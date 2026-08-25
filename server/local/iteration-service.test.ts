import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IterationResult } from "../../shared/iteration";
import { LocalDatabase } from "./database";
import { IterationService } from "./iteration-service";

let temporaryDirectory = "";
let database: LocalDatabase;
let service: IterationService;
let currentTimeMs = 0;
let idSequence = 0;
let tokenSequence = 0;
let launched = 0;
let headRef = "";

const candidateRef = "a".repeat(40);
const baseRef = "b".repeat(40);

const result: IterationResult = {
  summary: "已完成界面状态调整并通过定向检查。",
  changes: ["统一任务状态标签", "补充验收摘要"],
  checks: [
    {
      label: "定向测试",
      status: "passed",
      summary: "状态迁移与输出契约均通过。",
    },
  ],
  risks: ["仍需由负责人确认最终文案。"],
  previewUrl: "/projects/demo/preview",
};

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cofound-iteration-service-")
  );
  database = new LocalDatabase({
    dataDir: temporaryDirectory,
    dbPath: path.join(temporaryDirectory, "test.sqlite"),
  });
  currentTimeMs = Date.UTC(2026, 7, 23, 8, 0, 0);
  idSequence = 0;
  tokenSequence = 0;
  launched = 0;
  headRef = baseRef;
  service = new IterationService(database, {
    clock: () => new Date(currentTimeMs).toISOString(),
    idFactory: () => `iteration_test_${++idSequence}`,
    launchCodex: () => {
      launched += 1;
      return true;
    },
    headRefResolver: () => headRef,
    candidateRefVerifier: value => value === baseRef || value === candidateRef,
    candidateAncestryVerifier: (base, candidate) =>
      base === baseRef && candidate === candidateRef,
    claimTokenFactory: () =>
      `claim-token-${String(++tokenSequence).padStart(40, "0")}`,
    leaseDurationMs: 60_000,
    appVersion: "1.1.0-test",
  });
});

afterEach(() => {
  database.close();
  const resolved = path.resolve(temporaryDirectory);
  if (
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
    path.basename(resolved).startsWith("cofound-iteration-service-")
  )
    fs.rmSync(resolved, { recursive: true, force: true });
});

function createTask(description = "优化项目详情页的事实与判断分区") {
  return service.create({
    description,
    category: "interface",
    qualityMode: "standard",
    requestedBy: "Cassian",
  });
}

function advanceTime(milliseconds: number) {
  currentTimeMs += milliseconds;
}

