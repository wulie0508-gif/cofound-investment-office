import { Button } from "@/components/ui/button";
import { useUiLanguage } from "@/contexts/UiLanguageContext";
import { FileClock, RefreshCw } from "lucide-react";
import type { InternalStorageOverview } from "./internal-storage-model";
import { StorageBoundary } from "./StorageBoundary";

function metric(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString("zh-CN") : "—";
}

export function formatArchiveTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

type Copy = (chinese: string, english: string) => string;

export function buildArchiveMetrics(
  overview: InternalStorageOverview,
  copy: Copy
) {
  const connectionValue =
    overview.connectionState === "connected"
      ? overview.storageScope === "enterprise_shared"
        ? copy("企业共享 · 已连接", "Enterprise shared · Connected")
        : overview.storageScope === "personal"
          ? copy("个人目录 · 已连接", "Personal folder · Connected")
          : copy("已连接 · 类型待确认", "Connected · Type unconfirmed")
      : overview.connectionState === "unavailable"
        ? copy("暂不可用", "Unavailable")
        : copy("待连接", "Not connected");

  return [
    {
      label: copy("已归档项目", "Archived projects"),
      value: metric(overview.projectCount),
      numeric: true,
    },
    {
      label: copy("已保存文件", "Saved files"),
      value: metric(overview.fileCount),
      numeric: true,
    },
    {
      label: copy("连接状态", "Connection"),
      value: connectionValue,
      numeric: false,
    },
    {
      label: copy("最近更新时间", "Last updated"),
      value: formatArchiveTime(overview.lastSyncAt),
      numeric: false,
    },
  ];
}

export function InternalStorageStatus({
  overview,
  isRefreshing = false,
  onRefresh,
}: {
  overview: InternalStorageOverview;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}) {
  const { copy } = useUiLanguage();
  const connected = overview.connectionState === "connected";
  const storageScope = overview.storageScope ?? "unknown";
  const metrics = buildArchiveMetrics(overview, copy);

  return (
    <>
      <StorageBoundary overview={overview} />

      <section
        className="section-shell mt-5"
        aria-labelledby="sync-overview-title"
      >
        <div className="section-bar">
          <div>
            <h2 id="sync-overview-title" className="section-title">
              {copy("归档状态", "Archive status")}
            </h2>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {copy(
                storageScope === "enterprise_shared"
                  ? "显示企业共享资料的保存结果。"
                  : storageScope === "personal"
                    ? "显示当前个人目录中的保存结果。"
                    : "显示当前飞书目录的保存结果；目录类型尚待确认。",
                storageScope === "enterprise_shared"
                  ? "A simple view of files saved in enterprise shared storage."
                  : storageScope === "personal"
                    ? "A simple view of files saved in the current personal folder."
                    : "A simple view of saved files; the folder type is not yet confirmed."
              )}
            </p>
          </div>
          {onRefresh ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {copy("刷新状态", "Refresh")}
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(({ label, value, numeric }, index) => (
            <div
              key={label}
              className={`min-h-24 px-4 py-4 sm:px-5 ${index ? "border-t border-border sm:border-l sm:border-t-0" : ""} ${index === 2 ? "sm:border-l-0 sm:border-t lg:border-l lg:border-t-0" : ""}`}
            >
              <p className="field-label">{label}</p>
              <p
                className={
                  numeric
                    ? "finance-number mt-1.5 text-[1.75rem] font-bold text-foreground"
                    : "mt-2 text-sm font-bold leading-5 text-foreground"
                }
              >
                {value}
              </p>
            </div>
          ))}
        </div>
        {overview.failedCount ? (
          <div
            role="alert"
            className="flex items-start gap-3 border-t border-destructive/25 bg-destructive/[0.035] px-4 py-3.5 sm:px-5"
          >
            <FileClock
              className="mt-0.5 size-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <p className="text-xs font-medium leading-5 text-destructive">
              {copy(
                `有 ${overview.failedCount} 份资料尚未保存完成，请让 Codex 重新处理。`,
                `${overview.failedCount} file${overview.failedCount === 1 ? "" : "s"} could not be saved. Ask Codex to try again.`
              )}
            </p>
          </div>
        ) : null}
        {!connected ? (
          <div className="flex items-start gap-3 border-t border-border bg-muted/35 px-4 py-3.5 sm:px-5">
            <FileClock
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-xs font-medium leading-5 text-muted-foreground">
              {copy(
                "完成飞书目录配置后，这里会自动显示实际保存结果。",
                "Configure the Feishu folder to see the actual archive results here."
              )}
            </p>
          </div>
        ) : null}
      </section>
    </>
  );
}
