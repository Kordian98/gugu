import { Injectable } from "@nestjs/common";
import sharp from "sharp";
import { AI_IMPORT_ERRORS } from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { FaceDetector } from "./face-detector";
import { OcrEngine } from "./ocr-engine";
import { containsContactDetails } from "./pii-patterns";
import { type Box, padBox, planRedactions } from "./redaction-plan";

/** Long edge used for analysis (OCR, faces). */
const ANALYSIS_EDGE = 2000;
/** Long edge sent to the model (Claude's sweet spot; ~1.6k image tokens). */
const OUTPUT_EDGE = 1568;
/** A face covering at least this share of the image means "photo of a person": reject. */
const PERSON_FACE_AREA = 0.015;
/** This many confident faces means a photo of people (screenshots carry one or two avatars). */
const PEOPLE_FACE_COUNT = 3;
const CONFIDENT_FACE = 0.9;
const TEXT_PAD = 4;
const FACE_PAD = 8;

export interface GatedImage {
  /** Redacted JPEG, metadata stripped, ready for the model. */
  data: Buffer;
  mediaType: "image/jpeg";
  redactedRegions: number;
  maskedFaces: number;
}

/**
 * The no-PII gate for AI import (topic 08 §4.5, ADR 0009). Runs entirely on our servers:
 * 1. decode, apply EXIF rotation, drop all metadata (GPS, device);
 * 2. faces: reject a photo of a person (a face larger than an avatar, or 3+ faces), otherwise
 *    black out the one or two small faces (avatars in a screenshot);
 * 3. OCR: black out phone numbers, emails, links, handles and "honorific + Name" labels;
 * 4. verify: OCR the redacted output again and refuse to continue if any contact detail remains.
 */
@Injectable()
export class ImageGate {
  constructor(
    private readonly faces: FaceDetector,
    private readonly ocr: OcrEngine,
  ) {}

  async process(input: Buffer, index: number): Promise<GatedImage> {
    const base = await normalise(input, index);
    const meta = await sharp(base).metadata();
    const { width, height } = meta;
    const area = width * height;

    const boxes: Box[] = [];
    const faces = await this.faces.detect(base, width, height);
    const isPerson =
      faces.filter((f) => f.score >= CONFIDENT_FACE).length >= PEOPLE_FACE_COUNT ||
      faces.some((f) => ((f.box.x1 - f.box.x0) * (f.box.y1 - f.box.y0)) / area >= PERSON_FACE_AREA);
    if (isPerson) throw imageError(AI_IMPORT_ERRORS.personDetected, "Image shows a person", index);
    for (const f of faces) boxes.push(padBox(f.box, FACE_PAD, width, height));

    const redactions = planRedactions(await this.ocr.recognize(base));
    for (const r of redactions) boxes.push(padBox(r.box, TEXT_PAD, width, height));

    const redacted = await sharp(base)
      .composite(boxes.length ? [{ input: blackout(boxes, width, height), top: 0, left: 0 }] : [])
      .toBuffer();
    const data = await sharp(redacted)
      .resize(OUTPUT_EDGE, OUTPUT_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    // Egress check: what we are about to send must not read as a contact detail anymore.
    const verify = await this.ocr.recognize(data);
    const text = verify.map((line) => line.map((w) => w.text).join(" ")).join("\n");
    if (containsContactDetails(text) || planRedactions(verify).length > 0) {
      throw imageError(AI_IMPORT_ERRORS.piiCheckFailed, "Redaction could not be verified", index);
    }

    return {
      data,
      mediaType: "image/jpeg",
      redactedRegions: redactions.length,
      maskedFaces: faces.length,
    };
  }
}

async function normalise(input: Buffer, index: number): Promise<Buffer> {
  try {
    return await sharp(input, { failOn: "error", limitInputPixels: 80_000_000 })
      .rotate()
      .resize(ANALYSIS_EDGE, ANALYSIS_EDGE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .png()
      .toBuffer();
  } catch {
    throw imageError(AI_IMPORT_ERRORS.imageUnreadable, "Image could not be read", index);
  }
}

/** 422 pointing at the 1-based image index (`errors[0].path = "images.3"`). */
function imageError(code: string, title: string, index: number): AppError {
  return new AppError(422, code, title, { errors: [{ path: `images.${String(index)}`, code }] });
}

function blackout(boxes: Box[], width: number, height: number): Buffer {
  const rects = boxes
    .map(
      (b) =>
        `<rect x="${String(b.x0)}" y="${String(b.y0)}" width="${String(b.x1 - b.x0)}" height="${String(b.y1 - b.y0)}"/>`,
    )
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}"><g fill="#000">${rects}</g></svg>`,
  );
}
