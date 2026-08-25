import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES as FIELDS,
  FEISHU_PRODUCT_FEEDBACK_FIELD_PROJECTION,
} from "../../shared/feishu-feedback";
import {
  productFeedbackHandoffPayloadSchema,
  type ProductFeedbackHandoffPayload,
  type ProductFeedbackOutboxDto,
} from "../../shared/product-feedback";
import { LocalDatabase } from "./database";
import {
  refreshMaintenanceInbox,
  refreshReporterMaintenanceUpdates,
  syncPendingFeedback,
  type ProductFeedbackSyncPort,
} from "./feishu-feedback-service";
import type {
  LarkCliRunOptions,
  LarkCliRunResult,
  LarkCliRunner,
} from "./feishu-sync";

type FakeRecord = { id: string; fields: Record<string, unknown> };

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  return value;
}

function success(data: unknown): LarkCliRunResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify({ ok: true, identity: "user", data }),
    stderr: "",
  };
}

function feedbackPayload(
  overrides: Partial<ProductFeedbackHandoffPayload> = {}
) {
  return productFeedbackHandoffPayloadSchema.parse({
    schemaVersion: "1.0",
    applicationVersion: "1.0.0",
    capabilityPackVersion: "0.11.0+codex.20260824",
    kind: "initial_submission",
    outboxId: "feedback_outbox_00000001",
    sequence: 1,
    originKey: "feedback:origin-00000001",
    feedbackId: "feedback_00000001",
    round: 1,
    reporterName: "小明",
    title: "筛选状态不够清楚",
    description: "筛选后不容易确认当前条件，希望增加更清楚的提示。",
    expectedOutcome: "能快速确认当前筛选范围。",
    category: "workflow",
    impact: "inconvenient",
    submittedAt: "2026-08-24T02:00:00.000Z",
    sourceUpdatedAt: "2026-08-24T02:00:00.000Z",
    diagnosis: null,
    trialFixStatus: "not_attempted",
    triageStatus: null,
    maintainerNote: null,
    maintenanceTaskId: null,
    maintainerName: null,
    maintenanceUpdatedAt: null,
    ...overrides,
  });
}

class FakeFeedbackRunner implements LarkCliRunner {
  calls: string[][] = [];
  records: FakeRecord[] = [];
  nextRecord = 0;

  seed(value: ProductFeedbackHandoffPayload) {
    const serialized = JSON.stringify(canonicalize(value));
    const fingerprint = createHash("sha256").update(serialized).digest("hex");
    this.records.push({
      id: `rec_seed_${++this.nextRecord}`,
      fields: {
        [FIELDS.collaborationKey]: value.originKey,
        [FIELDS.feedbackId]: value.feedbackId,
        [FIELDS.latestOutboxId]: value.outboxId,
        [FIELDS.handoffFingerprint]: fingerprint,
        [FIELDS.frozenPayload]: serialized,
        [FIELDS.handoffKind]: value.kind,
        [FIELDS.sequence]: value.sequence,
        [FIELDS.round]: value.round,
      },
    });
  }

  async run(args: string[], _options: LarkCliRunOptions) {
    this.calls.push([...args]);
    if (args[0] === "auth" && args[1] === "status")
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          identity: "user",
          verified: true,
          identities: { user: { status: "ready", tokenStatus: "valid" } },
        }),
        stderr: "",
      } satisfies LarkCliRunResult;
    if (args[0] === "base" && args[1] === "+field-list")
      return success({
        items: FEISHU_PRODUCT_FEEDBACK_FIELD_PROJECTION.map(field => ({
          field_name: field.name,
          type: field.type,
        })),
      });
    if (args[0] === "base" && args[1] === "+record-list") {
      const filterIndex = args.indexOf("--filter-json");
      let records = this.records;
      if (filterIndex >= 0) {
        const filter = JSON.parse(args[filterIndex + 1]) as {
          conditions: Array<[string, string, string]>;
        };
        records = records.filter(
          record =>
            record.fields[FIELDS.collaborationKey] === filter.conditions[0][2]
        );
      }
      const offsetIndex = args.indexOf("--offset");
      const limitIndex = args.indexOf("--limit");
      const offset = offsetIndex < 0 ? 0 : Number(args[offsetIndex + 1]);
      const limit = limitIndex < 0 ? 100 : Number(args[limitIndex + 1]);
      return success({
        records: records.slice(offset, offset + limit).map(record => ({
          record_id: record.id,
          fields: record.fields,
        })),
      });
    }
    if (args[0] === "base" && args[1] === "+record-upsert") {
      const fields = JSON.parse(args[args.indexOf("--json") + 1]) as Record<
        string,
        unknown
      >;
      const recordIdIndex = args.indexOf("--record-id");
      if (recordIdIndex >= 0) {
        const record = this.records.find(
          item => item.id === args[recordIdIndex + 1]
        );
        if (!record) throw new Error("missing fake record");
        record.fields = { ...record.fields, ...fields };
        return success({ record: { record_id: record.id } });
      }
      const record = {
        id: `rec_${++this.nextRecord}`,
        fields,
      };
      this.records.push(record);
      return success({ record: { record_id: record.id } });
    }
    if (args[0] === "base" && args[1] === "+record-get") {
      const recordId = args[args.indexOf("--record-id") + 1];
      const record = this.records.find(item => item.id === recordId);
      return success({
        record: record
          ? { record_id: record.id, fields: record.fields }
          : undefined,
      });
    }
    return {
      exitCode: 1,
      stdout: "",
      stderr: JSON.stringify({ ok: false, error: { message: "unsupported" } }),
    } satisfies LarkCliRunResult;
  }
}

