import { describe, expect, it } from "vitest";
import { dateRangeForPreset } from "./ProjectList";

describe("project date shortcuts", () => {
  const now = new Date(2026, 7, 18, 14, 30, 0);

  it("builds a local-day range for today", () => {
    const range = dateRangeForPreset("today", "", "", now);
    const start = new Date(range.importedAfter!);
    const end = new Date(range.importedBefore!);

    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([
      2026,
      7,
      18,
      0,
    ]);
    expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([18, 23, 59]);
  });

  it("supports month and exact custom date ranges", () => {
    const month = dateRangeForPreset("thisMonth", "", "", now);
    expect(new Date(month.importedAfter!).getDate()).toBe(1);

    const custom = dateRangeForPreset("custom", "2026-08-02", "2026-08-09", now);
    expect(new Date(custom.importedAfter!).getDate()).toBe(2);
    expect(new Date(custom.importedBefore!).getDate()).toBe(9);
  });
});
