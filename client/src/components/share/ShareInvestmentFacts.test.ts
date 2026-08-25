import { describe, expect, it } from "vitest";
import { formatSharedFieldValue } from "./ShareInvestmentFacts";

const field = (key: string, value: unknown) => ({
  key,
  label: "",
  englishLabel: "",
  value,
  evidence: null,
  verification: "unverified" as const,
});

describe("shared investment field formatting", () => {
  it("formats investment amounts, ratios and runway with readable units", () => {
    expect(formatSharedFieldValue(field("fundingAmount", 10_000_000))).toBe(
      "¥1000万"
    );
    expect(formatSharedFieldValue(field("grossMargin", 48))).toBe("48%");
    expect(formatSharedFieldValue(field("runwayMonths", 16))).toBe("16 个月");
  });

  it("uses explicit disclosure language for absent values", () => {
    expect(formatSharedFieldValue(field("revenueAmount", null))).toBe("未披露");
    expect(formatSharedFieldValue(field("hasLoi", false))).toBe("否");
  });
});
