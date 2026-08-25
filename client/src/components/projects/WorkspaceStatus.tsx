import { Database } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function WorkspaceStatus({
  dataUpdatedAt,
  isRefreshing,
}: {
  dataUpdatedAt: number;
  isRefreshing: boolean;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        weekday: "short",
      }).format(now),
    [now]
  );
  const timeLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now),
    [now]
  );
  const refreshedLabel = dataUpdatedAt
    ? new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(dataUpdatedAt))
    : "等待数据";

  return (
    <aside
      className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 sm:w-auto sm:border-t-0 sm:pt-0 lg:justify-end"
      aria-label="工作台时间与本地服务状态"
    >
      <div>
        <p className="field-label">今日工作台</p>
        <p className="mono-meta mt-1 text-foreground">
          <time dateTime={now.toISOString()}>
            {dateLabel} {timeLabel}
          </time>
        </p>
      </div>
      <div className="flex items-center gap-2.5" aria-live="polite">
        <span className="flex size-8 items-center justify-center rounded-md border border-border bg-card">
          <Database className="size-3.5 text-signal" aria-hidden="true" />
        </span>
        <div>
          <p className="field-label">本机数据</p>
          <p className="mono-meta mt-1 text-foreground">
            {isRefreshing ? "正在刷新" : `已连接 ${refreshedLabel}`}
          </p>
        </div>
      </div>
    </aside>
  );
}
