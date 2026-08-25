import { PDFiumLibrary } from "@hyzyla/pdfium";
import sharp from "sharp";

let libraryPromise: ReturnType<typeof PDFiumLibrary.init> | null = null;

function library() {
  libraryPromise ??= PDFiumLibrary.init();
  return libraryPromise;
}

export async function renderPdfPagePng(
  buffer: Buffer,
  pageNumber: number,
  scale = 1.8
) {
  const pdfium = await library();
  const document = await pdfium.loadDocument(buffer);
  try {
    if (pageNumber < 1 || pageNumber > document.getPageCount())
      throw new Error("页码超出范围");
    const page = document.getPage(pageNumber - 1);
    const image = await page.render({
      scale,
      render: async options =>
        sharp(options.data, {
          raw: { width: options.width, height: options.height, channels: 4 },
        })
          .png()
          .toBuffer(),
    });
    return Buffer.from(image.data);
  } finally {
    document.destroy();
  }
}
