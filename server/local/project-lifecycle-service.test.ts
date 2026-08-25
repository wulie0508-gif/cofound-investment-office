import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalDatabase } from "./database";
import { importDocument, reanalyzeProject } from "./importer";
import {
  archiveLocalProject,
  restoreLocalProject,
} from "./project-lifecycle-service";

const tempDirectories: string[] = [];

function createDatabase() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cofound-recycle-"));
  tempDirectories.push(dataDir);
  return new LocalDatabase({ dataDir });
}

function bp(version: number) {
  return Buffer.from(
    `
# 玄启储能（完全虚构）

融资轮次：天使轮
本轮融资金额：${version === 1 ? "800" : "1200"} 万元
产品：面向工商业储能的安全诊断软件
客户：${version === 1 ? "3" : "7"} 家付费客户
版本：v${version}
`,
    "utf8"
  );
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("local project recycle bin", () => {
  it("retains files and management judgment while moving and restoring", async () => {
    const database = createDatabase();
    const imported = await importDocument(
      { buffer: bp(1), originalName: "玄启储能_完全虚构_BP_v1.md" },
      database
    );
    database.updateManagementStatus(
      imported.projectId,
      "继续了解",
      true,
      "测试判断"
    );
    const prepared = database.prepareCodexAnalysis({
      projectId: imported.projectId,
      skillName: "review-early-stage-investment",
      requestedBy: "李华",
    });
    const source = database.getFile(imported.fileId)!;
    const sourcePath = database.resolveStoredFile(String(source.stored_path));

    const archived = archiveLocalProject(
      { projectId: imported.projectId, requestedBy: "李华" },
      database
    );
    expect(archived.state).toBe("in_recycle_bin");
    expect(database.listProjects()).toHaveLength(0);
    expect(database.listArchivedProjects()).toHaveLength(1);
    expect(database.getActiveProject(imported.projectId)).toBeNull();
    expect(fs.existsSync(sourcePath)).toBe(true);
    await expect(
      reanalyzeProject(imported.projectId, database)
    ).rejects.toThrow("回收站");
    expect(() => database.getPreparedCodexAnalysisSource(prepared.id)).toThrow(
      "回收站"
    );

    restoreLocalProject(
      { projectId: imported.projectId, requestedBy: "李华" },
      database
    );
    const restored = database.getActiveProject(imported.projectId)!;
    expect(restored.managementStatus).toBe("继续了解");
    expect(restored.statusLocked).toBe(true);
    expect(restored.files).toHaveLength(1);
    expect(database.listArchivedProjects()).toHaveLength(0);
    database.close();
  });

  it("restores a recycled project on duplicate or same-company version import", async () => {
    const database = createDatabase();
    const first = await importDocument(
      { buffer: bp(1), originalName: "玄启储能_完全虚构_BP_v1.md" },
      database
    );
    archiveLocalProject(
      { projectId: first.projectId, requestedBy: "李华" },
      database
    );

    const duplicate = await importDocument(
      { buffer: bp(1), originalName: "玄启储能_完全虚构_BP_v1.md" },
      database
    );
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.restoredFromRecycleBin).toBe(true);
    expect(database.getActiveProject(first.projectId)?.files).toHaveLength(1);

    archiveLocalProject(
      { projectId: first.projectId, requestedBy: "李华" },
      database
    );
    const version = await importDocument(
      { buffer: bp(2), originalName: "玄启储能_完全虚构_BP_v2.md" },
      database
    );
    expect(version.projectId).toBe(first.projectId);
    expect(version.versionNumber).toBe(2);
    expect(version.restoredFromRecycleBin).toBe(true);
    const detail = database.getActiveProject(first.projectId)!;
    expect(detail.files).toHaveLength(2);
    expect(detail.files[0].previousFileId).toBe(first.fileId);
    database.close();
  });

  it("keeps a recycled project hidden when a new-version import fails", async () => {
    const database = createDatabase();
    const first = await importDocument(
      { buffer: bp(1), originalName: "玄启储能_完全虚构_BP_v1.md" },
      database
    );
    archiveLocalProject(
      { projectId: first.projectId, requestedBy: "李华" },
      database
    );
    const saveAnalysis = vi
      .spyOn(database, "saveAnalysis")
      .mockImplementationOnce(() => {
        throw new Error("模拟分析保存失败");
      });

    await expect(
      importDocument(
        { buffer: bp(2), originalName: "玄启储能_完全虚构_BP_v2.md" },
        database
      )
    ).rejects.toThrow("模拟分析保存失败");
    expect(database.isProjectArchived(first.projectId)).toBe(true);
    expect(database.getActiveProject(first.projectId)).toBeNull();
    saveAnalysis.mockRestore();
    database.close();
  });
});
