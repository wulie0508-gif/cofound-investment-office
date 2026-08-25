import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderSecurePage } from "../server/collaboration/watermark";
import { extractDocument } from "../server/local/extractor";

const image = await sharp(
  Buffer.from(`
  <svg width="1240" height="1754" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
    <text x="100" y="260" font-family="Arial" font-size="82" font-weight="700" fill="black">COFOUND ENERGY</text>
    <text x="100" y="430" font-family="Arial" font-size="64" fill="black">Revenue 12 million</text>
    <text x="100" y="550" font-family="Arial" font-size="58" fill="black">Angel round</text>
  </svg>`)
)
  .png()
  .toBuffer();
const document = await PDFDocument.create();
const embedded = await document.embedPng(image);
const page = document.addPage([620, 877]);
page.drawImage(embedded, { x: 0, y: 0, width: 620, height: 877 });
const pdfBuffer = Buffer.from(await document.save());
const result = await extractDocument(
  pdfBuffer,
  "scanned-bp.pdf",
  "application/pdf"
);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cofound-ocr-smoke-"));
const pdfPath = path.join(temporary, "scanned-bp.pdf");
fs.writeFileSync(pdfPath, pdfBuffer);
const securePreview = await renderSecurePage({
  absolutePath: pdfPath,
  mimeType: "application/pdf",
  pageNumber: 1,
  textPages: [result.text],
  identity: {
    name: "OCR 测试",
    email: "ocr@example.com",
    viewedAt: new Date().toISOString(),
    reference: "ocr-smoke",
  },
});
fs.rmSync(temporary, { recursive: true, force: true });
const passed =
  result.status === "parsed" &&
  result.text.toLocaleUpperCase().includes("COFOUND ENERGY") &&
  result.text.toLocaleLowerCase().includes("revenue") &&
  securePreview.subarray(1, 4).toString() === "PNG";
console.log(
  JSON.stringify(
    {
      ok: passed,
      status: result.status,
      text: result.text.slice(0, 180),
      securePreviewBytes: securePreview.length,
      error: result.error,
    },
    null,
    2
  )
);
if (!passed) process.exitCode = 1;
