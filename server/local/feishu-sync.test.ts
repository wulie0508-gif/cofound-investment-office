import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FEISHU_INDEX_FIELD_NAMES,
  FEISHU_INDEX_REQUIRED_FIELDS,
  type FeishuProjectSyncInput,
} from "../../shared/feishu-sync";
import {
  planFeishuProjectSync,
  preflightFeishuProjectSync,
  sanitizeLarkCliError,
  syncProjectToFeishu,
  type LarkCliRunOptions,
  type LarkCliRunResult,
  type LarkCliRunner,
} from "./feishu-sync";

const config = {
  driveRootFolderToken: "fld_root_test",
  baseToken: "bas_test",
  baseTableId: "tbl_test",
};

type FakeDriveEntry = {
  name: string;
  type: "folder" | "file";
  token: string;
  url: string;
};

function success(data: unknown): LarkCliRunResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify({ ok: true, identity: "user", data }),
    stderr: "",
  };
}

class FakeLarkCliRunner implements LarkCliRunner {
  calls: Array<{ args: string[]; cwd: string }> = [];
  folders = new Map<string, FakeDriveEntry[]>([
    [config.driveRootFolderToken, []],
  ]);
  records = new Map<string, Record<string, unknown>>();
  folderSequence = 0;
  fileSequence = 0;
  recordSequence = 0;
  tamperReadBack = false;
  staleReadBacksRemaining = 0;

  async run(
    args: string[],
    options: LarkCliRunOptions
  ): Promise<LarkCliRunResult> {
    this.calls.push({ args: [...args], cwd: options.cwd });
    if (args[0] === "auth" && args[1] === "status")
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          identity: "user",
          verified: true,
          identities: {
            user: { status: "ready", tokenStatus: "valid" },
          },
        }),
        stderr: "",
      };
    if (args[0] === "base" && args[1] === "+field-list")
      return success({
        items: FEISHU_INDEX_REQUIRED_FIELDS.map((name, index) => ({
          field_id: `fld_${index}`,
          field_name: name,
          type:
            name === FEISHU_INDEX_FIELD_NAMES.bpVersion ||
            name === FEISHU_INDEX_FIELD_NAMES.sizeBytes
              ? "number"
              : name === FEISHU_INDEX_FIELD_NAMES.syncedAt
                ? "datetime"
                : "text",
        })),
      });
    if (args[0] === "drive" && args[1] === "files" && args[2] === "list") {
      const params = JSON.parse(args[args.indexOf("--params") + 1]) as {
        folder_token: string;
      };
      return success({
        files: this.folders.get(params.folder_token) ?? [],
        has_more: false,
      });
    }
    if (args[0] === "drive" && args[1] === "+create-folder") {
      const parent = args[args.indexOf("--folder-token") + 1];
      const name = args[args.indexOf("--name") + 1];
      const token = `fld_${++this.folderSequence}`;
      const entry: FakeDriveEntry = {
        name,
        token,
        type: "folder",
        url: `https://example.feishu.cn/drive/folder/${token}`,
      };
      this.folders.set(parent, [...(this.folders.get(parent) ?? []), entry]);
      this.folders.set(token, []);
      return success({ folder_token: token, name });
    }
    if (args[0] === "drive" && args[1] === "+upload") {
      expect(args).not.toContain("--file-token");
      const parent = args[args.indexOf("--folder-token") + 1];
      const name = args[args.indexOf("--name") + 1];
      const file = args[args.indexOf("--file") + 1];
      expect(path.isAbsolute(file)).toBe(false);
      expect(fs.existsSync(path.join(options.cwd, file))).toBe(true);
      const token = `box_${++this.fileSequence}`;
      const entry: FakeDriveEntry = {
        name,
        token,
        type: "file",
        url: `https://example.feishu.cn/file/${token}`,
      };
      this.folders.set(parent, [...(this.folders.get(parent) ?? []), entry]);
      return success({ file_token: token, name });
    }
    if (args[0] === "base" && args[1] === "+record-list") {
      const filter = JSON.parse(args[args.indexOf("--filter-json") + 1]) as {
        conditions: Array<[string, string, string]>;
      };
      const hash = filter.conditions[0][2];
      const projectedFields = args.flatMap((arg, index) =>
        arg === "--field-id" ? [args[index + 1]] : []
      );
      const items = [...this.records.entries()].filter(
        ([, fields]) => fields[FEISHU_INDEX_FIELD_NAMES.sha256] === hash
      );
      return success({
        data: items.map(([, fields]) =>
          projectedFields.map(field => fields[field])
        ),
        fields: projectedFields,
        field_id_list: projectedFields.map((_, index) => `fld_${index}`),
        field_type_list: projectedFields.map(() => "text"),
        record_id_list: items.map(([recordId]) => recordId),
      });
    }
    if (args[0] === "base" && args[1] === "+record-upsert") {
      const fields = JSON.parse(args[args.indexOf("--json") + 1]) as Record<
        string,
        unknown
      >;
      const recordId = `rec_${++this.recordSequence}`;
      this.records.set(recordId, fields);
      return success({
        record: { record_id_list: [recordId] },
        created: true,
      });
    }
    if (args[0] === "base" && args[1] === "+record-get") {
      const recordId = args[args.indexOf("--record-id") + 1];
      const fields = { ...(this.records.get(recordId) ?? {}) };
      if (this.tamperReadBack || this.staleReadBacksRemaining > 0) {
        fields[FEISHU_INDEX_FIELD_NAMES.sha256] = "0".repeat(64);
        if (this.staleReadBacksRemaining > 0) this.staleReadBacksRemaining -= 1;
      }
      const fieldNames = Object.keys(fields);
      return success({
        data: [fieldNames.map(field => fields[field])],
        fields: fieldNames,
        field_id_list: fieldNames.map((_, index) => `fld_${index}`),
        field_type_list: fieldNames.map(() => "text"),
        record_id_list: [recordId],
      });
    }
    return {
      exitCode: 1,
      stdout: "",
      stderr: JSON.stringify({
        ok: false,
        identity: "user",
        error: { message: `unexpected command: ${args.join(" ")}` },
      }),
    };
  }
}

