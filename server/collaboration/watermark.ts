import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { renderPdfPagePng } from "../local/pdf-renderer";

type WatermarkIdentity = {
  name: string;
  email: string;
  viewedAt: string;
  reference: string;
};

function watermarkLines(identity: WatermarkIdentity) {
  return [
    `${identity.name} · ${identity.email}`,
    `${new Date(identity.viewedAt).toLocaleString("zh-CN", { hour12: false })} · ${identity.reference.slice(0, 12)}`,
  ];
}

function watermarkSvg(
  width: number,
  height: number,
  identity: WatermarkIdentity
) {
  const lines = watermarkLines(identity);
  const column = Math.max(320, Math.round(width * 0.45));
  const row = Math.max(170, Math.round(height * 0.19));
  const marks: string[] = [];
  for (let y = -height; y <= height; y += row) {
    for (let x = -width; x <= width; x += column) {
      marks.push(
        `<g transform="translate(${x} ${y}) rotate(-32)"><text class="mark">${escapeXml(lines[0])}</text><text y="28" class="mark small">${escapeXml(lines[1])}</text></g>`
      );
    }
  }
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>.mark{font:600 ${Math.max(18, Math.round(width / 42))}px "Microsoft YaHei","Segoe UI",sans-serif;fill:#075458;opacity:.17}.small{font-size:${Math.max(13, Math.round(width / 58))}px;font-weight:500}</style>${marks.join("")}</svg>`
  );
}

function escapeXml(value: string) {
  return value.replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!
  );
}

function textLines(text: string, max = 42) {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const character of paragraph) {
      current += character;
      if (current.length >= max) {
        lines.push(current);
        current = "";
      }
    }
    if (current) lines.push(current);
  }
  return lines.slice(0, 48);
}

async function renderTextPage(
  text: string,
  pageNumber: number,
  identity: WatermarkIdentity
) {
  const width = 1240;
  const height = 1754;
  const lines = textLines(text);
  const body = lines
    .map(
      (line, index) =>
        `<text x="96" y="${190 + index * 30}" class="body">${escapeXml(line)}</text>`
    )
    .join("");
  const marks: string[] = [];
  for (let y = -200; y < height + 300; y += 250) {
    for (let x = -250; x < width + 350; x += 480) {
      marks.push(
        `<g transform="translate(${x} ${y}) rotate(-32)"><text class="mark">${escapeXml(identity.name)} · ${escapeXml(identity.email)}</text><text y="28" class="mark small">${escapeXml(identity.reference.slice(0, 12))}</text></g>`
      );
    }
  }
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f7f9fa"/>
      <style>
        .body { font: 22px "Microsoft YaHei", "Segoe UI", sans-serif; fill: #17262d; }
        .meta { font: 600 24px "Microsoft YaHei", "Segoe UI", sans-serif; fill: #0b5557; }
        .mark { font: 600 25px "Microsoft YaHei", "Segoe UI", sans-serif; fill: #075458; opacity: .15; }
        .small { font-size: 18px; }
      </style>
      <text x="96" y="86" class="meta">Cofound 受控资料室 · 第 ${pageNumber} 页</text>
      <line x1="96" x2="1144" y1="116" y2="116" stroke="#bed0d1"/>
      ${body}
      ${marks.join("")}
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function renderPdfPage(
  absolutePath: string,
  pageNumber: number,
  identity: WatermarkIdentity,
  scale = 1.45
) {
  const page = await renderPdfPagePng(
    await fs.promises.readFile(absolutePath),
    pageNumber,
    scale
  );
  const metadata = await sharp(page).metadata();
  const width = metadata.width ?? 1240;
  const height = metadata.height ?? 1754;
  return sharp(page)
    .composite([
      { input: watermarkSvg(width, height, identity), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}

export async function renderSecurePage(input: {
  absolutePath: string;
  mimeType: string;
  pageNumber: number;
  textPages: string[];
  identity: WatermarkIdentity;
}) {
  if (
    input.mimeType === "application/pdf" ||
    path.extname(input.absolutePath).toLocaleLowerCase() === ".pdf"
  ) {
    return renderPdfPage(input.absolutePath, input.pageNumber, input.identity);
  }
  const text = input.textPages[input.pageNumber - 1];
  if (text === undefined) throw new Error("页码超出范围");
  return renderTextPage(text, input.pageNumber, input.identity);
}

export async function buildWatermarkedReviewPdf(input: {
  absolutePath: string;
  mimeType: string;
  pageCount: number;
  textPages: string[];
  identity: WatermarkIdentity;
}) {
  const document = await PDFDocument.create();
  const count = Math.max(
    1,
    input.mimeType === "application/pdf"
      ? input.pageCount
      : input.textPages.length
  );
  for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
    const png = await renderSecurePage({ ...input, pageNumber });
    const image = await document.embedPng(png);
    const page = document.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }
  document.setTitle("Cofound 受控下载副本");
  document.setSubject(`${input.identity.name} · ${input.identity.email}`);
  document.setCreator("Cofound BP Desk");
  document.setCreationDate(new Date(input.identity.viewedAt));
  return Buffer.from(await document.save({ useObjectStreams: true }));
}