describe("local Codex iteration task queue", () => {
  it("migrates the local database to schema version 11 with analysis launch coordination columns", () => {
    database.connection.exec(`
      DROP TABLE iteration_task_events;
      DROP TABLE iteration_tasks;
      CREATE TABLE iteration_tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        request_text TEXT NOT NULL,
        category TEXT NOT NULL,
        quality TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ready_for_codex',
        round INTEGER NOT NULL DEFAULT 1,
        requested_by TEXT NOT NULL,
        claimed_by TEXT,
        claimed_model TEXT,
        feedback TEXT,
        result_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        claimed_at TEXT,
        completed_at TEXT
      );
      UPDATE app_settings SET value = '7' WHERE key = 'schema_version';
    `);
    database.close();
    database = new LocalDatabase({
      dataDir: temporaryDirectory,
      dbPath: path.join(temporaryDirectory, "test.sqlite"),
    });
    expect(
      database.connection
        .prepare("SELECT value FROM app_settings WHERE key = 'schema_version'")
        .get()
    ).toEqual({ value: "11" });
    const tables = database.connection
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'iteration_%' ORDER BY name"
      )
      .all()
      .map(row => String((row as { name: string }).name));
    expect(tables).toEqual(["iteration_task_events", "iteration_tasks"]);
    const taskColumns = database.connection
      .prepare("PRAGMA table_info(iteration_tasks)")
      .all()
      .map(row => String((row as { name: string }).name));
    expect(taskColumns).toEqual(
      expect.arrayContaining([
        "claim_token_hash",
        "lease_expires_at",
        "base_ref",
        "candidate_ref",
        "applied_ref",
        "source_feedback_id",
      ])
    );
    const analysisTaskColumns = database.connection
      .prepare("PRAGMA table_info(codex_analysis_tasks)")
      .all()
      .map(row => String((row as { name: string }).name));
    expect(analysisTaskColumns).toEqual(
      expect.arrayContaining(["launch_token_hash", "launch_expires_at"])
    );
  });

  it("creates safe UI DTOs and atomically claims the oldest ready task", () => {
    const first = createTask("第一项界面优化\n保留补充说明");
    const second = createTask("第二项分析优化");

    expect(first).toMatchObject({
      title: "第一项界面优化",
      description: "第一项界面优化\n保留补充说明",
      qualityMode: "standard",
      status: "ready_for_codex",
      currentRound: 1,
    });
    const overview = service.overview({ limit: 20 });
    expect(overview.version).toEqual({
      appVersion: "1.1.0-test",
      capabilityPackVersion: "0.11.0+codex.20260824",
      codexLaunchAvailable: true,
      directRunMode: "task_queue",
    });
    expect(overview.items).toHaveLength(2);

    const claimedFirst = service.claim({
      claimedBy: "Codex A",
      modelName: "gpt-5",
    });
    const claimedSecond = service.claim({
      claimedBy: "Codex B",
      modelName: "gpt-5",
    });
    expect(claimedFirst?.task.id).toBe(first.id);
    expect(claimedSecond?.task.id).toBe(second.id);
    expect(claimedFirst?.claimToken).not.toBe(claimedSecond?.claimToken);
    expect(service.claim({ claimedBy: "Codex C", modelName: "gpt-5" })).toBe(
      null
    );
    expect(() =>
      service.claim({
        id: first.id,
        claimedBy: "Codex C",
        modelName: "gpt-5",
      })
    ).toThrow(/不能重复领取/u);

    const serialized = JSON.stringify(service.overview({ limit: 20 }));
    expect(serialized).not.toMatch(
      /stored_path|sha256|git_ref|claimed_model|claim_token|lease_expires|base_ref|candidate_ref|applied_ref|detail_json|logs?/iu
    );
    expect(serialized).not.toContain(claimedFirst!.claimToken);
    expect(serialized).not.toContain(candidateRef);
    expect(() =>
      service.create({
        description: "试图写入内部路径",
        category: "other",
        qualityMode: "quick",
        requestedBy: "Cassian",
        workspacePath: "C:\\private",
      } as never)
    ).toThrow();
  });

  it("runs claim, progress, result, human acceptance and Codex finalization", () => {
    const task = createTask();
    const claim = service.claim({
      id: task.id,
      claimedBy: "Codex desktop",
      modelName: "gpt-5",
    })!;
    expect(claim.task.status).toBe("working");
    expect(
      service.update({
        id: task.id,
        claimToken: claim.claimToken,
        status: "checking",
        message: "正在运行定向测试",
      }).status
    ).toBe("checking");

    expect(() =>
      service.complete({
        id: task.id,
        claimToken: claim.claimToken,
        modelName: "gpt-5",
        candidateRef: "c".repeat(40),
        result,
      })
    ).toThrow(/基线之后/u);
    expect(service.get(task.id)?.task.status).toBe("checking");
    expect(() =>
      service.complete({
        id: task.id,
        claimToken: claim.claimToken,
        modelName: "gpt-5",
        candidateRef: baseRef,
        result,
      })
    ).toThrow(/基线之后/u);

    const ready = service.complete({
      id: task.id,
      claimToken: claim.claimToken,
      modelName: "gpt-5",
      candidateRef,
      result,
    });
    expect(ready.status).toBe("ready");
    expect(ready.result).toEqual(result);
    expect(() =>
      service.preflightFinalize({ id: task.id, candidateRef })
    ).toThrow(/只有已通过任务/u);
    expect(
      service.decide({
        id: task.id,
        action: "accept",
        decidedBy: "Cassian",
        note: "验收通过",
      }).status
    ).toBe("approved");
    expect(() =>
      service.preflightFinalize({ id: task.id, candidateRef: baseRef })
    ).toThrow(/候选提交/u);
    expect(service.preflightFinalize({ id: task.id, candidateRef })).toEqual({
      ok: true,
    });
    headRef = baseRef;
    expect(() =>
      service.finalize({ id: task.id, appliedRef: baseRef })
    ).toThrow(/Git HEAD 不一致/u);
    expect(service.get(task.id)?.task.status).toBe("approved");
    headRef = candidateRef;
    expect(() =>
      service.finalize({ id: task.id, appliedRef: "b".repeat(40) })
    ).toThrow(/Git HEAD 不一致/u);
    expect(
      service.finalize({ id: task.id, appliedRef: candidateRef }).status
    ).toBe("completed");
    expect(() =>
      service.finalize({ id: task.id, appliedRef: candidateRef })
    ).toThrow(/只有已通过任务/u);
    expect(
      database.connection
        .prepare(
          "SELECT base_ref, candidate_ref, applied_ref FROM iteration_tasks WHERE id = ?"
        )
        .get(task.id)
    ).toEqual({
      base_ref: baseRef,
      candidate_ref: candidateRef,
      applied_ref: candidateRef,
    });

    const detail = service.get(task.id)!;
    expect(detail.events.map(event => event.type)).toEqual([
      "created",
      "claimed",
      "progress_updated",
      "result_submitted",
      "accepted",
      "finalized",
    ]);
    expect(JSON.stringify(detail.events)).not.toContain("正在运行定向测试");
    expect(JSON.stringify(detail)).not.toContain("a".repeat(40));
  });

  it("requires human feedback for revisions and starts a clean next round", () => {
    const task = createTask();
    const firstClaim = service.claim({
      id: task.id,
      claimedBy: "Codex desktop",
      modelName: "gpt-5",
    })!;
    expect(
      service.needsAttention({
        id: task.id,
        claimToken: firstClaim.claimToken,
        message: "需要负责人确认信息架构",
      }).status
    ).toBe("needs_attention");
    expect(() =>
      service.decide({
        id: task.id,
        action: "revise",
        decidedBy: "Cassian",
      })
    ).toThrow(/必须填写反馈/u);

    const revised = service.decide({
      id: task.id,
      action: "revise",
      decidedBy: "Cassian",
      note: "保留一级导航，压缩辅助说明。",
    });
    expect(revised).toMatchObject({
      status: "ready_for_codex",
      currentRound: 2,
      claimedBy: null,
      feedback: "保留一级导航，压缩辅助说明。",
      result: null,
    });

    const secondClaim = service.claim({
      id: task.id,
      claimedBy: "Codex desktop",
      modelName: "gpt-5",
    })!;
    service.complete({
      id: task.id,
      claimToken: secondClaim.claimToken,
      modelName: "gpt-5",
      candidateRef,
      result,
    });
    expect(
      service.decide({
        id: task.id,
        action: "revise",
        decidedBy: "Cassian",
        note: "预览链接还需要调整。",
      })
    ).toMatchObject({
      status: "ready_for_codex",
      currentRound: 3,
      result: null,
    });
  });

  it("protects active work with a renewable lease and safely requeues only after expiry", () => {
    const task = createTask();
    const firstClaim = service.claim({
      id: task.id,
      claimedBy: "Codex desktop",
      modelName: "gpt-5",
    })!;
    const wrongToken = "wrong-claim-token-0000000000000000000000000000";

    expect(firstClaim.task.canRequeue).toBe(false);
    expect(() =>
      service.update({
        id: task.id,
        claimToken: wrongToken,
        status: "checking",
      })
    ).toThrow(/领取凭据无效/u);
    expect(() =>
      service.heartbeat({ id: task.id, claimToken: wrongToken })
    ).toThrow(/领取凭据无效/u);

    advanceTime(20_000);
    const heartbeat = service.heartbeat({
      id: task.id,
      claimToken: firstClaim.claimToken,
    });
    expect(heartbeat).toEqual({
      ok: true,
      leaseExpiresAt: new Date(currentTimeMs + 60_000).toISOString(),
    });
    expect(() =>
      service.requeueExpired({ id: task.id, requestedBy: "Cassian" })
    ).toThrow(/租约仍有效/u);

    advanceTime(60_001);
    expect(service.get(task.id)?.task.canRequeue).toBe(true);
    expect(service.overview({ limit: 20 }).items[0]?.canRequeue).toBe(true);
    expect(() =>
      service.update({
        id: task.id,
        claimToken: firstClaim.claimToken,
        status: "checking",
      })
    ).toThrow(/租约已过期/u);

    expect(
      service.requeueExpired({ id: task.id, requestedBy: "Cassian" })
    ).toMatchObject({
      status: "ready_for_codex",
      claimedBy: null,
      canRequeue: false,
    });
    const secondClaim = service.claim({
      id: task.id,
      claimedBy: "Codex desktop",
      modelName: "gpt-5",
    })!;
    expect(secondClaim.claimToken).not.toBe(firstClaim.claimToken);
    expect(() =>
      service.update({
        id: task.id,
        claimToken: firstClaim.claimToken,
        status: "checking",
      })
    ).toThrow(/领取凭据无效/u);
    expect(
      service.update({
        id: task.id,
        claimToken: secondClaim.claimToken,
        status: "checking",
      }).status
    ).toBe("checking");

    const serialized = JSON.stringify(service.get(task.id));
    expect(serialized).not.toContain(firstClaim.claimToken);
    expect(serialized).not.toContain(secondClaim.claimToken);
    expect(serialized).not.toMatch(/leaseExpiresAt|claimToken/u);
  });

  it("pauses active work and keeps the event history append-only", () => {
    const task = createTask();
    service.claim({
      id: task.id,
      claimedBy: "Codex desktop",
      modelName: "gpt-5",
    });
    expect(
      service.decide({
        id: task.id,
        action: "pause",
        decidedBy: "Cassian",
        note: "本轮不继续",
      }).status
    ).toBe("paused");

    expect(() =>
      database.connection
        .prepare(
          "UPDATE iteration_task_events SET actor_name = 'changed' WHERE task_id = ?"
        )
        .run(task.id)
    ).toThrow(/append-only/u);
    expect(() =>
      database.connection
        .prepare("DELETE FROM iteration_task_events WHERE task_id = ?")
        .run(task.id)
    ).toThrow(/append-only/u);
    expect(service.get(task.id)?.events).toHaveLength(3);
  });

  it("launches Codex through the injected bridge and rejects shared mode", () => {
    expect(service.openCodex()).toEqual({ launched: true });
    expect(launched).toBe(1);

    const previousMode = process.env.COF_BP_MODE;
    process.env.COF_BP_MODE = "shared";
    try {
      expect(() => service.overview()).toThrow(/共享部署不开放/u);
      expect(() => service.openCodex()).toThrow(/共享部署不开放/u);
    } finally {
      if (previousMode === undefined) delete process.env.COF_BP_MODE;
      else process.env.COF_BP_MODE = previousMode;
    }
  });

  it("rejects technical leakage in visible results and unsafe preview locations", () => {
    const task = createTask();
    const claim = service.claim({
      id: task.id,
      claimedBy: "Codex desktop",
      modelName: "gpt-5",
    })!;
    const invalidResults: IterationResult[] = [
      { ...result, summary: "请查看 Git branch 的实现细节。" },
      { ...result, changes: [candidateRef] },
      { ...result, risks: ["内部文件位于 C:\\repo\\server\\index.ts。"] },
      { ...result, changes: ["已调整 iteration-service.ts"] },
      {
        ...result,
        checks: [
          {
            label: "定向检查",
            status: "failed",
            summary: "请执行：pnpm test",
          },
        ],
      },
      { ...result, summary: "TypeError: failed to render" },
      { ...result, risks: ["详情请查看 https://example.com/report"] },
      { ...result, previewUrl: "file:///C:/private/result.html" },
      { ...result, previewUrl: "//evil.example/result" },
      { ...result, previewUrl: "https://example.com/result" },
    ];

    for (const unsafeResult of invalidResults)
      expect(() =>
        service.complete({
          id: task.id,
          claimToken: claim.claimToken,
          modelName: "gpt-5",
          candidateRef,
          result: unsafeResult,
        })
      ).toThrow();

    expect(service.get(task.id)?.task.status).toBe("working");
    expect(
      service.complete({
        id: task.id,
        claimToken: claim.claimToken,
        modelName: "gpt-5",
        candidateRef,
        result: {
          ...result,
          summary: "已完成项目详情页调整，普通中文业务说明可正常展示。",
          previewUrl: "http://127.0.0.1:4010/projects/demo/preview",
        },
      }).status
    ).toBe("ready");
  });
});
