import { describe, expect, it } from "vitest";
import type { FeishuProjectSyncPlan } from "../../shared/feishu-sync";
import type { OperationSummary } from "../../shared/operation-ledger";
import {
  assertEnterpriseSharedStorageScope,
  createFeishuConfirmationPlan,
  summarizeInternalStorageOperations,
  withProjectFeishuSyncLock,
} from "./feishu-sync-service";

function operation(
  id: number,
  projectId: string,
  status: OperationSummary["status"],
  itemCount: number,
  finishedAt: string | null,
  storageBinding?: string
) {
  return {
    id,
    operationId: `op_${id}`,
    operationType: "feishu_sync",
    status,
    occurredAt: finishedAt ?? "2026-08-22T00:00:00.000Z",
    startedAt: "2026-08-22T00:00:00.000Z",
    finishedAt,
    projectId,
    fileHash: null,
    appVersion: "1.0.1",
    actor: { kind: "codex", id: "tester" },
    skill: null,
    model: null,
    promptVersion: null,
    error: status === "failed" ? { code: "TEST", message: "test" } : null,
    metadata: { itemCount, ...(storageBinding ? { storageBinding } : {}) },
    eventCount: 2,
  } satisfies OperationSummary;
}

describe("internal storage operation summary", () => {
  it("allows only an explicitly verified enterprise-shared sync target", () => {
    const base = {
      driveRootFolderToken: "fld_test",
      baseToken: "bas_test",
      baseTableId: "tbl_test",
    };

    expect(() =>
      assertEnterpriseSharedStorageScope({
        ...base,
        storageScope: "enterprise_shared",
      })
    ).not.toThrow();
    expect(() =>
      assertEnterpriseSharedStorageScope({ ...base, storageScope: "personal" })
    ).toThrow("正式内部同步只允许使用已核验的企业共享目录");
    expect(() => assertEnterpriseSharedStorageScope(base)).toThrow(
      "正式内部同步只允许使用已核验的企业共享目录"
    );
  });

  it("serializes concurrent Feishu writes for the same project", async () => {
    const events: string[] = [];
    let releaseFirst: () => void = () => undefined;
    let markFirstStarted: () => void = () => undefined;
    const firstStarted = new Promise<void>(resolve => {
      markFirstStarted = resolve;
    });
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const first = withProjectFeishuSyncLock("p_serial", async () => {
      events.push("first:start");
      markFirstStarted();
      await firstGate;
      events.push("first:end");
    });
    await firstStarted;
    const second = withProjectFeishuSyncLock("p_serial", async () => {
      events.push("second:start");
      events.push("second:end");
    });
    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  it("counts the latest successful snapshot once per project", () => {
    const summary = summarizeInternalStorageOperations([
      operation(6, "p_3", "started", 1, null),
      operation(5, "p_1", "succeeded", 2, "2026-08-22T06:00:00.000Z"),
      operation(4, "p_1", "succeeded", 2, "2026-08-22T05:00:00.000Z"),
      operation(3, "p_2", "failed", 4, "2026-08-22T04:00:00.000Z"),
      operation(2, "p_2", "succeeded", 3, "2026-08-22T03:00:00.000Z"),
    ]);

    expect(summary).toEqual({
      projectCount: 2,
      fileCount: 5,
      pendingCount: 1,
      failedCount: 1,
      lastSyncAt: "2026-08-22T06:00:00.000Z",
    });
  });

  it("does not mix legacy or another Drive target into current statistics", () => {
    const summary = summarizeInternalStorageOperations(
      [
        operation(
          3,
          "p_current",
          "succeeded",
          2,
          "2026-08-24T03:00:00.000Z",
          "binding_current"
        ),
        operation(
          2,
          "p_other",
          "succeeded",
          4,
          "2026-08-24T02:00:00.000Z",
          "binding_other"
        ),
        operation(1, "p_legacy", "succeeded", 6, "2026-08-24T01:00:00.000Z"),
      ],
      "binding_current"
    );

    expect(summary).toEqual({
      projectCount: 1,
      fileCount: 2,
      pendingCount: 0,
      failedCount: 0,
      lastSyncAt: "2026-08-24T03:00:00.000Z",
    });
  });

  it("builds a nontechnical confirmation summary without hashes or locators", () => {
    const plan = {
      schemaVersion: "1.0",
      planId: "fsp_private_plan_binding",
      generatedAt: "2026-08-23T00:00:00.000Z",
      project: { id: "p_test", name: "虚构项目" },
      requestedBy: "Cassian",
      config: {
        driveRootFolderToken: "fld_private",
        baseToken: "bas_private",
        baseTableId: "tbl_private",
      },
      folderLayout: {
        projectFolderName: "虚构项目 [p_test]",
        bpFolderName: "01_BP 原件",
        materialFolderName: "02_补充材料",
      },
      items: [
        {
          fileId: "f_bp",
          kind: "bp",
          category: "BP",
          versionNumber: 2,
          originalName: "虚构项目 BP.pdf",
          absolutePath: "C:/private/bp.pdf",
          sha256: "a".repeat(64),
          sizeBytes: 123,
          mimeType: "application/pdf",
          createdAt: "2026-08-23T00:00:00.000Z",
          syncKey: "a".repeat(64),
          folderKind: "bp",
          remoteFilename: "BP-v002-private.pdf",
        },
        {
          fileId: "f_material",
          kind: "material",
          category: "订单",
          versionNumber: null,
          originalName: "订单补充材料.pdf",
          absolutePath: "C:/private/order.pdf",
          sha256: "b".repeat(64),
          sizeBytes: 456,
          mimeType: "application/pdf",
          createdAt: "2026-08-23T00:00:00.000Z",
          syncKey: "b".repeat(64),
          folderKind: "material",
          remoteFilename: "order-private.pdf",
        },
      ],
      invariants: {
        identity: "user",
        retainEveryVersion: true,
        overwriteAllowed: false,
        deleteAllowed: false,
        dedupeKey: "sha256",
        baseRole: "thin_index",
        credentialsPersisted: false,
      },
    } satisfies FeishuProjectSyncPlan;

    const confirmation = createFeishuConfirmationPlan(
      plan,
      {
        items: [
          { fileId: "f_bp", action: "add_new" },
          { fileId: "f_material", action: "skip_duplicate" },
        ],
      },
      "Cofound Investment Office"
    );
    expect(confirmation).toMatchObject({
      project: { id: "p_test", name: "虚构项目" },
      targetFolder: "Cofound Investment Office / 虚构项目 [p_test]",
      items: [
        {
          fileType: "BP",
          fileName: "虚构项目 BP.pdf",
          bpVersion: 2,
          expectedAction: "add_new",
        },
        {
          fileType: "补充材料",
          fileName: "订单补充材料.pdf",
          bpVersion: null,
          expectedAction: "skip_duplicate",
        },
      ],
    });
    const humanFields = JSON.stringify({
      project: confirmation.project,
      targetFolder: confirmation.targetFolder,
      items: confirmation.items.map(
        ({ fileType, fileName, bpVersion, expectedAction }) => ({
          fileType,
          fileName,
          bpVersion,
          expectedAction,
        })
      ),
    });
    expect(humanFields).not.toContain("SHA-256");
    expect(humanFields).not.toContain("sha256");
    expect(humanFields).not.toContain("planId");
    expect(humanFields).not.toContain("Token");
  });
});
