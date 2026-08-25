import { describe, expect, it } from "vitest";
import { normalizeIndustryCategory } from "../../shared/bp";
import { analyzeDocument, parseMoney } from "./analyzer";

describe("deterministic investment analysis", () => {
  it("normalizes Chinese money units", () => {
    expect(parseMoney("1.2亿元")).toBe(120_000_000);
    expect(parseMoney("3,500 万元")).toBe(35_000_000);
    expect(parseMoney("120万元")).toBe(1_200_000);
  });

  it("never fills a missing fact and keeps recommendations separate", () => {
    const document = {
      pages: [
        {
          page: 1,
          text: [
            "公司名称：测试星球（完全虚构）",
            "核心产品：虚构软件",
            "所属行业：企业服务",
            "融资轮次：天使轮",
            "融资需求：500万元",
            "证据说明：有一份 LOI。",
          ].join("\n"),
        },
      ],
      text: "公司名称：测试星球（完全虚构） 核心产品：虚构软件 所属行业：企业服务 融资轮次：天使轮 融资需求：500万元 证据说明：有一份 LOI。",
    };
    const result = analyzeDocument(document, "file-test");
    expect(result.payload.facts.company.value).toBe("测试星球（完全虚构）");
    expect(result.payload.facts.revenueAmount.value).toBeNull();
    expect(result.payload.facts.company.page).toBe(1);
    expect(result.payload.aiStatus).toBe("信息不足");
    expect(result.payload.missingInformation).toContain("收入");
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.payload).not.toHaveProperty("recommendations");
  });

  it("extracts financing and customer quality fields for commercial checks", () => {
    const text = [
      "公司名称：远川测试科技（完全虚构）",
      "核心产品：工业巡检软件",
      "所属行业：工业软件",
      "融资轮次：Pre-A轮",
      "融资需求：2000万元",
      "投前估值：8000万元",
      "订单金额：1200万元",
      "营业收入：360万元",
      "付费客户数：12个",
      "第一大客户收入占比：58%",
      "毛利率：62%",
      "月度现金消耗：80万元",
      "现金跑道：10个月",
      "资金用途：研发、销售团队和库存备货",
      "客户情况：12家工业企业",
      "核心团队：三名全职创始成员",
      "商业模式：软件订阅与实施费",
    ].join("\n");
    const result = analyzeDocument(
      { pages: [{ page: 1, text }], text },
      "file-commercial"
    );

    expect(result.payload.schemaVersion).toBe("1.1");
    expect(result.payload.facts.preMoneyValuation.value).toBe(80_000_000);
    expect(result.payload.facts.payingCustomerCount.value).toBe(12);
    expect(result.payload.facts.customerConcentration.value).toBe(58);
    expect(result.payload.commercialChecks.map(check => check.name)).toContain(
      "融资定价与稀释"
    );
    expect(result.payload.risks.map(risk => risk.title)).toContain(
      "客户集中度偏高"
    );
  });

  it("marks conflicting values and unclear money units as deterministic ambiguity", () => {
    const text = [
      "公司名称：歧义测试企业（完全虚构）",
      "融资需求：500万元",
      "本轮计划融资：1000万元",
      "投前估值：8000",
    ].join("\n");
    const result = analyzeDocument(
      { pages: [{ page: 1, text }], text },
      "file-ambiguous"
    );

    expect(result.payload.facts.fundingAmount.verificationStatus).toBe(
      "ambiguous"
    );
    expect(result.payload.facts.fundingAmount.ambiguityReasons).toEqual(
      expect.arrayContaining(["multiple_values"])
    );
    expect(result.payload.facts.preMoneyValuation.ambiguityReasons).toEqual(
      expect.arrayContaining(["missing_unit", "unknown_currency"])
    );
    expect(
      result.payload.ambiguousInformation?.map(item => item.fieldKey)
    ).toEqual(expect.arrayContaining(["fundingAmount", "preMoneyValuation"]));
    expect(
      result.payload.commercialChecks.find(
        check => check.name === "融资定价与稀释"
      )?.result
    ).toBe("unknown");
  });

  it("treats 万元 as an explicit monetary unit and currency", () => {
    const text = [
      "公司名称：人民币单位测试（完全虚构）",
      "融资需求：500万元",
      "营业收入：120万元",
    ].join("\n");
    const result = analyzeDocument(
      { pages: [{ page: 1, text }], text },
      "file-cny-unit"
    );

    expect(result.payload.facts.fundingAmount.verificationStatus).toBe(
      "confirmed"
    );
    expect(result.payload.facts.revenueAmount.verificationStatus).toBe(
      "confirmed"
    );
  });

  it("marks a number split across adjacent pages as cross-page ambiguity", () => {
    const pages = [
      { page: 1, text: "公司名称：跨页测试（完全虚构）\n融资需求：" },
      { page: 2, text: "¥500万元\n资金用途：研发" },
    ];
    const result = analyzeDocument(
      { pages, text: pages.map(page => page.text).join("\n") },
      "file-cross-page"
    );

    expect(result.payload.facts.fundingAmount.value).toBe(5_000_000);
    expect(result.payload.facts.fundingAmount.ambiguityReasons).toContain(
      "cross_page_fragment"
    );
    expect(result.payload.facts.fundingAmount.verificationStatus).toBe(
      "ambiguous"
    );
  });

  it("extracts common Markdown BP prose and tables without guessing", () => {
    const text = [
      "> 虚构产品：**工业能源操作系统**",
      "> 项目阶段：**Pre-A**",
      "> 行业：**工业节能 / 能源数字化**",
      "**虚构公司全称：**澄流能效科技（苏州）有限公司",
      "截至基准日，公司拥有 **17 家付费客户、29 个站点**；2026 年 1-7 月新增签约订单 **1,320 万元人民币**。2026 年上半年确认收入 **710 万元人民币**，综合毛利率 **51.1%**。",
      "**本轮融资金额（执行摘要口径）：人民币 3,000 万元。**投前估值主张为 **人民币 1.60 亿元**。主要用于产品研发、交付标准化和市场拓展。",
      "| 付费客户 | 17 家 | 已签合同 |",
      "| 2026 年 1-7 月新增订单 | 1,320 万元人民币 | 已签合同 |",
      "| 2026H1 收入 | 710 万元人民币 | 管理口径 |",
      "| 2026H1 综合毛利率 | 51.1% | 管理口径 |",
      "| 账面现金 | 840 万元人民币 | 基准日 |",
      "| 近三个月平均净消耗 | 94 万元人民币/月 | 现金口径 |",
      "| 静态现金跑道 | 8.9 个月 | 静态口径 |",
      "2026H1 最大单一客户收入占比为 **22%**。",
      "公司采用“软件订阅 + 实施与边缘集成 + 节能收益分成”三类收入组合。",
      "**本轮融资金额（融资方案口径）：人民币 3,500 万元。**",
    ].join("\n");
    const result = analyzeDocument(
      { pages: [{ page: 1, text }], text },
      "file-markdown-bp"
    );

    expect(result.payload.facts.company.value).toBe(
      "澄流能效科技（苏州）有限公司"
    );
    expect(result.payload.facts.fundingRound.value).toBe("Pre-A");
    expect(result.payload.facts.industry.value).toBe("工业节能 / 能源数字化");
    expect(
      normalizeIndustryCategory(String(result.payload.facts.industry.value))
    ).toBe("新能源与气候科技");
    expect(result.payload.facts.orderAmount.value).toBe(13_200_000);
    expect(result.payload.facts.revenueAmount.value).toBe(7_100_000);
    expect(result.payload.facts.payingCustomerCount.value).toBe(17);
    expect(result.payload.facts.grossMargin.value).toBe(51.1);
    expect(result.payload.facts.runwayMonths.value).toBe(8.9);
    expect(result.payload.facts.fundingAmount.verificationStatus).toBe(
      "ambiguous"
    );
    expect(result.payload.facts.fundingAmount.ambiguityReasons).toContain(
      "multiple_values"
    );
  });
});
