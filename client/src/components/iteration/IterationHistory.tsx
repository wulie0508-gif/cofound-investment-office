import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import {
  formatIterationTime,
  type IterationItem,
  type IterationStatus,
} from "./iteration-model";

type Copy = (chinese: string, english: string) => string;

const HISTORY_STATUS: Record<
  IterationStatus,
  { chinese: string; english: string }
> = {
  ready_for_codex: { chinese: "等待 Codex", english: "Ready for Codex" },
  working: { chinese: "处理中", english: "In progress" },
  checking: { chinese: "检查中", english: "Checking" },
  needs_attention: { chinese: "需要处理", english: "Needs attention" },
  ready: { chinese: "等待确认", english: "Ready for review" },
  approved: { chinese: "已确认", english: "Approved" },
  completed: { chinese: "已完成", english: "Completed" },
  paused: { chinese: "已暂停", english: "Paused" },
};

export function IterationHistory({
  items,
  copy,
}: {
  items: IterationItem[];
  copy: Copy;
}) {
  return (
    <section
      className="section-shell mt-5"
      aria-labelledby="iteration-history-title"
    >
      <div className="section-bar">
        <div>
          <h2 id="iteration-history-title" className="section-title">
            {copy("迭代记录", "Improvement history")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {copy(
              "只记录每轮改进的目的、结果和状态。",
              "A concise record of each improvement and its outcome."
            )}
          </p>
        </div>
        <span className="mono-meta">{items.length || "—"}</span>
      </div>

      {items.length ? (
        <div className="divide-y divide-border" role="list">
          {items.slice(0, 12).map(item => {
            const status = HISTORY_STATUS[item.status];
            return (
              <article
                key={item.id}
                role="listitem"
                className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-bold">{item.title}</h3>
                    <Badge variant="outline" className="text-muted-foreground">
                      {copy(status.chinese, status.english)}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {item.result?.summary ?? item.description}
                  </p>
                </div>
                <time
                  dateTime={item.updatedAt}
                  className="font-mono text-[11px] text-muted-foreground"
                >
                  {formatIterationTime(item.updatedAt)}
                </time>
              </article>
            );
          })}
        </div>
      ) : (
        <div role="status" className="px-5 py-10 text-center">
          <History
            className="mx-auto size-7 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-bold">
            {copy("还没有历史记录", "No history yet")}
          </p>
        </div>
      )}
    </section>
  );
}
