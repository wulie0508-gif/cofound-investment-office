import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDatabase } from "./database";
import { WechatBpInbox, type WechatRouterSnapshot } from "./wechat-inbox";

let root = "";
let dataDir = "";
let wechatFiles = "";
let routerRoot = "";
let snapshotPath = "";
let database: LocalDatabase;

function writeSnapshot(snapshot: WechatRouterSnapshot) {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot), "utf8");
}

function validSnapshot(
  triggers: WechatRouterSnapshot["triggers"] = [],
  attachments: WechatRouterSnapshot["attachments"] = [],
): WechatRouterSnapshot {
  return {
    scopeVerified: true,
    chatUsername: "filehelper",
    triggerPhrase: "存入项目库",
    triggers,
    attachments,
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cofound-wechat-test-"));
  dataDir = path.join(root, "data");
  wechatFiles = path.join(root, "wechat", "msg", "file", "2026-08");
  routerRoot = path.join(root, "router");
  snapshotPath = path.join(dataDir, "integrations", "snapshot.json");
  fs.mkdirSync(wechatFiles, { recursive: true });
  fs.mkdirSync(path.join(routerRoot, "scripts", "frida_route"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(routerRoot, "scripts", "frida_route", "run_frida_scan.py"),
    "# fixture",
  );
  database = new LocalDatabase({
    dataDir,
    dbPath: path.join(dataDir, "test.sqlite"),
  });
});

afterEach(() => {
  database.close();
  const resolved = path.resolve(root);
  if (
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
    path.basename(resolved).startsWith("cofound-wechat-test-")
  ) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

describe("WeChat BP inbox", () => {
  it("baselines old files, then imports one scoped trigger + attachment exactly once", async () => {
    fs.writeFileSync(path.join(wechatFiles, "旧材料.md"), "旧文件不会导入");
    writeSnapshot(validSnapshot());
    const inbox = new WechatBpInbox({
      dataDir,
      attachmentRoots: [path.dirname(wechatFiles)],
      routerRoot,
      snapshotPath,
      now: () => new Date("2026-08-18T04:00:00.000Z"),
    });

    expect(inbox.initialize().baselineFiles).toBe(1);
    const filename = "星桥机器人-天使轮.md";
    fs.writeFileSync(
      path.join(wechatFiles, filename),
      [
        "公司名称：星桥机器人（完全虚构）",
        "核心产品：仓储机器人",
        "所属行业：机器人与先进制造",
        "融资轮次：天使轮",
        "融资需求：800万元",
        "订单金额：120万元",
      ].join("\n"),
    );
    writeSnapshot(
      validSnapshot(
        [{ id: "trigger-new", phrase: "存入项目库" }],
        [{ id: "attachment-new", filename }],
      ),
    );

    const first = await inbox.consumeSnapshot(database);
    expect(first.imported).toHaveLength(1);
    expect(first.imported[0].duplicate).toBe(false);
    expect(database.countProjects()).toBe(1);

    const second = await inbox.consumeSnapshot(database);
    expect(second.imported).toHaveLength(0);
    expect(database.countProjects()).toBe(1);
  });

  it("fails closed when the scanner cannot prove filehelper scope", async () => {
    writeSnapshot(validSnapshot());
    const inbox = new WechatBpInbox({
      dataDir,
      attachmentRoots: [path.dirname(wechatFiles)],
      routerRoot,
      snapshotPath,
    });
    inbox.initialize();
    fs.writeFileSync(path.join(wechatFiles, "不应导入.md"), "公司名称：不应导入");
    writeSnapshot({
      scopeVerified: false,
      chatUsername: "unknown",
      triggerPhrase: "存入项目库",
      triggers: [{ id: "unsafe-trigger" }],
      attachments: [{ id: "unsafe-file", filename: "不应导入.md" }],
    });

    await expect(inbox.consumeSnapshot(database)).rejects.toThrow(
      "无法确认文件传输助手范围",
    );
    expect(database.countProjects()).toBe(0);
  });

  it("does not import a new file without the BP trigger", async () => {
    writeSnapshot(validSnapshot());
    const inbox = new WechatBpInbox({
      dataDir,
      attachmentRoots: [path.dirname(wechatFiles)],
      routerRoot,
      snapshotPath,
    });
    inbox.initialize();
    fs.writeFileSync(path.join(wechatFiles, "普通文件.md"), "公司名称：普通文件");
    writeSnapshot(
      validSnapshot([], [{ id: "attachment-only", filename: "普通文件.md" }]),
    );

    const result = await inbox.consumeSnapshot(database);
    expect(result.imported).toHaveLength(0);
    expect(result.ignored).toBe(1);
    expect(database.countProjects()).toBe(0);
  });
});
