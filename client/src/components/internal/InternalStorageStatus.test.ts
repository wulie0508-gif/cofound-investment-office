import { describe, expect, it } from "vitest";
import {
  buildArchiveMetrics,
  formatArchiveTime,
} from "./InternalStorageStatus";
import { buildStorageScopePresentation } from "./StorageBoundary";

const bilingual = (chinese: string, english: string) =>
  `${chinese} / ${english}`;

describe("internal archive status", () => {
  it("exposes only the four user-facing archive metrics", () => {
    const metrics = buildArchiveMetrics(
      {
        connectionState: "connected",
        storageScope: "enterprise_shared",
        projectCount: 3,
        fileCount: 8,
        pendingCount: 2,
        failedCount: 1,
        lastSyncAt: "2026-08-23T10:30:00+08:00",
      },
      bilingual
    );

    expect(metrics.map(item => item.label)).toEqual([
      "已归档项目 / Archived projects",
      "已保存文件 / Saved files",
      "连接状态 / Connection",
      "最近更新时间 / Last updated",
    ]);
    expect(metrics.map(item => item.value)).not.toContain("2");
    expect(metrics.map(item => item.value)).not.toContain("1");
    expect(metrics[2]?.value).toBe(
      "企业共享 · 已连接 / Enterprise shared · Connected"
    );
  });

  it("never presents an unknown folder as enterprise shared", () => {
    const overview = {
      connectionState: "connected" as const,
      storageScope: "unknown" as const,
      driveRootName: "Cofound Investment Office",
    };
    const metrics = buildArchiveMetrics(overview, bilingual);
    const presentation = buildStorageScopePresentation(overview, bilingual);

    expect(metrics[2]?.value).toBe(
      "已连接 · 类型待确认 / Connected · Type unconfirmed"
    );
    expect(presentation.connectionLabel).not.toContain("企业共享");
    expect(presentation.storageTitle).toContain("类型待确认");
  });

  it("uses a neutral placeholder when no update time is available", () => {
    expect(formatArchiveTime(null)).toBe("—");
    expect(formatArchiveTime("not-a-date")).toBe("—");
  });
});
