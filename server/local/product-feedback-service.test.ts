import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProductFeedbackDiagnosis } from "../../shared/product-feedback";
import { LocalDatabase } from "./database";
import { IterationService } from "./iteration-service";
import {
  ProductFeedbackService,
  ProductFeedbackServiceError,
} from "./product-feedback-service";

let temporaryDirectories: string[] = [];
let databases: LocalDatabase[] = [];
let database: LocalDatabase;
let iterationService: IterationService;
let service: ProductFeedbackService;
let currentTimeMs = 0;
let feedbackSequence = 0;
let outboxSequence = 0;
let iterationSequence = 0;
let tokenSequence = 0;

const diagnosis: ProductFeedbackDiagnosis = {
  summary: "已确认筛选交互存在状态反馈不清晰的问题。",
  proposedActions: ["补充明确的加载状态", "保留用户已经选择的条件"],
  checks: [
    {
      label: "本地复现",
      status: "passed",
      summary: "在测试项目中稳定复现并完成边界检查。",
    },
  ],
  risks: ["仍需负责人确认最终中文提示。"],
  openQuestions: ["是否同时调整英文提示？"],
};

function makeDatabase(prefix: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  const target = new LocalDatabase({
    dataDir: directory,
    dbPath: path.join(directory, "test.sqlite"),
  });
  databases.push(target);
  return target;
}

function makeIterationService(target: LocalDatabase) {
  return new IterationService(target, {
    clock: () => new Date(currentTimeMs).toISOString(),
    idFactory: () => `iteration_feedback_${++iterationSequence}`,
    claimTokenFactory: () => `iteration-token-${"x".repeat(40)}`,
    headRefResolver: () => "a".repeat(40),
    candidateRefVerifier: () => true,
    candidateAncestryVerifier: () => true,
    appVersion: "1.2.0-test",
  });
}

function makeFeedbackService(
  target: LocalDatabase,
  iterations: IterationService,
  maintainerMode: boolean
) {
  return new ProductFeedbackService(target, iterations, {
    clock: () => new Date(currentTimeMs).toISOString(),
    idFactory: () => `feedback_test_${++feedbackSequence}`,
    outboxIdFactory: () => `feedback_outbox_test_${++outboxSequence}`,
    claimTokenFactory: () =>
      `feedback-claim-${String(++tokenSequence).padStart(40, "0")}`,
    leaseDurationMs: 60_000,
    maintainerMode,
    appVersion: "1.2.0-test",
    capabilityPackVersion: "0.11.0+codex.20260824",
  });
}

function createFeedback(target = service) {
  return target.create({
    description: "项目筛选后缺少清晰的加载反馈",
    expectedOutcome: "筛选期间显示状态并保留已选条件",
    category: "interface",
    impact: "inconvenient",
    reporterName: "Cassian",
  });
}

function completeDiagnosis(target = service, id?: string) {
  const feedbackId = id ?? createFeedback(target).id;
  const claim = target.claim({
    id: feedbackId,
    claimedBy: "Codex desktop",
    modelName: "gpt-5",
  });
  if (!claim) throw new Error("claim failed");
  currentTimeMs += 1_000;
  return {
    feedback: target.complete({
      id: feedbackId,
      claimToken: claim.claimToken,
      modelName: "gpt-5",
      diagnosis,
      trialFixStatus: "passed",
    }),
    claim,
  };
}

beforeEach(() => {
  temporaryDirectories = [];
  databases = [];
  currentTimeMs = Date.UTC(2026, 7, 24, 8, 0, 0);
  feedbackSequence = 0;
  outboxSequence = 0;
  iterationSequence = 0;
  tokenSequence = 0;
  database = makeDatabase("cofound-product-feedback-");
  iterationService = makeIterationService(database);
  service = makeFeedbackService(database, iterationService, true);
});

afterEach(() => {
  for (const target of databases) {
    try {
      target.close();
    } catch {
      // Already closed by the test.
    }
  }
  for (const directory of temporaryDirectories) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      // Windows can briefly retain a SQLite handle after an assertion failure.
    }
  }
});

