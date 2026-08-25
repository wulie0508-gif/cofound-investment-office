import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FEISHU_TEAM_INBOX_NAME } from "../../shared/feishu-sync";
import { LocalDatabase } from "./database";
import { planFeishuInboxPull, pullFeishuInbox } from "./feishu-inbox-service";
import type {
  LarkCliRunOptions,
  LarkCliRunResult,
  LarkCliRunner,
} from "./feishu-sync";
import { archiveLocalProject } from "./project-lifecycle-service";

const tempDirectories: string[] = [];

type RemoteFile = {
  token: string;
  name: string;
  modified: string;
  content: Buffer;
  reportedSize?: string | null;
  downloadedSize?: number;
};

class FakeInboxRunner implements LarkCliRunner {
  readonly rootToken = "root-test";
  readonly inboxToken = "inbox-test";
  files: RemoteFile[] = [];
  downloads = 0;

  async run(
    args: string[],
    options: LarkCliRunOptions
  ): Promise<LarkCliRunResult> {
    if (args[0] === "auth")
      return this.result({
        identity: "user",
        verified: true,
        identities: { user: { status: "ready", tokenStatus: "valid" } },
      });
    if (args[0] === "drive" && args[1] === "files" && args[2] === "list") {
      const params = JSON.parse(args[args.indexOf("--params") + 1]) as {
        folder_token: string;
      };
      if (params.folder_token === this.rootToken)
        return this.result({
          ok: true,
          identity: "user",
          data: {
            has_more: false,
            files: [
              {
                name: FEISHU_TEAM_INBOX_NAME,
                type: "folder",
                token: this.inboxToken,
              },
            ],
          },
        });
      if (params.folder_token === this.inboxToken)
        return this.result({
          ok: true,
          identity: "user",
          data: {
            has_more: false,
            files: this.files.map(file => ({
              name: file.name,
              type: "file",
              token: file.token,
              ...(file.reportedSize === null
                ? {}
                : {
                    size: file.reportedSize ?? String(file.content.length),
                  }),
              modified_time: file.modified,
            })),
          },
        });
    }
    if (args[0] === "drive" && args[1] === "+download") {
      const token = args[args.indexOf("--file-token") + 1];
      const output = args[args.indexOf("--output") + 1];
      const remote = this.files.find(file => file.token === token);
      if (!remote) return this.result({ ok: false }, 1, "not found");
      const outputPath = path.resolve(options.cwd, output);
      if (remote.downloadedSize !== undefined) {
        const handle = fs.openSync(outputPath, "w");
        try {
          fs.ftruncateSync(handle, remote.downloadedSize);
        } finally {
          fs.closeSync(handle);
        }
      } else {
        fs.writeFileSync(outputPath, remote.content);
      }
      this.downloads += 1;
      return this.result({ ok: true, identity: "user", data: {} });
    }
    return this.result({ ok: false }, 1, `unsupported: ${args.join(" ")}`);
  }

  private result(
    payload: unknown,
    exitCode = 0,
    stderr = ""
  ): LarkCliRunResult {
    return { exitCode, stdout: JSON.stringify(payload), stderr };
  }
}

function createDatabase(runner: FakeInboxRunner) {
  const dataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "cofound-feishu-inbox-")
  );
  tempDirectories.push(dataDir);
  fs.writeFileSync(
    path.join(dataDir, "feishu-internal-storage.json"),
    JSON.stringify({
      driveRootFolderToken: runner.rootToken,
      baseToken: "base-test",
      baseTableId: "table-test",
      storageScope: "enterprise_shared",
    })
  );
  return new LocalDatabase({ dataDir });
}