let temporaryDirectory = "";

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cofound-feishu-")
  );
});

afterEach(() => {
  const resolved = path.resolve(temporaryDirectory);
  if (
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
    path.basename(resolved).startsWith("cofound-feishu-")
  )
    fs.rmSync(resolved, { recursive: true, force: true });
});

function fixtureFile(name: string, content: string) {
  const absolutePath = path.join(temporaryDirectory, name);
  fs.writeFileSync(absolutePath, content);
  return {
    absolutePath,
    sha256: createHash("sha256").update(content).digest("hex"),
    sizeBytes: Buffer.byteLength(content),
  };
}

function makeInput(): FeishuProjectSyncInput {
  const first = fixtureFile("bp-v1.pdf", "synthetic-bp-v1");
  const second = fixtureFile("bp-v2.pdf", "synthetic-bp-v2");
  const material = fixtureFile("order.pdf", "synthetic-order-proof");
  return {
    project: { id: "p_fixture", name: "澄川储能（完全虚构）" },
    requestedBy: "Cassian",
    files: [
      {
        fileId: "f_v2",
        kind: "bp",
        category: "bp",
        versionNumber: 2,
        originalName: "澄川储能 BP v2.pdf",
        mimeType: "application/pdf",
        createdAt: "2026-08-22T02:00:00.000Z",
        ...second,
      },
      {
        fileId: "f_v1",
        kind: "bp",
        category: "bp",
        versionNumber: 1,
        originalName: "澄川储能 BP v1.pdf",
        mimeType: "application/pdf",
        createdAt: "2026-08-21T02:00:00.000Z",
        ...first,
      },
      {
        fileId: "m_order",
        kind: "material",
        category: "contracts_orders",
        versionNumber: null,
        originalName: "订单证明.pdf",
        mimeType: "application/pdf",
        createdAt: "2026-08-22T03:00:00.000Z",
        ...material,
      },
    ],
  };
}