describe("product feedback diagnosis and maintenance handoff", () => {
  it("creates schema v11 durable tables and append-only feedback events", () => {
    expect(
      database.connection
        .prepare("SELECT value FROM app_settings WHERE key = 'schema_version'")
        .get()
    ).toEqual({ value: "11" });
    const tables = database.connection
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'product_feedback%' ORDER BY name"
      )
      .all()
      .map(row => String((row as { name: string }).name));
    expect(tables).toEqual([
      "product_feedback",
      "product_feedback_events",
      "product_feedback_outbox",
    ]);
    const columns = database.connection
      .prepare("PRAGMA table_info(product_feedback)")
      .all()
      .map(row => String((row as { name: string }).name));
    expect(columns).toEqual(
      expect.arrayContaining([
        "source_feedback_id",
        "claim_token_hash",
        "lease_expires_at",
        "diagnosis_json",
        "maintainer_iteration_id",
        "maintainer_note",
        "triaged_by",
        "triaged_at",
      ])
    );

    createFeedback();
    expect(() =>
      database.connection
        .prepare("UPDATE product_feedback_events SET actor_name = 'changed'")
        .run()
    ).toThrow(/append-only/u);
    expect(() =>
      database.connection.prepare("DELETE FROM product_feedback_events").run()
    ).toThrow(/append-only/u);
    database.close();
  });

  it("freezes an initial outbox and runs token-bound diagnosis with stable timestamps", () => {
    const created = createFeedback();
    expect(created).toMatchObject({
      status: "ready_for_codex",
      triageStatus: "new",
      syncStatus: "pending",
      currentRound: 1,
      diagnosis: null,
    });
    const firstOutbox = service.pendingOutboxForFeedback(created.id);
    expect(firstOutbox).toHaveLength(1);
    expect(firstOutbox[0].payload).toMatchObject({
      applicationVersion: "1.2.0-test",
      capabilityPackVersion: "0.11.0+codex.20260824",
      kind: "initial_submission",
      sequence: 1,
      submittedAt: created.createdAt,
      sourceUpdatedAt: created.createdAt,
      diagnosis: null,
      triageStatus: null,
    });

    const claim = service.claim({
      id: created.id,
      claimedBy: "Codex desktop",
      modelName: "gpt-5",
    });
    expect(claim?.feedback.status).toBe("working");
    expect(() =>
      service.update({
        id: created.id,
        claimToken: "wrong-token".padEnd(40, "x"),
        status: "checking",
      })
    ).toThrow(/凭据无效/u);
    currentTimeMs += 1_000;
    service.update({
      id: created.id,
      claimToken: claim!.claimToken,
      status: "checking",
      message: "正在复核界面边界。",
    });
    const heartbeat = service.heartbeat({
      id: created.id,
      claimToken: claim!.claimToken,
    });
    expect(Date.parse(heartbeat.leaseExpiresAt)).toBeGreaterThan(currentTimeMs);
    currentTimeMs += 1_000;
    const completed = service.complete({
      id: created.id,
      claimToken: claim!.claimToken,
      modelName: "gpt-5",
      diagnosis,
      trialFixStatus: "passed",
    });
    expect(completed).toMatchObject({
      status: "ready",
      diagnosis,
      trialFixStatus: "passed",
    });
    const outbox = service.pendingOutboxForFeedback(created.id);
    expect(outbox.map(item => item.sequence)).toEqual([1, 2]);
    expect(outbox[1].payload).toMatchObject({
      kind: "diagnosis_update",
      submittedAt: created.createdAt,
      sourceUpdatedAt: new Date(currentTimeMs).toISOString(),
      diagnosis,
    });
    const serialized = JSON.stringify(service.get(created.id));
    expect(serialized).not.toContain(claim!.claimToken);
    expect(serialized).not.toMatch(
      /claim_token|lease_expires|payload_sha256|last_error|origin_key/iu
    );
    database.close();
  });

  it("recovers only expired claims and supports explicit needs-attention", () => {
    const first = createFeedback();
    const claim = service.claim({
      id: first.id,
      claimedBy: "Codex A",
      modelName: "gpt-5",
    });
    expect(() =>
      service.claim({
        id: first.id,
        claimedBy: "Codex B",
        modelName: "gpt-5",
      })
    ).toThrow(/不能重复领取/u);
    currentTimeMs += 61_000;
    const recovered = service.claim({
      id: first.id,
      claimedBy: "Codex B",
      modelName: "gpt-5",
    });
    expect(recovered?.claimToken).not.toBe(claim?.claimToken);
    const attention = service.needsAttention({
      id: first.id,
      claimToken: recovered!.claimToken,
      message: "缺少可复现的操作步骤。",
    });
    expect(attention.status).toBe("needs_attention");
    expect(() =>
      service.heartbeat({
        id: first.id,
        claimToken: recovered!.claimToken,
      })
    ).toThrow(/不可使用/u);
    database.close();
  });

  it("rejects paths, commands, hashes, URLs, credentials, BP bodies and stacks", () => {
    const unsafeDescriptions = [
      "请检查 D:\\Workspace\\secret.txt",
      "详情见 https://example.com/internal",
      "请运行 powershell -File repair.ps1",
      "token=very-secret-value",
      "BP 正文：这是整份商业计划书",
      "TypeError: failed to render",
    ];
    for (const description of unsafeDescriptions)
      expect(() =>
        service.create({
          description,
          category: "other",
          impact: "blocked",
          reporterName: "Cassian",
        })
      ).toThrow();

    const created = createFeedback();
    const claim = service.claim({
      id: created.id,
      claimedBy: "Codex",
      modelName: "gpt-5",
    });
    expect(() =>
      service.complete({
        id: created.id,
        claimToken: claim!.claimToken,
        modelName: "gpt-5",
        diagnosis: {
          ...diagnosis,
          summary: `内部引用 ${"a".repeat(40)}`,
        },
        trialFixStatus: "not_available",
      })
    ).toThrow();
    database.close();
  });

  it("tracks durable outbox failures safely and marks each feedback independently", () => {
    const first = createFeedback();
    const second = createFeedback();
    const firstOutbox = service.pendingOutboxForFeedback(first.id)[0];
    expect(service.pendingOutbox({ feedbackId: first.id })).toHaveLength(1);
    expect(service.pendingOutbox({ feedbackId: second.id })).toHaveLength(1);

    const failed = service.markOutboxFailed({
      outboxId: firstOutbox.id,
      error: "access_token=secret-value connection failed",
    });
    expect(failed.status).toBe("failed");
    const stored = database.connection
      .prepare(
        "SELECT last_error, payload_sha256 FROM product_feedback_outbox WHERE id = ?"
      )
      .get(firstOutbox.id) as { last_error: string; payload_sha256: string };
    expect(stored.last_error).toContain("[REDACTED]");
    expect(JSON.stringify(failed)).not.toContain(stored.payload_sha256);
    expect(JSON.stringify(failed)).not.toContain("secret-value");

    const synced = service.markOutboxSynced({
      outboxId: firstOutbox.id,
      remoteRecordId: "record_feedback_1",
    });
    expect(synced.status).toBe("synced");
    expect(
      service.markOutboxSynced({
        outboxId: firstOutbox.id,
        remoteRecordId: "record_feedback_1",
      }).attemptCount
    ).toBe(synced.attemptCount);
    expect(service.get(first.id)?.feedback.syncStatus).toBe("synced");
    expect(service.get(second.id)?.feedback.syncStatus).toBe("pending");
    database.close();
  });

  it("does not let maintenance allocate the diagnosis sequence before Codex finishes", () => {
    const created = createFeedback();
    expect(() =>
      service.triage({
        id: created.id,
        action: "needs_info",
        decidedBy: "Maintainer",
        note: "请先完成安全诊断。",
      })
    ).toThrow(/诊断尚未完成/u);
    expect(
      service.pendingOutboxForFeedback(created.id).map(item => item.sequence)
    ).toEqual([1]);
    database.close();
  });

  it("tracks every local feedback key instead of silently dropping older reports", () => {
    for (let index = 0; index < 205; index += 1) createFeedback();
    const tracked = service.trackedOriginKeys();
    expect(tracked).toHaveLength(205);
    expect(new Set(tracked.map(item => item.originKey)).size).toBe(205);
    database.close();
  });

  it("ingests remote diagnosis, creates one maintenance task, and returns ordered maintenance updates", () => {
    const reporterFeedback = createFeedback();
    completeDiagnosis(service, reporterFeedback.id);
    const reporterOutbox = service.pendingOutboxForFeedback(
      reporterFeedback.id
    );

    const maintainerDatabase = makeDatabase("cofound-maintainer-feedback-");
    const maintainerIterations = makeIterationService(maintainerDatabase);
    const maintainer = makeFeedbackService(
      maintainerDatabase,
      maintainerIterations,
      true
    );
    const remoteInitial = maintainer.ingestRemote({
      payload: reporterOutbox[0].payload,
      remoteRecordId: "record_shared_feedback",
    });
    expect(remoteInitial.status).toBe("awaiting_diagnosis");
    expect(() =>
      maintainer.ingestRemote({
        payload: {
          ...reporterOutbox[1].payload,
          description: "试图改写原始问题描述",
        },
        remoteRecordId: "record_shared_feedback",
      })
    ).toThrow(/改写原始反馈/u);
    expect(() =>
      maintainer.ingestRemote({
        payload: {
          ...reporterOutbox[1].payload,
          outboxId: "feedback_outbox_gap_test",
          sequence: 3,
        },
        remoteRecordId: "record_shared_feedback",
      })
    ).toThrow(/序号不连续/u);
    const remoteReady = maintainer.ingestRemote({
      payload: reporterOutbox[1].payload,
      remoteRecordId: "record_shared_feedback",
    });
    expect(remoteReady).toMatchObject({
      status: "ready",
      triageStatus: "new",
      createdAt: reporterFeedback.createdAt,
    });

    const accepted = maintainer.triage({
      id: remoteReady.id,
      action: "accept",
      decidedBy: "Maintainer",
      note: "已纳入下一轮正式维护。",
    });
    expect(accepted).toMatchObject({
      triageStatus: "accepted",
      hasMaintenanceTask: true,
      maintainerNote: "已纳入下一轮正式维护。",
      triagedBy: "Maintainer",
    });
    const maintenanceOutbox = maintainer.pendingOutboxForFeedback(
      remoteReady.id
    );
    expect(maintenanceOutbox).toHaveLength(1);
    expect(maintenanceOutbox[0].payload).toMatchObject({
      kind: "maintenance_update",
      sequence: 3,
      feedbackId: reporterFeedback.id,
      submittedAt: reporterFeedback.createdAt,
      triageStatus: "accepted",
      maintainerName: "Maintainer",
    });
    expect(maintenanceOutbox[0].payload.maintenanceTaskId).toBeTruthy();

    maintainer.triage({
      id: remoteReady.id,
      action: "accept",
      decidedBy: "Maintainer",
    });
    expect(
      maintainerDatabase.connection
        .prepare(
          "SELECT COUNT(*) AS count FROM iteration_tasks WHERE source_feedback_id = ?"
        )
        .get(remoteReady.id)
    ).toEqual({ count: 1 });
    expect(maintainer.pendingOutboxForFeedback(remoteReady.id)).toHaveLength(1);

    const applied = service.applyRemoteMaintenanceUpdate({
      payload: maintenanceOutbox[0].payload,
      remoteRecordId: "record_shared_feedback",
    });
    expect(applied).toMatchObject({
      triageStatus: "accepted",
      hasMaintenanceTask: true,
      maintainerNote: "已纳入下一轮正式维护。",
    });
    expect(
      service.applyRemoteMaintenanceUpdate({
        payload: maintenanceOutbox[0].payload,
        remoteRecordId: "record_shared_feedback",
      }).triageStatus
    ).toBe("accepted");
    expect(() =>
      service.applyRemoteMaintenanceUpdate({
        payload: {
          ...maintenanceOutbox[0].payload,
          outboxId: "feedback_outbox_tampered",
        },
        remoteRecordId: "record_shared_feedback",
      })
    ).toThrow(/序号/u);

    const iterationId = String(
      (
        maintainerDatabase.connection
          .prepare(
            "SELECT maintainer_iteration_id FROM product_feedback WHERE id = ?"
          )
          .get(remoteReady.id) as { maintainer_iteration_id: string }
      ).maintainer_iteration_id
    );
    expect(() =>
      maintainer.closeMaintenance({
        id: remoteReady.id,
        decidedBy: "Maintainer",
      })
    ).toThrow(/尚未完成/u);
    maintainerDatabase.connection
      .prepare("UPDATE iteration_tasks SET status = 'completed' WHERE id = ?")
      .run(iterationId);
    const closed = maintainer.closeMaintenance({
      id: remoteReady.id,
      decidedBy: "Maintainer",
      note: "修复已进入正式版本。",
    });
    expect(closed.triageStatus).toBe("completed");
    const completedOutbox = maintainer.pendingOutboxForFeedback(
      remoteReady.id
    )[1];
    expect(completedOutbox.payload).toMatchObject({
      sequence: 4,
      triageStatus: "completed",
      maintainerNote: "修复已进入正式版本。",
    });
    expect(
      service.applyRemoteMaintenanceUpdate({
        payload: completedOutbox.payload,
        remoteRecordId: "record_shared_feedback",
      }).triageStatus
    ).toBe("completed");

    database.close();
    maintainerDatabase.close();
  });

  it("keeps maintainer-only and all feedback APIs closed in shared mode", () => {
    const nonMaintainerDatabase = makeDatabase("cofound-colleague-feedback-");
    const nonMaintainer = makeFeedbackService(
      nonMaintainerDatabase,
      makeIterationService(nonMaintainerDatabase),
      false
    );
    const local = completeDiagnosis().feedback;
    expect(nonMaintainer.capabilities()).toEqual({ maintainerMode: false });
    expect(() =>
      nonMaintainer.ingestRemote({
        payload: service.pendingOutboxForFeedback(local.id)[0].payload,
        remoteRecordId: "record_forbidden_inbox",
      })
    ).toThrow(/不是产品维护端/u);
    expect(() =>
      nonMaintainer.triage({
        id: local.id,
        action: "accept",
        decidedBy: "Colleague",
      })
    ).toThrow(ProductFeedbackServiceError);

    const previousMode = process.env.COF_BP_MODE;
    process.env.COF_BP_MODE = "shared";
    try {
      expect(() => service.capabilities()).toThrow(/共享部署/u);
      expect(() => service.list()).toThrow(/共享部署/u);
      expect(() => createFeedback()).toThrow(/共享部署/u);
      expect(() => service.pendingOutbox()).toThrow(/共享部署/u);
    } finally {
      if (previousMode === undefined) delete process.env.COF_BP_MODE;
      else process.env.COF_BP_MODE = previousMode;
    }
    database.close();
    nonMaintainerDatabase.close();
  });
});
