import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDatabase } from "./database";
import { importDocument, importFilePath } from "./importer";

const samples = path.resolve(process.cwd(), "samples", "mock-bps");
let temporaryDirectory = "";
let database: LocalDatabase;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "cofound-bp-test-"));
  database = new LocalDatabase({
    dataDir: temporaryDirectory,
    dbPath: path.join(temporaryDirectory, "test.sqlite"),
  });
});

afterEach(() => {
  database.close();
  const resolved = path.resolve(temporaryDirectory);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith("cofound-bp-test-")) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

describe("local BP import flow", () => {
  it("runs import, hash dedupe, versioning, FTS, analysis and locked status", async () => {
    const angelV1Path = path.join(samples, "01-星屿智造-天使-v1.md");
    const angelV2Path = path.join(samples, "01-星屿智造-天使-v2.md");
    const preAPath = path.join(samples, "02-澄川能源-Pre-A.md");
    const aRoundPath = path.join(samples, "03-北辰医疗数据-A轮.md");

    const angelV1 = await importFilePath(angelV1Path, {}, database);
    const duplicate = await importFilePath(angelV1Path, {}, database);
    const angelV2 = await importFilePath(angelV2Path, {}, database);
    const preA = await importFilePath(preAPath, {}, database);
    await importFilePath(aRoundPath, {}, database);

    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.fileId).toBe(angelV1.fileId);
    expect(angelV2.projectId).toBe(angelV1.projectId);
    expect(angelV2.versionNumber).toBe(2);
    expect(database.countProjects()).toBe(3);

    const angel = database.getProject(angelV1.projectId)!;
    expect(angel.files).toHaveLength(2);
    expect(angel.files[0].previousFileId).toBe(angel.files[1].id);
    expect(angel.analysis?.facts.revenueAmount.value).toBe(1_200_000);
    expect(angel.analysis?.facts.revenueAmount.page).toBe(2);
    expect(angel.aiStatus).toBe("商业信号较强");
    expect(angel.managementStatus).toBe("待判断");
    expect(angel.shareMode).toBe("local_only");
    expect(angel.syncState).toBe("local_only");

    const preAProject = database.getProject(preA.projectId)!;
    expect(preAProject.aiStatus).toBe("商业信号较强");
    expect(preAProject.industry).toBe("新能源与气候科技");
    expect(database.listProjects({ search: "储能站" }).map((project) => project.id)).toContain(preA.projectId);

    database.updateManagementStatus(angel.id, "持续跟踪", true, "集成测试人工锁定");
    const v3Buffer = Buffer.concat([fs.readFileSync(angelV2Path), Buffer.from("\n\n版本备注：仅用于测试新哈希。")]);
    await importDocument({ buffer: v3Buffer, originalName: "星屿智造-v3.md", projectId: angel.id }, database);
    const locked = database.getProject(angel.id)!;
    expect(locked.localVersion).toBe(3);
    expect(locked.aiStatus).toBe("商业信号较强");
    expect(locked.managementStatus).toBe("持续跟踪");
    expect(locked.statusLocked).toBe(true);

    database.updateShareMode(angel.id, "fields_only");
    const sharedFields = database.getProject(angel.id)!;
    expect(sharedFields.shareMode).toBe("fields_only");
    expect(sharedFields.syncState).toBe("local_only");
  });
});
