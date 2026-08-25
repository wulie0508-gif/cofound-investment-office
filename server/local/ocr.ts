import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker, OEM } from "tesseract.js";
import type { ParsedPage } from "./analyzer";
import { renderPdfPagePng } from "./pdf-renderer";

const require = createRequire(import.meta.url);
function languageDirectory() {
  const target = path.resolve(
    process.env.COF_BP_OCR_CACHE_DIR ??
      path.join(os.tmpdir(), "cofound-bp-ocr-languages")
  );
  fs.mkdirSync(target, { recursive: true });
  const packages = ["@tesseract.js-data/chi_sim", "@tesseract.js-data/eng"];
  for (const packageName of packages) {
    const descriptor = require(packageName) as {
      code: string;
      langPath: string;
    };
    const source = path.join(
      descriptor.langPath,
      `${descriptor.code}.traineddata.gz`
    );
    const destination = path.join(target, `${descriptor.code}.traineddata.gz`);
    if (
      !fs.existsSync(destination) ||
      fs.statSync(destination).size !== fs.statSync(source).size
    ) {
      fs.copyFileSync(source, destination);
    }
  }
  return target;
}

function cacheDirectory() {
  const target = path.resolve(
    process.env.COF_BP_OCR_CACHE_DIR ??
      path.join(os.tmpdir(), "cofound-bp-ocr-cache")
  );
  fs.mkdirSync(target, { recursive: true });
  return target;
}

let exclusive = Promise.resolve();

export function ocrPdf(buffer: Buffer): Promise<ParsedPage[]> {
  const run = async () => {
    const debug = (message: string) => {
      if (process.env.COF_BP_OCR_DEBUG === "1")
        console.error(`[OCR] ${message}`);
    };
    debug("opening PDF");
    const task = getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: true,
    });
    const pdf = await task.promise;
    const maxPages = Math.max(
      1,
      Number(process.env.COF_BP_OCR_MAX_PAGES ?? 80)
    );
    const pageCount = Math.min(pdf.numPages, maxPages);
    debug("creating Tesseract worker");
    const worker = await createWorker(["chi_sim", "eng"], OEM.LSTM_ONLY, {
      langPath: languageDirectory(),
      gzip: true,
      cachePath: cacheDirectory(),
    });
    const pages: ParsedPage[] = [];
    try {
      debug("worker ready");
      await worker.setParameters({
        preserve_interword_spaces: "1",
        user_defined_dpi: "220",
      });
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        debug(`rendering page ${pageNumber}`);
        const image = await renderPdfPagePng(buffer, pageNumber, 2.1);
        debug(`recognizing page ${pageNumber} (${image.length} bytes)`);
        const result = await worker.recognize(image);
        debug(`recognized page ${pageNumber}`);
        pages.push({
          page: pageNumber,
          text: result.data.text
            .replace(/\r/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim(),
        });
      }
    } finally {
      await worker.terminate();
      await pdf.destroy();
    }
    return pages;
  };
  const result = exclusive.then(run, run);
  exclusive = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
