import { formatDate } from "@/lib/format";
import { projectStatusLabel, type ProjectDetail } from "@shared/bp";
import { Bot, CircleDot, UserRound } from "lucide-react";

function displayNote(note: string | null) {
  if (note === "实际管理状态未锁定，已采用 AI 建议") {
    return "历史记录：管理判断曾由旧版初筛结果自动填充";
  }
  if (note === "基于本地确定性规则的建议状态") {
    return "基于本地材料和确定性规则的初筛状态";
  }
  return note;
}

export function StatusHistory({
  events,
}: {
  events: ProjectDetail["statusHistory"];
}) {
  return (
    <section className="section-shell p-5" aria-labelledby="history-title">
      <h2 id="history-title" className="font-bold">
        进度记录
      </h2>
      <ol className="mt-4 space-y-3">
        {events.map(event => {
          const note = displayNote(event.note);
          const Icon =
            event.source === "ai"
              ? Bot
              : event.source === "human"
                ? UserRound
                : CircleDot;
          return (
            <li key={event.id} className="flex gap-3 text-sm">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                <Icon className="size-3.5 text-signal" />
              </span>
              <div className="min-w-0">
                <p className="font-medium">
                  {projectStatusLabel(event.status)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    /{" "}
                    {event.source === "ai"
                      ? "AI"
                      : event.source === "human"
                        ? "人工"
                        : "系统"}
                  </span>
                </p>
                {note && (
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {note}
                  </p>
                )}
                <time
                  className="mt-0.5 block text-[11px] text-muted-foreground"
                  dateTime={event.createdAt}
                >
                  {formatDate(event.createdAt)}
                </time>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