function outbox(
  value: ProductFeedbackHandoffPayload
): ProductFeedbackOutboxDto {
  return {
    id: value.outboxId,
    feedbackId: value.feedbackId,
    kind: value.kind,
    sequence: value.sequence,
    payload: value,
    status: "pending",
    attemptCount: 0,
    createdAt: value.sourceUpdatedAt,
    updatedAt: value.sourceUpdatedAt,
  };
}

function port(overrides: Partial<ProductFeedbackSyncPort> = {}) {
  return {
    capabilities: vi.fn(() => ({ maintainerMode: true })),
    pendingOutbox: vi.fn(() => []),
    pendingOutboxForFeedback: vi.fn(() => []),
    markOutboxSynced: vi.fn(),
    markOutboxFailed: vi.fn(),
    ingestRemote: vi.fn(),
    trackedOriginKeys: vi.fn(() => []),
    applyRemoteMaintenanceUpdate: vi.fn(),
    ...overrides,
  } as unknown as ProductFeedbackSyncPort;
}

describe("Feishu product feedback sync service", () => {
  let temporaryDirectory = "";
  let database: LocalDatabase;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "cofound-feedback-sync-")
    );
    database = new LocalDatabase({ dataDir: temporaryDirectory });
  });

  afterEach(() => {
    database.close();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  function configure() {
    fs.writeFileSync(
      path.join(temporaryDirectory, "feishu-internal-storage.json"),
      JSON.stringify({
        driveRootFolderToken: "fld_test",
        baseToken: "bas_internal_index",
        baseTableId: "tbl_internal_index",
        feedbackBaseToken: "bas_feedback",
        feedbackTableId: "tbl_product_feedback",
      }),
      "utf8"
    );
  }

  it("does no CLI work when the feedback table is not explicitly configured", async () => {
    const runner = new FakeFeedbackRunner();
    const result = await syncPendingFeedback(port(), { database, runner });
    expect(result.status).toBe("not_configured");
    expect(runner.calls).toEqual([]);
  });

  it("checks maintainer capability before reading the shared feedback table", async () => {
    configure();
    const runner = new FakeFeedbackRunner();
    const result = await refreshMaintenanceInbox(
      port({ capabilities: vi.fn(() => ({ maintainerMode: false })) }),
      { database, runner }
    );
    expect(result).toMatchObject({
      status: "failed",
      errorCode: "maintainer_required",
      received: 0,
    });
    expect(runner.calls).toEqual([]);
  });

  it("syncs only the requested feedback instead of draining the global outbox", async () => {
    configure();
    const runner = new FakeFeedbackRunner();
    const selected = feedbackPayload();
    const other = feedbackPayload({
      feedbackId: "feedback_00000002",
      originKey: "feedback:origin-00000002",
      outboxId: "feedback_outbox_00000002",
    });
    const syncPort = port({
      pendingOutbox: vi.fn(() => [outbox(other)]),
      pendingOutboxForFeedback: vi.fn(() => [outbox(selected)]),
    });
    const result = await syncPendingFeedback(syncPort, {
      database,
      runner,
      feedbackId: selected.feedbackId,
      waitForRetry: async () => undefined,
    });
    expect(result).toMatchObject({ attempted: 1, succeeded: 1, failed: 0 });
    expect(syncPort.pendingOutboxForFeedback).toHaveBeenCalledWith(
      selected.feedbackId,
      50
    );
    expect(syncPort.pendingOutbox).not.toHaveBeenCalled();
    expect(syncPort.markOutboxSynced).toHaveBeenCalledWith({
      outboxId: selected.outboxId,
      remoteRecordId: "rec_1",
    });
  });

  it("keeps maintainer and reporter pull paths separated", async () => {
    configure();
    const runner = new FakeFeedbackRunner();
    const incoming = feedbackPayload();
    const maintenance = feedbackPayload({
      feedbackId: "feedback_00000002",
      originKey: "feedback:origin-00000002",
      outboxId: "feedback_outbox_00000002",
      sequence: 2,
      kind: "maintenance_update",
      sourceUpdatedAt: "2026-08-24T04:00:00.000Z",
      triageStatus: "completed",
      maintainerNote: "维护已完成。",
      maintenanceTaskId: "iteration_00000001",
      maintainerName: "维护者",
      maintenanceUpdatedAt: "2026-08-24T04:00:00.000Z",
    });
    runner.seed(incoming);
    runner.seed(maintenance);
    const maintainerPort = port();
    const maintainerResult = await refreshMaintenanceInbox(maintainerPort, {
      database,
      runner,
    });
    expect(maintainerResult).toMatchObject({
      received: 2,
      ingested: 1,
      ignored: 1,
      failed: 0,
    });
    expect(maintainerPort.ingestRemote).toHaveBeenCalledTimes(1);
    expect(maintainerPort.ingestRemote).toHaveBeenCalledWith({
      payload: incoming,
      remoteRecordId: "rec_seed_1",
    });

    runner.calls = [];
    const reporterPort = port({
      trackedOriginKeys: vi.fn(() => [
        { id: maintenance.feedbackId, originKey: maintenance.originKey },
      ]),
    });
    const reporterResult = await refreshReporterMaintenanceUpdates(
      reporterPort,
      { database, runner }
    );
    expect(reporterResult).toMatchObject({
      tracked: 1,
      received: 1,
      applied: 1,
      failed: 0,
      queryCount: 1,
    });
    expect(reporterPort.applyRemoteMaintenanceUpdate).toHaveBeenCalledWith({
      payload: maintenance,
      remoteRecordId: "rec_seed_2",
    });
    const recordLists = runner.calls.filter(call =>
      call.includes("+record-list")
    );
    expect(recordLists).toHaveLength(1);
    expect(recordLists[0]).toContain("--filter-json");
    expect(recordLists[0]).not.toContain("--offset");
  });
});
