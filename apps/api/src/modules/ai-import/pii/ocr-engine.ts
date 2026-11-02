import { copyFile, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createWorker, type Worker } from "tesseract.js";
import type { OcrLines } from "./redaction-plan";

/** Text recognition on our own servers; images never leave the API for OCR (ADR 0009). */
export abstract class OcrEngine {
  abstract recognize(image: Buffer): Promise<OcrLines>;
}

export const OCR_LANGUAGES = ["vie", "eng"] as const;

/**
 * Tesseract (WASM, `vie` + `eng` from the `@tesseract.js-data/*` packages, no network at runtime).
 * One worker, created lazily and reused; jobs are serialised by tesseract.js.
 */
@Injectable()
export class TesseractOcrEngine extends OcrEngine implements OnModuleDestroy {
  private worker: Promise<Worker> | null = null;

  async recognize(image: Buffer): Promise<OcrLines> {
    const worker = await this.getWorker();
    const { data } = await worker.recognize(image, {}, { blocks: true, text: false });
    return (data.blocks ?? []).flatMap((b) =>
      b.paragraphs.flatMap((p) =>
        p.lines.map((l) =>
          l.words
            .filter((w) => w.text.trim() !== "")
            .map((w) => ({ text: w.text, bbox: { ...w.bbox } })),
        ),
      ),
    );
  }

  async onModuleDestroy(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    if (worker) await (await worker).terminate();
  }

  private getWorker(): Promise<Worker> {
    this.worker ??= (async () => {
      const langPath = await prepareLanguageData();
      return createWorker([...OCR_LANGUAGES], 1, {
        langPath,
        cachePath: langPath,
        gzip: true,
        logger: () => undefined,
        errorHandler: () => undefined,
      });
    })().catch((error: unknown) => {
      this.worker = null;
      throw error;
    });
    return this.worker;
  }
}

/** tesseract.js reads all languages from one directory; copy the packaged data there once. */
async function prepareLanguageData(): Promise<string> {
  const require = createRequire(import.meta.url);
  const dir = path.join(tmpdir(), "gugu-tessdata-v1");
  await mkdir(dir, { recursive: true });
  for (const lang of OCR_LANGUAGES) {
    const pkg = require(`@tesseract.js-data/${lang}`) as { langPath: string };
    const target = path.join(dir, `${lang}.traineddata.gz`);
    const exists = await stat(target).then(
      (s) => s.size > 0,
      () => false,
    );
    if (!exists) await copyFile(path.join(pkg.langPath, `${lang}.traineddata.gz`), target);
  }
  return dir;
}
