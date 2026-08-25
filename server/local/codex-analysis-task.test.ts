import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CodexInvestmentAnalysisResult,
  PreparedCodexAnalysisRun,
} from "../../shared/bp";
import { createCodexAnalysisTask } from "./codex-analysis-task-service";
import { LocalDatabase } from "./database";
import { importFilePath } from "./importer";

const samples = path.resolve(process.cwd(), "samples", "mock-bps");
let temporaryDirectory = "";
let database: LocalDatabase;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cofound-codex-analysis-task-")
  );
  database = new LocalDatabase({
    dataDir: temporaryDirectory,
    dbPath: path.join(temporaryDirectory, "test.sqlite"),
  });
});

afterEach(() => {
  vi.useRealTimers();
  database.close();
  const resolved = path.resolve(temporaryDirectory);
  if (
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
    path.basename(resolved).startsWith("cofound-codex-analysis-task-")
  )
    fs.rmSync(resolved, { recursive: true, force: true });
});

function groundedResult(
  prepared: PreparedCodexAnalysisRun
): CodexInvestmentAnalysisResult {
  const fact = prepared.factSnapshot.facts.find(
    item => item.evidence?.page && item.evidence.quote
  );
  if (!fact?.evidence?.page || !fact.evidence.quote)
    throw new Error("测试样本缺少可引用证据");
  const evidence = [
    {
      fieldKey: fact.key,
      page: fact.evidence.page,
      quote: fact.evidence.quote,
    },
  ];
  return {
    schemaVersion: "1.0",
    summary: "商业事实支持继续验证，结论仍以当前冻结材料为边界。",
    positiveSignals: [
      {
        title: "存在可核验事实",
        detail: "材料提供了可以回到原文复核的经营信息。",
        basis: "evidence",
        evidence,
      },
    ],
    keyRisks: [
      {
        title: "关键闭环仍待补充",
        detail: "现有材料不足以确认全部商业闭环。",
        basis: "inference",
        evidence: [],
      },
    ],
    frameworkSections: [
      {
        key: "screening",
        title: "综合初筛",
        assessment: "mixed",
        detail: "已有信号，但需要继续核验。",
        evidence,
        counterarguments: ["单一材料可能不是最新经营口径。"],
        unresolvedQuestions: ["订单、验收和回款分别是多少？"],
      },
    ],
    unresolvedQuestions: ["订单、验收和回款分别是多少？"],
    nextActions: ["核验合同、验收材料和回款凭证。"],
    aiSuggestion: "已完成初筛",
    confidence: "medium",
  };
}

