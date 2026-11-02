import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Injectable } from "@nestjs/common";
import type { InferenceSession } from "onnxruntime-node";
import sharp from "sharp";
import type { Box } from "./redaction-plan";

export interface DetectedFace {
  score: number;
  /** Pixel box in the analysed image. */
  box: Box;
}

/** Face detection on our own servers (ADR 0009). */
export abstract class FaceDetector {
  /** Faces in an RGB image of the given size. */
  abstract detect(image: Buffer, width: number, height: number): Promise<DetectedFace[]>;
}

const INPUT_W = 320;
const INPUT_H = 240;
const SCORE_THRESHOLD = 0.75;
const IOU_THRESHOLD = 0.3;

/** UltraFace RFB-320 (MIT, 1.2 MB) on onnxruntime-node; ~10 ms per image on a laptop CPU. */
@Injectable()
export class UltraFaceDetector extends FaceDetector {
  private session: Promise<InferenceSession> | null = null;

  async detect(image: Buffer, width: number, height: number): Promise<DetectedFace[]> {
    const ort = await import("onnxruntime-node");
    const session = await this.getSession();
    const input = await toInputTensor(image);
    const inputName = session.inputNames[0] ?? "input";
    const out = await session.run({
      [inputName]: new ort.Tensor("float32", input, [1, 3, INPUT_H, INPUT_W]),
    });
    const scores = out[session.outputNames[0] ?? "scores"]?.data as Float32Array;
    const boxes = out[session.outputNames[1] ?? "boxes"]?.data as Float32Array;
    const candidates: DetectedFace[] = [];
    for (let i = 0; i < scores.length / 2; i++) {
      const score = scores[i * 2 + 1] ?? 0;
      if (score < SCORE_THRESHOLD) continue;
      candidates.push({
        score,
        box: {
          x0: Math.max(0, (boxes[i * 4] ?? 0) * width),
          y0: Math.max(0, (boxes[i * 4 + 1] ?? 0) * height),
          x1: Math.min(width, (boxes[i * 4 + 2] ?? 0) * width),
          y1: Math.min(height, (boxes[i * 4 + 3] ?? 0) * height),
        },
      });
    }
    return nonMaxSuppression(candidates, IOU_THRESHOLD);
  }

  private getSession() {
    this.session ??= import("onnxruntime-node")
      .then((ort) =>
        ort.InferenceSession.create(resolveModelPath(), {
          logSeverityLevel: 3,
          graphOptimizationLevel: "all",
        }),
      )
      .catch((error: unknown) => {
        this.session = null;
        throw error;
      });
    return this.session;
  }
}

/** Works from `src/` (tests, dev) and from the bundled `dist/` (the model ships in `assets/`). */
function resolveModelPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../../../assets/models/ultraface-rfb-320.onnx"),
    path.resolve(here, "../assets/models/ultraface-rfb-320.onnx"),
    path.resolve(process.cwd(), "assets/models/ultraface-rfb-320.onnx"),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("Face model assets/models/ultraface-rfb-320.onnx not found");
  return found;
}

/** RGB → normalised CHW float32 at the model's 320×240 input. */
async function toInputTensor(image: Buffer): Promise<Float32Array> {
  const { data } = await sharp(image)
    .resize(INPUT_W, INPUT_H, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const plane = INPUT_W * INPUT_H;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) input[c * plane + i] = ((data[i * 3 + c] ?? 0) - 127) / 128;
  }
  return input;
}

export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inter = ix * iy;
  const area = (r: Box) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
  const union = area(a) + area(b) - inter;
  return union <= 0 ? 0 : inter / union;
}

/** Keeps the best-scoring box of each overlapping group. */
export function nonMaxSuppression(faces: DetectedFace[], threshold: number): DetectedFace[] {
  const sorted = [...faces].sort((a, b) => b.score - a.score);
  const kept: DetectedFace[] = [];
  for (const f of sorted) {
    if (kept.every((k) => iou(k.box, f.box) < threshold)) kept.push(f);
  }
  return kept;
}
