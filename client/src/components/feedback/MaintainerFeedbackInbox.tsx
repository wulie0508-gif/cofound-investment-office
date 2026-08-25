import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Inbox, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_IMPACT_LABELS,
  FEEDBACK_TRIAGE_LABELS,
} from "./feedback-labels";
import {
  formatFeedbackTime,
  type FeedbackItem,
  type FeedbackTriageAction,
  type FeedbackTriageStatus,
} from "./feedback-model";
import { FeedbackSyncBadge } from "./FeedbackSyncBadge";

type Copy = (chinese: string, english: string) => string;
type InboxFilter = "all" | FeedbackTriageStatus;

const FILTERS: Array<{
  value: InboxFilter;
  chinese: string;
  english: string;
}> = [
  { value: "all", chinese: "全部", english: "All" },
  { value: "new", chinese: "待查看", english: "New" },
  { value: "needs_info", chinese: "待补充", english: "Needs info" },
  { value: "duplicate", chinese: "相似问题", english: "Related" },
  { value: "accepted", chinese: "已纳入", english: "Accepted" },
  { value: "completed", chinese: "已完成", english: "Completed" },
  { value: "deferred", chinese: "暂缓", english: "Deferred" },
];

export function MaintainerFeedbackInbox({
  items,
  selectedId,
  isTriaging,
  isRefreshing,
  copy,
  onSelect,
  onTriage,
  onRefresh,
}: {
  items: FeedbackItem[];
  selectedId: string | null;
  isTriaging: boolean;
  isRefreshing: boolean;
  copy: Copy;
  onSelect: (id: string) => void;
  onTriage: (id: string, action: FeedbackTriageAction, note?: string) => void;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<InboxFilter>("new");
  const [query, setQuery] = useState("");
  const [pendingAction, setPendingAction] = useState<Exclude<
    FeedbackTriageAction,
    "accept"
  > | null>(null);
  const [note, setNote] = useState("");

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return items.filter(item => {
      if (filter !== "all" && item.triageStatus !== filter) return false;
      if (!normalized) return true;
      return [item.title, item.description, item.reporterName]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [filter, items, query]);
  const selected =
    visibleItems.find(item => item.id === selectedId) ??
    visibleItems[0] ??
    null;

  const choose = (id: string) => {
    setPendingAction(null);
    setNote("");
    onSelect(id);
  };

  return (
    <section className="section-shell" aria-labelledby="maintainer-inbox-title">
      <div className="section-bar flex-col items-stretch gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="finance-kicker">TEAM FEEDBACK</p>
          <h2 id="maintainer-inbox-title" className="section-title mt-1">
            {copy("集中反馈收件箱", "Team feedback inbox")}
          </h2>
        </div>
        <div className="flex min-w-0 gap-2 sm:ml-auto">
          <div className="relative min-w-0 flex-1 sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={copy("搜索问题或提交人", "Search feedback")}
              className="h-9 w-full border border-input bg-card pl-9 pr-3 text-sm"
              aria-label={copy("搜索团队反馈", "Search team feedback")}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 gap-2"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">
              {copy("刷新收件箱", "Refresh")}
            </span>
          </Button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3 sm:px-5">
        {FILTERS.map(option => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={filter === option.value ? "default" : "outline"}
            className="shrink-0"
            onClick={() => setFilter(option.value)}
          >
            {copy(option.chinese, option.english)}
          </Button>
        ))}
      </div>

      <div className="grid min-h-96 lg:grid-cols-[minmax(16rem,0.85fr)_minmax(0,1.15fr)]">
        <div className="border-b border-border lg:border-b-0 lg:border-r">
          {visibleItems.length ? (
            <div
              className="max-h-[38rem] divide-y divide-border overflow-y-auto"
              role="list"
            >
              {visibleItems.map(item => {
                const active = selected?.id === item.id;
                const impact = FEEDBACK_IMPACT_LABELS[item.impact];
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="listitem"
                    aria-current={active ? "true" : undefined}
                    className={`w-full px-4 py-4 text-left transition-colors sm:px-5 ${
                      active ? "bg-muted/70" : "hover:bg-muted/40"
                    }`}
                    onClick={() => choose(item.id)}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">
                          {item.title}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.reporterName} ·{" "}
                          {formatFeedbackTime(item.createdAt)}
                        </span>
                      </span>
                      <Badge
                        variant="outline"
                        className="shrink-0 text-muted-foreground"
                      >
                        {copy(impact.chinese, impact.english)}
                      </Badge>
                    </span>
                    <span className="mt-2 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                      {item.diagnosis?.summary ?? item.description}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-12 text-center" role="status">
              <Inbox
                className="mx-auto size-7 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-bold">
                {copy("当前没有符合条件的反馈", "No matching feedback")}
              </p>
            </div>
          )}
        </div>

        {selected ? (
          <div className="min-w-0 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="finance-kicker">FEEDBACK DETAIL</p>
                <h3 className="mt-2 text-base font-extrabold leading-6">
                  {selected.title}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selected.reporterName} ·{" "}
                  {formatFeedbackTime(selected.createdAt)}
                </p>
              </div>
              <FeedbackSyncBadge status={selected.syncStatus} copy={copy} />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="border border-border bg-muted/20 p-3">
                <p className="field-label">{copy("功能分类", "Area")}</p>
                <p className="mt-1 text-xs font-bold">
                  {copy(
                    FEEDBACK_CATEGORY_LABELS[selected.category].chinese,
                    FEEDBACK_CATEGORY_LABELS[selected.category].english
                  )}
                </p>
              </div>
              <div className="border border-border bg-muted/20 p-3">
                <p className="field-label">{copy("当前状态", "Status")}</p>
                <p className="mt-1 text-xs font-bold">
                  {copy(
                    FEEDBACK_TRIAGE_LABELS[selected.triageStatus].chinese,
                    FEEDBACK_TRIAGE_LABELS[selected.triageStatus].english
                  )}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4 text-sm leading-6">
              <div>
                <p className="field-label">{copy("问题描述", "Issue")}</p>
                <p className="mt-1 font-medium">{selected.description}</p>
              </div>
              {selected.expectedOutcome ? (
                <div>
                  <p className="field-label">
                    {copy("期望结果", "Expected outcome")}
                  </p>
                  <p className="mt-1 font-medium">{selected.expectedOutcome}</p>
                </div>
              ) : null}
              {selected.diagnosis ? (
                <div className="border-l-2 border-signal/35 pl-3">
                  <p className="field-label">
                    {copy("Codex 整理摘要", "Codex summary")}
                  </p>
                  <p className="mt-1 font-medium">
                    {selected.diagnosis.summary}
                  </p>
                </div>
              ) : null}
            </div>

            {selected.triageStatus === "new" ||
            selected.triageStatus === "needs_info" ? (
              <div className="mt-6 border-t border-border pt-4">
                <p className="field-label">
                  {copy("维护判断", "Maintainer decision")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => onTriage(selected.id, "accept")}
                    disabled={isTriaging || selected.status !== "ready"}
                  >
                    {copy("纳入改进", "Accept")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPendingAction("needs_info")}
                    disabled={isTriaging}
                  >
                    {copy("请提交人补充", "Request information")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPendingAction("duplicate")}
                    disabled={isTriaging}
                  >
                    {copy("标记为相似问题", "Mark as related")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setPendingAction("deferred")}
                    disabled={isTriaging}
                  >
                    {copy("暂不安排", "Defer")}
                  </Button>
                </div>

                {selected.status !== "ready" ? (
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    {copy(
                      "等待提交人的 Codex 完成整理后，即可纳入本机迭代待办。",
                      "This can be accepted after the reporter's Codex finishes the diagnosis."
                    )}
                  </p>
                ) : null}

                {pendingAction ? (
                  <div className="mt-4 border-l-2 border-signal/35 pl-3">
                    <label
                      htmlFor="feedback-triage-note"
                      className="text-xs font-bold"
                    >
                      {copy("给提交人的说明", "Note for the reporter")}
                    </label>
                    <Textarea
                      id="feedback-triage-note"
                      value={note}
                      onChange={event => setNote(event.target.value)}
                      placeholder={copy(
                        "用一句话说明还需要什么，或为什么暂不安排。",
                        "Briefly explain what is needed or why this is deferred."
                      )}
                      className="mt-2 min-h-20 resize-y bg-background text-sm leading-6"
                      maxLength={2_000}
                    />
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!note.trim() || isTriaging}
                        onClick={() =>
                          onTriage(selected.id, pendingAction, note.trim())
                        }
                      >
                        {copy("确认发送", "Confirm")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isTriaging}
                        onClick={() => {
                          setPendingAction(null);
                          setNote("");
                        }}
                      >
                        {copy("取消", "Cancel")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {selected.hasMaintenanceTask ? (
              <p className="mt-5 border-l-2 border-signal/40 pl-3 text-xs leading-5 text-muted-foreground">
                {copy(
                  "该问题已进入下方本机迭代待办，由维护者的 Codex 继续处理。",
                  "This issue is now in the local improvement queue for the maintainer's Codex."
                )}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-64 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {copy("选择一条反馈查看详情", "Select feedback to view details")}
          </div>
        )}
      </div>
    </section>
  );
}