describe("Codex analysis task queue", () => {
  it("persists a free-form user prompt and binds it to the immutable analysis run", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const first = database.createCodexAnalysisTask({
      projectId: imported.projectId,
      mode: "auto",
      requestedBy: "Cassian",
      userPrompt:
        "  我判断订单增长不错，请帮我找反证，并指出这个判断还缺哪些事实。\u0000  ",
    });
    const second = database.createCodexAnalysisTask({
      projectId: imported.projectId,
      mode: "auto",
      requestedBy: "Cassian",
      userPrompt: "请重点增强下一次创始人访谈的问题清单。",
    });

    expect(first.task.userPrompt).toBe(
      "我判断订单增长不错，请帮我找反证，并指出这个判断还缺哪些事实。"
    );
    expect(second.task.id).not.toBe(first.task.id);
    const claim = database.claimCodexAnalysisTask({
      taskId: first.task.id,
      claimedBy: "local-codex",
      leaseSeconds: 1_800,
    });
    expect(claim?.task.userPrompt).toBe(first.task.userPrompt);
    const prepared = database.prepareCodexAnalysis({
      projectId: imported.projectId,
      skillName: "review-early-stage-investment",
      requestedBy: "local-codex",
      taskId: first.task.id,
    });
    expect(prepared.sourceTaskId).toBe(first.task.id);
    expect(prepared.requestContext).toEqual({
      userPrompt: first.task.userPrompt,
    });
    expect(
      database.listCodexAnalysisRuns(imported.projectId)[0].requestContext
    ).toEqual({ userPrompt: first.task.userPrompt });
  });

  it("rejects an oversized free-form analysis prompt at the persistence boundary", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    expect(() =>
      database.createCodexAnalysisTask({
        projectId: imported.projectId,
        mode: "auto",
        requestedBy: "Cassian",
        userPrompt: "x".repeat(1_201),
      })
    ).toThrow("分析需求不能超过 1200 个字符");
  });

  it("reuses a duplicate click and keeps the task queued when launch fails", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const bridgeUnavailable = () => ({
      ok: false as const,
      error: {
        code: "codex_executable_not_found" as const,
        message: "测试 App Server 不可用",
        retryable: true,
        fallback: "open_codex_manually" as const,
      },
    });
    const first = await createCodexAnalysisTask(
      {
        projectId: imported.projectId,
        mode: "auto",
        requestedBy: "Cassian",
      },
      database,
      bridgeUnavailable,
      () => {
        throw new Error("测试启动器不可用");
      }
    );
    const second = await createCodexAnalysisTask(
      {
        projectId: imported.projectId,
        mode: "auto",
        requestedBy: "Cassian",
      },
      database,
      bridgeUnavailable,
      () => ({ launched: true })
    );

    expect(first.task.status).toBe("queued");
    expect(first.launch.launched).toBe(false);
    expect(first.launch.error).toContain("未能自动打开 Codex");
    expect(second.task.id).toBe(first.task.id);
    expect(second.reused).toBe(true);
    expect(second.task.status).toBe("queued");
    expect(second.task.launcherError).toBeNull();
  });

  it("records an App Server thread and reuses it without interrupting the active turn", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    let desktopLaunches = 0;
    const threadId = "01991b65-0bd7-7f40-a10d-3f52e0b9bc4a";
    const turnId = "01991b65-1244-71b5-9873-a3b47e43ff38";
    let bridgeCalls = 0;
    const launchThread = () => {
      bridgeCalls += 1;
      return {
        ok: true as const,
        threadId,
        turnId,
        ui: { opened: true as const, mode: "thread_uri" as const, error: null },
      };
    };

    const first = await createCodexAnalysisTask(
      {
        projectId: imported.projectId,
        mode: "assess-market-first",
        requestedBy: "Cassian",
      },
      database,
      launchThread,
      () => {
        desktopLaunches += 1;
        return { launched: true };
      },
      () => true
    );
    const second = await createCodexAnalysisTask(
      {
        projectId: imported.projectId,
        mode: "assess-market-first",
        requestedBy: "Cassian",
      },
      database,
      launchThread,
      () => {
        desktopLaunches += 1;
        return { launched: true };
      },
      () => true
    );

    expect(first.launch).toMatchObject({
      launched: true,
      mode: "app_server",
    });
    expect(first.task.codexThreadId).toBe(threadId);
    expect(first.task.codexTurnId).toBe(turnId);
    expect(second.reused).toBe(true);
    expect(second.task.id).toBe(first.task.id);
    expect(bridgeCalls).toBe(1);
    expect(desktopLaunches).toBe(0);
  });

  it("uses one SQLite launch slot across overlapping requests", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const secondDatabase = new LocalDatabase({
      dataDir: temporaryDirectory,
      dbPath: path.join(temporaryDirectory, "test.sqlite"),
    });
    let releaseLaunch!: () => void;
    const launchGate = new Promise<void>(resolve => {
      releaseLaunch = resolve;
    });
    const launchThread = vi.fn(async () => {
      await launchGate;
      return {
        ok: true as const,
        threadId: "01991b65-0bd7-7f40-a10d-3f52e0b9bc4a",
        turnId: "01991b65-1244-71b5-9873-a3b47e43ff38",
        ui: { opened: true as const, mode: "thread_uri" as const, error: null },
      };
    });
    const input = {
      projectId: imported.projectId,
      mode: "auto" as const,
      requestedBy: "Cassian",
    };

    try {
      const firstPromise = createCodexAnalysisTask(
        input,
        database,
        launchThread,
        () => ({ launched: false }),
        () => false
      );
      await Promise.resolve();
      const secondPromise = createCodexAnalysisTask(
        input,
        secondDatabase,
        launchThread,
        () => ({ launched: false }),
        () => false
      );
      releaseLaunch();
      const [first, second] = await Promise.all([firstPromise, secondPromise]);

      expect(first.task.id).toBe(second.task.id);
      expect(launchThread).toHaveBeenCalledTimes(1);
      expect(second.reused).toBe(true);
      expect(second.launch).toMatchObject({ launched: true, error: null });
    } finally {
      secondDatabase.close();
    }
  });

  it("safely fails the task when the launched Codex turn terminates", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    let terminalCallback:
      | ((event: {
          status: "completed" | "failed" | "interrupted";
          threadId: string;
          turnId: string;
          safeMessage: string | null;
        }) => void | Promise<void>)
      | undefined;
    const result = await createCodexAnalysisTask(
      {
        projectId: imported.projectId,
        mode: "auto",
        requestedBy: "Cassian",
      },
      database,
      (_input, lifecycle) => {
        terminalCallback = lifecycle?.onTurnTerminal;
        return {
          ok: true as const,
          threadId: "01991b65-0bd7-7f40-a10d-3f52e0b9bc4a",
          turnId: "01991b65-1244-71b5-9873-a3b47e43ff38",
          ui: {
            opened: true as const,
            mode: "thread_uri" as const,
            error: null,
          },
        };
      },
      () => ({ launched: false }),
      () => false
    );

    await terminalCallback?.({
      status: "failed",
      threadId: result.task.codexThreadId!,
      turnId: result.task.codexTurnId!,
      safeMessage: "Codex 分析会话执行失败，请重新发起分析",
    });
    const failed = database.getCodexAnalysisTask(result.task.id)!;

    expect(failed.status).toBe("failed");
    expect(failed.errorDetail).toBe("Codex 分析会话执行失败，请重新发起分析");
  });

  it("marks a completed Codex conversation failed when no analysis result was linked", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    let terminalCallback:
      | ((event: {
          status: "completed" | "failed" | "interrupted";
          threadId: string;
          turnId: string;
          safeMessage: string | null;
        }) => void | Promise<void>)
      | undefined;
    const result = await createCodexAnalysisTask(
      {
        projectId: imported.projectId,
        mode: "auto",
        requestedBy: "Cassian",
      },
      database,
      (_input, lifecycle) => {
        terminalCallback = lifecycle?.onTurnTerminal;
        return {
          ok: true as const,
          threadId: "01991b65-0bd7-7f40-a10d-3f52e0b9bc4a",
          turnId: "01991b65-1244-71b5-9873-a3b47e43ff38",
          ui: {
            opened: true as const,
            mode: "thread_uri" as const,
            error: null,
          },
        };
      },
      () => ({ launched: false }),
      () => false
    );

    await terminalCallback?.({
      status: "completed",
      threadId: result.task.codexThreadId!,
      turnId: result.task.codexTurnId!,
      safeMessage: null,
    });

    expect(database.getCodexAnalysisTask(result.task.id)).toMatchObject({
      status: "failed",
      errorDetail: "Codex 对话已结束但未返回分析结果，可重新发起",
    });
  });

  it("starts a fresh turn when a queued App Server handoff never claims the task", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const launchThread = vi.fn(() => ({
      ok: true as const,
      threadId: "01991b65-0bd7-7f40-a10d-3f52e0b9bc4a",
      turnId: "01991b65-1244-71b5-9873-a3b47e43ff38",
      ui: { opened: true as const, mode: "thread_uri" as const, error: null },
    }));
    const input = {
      projectId: imported.projectId,
      mode: "auto" as const,
      requestedBy: "Cassian",
    };
    const first = await createCodexAnalysisTask(
      input,
      database,
      launchThread,
      () => ({ launched: false }),
      () => true
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.parse(first.task.updatedAt) + 301_000));

    const retry = await createCodexAnalysisTask(
      input,
      database,
      launchThread,
      () => ({ launched: false }),
      () => true
    );

    expect(retry.reused).toBe(true);
    expect(retry.task.id).toBe(first.task.id);
    expect(launchThread).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh turn after a claimed task lease expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T01:00:00.000Z"));
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const launchThread = vi.fn(() => ({
      ok: true as const,
      threadId: "01991b65-0bd7-7f40-a10d-3f52e0b9bc4a",
      turnId: "01991b65-1244-71b5-9873-a3b47e43ff38",
      ui: { opened: true as const, mode: "thread_uri" as const, error: null },
    }));
    const input = {
      projectId: imported.projectId,
      mode: "auto" as const,
      requestedBy: "Cassian",
    };
    const first = await createCodexAnalysisTask(
      input,
      database,
      launchThread,
      () => ({ launched: false }),
      () => true
    );
    database.claimCodexAnalysisTask({
      taskId: first.task.id,
      claimedBy: "codex-session-a",
      leaseSeconds: 60,
    });

    vi.advanceTimersByTime(61_000);
    const retry = await createCodexAnalysisTask(
      input,
      database,
      launchThread,
      () => ({ launched: false }),
      () => true
    );

    expect(retry.task.id).toBe(first.task.id);
    expect(launchThread).toHaveBeenCalledTimes(2);
  });

  it("allows only one active claimant for a task", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const created = database.createCodexAnalysisTask({
      projectId: imported.projectId,
      mode: "auto",
      requestedBy: "Cassian",
    });
    const first = database.claimCodexAnalysisTask({
      taskId: created.task.id,
      claimedBy: "codex-session-a",
      leaseSeconds: 1_800,
    });

    expect(first?.task.status).toBe("claimed");
    expect(first?.claimToken).toHaveLength(43);
    expect(
      database.claimCodexAnalysisTask({
        claimedBy: "codex-session-b",
        leaseSeconds: 1_800,
      })
    ).toBeNull();
    expect(() =>
      database.claimCodexAnalysisTask({
        taskId: created.task.id,
        claimedBy: "codex-session-b",
        leaseSeconds: 1_800,
      })
    ).toThrow("不能重复领取");
  });

  it("prevents an expired launch callback from failing a reclaimed task", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T01:00:00.000Z"));
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const created = database.createCodexAnalysisTask({
      projectId: imported.projectId,
      mode: "auto",
      requestedBy: "Cassian",
    });
    const launch = database.reserveCodexAnalysisTaskLaunch({
      taskId: created.task.id,
      ttlSeconds: 60,
    })!;
    database.claimCodexAnalysisTask({
      taskId: created.task.id,
      claimedBy: "codex-session-a",
      leaseSeconds: 60,
    });

    vi.advanceTimersByTime(61_000);
    const reclaimed = database.claimCodexAnalysisTask({
      taskId: created.task.id,
      claimedBy: "codex-session-b",
      leaseSeconds: 1_800,
    })!;
    database.failCodexAnalysisTaskFromLaunch({
      taskId: created.task.id,
      launchToken: launch.launchToken,
      errorDetail: "旧会话迟到的失败回调",
    });

    expect(database.getCodexAnalysisTask(created.task.id)).toMatchObject({
      status: "claimed",
      claimedBy: "codex-session-b",
      leaseExpiresAt: reclaimed.task.leaseExpiresAt,
      errorDetail: null,
    });
  });

  it("extends the claim lease when a ten-minute heartbeat reports progress", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T01:00:00.000Z"));
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const created = database.createCodexAnalysisTask({
      projectId: imported.projectId,
      mode: "auto",
      requestedBy: "Cassian",
    });
    const claim = database.claimCodexAnalysisTask({
      taskId: created.task.id,
      claimedBy: "codex-session-a",
      leaseSeconds: 1_800,
    })!;
    const initialExpiry = Date.parse(claim.task.leaseExpiresAt!);

    vi.advanceTimersByTime(10 * 60 * 1_000);
    const heartbeat = database.progressCodexAnalysisTask({
      taskId: created.task.id,
      claimToken: claim.claimToken,
      message: "仍在分析，已完成事实与市场章节",
      leaseSeconds: 1_800,
    });

    expect(Date.parse(heartbeat.leaseExpiresAt!)).toBe(
      initialExpiry + 10 * 60 * 1_000
    );
    expect(heartbeat.status).toBe("analyzing");
  });

  it("supersedes queued work when a new BP version arrives", async () => {
    const v1 = await importFilePath(
      path.join(samples, "01-星屿智造-天使-v1.md"),
      {},
      database
    );
    const created = database.createCodexAnalysisTask({
      projectId: v1.projectId,
      mode: "assess-founder-first",
      requestedBy: "Cassian",
    });
    const claim = database.claimCodexAnalysisTask({
      taskId: created.task.id,
      claimedBy: "codex-session-a",
      leaseSeconds: 1_800,
    })!;

    await importFilePath(
      path.join(samples, "01-星屿智造-天使-v2.md"),
      {},
      database
    );

    const task = database.getCodexAnalysisTask(created.task.id)!;
    expect(task.status).toBe("superseded");
    expect(task.errorDetail).toContain("项目版本");
    expect(() =>
      database.progressCodexAnalysisTask({
        taskId: task.id,
        claimToken: claim.claimToken,
        message: "继续分析",
        leaseSeconds: 1_800,
      })
    ).toThrow("项目版本已经变化");
  });

  it("records failure and allows a fresh task to be created", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const created = database.createCodexAnalysisTask({
      projectId: imported.projectId,
      mode: "auto",
      requestedBy: "Cassian",
    });
    const claim = database.claimCodexAnalysisTask({
      taskId: created.task.id,
      claimedBy: "codex-session-a",
      leaseSeconds: 1_800,
    })!;
    const failed = database.failCodexAnalysisTask({
      taskId: created.task.id,
      claimToken: claim.claimToken,
      errorDetail: "模型会话中断",
    });
    const retry = database.createCodexAnalysisTask({
      projectId: imported.projectId,
      mode: "auto",
      requestedBy: "Cassian",
    });

    expect(failed.status).toBe("failed");
    expect(failed.errorDetail).toBe("模型会话中断");
    expect(retry.reused).toBe(false);
    expect(retry.task.id).not.toBe(failed.id);
  });

  it("links a completed evidence run and records the routed Skill", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const created = database.createCodexAnalysisTask({
      projectId: imported.projectId,
      mode: "auto",
      requestedBy: "Cassian",
    });
    const claim = database.claimCodexAnalysisTask({
      taskId: created.task.id,
      claimedBy: "codex-session-a",
      leaseSeconds: 1_800,
      codexThreadId: "thread-test",
    })!;
    const analyzing = database.progressCodexAnalysisTask({
      taskId: created.task.id,
      claimToken: claim.claimToken,
      message: "正在执行综合初筛",
      selectedSkill: "review-early-stage-investment",
      routerReason: "默认主 Skill 根据早期项目材料选择综合初筛。",
      leaseSeconds: 1_800,
    });
    const run = database.prepareCodexAnalysis({
      projectId: imported.projectId,
      skillName: "review-early-stage-investment",
      requestedBy: "Cassian",
    });
    database.completeCodexAnalysis({
      runId: run.id,
      modelName: "Codex test",
      result: groundedResult(run),
    });
    const completed = database.completeCodexAnalysisTask({
      taskId: created.task.id,
      claimToken: claim.claimToken,
      runId: run.id,
      selectedSkill: "review-early-stage-investment",
      routerReason: "默认主 Skill 根据早期项目材料选择综合初筛。",
      codexThreadId: "thread-test",
      codexTurnId: "turn-test",
    });

    expect(analyzing.status).toBe("analyzing");
    expect(completed.status).toBe("completed");
    expect(completed.runId).toBe(run.id);
    expect(completed.selectedSkill).toBe("review-early-stage-investment");
    expect(completed.codexThreadId).toBe("thread-test");
    expect(completed.codexTurnId).toBe("turn-test");
  });
});
