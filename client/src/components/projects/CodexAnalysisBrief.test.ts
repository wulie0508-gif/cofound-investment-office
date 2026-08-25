import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CodexAnalysisBrief } from "./CodexAnalysisBrief";

describe("CodexAnalysisBrief", () => {
  it("keeps the open prompt optional and hides reference views by default", () => {
    const html = renderToStaticMarkup(
      createElement(CodexAnalysisBrief, {
        mode: "auto",
        objective: "",
        disabled: false,
        onModeChange: () => undefined,
        onObjectiveChange: () => undefined,
      })
    );

    expect(html).toContain("告诉 Codex 你现在想判断什么（可选）");
    expect(html).toContain("留空也可以直接开始开放分析");
    expect(html).toContain("指定一个参考视角（可选）");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('id="codex-analysis-mode"');
  });

  it("frames Skills as optional tools and the dashboard as structured memory", () => {
    const html = renderToStaticMarkup(
      createElement(CodexAnalysisBrief, {
        mode: "review-early-stage-investment",
        objective: "请和我一起验证这家公司是否值得继续跟进",
        disabled: false,
        onModeChange: () => undefined,
        onObjectiveChange: () => undefined,
      })
    );

    expect(html).toContain("自由调用现有 Skill");
    expect(html).toContain("在对话中继续追问和增强思路");
    expect(html).toContain("看板只保存可复核的结构化结论");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('id="codex-analysis-mode"');
  });
});
