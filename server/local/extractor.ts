import path from "node:path";
import JSZip from "jszip";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ParsedDocument, ParsedPage } from "./analyzer";
import { ocrPdf } from "./ocr";

export const SUPPORTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".pptx",
  ".txt",
  ".md",
  ".markdown",
  ".doc",
  ".ppt",
];

export const MATERIAL_EXTENSIONS = [
  ...SUPPORTED_EXTENSIONS,
  ".xlsx",
  ".xls",
  ".csv",
  ".html",
  ".htm",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".zip",
  ".m4a",
  ".mp3",
  ".wav",
];

const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv",
  ".html": "text/html",
  ".htm": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".zip": "application/zip",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

export type ExtractionResult = ParsedDocument & {
  status: "parsed" | "unsupported" | "failed";
  error: string | null;
  mimeType: string;
};

export function mimeForFile(fileName: string, supplied?: string) {
  if (supplied && supplied !== "application/octet-stream") return supplied;
  return (
    MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()] ??
    "application/octet-stream"
  );
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlText(xml: string, paragraphTags: RegExp) {
  return decodeXml(
    xml
      .replace(paragraphTags, "\n")
      .replace(/<(?:w:tab|a:tab)[^>]*\/?\s*>/g, "\t")
      .replace(/<(?:w:br|a:br)[^>]*\/?\s*>/g, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pagesFromText(text: string): ParsedPage[] {
  const normalized = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!normalized) return [];
  const explicit = normalized
    .split(/\f|\n\s*---\s*(?:第\s*)?\d+\s*(?:页|page)\s*---\s*\n/iu)
    .map(part => part.trim())
    .filter(Boolean);
  if (explicit.length > 1)
    return explicit.map((pageText, index) => ({
      page: index + 1,
      text: pageText,
    }));

  const pages: ParsedPage[] = [];
  let current = "";
  for (const paragraph of normalized.split(/\n{2,}/)) {
    if (current.length > 3_200) {
      pages.push({ page: pages.length + 1, text: current.trim() });
      current = "";
    }
    current += `${paragraph.trim()}\n\n`;
  }
  if (current.trim())
    pages.push({ page: pages.length + 1, text: current.trim() });
  return pages;
}

async function extractPdf(buffer: Buffer): Promise<ParsedPage[]> {
  const task = getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  const pages: ParsedPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map(item => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push({ page: pageNumber, text });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  const extractedCharacters = pages.reduce(
    (total, page) => total + page.text.replace(/\s/g, "").length,
    0
  );
  if (extractedCharacters < 40 && process.env.COF_BP_OCR !== "0") {
    const ocrPages = await ocrPdf(buffer);
    const ocrCharacters = ocrPages.reduce(
      (total, page) => total + page.text.replace(/\s/g, "").length,
      0
    );
    if (ocrCharacters > extractedCharacters) return ocrPages;
  }
  return pages;
}

async function extractDocx(buffer: Buffer): Promise<ParsedPage[]> {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("DOCX 中未找到 word/document.xml");
  const xml = await entry.async("string");
  const text = xmlText(xml, /<\/w:p>/g);
  return pagesFromText(text);
}

async function extractPptx(buffer: Buffer): Promise<ParsedPage[]> {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => {
      const a = Number(left.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      const b = Number(right.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      return a - b;
    });
  const pages: ParsedPage[] = [];
  for (const name of names) {
    const entry = zip.file(name);
    if (!entry) continue;
    const xml = await entry.async("string");
    pages.push({ page: pages.length + 1, text: xmlText(xml, /<\/a:p>/g) });
  }
  return pages;
}

export async function extractDocument(
  buffer: Buffer,
  fileName: string,
  suppliedMimeType?: string
): Promise<ExtractionResult> {
  const extension = path.extname(fileName).toLowerCase();
  const mimeType = mimeForFile(fileName, suppliedMimeType);
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    return {
      pages: [],
      text: "",
      status: "unsupported",
      error: `暂不支持 ${extension || "未知"} 格式`,
      mimeType,
    };
  }
  if (extension === ".doc" || extension === ".ppt") {
    return {
      pages: [],
      text: "",
      status: "unsupported",
      error:
        "旧版二进制 Office 文件已安全保存，但第一轮不调用 LibreOffice 同步转换；请另存为 DOCX/PPTX/PDF 后重新导入。",
      mimeType,
    };
  }

  try {
    let pages: ParsedPage[];
    if (extension === ".pdf") pages = await extractPdf(buffer);
    else if (extension === ".docx") pages = await extractDocx(buffer);
    else if (extension === ".pptx") pages = await extractPptx(buffer);
    else pages = pagesFromText(buffer.toString("utf8"));
    const text = pages
      .map(page => page.text)
      .join("\n\n")
      .trim();
    if (!text) {
      return {
        pages,
        text,
        status: "failed",
        error: "文件中未提取到可分析文本（可能是扫描件或空文档）",
        mimeType,
      };
    }
    return { pages, text, status: "parsed", error: null, mimeType };
  } catch (error) {
    return {
      pages: [],
      text: "",
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      mimeType,
    };
  }
}
