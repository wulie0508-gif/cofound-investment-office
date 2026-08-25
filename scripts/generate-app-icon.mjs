import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const assetDirectory = path.join(projectRoot, "client", "src", "assets");
const svgPath = path.join(assetDirectory, "cofound-mark.svg");
const pngPath = path.join(assetDirectory, "cofound-investment-office.png");
const icoPath = path.join(assetDirectory, "cofound-investment-office.ico");

const svg = await fs.readFile(svgPath);
const png = await sharp(svg)
  .resize(256, 256, { fit: "contain" })
  .png({ compressionLevel: 9 })
  .toBuffer();
await fs.writeFile(pngPath, png);

const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(0, 6);
header.writeUInt8(0, 7);
header.writeUInt8(0, 8);
header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(header.length, 18);

await fs.writeFile(icoPath, Buffer.concat([header, png]));
process.stdout.write(`${icoPath}\n${pngPath}\n`);
