import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalDatabase } from "../server/local/database";
import { importFilePath } from "../server/local/importer";

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "cofound-bp-smoke-"));
const database = new LocalDatabase({ dataDir: temporaryDirectory, dbPath: path.join(temporaryDirectory, "smoke.sqlite") });
try {
  const samples = path.resolve(process.cwd(), "samples", "mock-bps");
  const first = await importFilePath(path.join(samples, "01-星屿智造-天使-v1.md"), {}, database);
  const duplicate = await importFilePath(path.join(samples, "01-星屿智造-天使-v1.md"), {}, database);
  const version = await importFilePath(path.join(samples, "01-星屿智造-天使-v2.md"), {}, database);
  await importFilePath(path.join(samples, "02-澄川能源-Pre-A.md"), {}, database);
  await importFilePath(path.join(samples, "03-北辰医疗数据-A轮.md"), {}, database);
  if (!duplicate.duplicate || first.projectId !== version.projectId || version.versionNumber !== 2 || database.countProjects() !== 3) {
    throw new Error("端到端断言失败");
  }
  console.log(JSON.stringify({ ok: true, projects: database.countProjects(), duplicate: duplicate.duplicate, version: version.versionNumber }, null, 2));
} finally {
  database.close();
  const resolved = path.resolve(temporaryDirectory);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith("cofound-bp-smoke-")) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