function bp(version: number) {
  return Buffer.from(
    `
# 云衡能源（完全虚构）

产品：面向园区微电网的预测调度平台
融资轮次：Pre-A
本轮融资金额：${version === 1 ? "1800" : "2600"} 万元
付费客户：${version === 1 ? "5" : "11"} 家
版本：v${version}
`,
    "utf8"
  );
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("Feishu enterprise team inbox", () => {
  it("imports, skips unchanged, restores recycled projects, and appends v2", async () => {
    const runner = new FakeInboxRunner();
    runner.files = [
      {
        token: "remote-v1",
        name: "云衡能源_完全虚构_BP_v1.md",
        modified: "100",
        content: bp(1),
      },
    ];
    const database = createDatabase(runner);
    const options = { runner, cwd: database.dataDir };

    const firstPlan = await planFeishuInboxPull(database, options);
    expect(firstPlan.items[0].action).toBe("download_and_import");
    const firstPull = await pullFeishuInbox(
      { requestedBy: "王小明" },
      database,
      options
    );
    expect(firstPull).toMatchObject({ imported: 1, restored: 0, failed: 0 });
    expect(database.listProjects()).toHaveLength(1);
    const project = database.listProjects()[0];

    const secondPlan = await planFeishuInboxPull(database, options);
    expect(secondPlan.items[0].action).toBe("skip_already_imported");
    const downloadsBeforeSkip = runner.downloads;
    const skipped = await pullFeishuInbox(
      { requestedBy: "王小明" },
      database,
      options
    );
    expect(skipped.skipped).toBe(1);
    expect(runner.downloads).toBe(downloadsBeforeSkip);

    archiveLocalProject(
      { projectId: project.id, requestedBy: "王小明" },
      database
    );
    const restorePlan = await planFeishuInboxPull(database, options);
    expect(restorePlan.items[0].action).toBe("restore_after_verification");
    const restored = await pullFeishuInbox(
      { requestedBy: "王小明" },
      database,
      options
    );
    expect(restored).toMatchObject({ downloaded: 1, restored: 1, failed: 0 });
    expect(database.getActiveProject(project.id)?.files).toHaveLength(1);

    runner.files.push({
      token: "remote-v2",
      name: "云衡能源_完全虚构_BP_v2.md",
      modified: "200",
      content: bp(2),
    });
    const versioned = await pullFeishuInbox(
      { requestedBy: "王小明" },
      database,
      options
    );
    expect(versioned).toMatchObject({ imported: 1, failed: 0 });
    const detail = database.getActiveProject(project.id)!;
    expect(detail.files).toHaveLength(2);
    expect(detail.files[0].versionNumber).toBe(2);
    expect(detail.files[0].previousFileId).toBe(detail.files[1].id);
    database.close();
  });

  it("rejects an unknown-size oversized download before importing it", async () => {
    const runner = new FakeInboxRunner();
    runner.files = [
      {
        token: "remote-oversized",
        name: "超大_BP_完全虚构.md",
        modified: "300",
        content: Buffer.from("placeholder"),
        reportedSize: null,
        downloadedSize: 50 * 1024 * 1024 + 1,
      },
    ];
    const database = createDatabase(runner);
    const options = { runner, cwd: database.dataDir };

    const plan = await planFeishuInboxPull(database, options);
    expect(plan.items[0]).toMatchObject({
      action: "download_and_import",
      sizeBytes: null,
    });
    const receipt = await pullFeishuInbox(
      { requestedBy: "王小明" },
      database,
      options
    );
    expect(receipt).toMatchObject({
      downloaded: 0,
      imported: 0,
      failed: 1,
    });
    expect(receipt.items[0].message).toContain("超过 50MB");
    expect(database.listProjects()).toHaveLength(0);
    database.close();
  });

  it("repairs a missing local original from a hash-matching Feishu copy", async () => {
    const runner = new FakeInboxRunner();
    runner.files = [
      {
        token: "remote-repair",
        name: "云衡能源_完全虚构_BP_v1.md",
        modified: "400",
        content: bp(1),
      },
    ];
    const database = createDatabase(runner);
    const options = { runner, cwd: database.dataDir };
    await pullFeishuInbox({ requestedBy: "王小明" }, database, options);
    const project = database.listProjects()[0];
    const stored = database.getLatestFile(project.id)!;
    const storedPath = database.resolveStoredFile(String(stored.stored_path));
    fs.unlinkSync(storedPath);

    const plan = await planFeishuInboxPull(database, options);
    expect(plan.items[0].action).toBe("download_and_import");
    const repaired = await pullFeishuInbox(
      { requestedBy: "王小明" },
      database,
      options
    );
    expect(repaired.items[0]).toMatchObject({ status: "skipped_duplicate" });
    expect(repaired.items[0].message).toContain("本地缺失原件已恢复");
    expect(fs.readFileSync(storedPath)).toEqual(bp(1));
    database.close();
  });

  it("continues with later files when one local receipt read fails", async () => {
    const runner = new FakeInboxRunner();
    runner.files = [
      {
        token: "remote-bad-receipt",
        name: "收据异常_完全虚构_BP_v1.md",
        modified: "500",
        content: bp(1),
      },
      {
        token: "remote-after-error",
        name: "后续文件_完全虚构_BP_v2.md",
        modified: "501",
        content: bp(2),
      },
    ];
    const database = createDatabase(runner);
    const options = { runner, cwd: database.dataDir };
    const original = database.getFeishuInboxReceipt.bind(database);
    const receiptRead = vi
      .spyOn(database, "getFeishuInboxReceipt")
      .mockImplementationOnce(() => {
        throw new Error("模拟本地收据损坏");
      })
      .mockImplementation(original);

    const receipt = await pullFeishuInbox(
      { requestedBy: "王小明" },
      database,
      options
    );
    expect(receipt).toMatchObject({ imported: 1, failed: 1 });
    expect(receipt.items.map(item => item.status)).toEqual([
      "failed",
      "imported",
    ]);
    receiptRead.mockRestore();
    database.close();
  });
});
