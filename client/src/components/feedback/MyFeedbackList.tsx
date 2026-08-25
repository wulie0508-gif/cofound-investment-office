import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquareText, RefreshCw } from "lucide-react";
import {
  FEEDBACK_DIAGNOSIS_LABELS,
  FEEDBACK_TRIAGE_LABELS,
} from "./feedback-labels";
import { formatFeedbackTime, type FeedbackItem } from "./feedback-model";
import { FeedbackSyncBadge } from "./FeedbackSyncBadge";

type Copy = (chinese: string, english: string) => string;

export function MyFeedbackList({
  items,
  selectedId,
  isRefreshing,
  copy,
  onSelect,
  onRefresh,
}: {
  items: FeedbackItem[];
  selectedId: string | null;
  isRefreshing: boolean;
  copy: Copy;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="section-shell" aria-labelledby="my-feedback-title">
      <div className="section-bar">
        <div>
          <h2 id="my-feedback-title" className="section-title">
            {copy("我的反馈", "My feedback")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {copy(
              "查看自己上报的问题和维护进度。",
              "Track the issues you reported and their progress."
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="mono-meta">{items.length || "—"}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {copy("刷新进度", "Refresh")}
          </Button>
        </div>
      </div>

      {items.length ? (
        <div className="divide-y divide-border" role="list">
          {items.map(item => {
            const diagnosis = FEEDBACK_DIAGNOSIS_LABELS[item.status];
            const triage = FEEDBACK_TRIAGE_LABELS[item.triageStatus];
            const selected = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                role="listitem"
                aria-current={selected ? "true" : undefined}
                className={`grid w-full gap-3 px-4 py-4 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5 ${
                  selected ? "bg-muted/70" : "hover:bg-muted/40"
                }`}
                onClick={() => onSelect(item.id)}
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-bold">
                      {item.title}
                    </span>
                    <Badge variant="outline" className="text-muted-foreground">
                      {copy(triage.chinese, triage.english)}
                    </Badge>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                    {item.diagnosis?.summary ?? item.description}
                  </span>
                  <span className="mt-2 block text-[11px] text-muted-foreground">
                    {copy(diagnosis.chinese, diagnosis.english)} ·{" "}
                    {formatFeedbackTime(item.updatedAt)}
                  </span>
                </span>
                <FeedbackSyncBadge status={item.syncStatus} copy={copy} />
              </button>
            );
          })}
        </div>
      ) : (
        <div role="status" className="px-5 py-10 text-center">
          <MessageSquareText
            className="mx-auto size-7 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-bold">
            {copy("还没有上报记录", "No feedback yet")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {copy(
              "上方提交的问题会安全保存在这里。",
              "Submitted feedback will appear here."
            )}
          </p>
        </div>
      )}
    </section>
  );
}
