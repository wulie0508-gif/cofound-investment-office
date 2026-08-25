import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES as FIELDS,
  FEISHU_PRODUCT_FEEDBACK_FIELD_PROJECTION,
} from "../../shared/feishu-feedback";
import {
  productFeedbackHandoffPayloadSchema,
  type ProductFeedbackHandoffPayload,
} from "../../shared/product-feedback";
import {
  FeishuFeedbackAdapterError,
  preflightFeishuProductFeedback,
  pullFeishuMaintenanceInbox,
  pullFeishuMaintenanceUpdatesForOriginKeys,
  syncProductFeedbackRecord,
  withFeishuFeedbackCollaborationLock,
} from "./feishu-feedback";
import type {
  LarkCliRunOptions,
  LarkCliRunResult,
  LarkCliRunner,
} from "./feishu-sync";

const config = { baseToken: "bas_feedback_test", tableId: "tbl_feedback" };

function success(data: unknown): LarkCliRunResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify({ ok: true, identity: "user", data }),
    stderr: "",
  };
}

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

function payload(
  overrides: Partial<ProductFeedbackHandoffPayload> = {}
): ProductFeedbackHandoffPayload {
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
    title: "筛选操作不够清楚",
    description: "项目筛选后不容易看出当前条件，希望增加更清楚的提示。",
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

type FakeRecord = { id: string; fields: Record<string, unknown> };

class FakeFeedbackRunner implements LarkCliRunner {
  calls: string[][] = [];
  records: FakeRecord[] = [];
  nextRecord = 0;
  failReads = false;
  datetimeReadbackAsMilliseconds = false;

  seed(value: ProductFeedbackHandoffPayload, maintenance = {}) {
    const parsed = productFeedbackHandoffPayloadSchema.parse(value);
    const serialized = JSON.stringify(canonicalize(parsed));
    const fingerprint = createHash("sha256").update(serialized).digest("hex");
    const record = {
      id: `rec_seed_${++this.nextRecord}`,
      fields: {
        [FIELDS.collaborationKey]: parsed.originKey,
        [FIELDS.feedbackId]: parsed.feedbackId,
        [FIELDS.latestOutboxId]: parsed.outboxId,
        [FIELDS.handoffFingerprint]: fingerprint,
        [FIELDS.frozenPayload]: serialized,
        [FIELDS.handoffKind]: parsed.kind,
        [FIELDS.sequence]: parsed.sequence,
        [FIELDS.round]: parsed.round,
        ...maintenance,
      },
    };
    this.records.push(record);
    return record;
  }

  async run(
    args: string[],
    _options: LarkCliRunOptions
  ): Promise<LarkCliRunResult> {
    this.calls.push([...args]);
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
        items: FEISHU_PRODUCT_FEEDBACK_FIELD_PROJECTION.map((field, index) => ({
          field_id: `fld_${index}`,
          field_name: field.name,
          type: field.type,
        })),
      });
    if (args[0] === "base" && args[1] === "+record-list") {
      if (this.failReads)
        return {
          exitCode: 1,
          stdout: "",
          stderr: JSON.stringify({
            ok: false,
            error: { message: "access_token=never-expose-this" },
          }),
        };
      const filterIndex = args.indexOf("--filter-json");
      let records = this.records;
      if (filterIndex >= 0) {
        const filter = JSON.parse(args[filterIndex + 1]) as {
          conditions: Array<[string, string, string]>;
        };
        const key = filter.conditions[0][2];
        records = records.filter(
          record => record.fields[FIELDS.collaborationKey] === key
        );
      }
      const offsetIndex = args.indexOf("--offset");
      const limitIndex = args.indexOf("--limit");
      const offset = offsetIndex >= 0 ? Number(args[offsetIndex + 1]) : 0;
      const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 100;
      const page = records.slice(offset, offset + limit);
      return success({
        records: page.map(record => ({
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
        return success({ record: { record_id: record.id }, updated: true });
      }
      const record: FakeRecord = {
        id: `rec_${++this.nextRecord}`,
        fields,
      };
      this.records.push(record);
      return success({ record: { record_id: record.id }, created: true });
    }
    if (args[0] === "base" && args[1] === "+record-get") {
      const id = args[args.indexOf("--record-id") + 1];
      const record = this.records.find(item => item.id === id);
      const fields = record ? { ...record.fields } : undefined;
      if (fields && this.datetimeReadbackAsMilliseconds)
        for (const field of FEISHU_PRODUCT_FEEDBACK_FIELD_PROJECTION.filter(
          item => item.type === "datetime"
        )) {
          const value = fields[field.name];
          if (
            typeof value === "string" &&
            /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(value)
          )
            fields[field.name] = Date.parse(`${value.replace(" ", "T")}+08:00`);
        }
      return success({
        record: record ? { record_id: record.id, fields } : undefined,
      });
    }
    return {
      exitCode: 1,
      stdout: "",
      stderr: JSON.stringify({
        ok: false,
        error: { message: "unsupported fake command" },
      }),
    };
  }
}

describe("Feishu product feedback adapter", () => {
  it("performs a read-only user and schema preflight", async () => {
    const runner = new FakeFeedbackRunner();
    await expect(
      preflightFeishuProductFeedback(config, { runner })
    ).resolves.toEqual({ status: "ready" });
    expect(runner.calls.map(call => call.slice(0, 2))).toEqual([
      ["auth", "status"],
      ["base", "+field-list"],
    ]);
  });

  it("creates once and skips an identical frozen outbox on retry", async () => {
    const runner = new FakeFeedbackRunner();
    const value = payload();
    const first = await syncProductFeedbackRecord(config, value, {
      runner,
      waitForRetry: async () => undefined,
    });
    const writesAfterFirst = runner.calls.filter(call =>
      call.includes("+record-upsert")
    ).length;
    const second = await syncProductFeedbackRecord(config, value, {
      runner,
      waitForRetry: async () => undefined,
    });
    expect(first.action).toBe("created");
    expect(second.action).toBe("skipped_existing");
    expect(
      runner.calls.filter(call => call.includes("+record-upsert")).length
    ).toBe(writesAfterFirst);
  });

  it("updates a later diagnosis without overwriting maintainer-owned fields", async () => {
    const runner = new FakeFeedbackRunner();
    const first = payload();
    const seeded = runner.seed(first, {
      [FIELDS.processingStatus]: "accepted",
      [FIELDS.maintainerReply]: "已纳入下一轮改进。",
    });
    const update = payload({
      kind: "diagnosis_update",
      outboxId: "feedback_outbox_00000002",
      sequence: 2,
      sourceUpdatedAt: "2026-08-24T03:00:00.000Z",
      diagnosis: {
        summary: "筛选状态缺少持续可见的提示。",
        proposedActions: ["保留当前筛选摘要。"],
        checks: [
          {
            label: "筛选状态",
            status: "passed",
            summary: "已确认问题可以稳定复现。",
          },
        ],
        risks: ["移动端空间需要控制。"],
        openQuestions: ["是否需要保存常用筛选。"],
      },
      trialFixStatus: "passed",
    });
    const receipt = await syncProductFeedbackRecord(config, update, {
      runner,
      waitForRetry: async () => undefined,
    });
    expect(receipt.action).toBe("updated");
    expect(seeded.fields[FIELDS.processingStatus]).toBe("accepted");
    expect(seeded.fields[FIELDS.maintainerReply]).toBe("已纳入下一轮改进。");
    const updateCall = runner.calls.find(call =>
      call.includes("+record-upsert")
    );
    expect(updateCall).toContain("--record-id");
  });

  it("projects versions and all timestamps in Asia/Shanghai", async () => {
    const runner = new FakeFeedbackRunner();
    runner.datetimeReadbackAsMilliseconds = true;
    runner.seed(payload());
    const update = payload({
      kind: "maintenance_update",
      outboxId: "feedback_outbox_00000002",
      sequence: 2,
      applicationVersion: "1.1.0",
      capabilityPackVersion: "0.12.0+codex.20260825",
      sourceUpdatedAt: "2026-08-24T16:30:00.000Z",
      triageStatus: "completed",
      maintainerNote: "已完成并等待本机刷新。",
      maintenanceTaskId: "iteration_00000001",
      maintainerName: "维护者",
      maintenanceUpdatedAt: "2026-08-24T16:30:00.000Z",
    });
    await syncProductFeedbackRecord(config, update, {
      runner,
      waitForRetry: async () => undefined,
    });
    const record = runner.records[0];
    expect(record.fields).toMatchObject({
      [FIELDS.applicationVersion]: "1.1.0",
      [FIELDS.capabilityPackVersion]: "0.12.0+codex.20260825",
      [FIELDS.submittedAt]: "2026-08-24 10:00:00",
      [FIELDS.sourceUpdatedAt]: "2026-08-25 00:30:00",
      [FIELDS.processingStatus]: "completed",
      [FIELDS.maintainerName]: "维护者",
      [FIELDS.maintenanceUpdatedAt]: "2026-08-25 00:30:00",
    });
  });

  it("fails closed if the same outbox id is reused with changed content", async () => {
    const runner = new FakeFeedbackRunner();
    const original = payload();
    runner.seed(original);
    const changed = payload({ description: "同一发送项出现了不同内容。" });
    await expect(
      syncProductFeedbackRecord(config, changed, { runner })
    ).rejects.toMatchObject({ code: "payload_conflict" });
    expect(runner.calls.some(call => call.includes("+record-upsert"))).toBe(
      false
    );
  });

  it("fails closed when an earlier outbox has not reached the remote record", async () => {
    const runner = new FakeFeedbackRunner();
    const diagnosisWithoutInitial = payload({
      kind: "diagnosis_update",
      outboxId: "feedback_outbox_00000002",
      sequence: 2,
      sourceUpdatedAt: "2026-08-24T03:00:00.000Z",
      diagnosis: {
        summary: "已有诊断，但首次提交尚未同步。",
        proposedActions: ["先恢复首次提交。"],
        checks: [],
        risks: [],
        openQuestions: [],
      },
    });
    await expect(
      syncProductFeedbackRecord(config, diagnosisWithoutInitial, { runner })
    ).rejects.toMatchObject({ code: "payload_conflict" });
    expect(runner.records).toHaveLength(0);

    runner.seed(payload());
    const sequenceGap = payload({
      kind: "diagnosis_update",
      outboxId: "feedback_outbox_00000003",
      sequence: 3,
      sourceUpdatedAt: "2026-08-24T04:00:00.000Z",
      diagnosis: diagnosisWithoutInitial.diagnosis,
    });
    await expect(
      syncProductFeedbackRecord(config, sequenceGap, { runner })
    ).rejects.toMatchObject({ code: "payload_conflict" });
  });

  it("pulls every page and validates each frozen payload", async () => {
    const runner = new FakeFeedbackRunner();
    for (let index = 0; index < 205; index += 1)
      runner.seed(
        payload({
          outboxId: `feedback_outbox_${String(index).padStart(8, "0")}`,
          originKey: `feedback:origin-${String(index).padStart(8, "0")}`,
          feedbackId: `feedback_${String(index).padStart(8, "0")}`,
        })
      );
    const snapshot = await pullFeishuMaintenanceInbox(config, {
      runner,
      now: new Date("2026-08-24T04:00:00.000Z"),
    });
    expect(snapshot.items).toHaveLength(205);
    expect(snapshot.pageCount).toBe(2);
    expect(snapshot.readAt).toBe("2026-08-24T04:00:00.000Z");
  });

  it("pulls reporter updates only through exact collaboration-key queries", async () => {
    const runner = new FakeFeedbackRunner();
    const own = payload({
      kind: "maintenance_update",
      outboxId: "feedback_outbox_00000002",
      sequence: 2,
      sourceUpdatedAt: "2026-08-24T05:00:00.000Z",
      triageStatus: "accepted",
      maintainerNote: "已纳入维护任务。",
      maintenanceTaskId: "iteration_00000001",
      maintainerName: "维护者",
      maintenanceUpdatedAt: "2026-08-24T05:00:00.000Z",
    });
    runner.seed(own);
    runner.seed(
      payload({
        originKey: "feedback:another-origin",
        feedbackId: "feedback_00000002",
        outboxId: "feedback_outbox_00000003",
      })
    );
    const snapshot = await pullFeishuMaintenanceUpdatesForOriginKeys(
      config,
      [own.originKey],
      { runner, now: new Date("2026-08-24T06:00:00.000Z") }
    );
    expect(snapshot.items.map(item => item.collaborationKey)).toEqual([
      own.originKey,
    ]);
    expect(snapshot.queryCount).toBe(1);
    const recordLists = runner.calls.filter(call =>
      call.includes("+record-list")
    );
    expect(recordLists).toHaveLength(1);
    expect(recordLists.every(call => call.includes("--filter-json"))).toBe(
      true
    );
    expect(recordLists.every(call => !call.includes("--offset"))).toBe(true);
  });

  it("maps remote CLI details to a safe error code", async () => {
    const runner = new FakeFeedbackRunner();
    runner.failReads = true;
    let received: unknown;
    try {
      await syncProductFeedbackRecord(config, payload(), { runner });
    } catch (error) {
      received = error;
    }
    expect(received).toBeInstanceOf(FeishuFeedbackAdapterError);
    expect(received).toMatchObject({
      code: "remote_read_failed",
      message: "remote_read_failed",
    });
    expect(JSON.stringify(received)).not.toContain("never-expose-this");
  });

  it("serializes the same Base and collaboration key", async () => {
    const events: string[] = [];
    let release: () => void = () => undefined;
    let started: () => void = () => undefined;
    const firstStarted = new Promise<void>(resolve => {
      started = resolve;
    });
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const first = withFeishuFeedbackCollaborationLock(
      config.baseToken,
      "feedback:lock-test",
      async () => {
        events.push("first:start");
        started();
        await gate;
        events.push("first:end");
      }
    );
    await firstStarted;
    const second = withFeishuFeedbackCollaborationLock(
      config.baseToken,
      "feedback:lock-test",
      async () => {
        events.push("second:start");
      }
    );
    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });
});
