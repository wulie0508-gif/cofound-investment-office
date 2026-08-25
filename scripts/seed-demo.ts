import fs from "node:fs";
import path from "node:path";
import { getDatabase } from "../server/local/database";
import { importFilePath } from "../server/local/importer";

const root = path.resolve(process.cwd(), "samples", "mock-bps");
const files = [
  "01-星屿智造-天使-v1.md",
  "01-星屿智造-天使-v1.md",
  "01-星屿智造-天使-v2.md",
  "02-澄川能源-Pre-A.md",
  "03-北辰医疗数据-A轮.md",
];

if (!fs.existsSync(root)) throw new Error(`模拟 BP 目录不存在：${root}`);
const results = [];
for (const file of files) {
  results.push({ file, ...(await importFilePath(path.join(root, file))) });
}

const database = getDatabase();
console.log(JSON.stringify({
  ok: true,
  dataDir: database.dataDir,
  projectCount: database.countProjects(),
  runs: results,
  projects: database.listProjects().map((project) => ({
    id: project.id,
    name: project.name,
    round: project.fundingRound,
    version: project.localVersion,
    aiStatus: project.aiStatus,
    managementStatus: project.managementStatus,
    shareMode: project.shareMode,
  })),
}, null, 2));
