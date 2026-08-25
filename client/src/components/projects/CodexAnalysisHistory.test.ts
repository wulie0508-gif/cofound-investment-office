import type { CodexAnalysisRun } from "@shared/bp";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CodexAnalysisHistory } from "./CodexAnalysisHistory";

const result: NonNullable<CodexAnalysisRun["result"]> = {
  schemaVersion: "1.0",
  summary: "现有客户证据支持继续核实，但收入质量仍需复核。",
  positiveSignals: [
    {
      title: "已有付费客户",
      detail: "材料披露两家付费客户。",
      basis: "evidence",
      evidence: [
        { fieldKey: "payingCustomerCount", page: 6, quote: "付费客户 2 家" },
      ],
    },
  ],
  keyRisks: [
    {
      title: "客户集中",
      detail: "尚未披露第一大客户占比。",
      basis: "missing_information",
      evidence: [],
    },
  ],
  frameworkSections: [
    {
      key: "commercial-evidence",
      title: "商业证据",
      assessment: "mixed",
      detail: "已有客户，但收入质量仍需核实。",
      evidence: [
        { fieldKey: "payingCustomerCount", page: 6, quote: "付费客户 2 家" },
      ],
      counterarguments: ["客户数量不等于可持续收入"],
      unresolvedQuestions: ["续约率是多少？"],
    },
  ],
  unresolvedQuestions: ["回款周期是多少？"],
  nextActions: ["核验合同与回款凭证"],
  aiSuggestion: "已有商业信号",
  confidence: "medium",
};

function run(
  status: CodexAnalysisRun["status"],
  overrides: Partial<CodexAnalysisRun> = {}
): CodexAnalysisRun {
  return {
    id: `run-${status}`,
    projectId: "project-1",
    sourceFileId: "file-1",
    sourceFileSha256: "1234567890abcdef1234567890abcdef",
    projectLocalVersion: 2,
    factSnapshotHash: "abcdef1234567890abcdef1234567890",
    skillName: "review-early-stage-investment",
    skillVersion: "1.0.0",
    promptVersion: "1.0.0",
    requestedBy: "Cassian",
    modelName: status === "prepared" ? null : "gpt-5",
    status,
    result: status === "completed" || status === "stale" ? result : null,
    errorDetail: status === "failed" ? "分析过程被中断" : null,
    createdAt: "2026-08-22T01:00:00.000Z",
    completedAt: status === "completed" ? "2026-08-22T01:05:00.000Z" : null,
    staleAt: status === "stale" ? "2026-08-22T02:00:00.000Z" : null,
    staleReason: status === "stale" ? "项目原文件版本已经变化" : null,
    ...overrides,
  };
}

describe("CodexAnalysisHistory", () => {
  it("renders a meaningful empty state without controls", () => {
    const html = renderToStaticMarkup(
      createElement(CodexAnalysisHistory, { analyses: [] })
    );

    expect(html).toContain("还没有 Codex 深度分析记录");
    expect(html).toContain("AI 只提供分析建议");
    expect(html).not.toContain("<button");
  });

  it("renders prepared, completed, stale and failed histories with provenance", () => {
    const html = renderToStaticMarkup(
      createElement(CodexAnalysisHistory, {
        analyses: [
          run("prepared"),
          run("completed"),
          run("stale"),
          run("failed"),
        ],
      })
    );

    for (const label of ["已准备", "已完成", "已过期", "失败"]) {
      expect(html).toContain(label);
    }
    for (const content of [
      "Cofound 核心初筛",
      "现有客户证据支持继续核实",
      "已有付费客户",
      "客户集中",
      "商业证据",
      "客户数量不等于可持续收入",
      "回款周期是多少？",
      "核验合同与回款凭证",
      "已有商业信号",
      "Cassian",
      "gpt-5",
      "1234567890ab…",
      "abcdef123456…",
      "项目原文件版本已经变化",
      "分析过程被中断",
    ]) {
      expect(html).toContain(content);
    }
    expect(html).not.toContain("<button");
  });
});