describe("Cofound Feishu internal storage adapter", () => {
  it("redacts credentials, Feishu locators, and local paths from CLI errors", () => {
    const safe = sanitizeLarkCliError(
      "Bearer abc123 access_token=secret fldAbcdefgh123 D:\\Workspace\\private.pdf"
    );
    expect(safe).not.toContain("abc123");
    expect(safe).not.toContain("secret");
    expect(safe).not.toContain("fldAbcdefgh123");
    expect(safe).not.toContain("private.pdf");
    expect(safe).toContain("[redacted]");
  });

  it("plans every BP version and performs a side-effect-free dry run", async () => {
    const plan = planFeishuProjectSync(
      config,
      makeInput(),
      new Date("2026-08-22T04:00:00.000Z")
    );
    expect(plan.items.map(item => item.fileId)).toEqual([
      "f_v1",
      "f_v2",
      "m_order",
    ]);
    expect(new Set(plan.items.map(item => item.remoteFilename)).size).toBe(3);
    expect(plan.invariants).toMatchObject({
      identity: "user",
      retainEveryVersion: true,
      overwriteAllowed: false,
      deleteAllowed: false,
      dedupeKey: "sha256",
      baseRole: "thin_index",
      credentialsPersisted: false,
    });
    const runner = new FakeLarkCliRunner();
    const receipt = await syncProjectToFeishu(plan, {
      dryRun: true,
      runner,
      now: new Date("2026-08-22T04:00:00.000Z"),
    });
    expect(receipt.status).toBe("planned");
    expect(receipt.writes).toMatchObject({
      foldersCreated: 0,
      filesUploaded: 0,
      indexRecordsCreated: 0,
      overwrites: 0,
      deletes: 0,
    });
    expect(runner.calls).toHaveLength(0);
  });

  it("preflights add/skip decisions using read-only auth and Base queries", async () => {
    const plan = planFeishuProjectSync(config, makeInput());
    const runner = new FakeLarkCliRunner();
    const first = await preflightFeishuProjectSync(plan, {
      runner,
      cwd: temporaryDirectory,
    });
    expect(first.items).toEqual(
      plan.items.map(item => ({ fileId: item.fileId, action: "add_new" }))
    );
    expect(
      runner.calls.some(call =>
        ["+create-folder", "+upload", "+record-upsert"].some(command =>
          call.args.includes(command)
        )
      )
    ).toBe(false);

    const synced = await syncProjectToFeishu(plan, {
      runner,
      cwd: temporaryDirectory,
    });
    expect(synced.status).toBe("succeeded");
    const callsBeforeSecondPreflight = runner.calls.length;
    const second = await preflightFeishuProjectSync(plan, {
      runner,
      cwd: temporaryDirectory,
    });
    expect(second.items).toEqual(
      plan.items.map(item => ({
        fileId: item.fileId,
        action: "skip_duplicate",
      }))
    );
    const preflightCalls = runner.calls.slice(callsBeforeSecondPreflight);
    expect(preflightCalls.every(call => !call.args.includes("drive"))).toBe(
      true
    );
    expect(
      preflightCalls.some(call =>
        ["+record-upsert", "+record-batch-create", "+record-batch-update"].some(
          command => call.args.includes(command)
        )
      )
    ).toBe(false);
  });

  it("binds the stable plan id to project, actor, layout and file metadata", () => {
    const input = makeInput();
    const baseline = planFeishuProjectSync(config, input).planId;
    const variants: FeishuProjectSyncInput[] = [
      { ...input, project: { ...input.project, name: "另一个项目名" } },
      { ...input, requestedBy: "Maya" },
      {
        ...input,
        files: input.files.map((file, index) =>
          index === 0 ? { ...file, fileId: "different-file-id" } : file
        ),
      },
      {
        ...input,
        files: input.files.map((file, index) =>
          index === 0 ? { ...file, category: "updated-category" } : file
        ),
      },
      {
        ...input,
        files: input.files.map((file, index) =>
          index === 0 ? { ...file, mimeType: "application/octet-stream" } : file
        ),
      },
    ];
    for (const variant of variants)
      expect(planFeishuProjectSync(config, variant).planId).not.toBe(baseline);
    expect(
      planFeishuProjectSync(
        { ...config, driveRootFolderToken: "fld_other_root" },
        input
      ).planId
    ).not.toBe(baseline);
  });

  it("uploads all versions, writes the thin index, and verifies every write", async () => {
    const plan = planFeishuProjectSync(config, makeInput());
    const runner = new FakeLarkCliRunner();
    const receipt = await syncProjectToFeishu(plan, {
      runner,
      cwd: temporaryDirectory,
      now: new Date("2026-08-22T04:00:00.000Z"),
    });
    expect(receipt.status).toBe("succeeded");
    expect(receipt.writes).toEqual({
      foldersCreated: 3,
      filesUploaded: 3,
      indexRecordsCreated: 3,
      overwrites: 0,
      deletes: 0,
    });
    expect(receipt.verification.schemaChecked).toBe(true);
    expect(receipt.verification.allPassed).toBe(true);
    expect(receipt.items.every(item => item.readBackVerified)).toBe(true);
    expect(runner.records).toHaveLength(3);
    for (const call of runner.calls) {
      if (["base", "drive"].includes(call.args[0])) {
        expect(call.args).toContain("--as");
        expect(call.args[call.args.indexOf("--as") + 1]).toBe("user");
      }
      expect(call.args.join(" ")).not.toMatch(/delete|--file-token/u);
    }
  });

  it("is idempotent by SHA-256 on a repeated sync", async () => {
    const plan = planFeishuProjectSync(config, makeInput());
    const runner = new FakeLarkCliRunner();
    const first = await syncProjectToFeishu(plan, {
      runner,
      cwd: temporaryDirectory,
    });
    expect(first.status).toBe("succeeded");
    const callsBeforeSecondRun = runner.calls.length;
    const second = await syncProjectToFeishu(plan, {
      runner,
      cwd: temporaryDirectory,
    });
    expect(second.status).toBe("succeeded");
    expect(second.items.every(item => item.status === "skipped_existing")).toBe(
      true
    );
    expect(second.writes).toMatchObject({
      foldersCreated: 0,
      filesUploaded: 0,
      indexRecordsCreated: 0,
      overwrites: 0,
      deletes: 0,
    });
    const secondRunCalls = runner.calls.slice(callsBeforeSecondRun);
    expect(secondRunCalls.some(call => call.args.includes("+upload"))).toBe(
      false
    );
    expect(
      secondRunCalls.some(call => call.args.includes("+record-upsert"))
    ).toBe(false);
  });

  it("retries a newly written index record until Feishu readback is consistent", async () => {
    const plan = planFeishuProjectSync(config, makeInput());
    const runner = new FakeLarkCliRunner();
    runner.staleReadBacksRemaining = 2;
    const receipt = await syncProjectToFeishu(plan, {
      runner,
      cwd: temporaryDirectory,
      readBackRetryDelay: async () => undefined,
    });
    expect(receipt.status).toBe("succeeded");
    expect(receipt.verification.allPassed).toBe(true);
    expect(receipt.verification.readBackChecks).toBeGreaterThanOrEqual(16);
    expect(
      runner.calls.filter(call => call.args.includes("+record-get")).length
    ).toBeGreaterThanOrEqual(5);
  });

  it("fails closed when the source bytes no longer match the stored hash", () => {
    const input = makeInput();
    fs.appendFileSync(input.files[0].absolutePath, "tampered");
    expect(() => planFeishuProjectSync(config, input)).toThrow(
      "文件内容与 SHA-256 不一致"
    );
  });

  it("revalidates source bytes after planning and before the first CLI call", async () => {
    const input = makeInput();
    const plan = planFeishuProjectSync(config, input);
    fs.appendFileSync(input.files[0].absolutePath, "changed-after-plan");
    const runner = new FakeLarkCliRunner();
    const receipt = await syncProjectToFeishu(plan, {
      runner,
      cwd: temporaryDirectory,
    });
    expect(receipt.status).toBe("failed");
    expect(receipt.error).toContain("执行前文件内容校验失败");
    expect(runner.calls).toHaveLength(0);
  });

  it("returns a failed receipt when Base write-after-readback differs", async () => {
    const plan = planFeishuProjectSync(config, makeInput());
    const runner = new FakeLarkCliRunner();
    runner.tamperReadBack = true;
    const receipt = await syncProjectToFeishu(plan, {
      runner,
      cwd: temporaryDirectory,
      readBackRetryDelay: async () => undefined,
    });
    expect(receipt.status).toBe("failed");
    expect(receipt.verification.allPassed).toBe(false);
    expect(receipt.verification.readBackChecks).toBeGreaterThanOrEqual(12);
    expect(receipt.items[0].error).toContain("SHA-256 回读不一致");
    expect(receipt.writes.deletes).toBe(0);
    expect(receipt.writes.overwrites).toBe(0);
  });
});
