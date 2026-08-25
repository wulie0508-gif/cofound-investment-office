import { describe, expect, it } from "vitest";
import {
  buildBpOptimizationPrompt,
  buildInvestmentFrameworkPrompt,
  BUILT_IN_SKILLS,
  INVESTMENT_FRAMEWORKS,
} from "./investment-frameworks";

describe("investment framework prompts", () => {
  it("binds the selected framework to the exact local project", () => {
    const framework = INVESTMENT_FRAMEWORKS.find(
      item => item.id === "market-first"
    );
    expect(framework).toBeDefined();
    const prompt = buildInvestmentFrameworkPrompt({
      projectId: "project-123",
      projectName: "虚构项目",
      framework: framework!,
    });
    expect(prompt).toContain("$assess-market-first");
    expect(prompt).toContain("项目 ID：project-123");
    expect(prompt).toContain("赛道卡位");
    expect(prompt).toContain("重点输出");
    expect(prompt).toContain("不要把机构参考视角描述为机构官方评分表");
    expect(prompt).toContain("prepare_investment_analysis");
    expect(prompt).toContain("complete_investment_analysis");
  });

  it("uses the main workspace skill as the default single-skill router", () => {
    const framework = INVESTMENT_FRAMEWORKS[0];
    expect(framework.id).toBe("auto-select");
    const prompt = buildInvestmentFrameworkPrompt({
      projectId: "project-router",
      projectName: "路由测试项目",
      framework,
    });
    expect(prompt).toContain("$analyze-local-bp");
    expect(prompt).toContain("选择且只选择一个主分析 Skill");
    expect(prompt).toContain("不要同时运行多套框架");
    expect(prompt).toContain("事实快照");
  });

  it("registers core analysis skills and optional CleanTech enhancements", () => {
    expect(BUILT_IN_SKILLS).toHaveLength(10);
    expect(BUILT_IN_SKILLS.map(item => item.skillName)).toEqual([
      "analyze-local-bp",
      "review-early-stage-investment",
      "assess-market-first",
      "assess-founder-first",
      "assess-long-term-value",
      "enhance-cleantech-project",
      "review-cleantech-financial-evidence",
      "match-shanghai-cleantech-policies",
      "match-cleantech-project-opportunities",
      "improve-investment-bp",
    ]);
    expect(
      BUILT_IN_SKILLS.find(
        item => item.skillName === "match-shanghai-cleantech-policies"
      )?.role
    ).toBe("项目增强");
  });

  it("explains when each analysis skill applies and where it must stop", () => {
    expect(INVESTMENT_FRAMEWORKS).toHaveLength(5);
    for (const framework of INVESTMENT_FRAMEWORKS) {
      expect(framework.useWhen.length).toBeGreaterThan(12);
      expect(framework.decisionQuestion).toMatch(/？$/u);
      expect(framework.guardrail.length).toBeGreaterThan(12);
    }
    expect(
      INVESTMENT_FRAMEWORKS.find(item => item.id === "founder-first")?.guardrail
    ).toContain("不根据学历");
    expect(
      INVESTMENT_FRAMEWORKS.find(item => item.id === "market-first")?.guardrail
    ).toContain("不当作通用");
  });

  it("keeps BP optimization evidence-bound and non-destructive", () => {
    const prompt = buildBpOptimizationPrompt({
      projectId: "project-bp",
      projectName: "BP 测试项目",
    });
    expect(prompt).toContain("$improve-investment-bp");
    expect(prompt).toContain("不要覆盖原件");
    expect(prompt).toContain("事实快照");
    expect(prompt).toContain("创建新版本");
  });
});
