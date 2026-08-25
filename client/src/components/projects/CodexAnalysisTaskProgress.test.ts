import type { CodexAnalysisTask, CodexAnalysisTaskStatus } from "@shared/bp";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CodexAnalysisTaskProgress } from "./CodexAnalysisTaskProgress";
import {
  ANALYSIS_MODES,
  analysisTaskIsLive,
  analysisTaskLeaseExpired,
  analysisTaskNeedsRestart,
  analysisTaskQueuedHandoffExpired,
  safeCodexThreadUri,
} from "./codex-analysis-options";

function task(status: CodexAnalysisTaskStatus): CodexAnalysisTask {
  const currentTime = Date.now();
  return {
    id: `task-${status}`,
    projectId: "project-1",
    sourceFileId: "file-1",
    sourceFileVersion: 2,
    projectLocalVersion: 3,
    requestedBy: "Cassian",
    mode: "auto",
    status,
    selectedSkill: status === "queued" ? null : "review-early-stage-investment",
    routerReason: status === "queued" ? null : "项目处于早期融资阶段",
    runId: status === "completed" ? "run-1" : null,
    codexThreadId: null,
    codexTurnId: null,
    launcherMode: "desktop_fallback",
    launcherError: null,
    claimedBy: status === "queued" ? null : "Codex",
    claimedAt:
      status === "queued" ? null : new Date(currentTime - 1_000).toISOString(),
    leaseExpiresAt:
      status === "claimed" || status === "analyzing"
        ? new Date(Date.now() + 60_000).toISOString()
        : null,
    progressMessage: null,
    errorDetail: status === "failed" ? "分析进程意外结束" : null,
    createdAt: new Date(currentTime - 2_000).toISOString(),
    updatedAt: new Date(currentTime - 1_000).toISOString(),
    completedAt:
      status === "completed"
        ? new Date(currentTime - 1_000).toISOString()
        : null,
  };
}

describe("CodexAnalysisTaskProgress", () => {
  it("keeps auto routing as the default and exposes four optional views", () => {
    expect(ANALYSIS_MODES.map(item => item.value)).toEqual([
      "auto",
      "review-early-stage-investment",
      "assess-market-first",
      "assess-founder-first",
      "assess-long-term-value",
    ]);
    expect(ANALYSIS_MODES[0].label).toContain("开放分析");
  });

  it("explains the default empty state", () => {
    const html = renderToStaticMarkup(
      createElement(CodexAnalysisTaskProgress, { task: null })
    );

    expect(html).toContain("尚未生成结构化分析");
    expect(html).toContain("自由对话不会强制写入看板");
    expect(html).toContain("绑定当前事实版本");
  });

  it("renders every task state and the desktop recovery instruction", () => {
    const statuses: CodexAnalysisTaskStatus[] = [
      "queued",
      "claimed",
      "analyzing",
      "completed",
      "failed",
      "superseded",
    ];
    const html = statuses
      .map(status =>
        renderToStaticMarkup(
          createElement(CodexAnalysisTaskProgress, { task: task(status) })
        )
      )
      .join("\n");

    for (const label of [
      "等待 Codex",
      "Codex 已领取",
      "正在分析",
      "分析已完成",
      "本次未完成",
      "材料版本已更新",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("处理 Cofound 分析待办");
    expect(html).toContain("综合初筛");
    expect(html).toContain("分析进程意外结束");
  });

  it("derives an expired lease as recoverable and no longer live", () => {
    const currentTime = Date.now();
    const interrupted = task("analyzing");
    interrupted.leaseExpiresAt = new Date(currentTime - 1_000).toISOString();
    interrupted.codexThreadId = "01991b65-0bd7-7f40-a10d-3f52e0b9bc4a";

    expect(analysisTaskLeaseExpired(interrupted, currentTime)).toBe(true);
    expect(analysisTaskNeedsRestart(interrupted, currentTime)).toBe(true);
    expect(analysisTaskIsLive(interrupted, currentTime)).toBe(false);
    const html = renderToStaticMarkup(
      createElement(CodexAnalysisTaskProgress, { task: interrupted })
    );
    expect(html).toContain("执行中断，可恢复");
    expect(html).toContain("重新启动分析");
    expect(html).not.toContain("在 Codex 中继续");
  });

  it("turns a queued handoff into a restart after five minutes", () => {
    const currentTime = Date.now();
    const abandoned = task("queued");
    abandoned.updatedAt = new Date(currentTime - 300_001).toISOString();

    expect(analysisTaskQueuedHandoffExpired(abandoned, currentTime)).toBe(true);
    expect(analysisTaskNeedsRestart(abandoned, currentTime)).toBe(true);
    expect(analysisTaskIsLive(abandoned, currentTime)).toBe(false);
    const html = renderToStaticMarkup(
      createElement(CodexAnalysisTaskProgress, { task: abandoned })
    );
    expect(html).toContain("启动未接手，可重新启动");
    expect(html).toContain("交接时间内接手");
  });

  it("offers a safe return link for an App Server thread", () => {
    const completed = task("completed");
    completed.codexThreadId = "01991b65-0bd7-7f40-a10d-3f52e0b9bc4a";
    completed.launcherMode = "app_server";
    const html = renderToStaticMarkup(
      createElement(CodexAnalysisTaskProgress, { task: completed })
    );

    expect(html).toContain("在 Codex 中继续");
    expect(html).toContain(
      "codex://threads/01991b65-0bd7-7f40-a10d-3f52e0b9bc4a"
    );
    expect(safeCodexThreadUri("javascript:alert(1)")).toBeNull();
  });

  it("keeps an App Server window-open failure visible", () => {
    const queued = task("queued");
    queued.launcherMode = "app_server";
    queued.launcherError = "分析任务已创建，但未能自动打开 Codex";
    queued.codexThreadId = "01991b65-0bd7-7f40-a10d-3f52e0b9bc4a";
    const html = renderToStaticMarkup(
      createElement(CodexAnalysisTaskProgress, { task: queued })
    );

    expect(html).toContain("Codex 窗口未自动打开");
    expect(html).toContain("对话已经出现在 Codex 任务列表中");
    expect(html).not.toContain("在 Codex 中继续");
  });
});
