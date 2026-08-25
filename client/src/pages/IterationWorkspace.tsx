import Navbar from "@/components/Navbar";
import { MaintainerFeedbackInbox } from "@/components/feedback/MaintainerFeedbackInbox";
import type { FeedbackTriageAction } from "@/components/feedback/feedback-model";
import { CurrentIteration } from "@/components/iteration/CurrentIteration";
import { IterationComposer } from "@/components/iteration/IterationComposer";
import { IterationHistory } from "@/components/iteration/IterationHistory";
import { IterationVersionBar } from "@/components/iteration/IterationVersionBar";
import {
  ACTIVE_ITERATION_STATUSES,
  type IterationCategory,
  type IterationDecision,
  type IterationQualityMode,
} from "@/components/iteration/iteration-model";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiLanguage } from "@/contexts/UiLanguageContext";
import { useCollaborationSession } from "@/hooks/useCollaborationSession";
import { trpc } from "@/lib/trpc";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function IterationWorkspace() {
  const { copy } = useUiLanguage();
  const session = useCollaborationSession();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<IterationCategory>("interface");
  const [qualityMode, setQualityMode] =
    useState<IterationQualityMode>("standard");
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(
    null
  );
  const capabilities = trpc.productFeedback.capabilities.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });
  const feedbackInbox = trpc.productFeedback.list.useQuery(
    { source: "remote", limit: 100 },
    {
      enabled: capabilities.data?.maintainerMode === true,
      refetchInterval: 8_000,
      refetchOnWindowFocus: false,
      retry: false,
    }
  );
  const overview = trpc.iterations.overview.useQuery(undefined, {
    refetchInterval: 4_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const create = trpc.iterations.create.useMutation();
  const decide = trpc.iterations.decide.useMutation();
  const requeueExpired = trpc.iterations.requeueExpired.useMutation();
  const openCodex = trpc.iterations.openCodex.useMutation();
  const triageFeedback = trpc.productFeedback.triage.useMutation();
  const syncFeedback = trpc.productFeedback.sync.useMutation();
  const refreshInbox =
    trpc.productFeedback.refreshMaintainerInbox.useMutation();
  const [hasRefreshedInbox, setHasRefreshedInbox] = useState(false);

  const items = overview.data?.items ?? [];
  const current =
    items.find(item => ACTIVE_ITERATION_STATUSES.has(item.status)) ?? null;
  const history = items.filter(item => item.id !== current?.id);
  const requestedBy = session.user?.name.trim() || "本机使用者";

  useEffect(() => {
    if (hasRefreshedInbox || capabilities.data?.maintainerMode !== true) return;
    setHasRefreshedInbox(true);
    void refreshInbox
      .mutateAsync()
      .then(() => feedbackInbox.refetch())
      .catch(() => undefined);
  }, [
    capabilities.data?.maintainerMode,
    feedbackInbox,
    hasRefreshedInbox,
    refreshInbox,
  ]);

  const submit = async () => {
    try {
      await create.mutateAsync({
        description: description.trim(),
        category,
        qualityMode,
        requestedBy,
      });
      setDescription("");
      setQualityMode("standard");
      await overview.refetch();
      toast.success(copy("迭代待办已记录", "Improvement saved"));
    } catch {
      toast.error(
        copy(
          "暂时无法记录，请确认本地工作台已经启动。",
          "Could not save this request. Make sure the local workspace is running."
        )
      );
    }
  };

  const handleDecision = async (
    id: string,
    action: IterationDecision,
    note?: string
  ) => {
    try {
      await decide.mutateAsync({ id, action, decidedBy: requestedBy, note });
      await overview.refetch();
      toast.success(
        action === "accept"
          ? copy("已确认采用", "Accepted")
          : action === "revise"
            ? copy("已请 Codex 继续调整", "Revision requested")
            : copy("本轮已暂停", "Improvement paused")
      );
    } catch {
      toast.error(
        copy("暂时无法保存决定，请稍后重试。", "Could not save your decision.")
      );
    }
  };

  const handleOpenCodex = async () => {
    try {
      await openCodex.mutateAsync();
      toast.success(
        copy(
          "Codex 已打开，请说“处理 Cofound 迭代待办”。",
          "Codex is open. Ask it to handle Cofound improvements."
        )
      );
    } catch {
      toast.error(
        copy(
          "暂时无法从网页打开，请使用桌面上的 Codex 图标。",
          "Could not open Codex here. Use the desktop Codex icon instead."
        )
      );
    }
  };

  const handleRequeue = async (id: string) => {
    try {
      await requeueExpired.mutateAsync({ id, requestedBy });
      await overview.refetch();
      toast.success(
        copy("已重新加入 Codex 待办", "Returned to the Codex task list")
      );
    } catch {
      toast.error(
        copy(
          "暂时无法恢复，任务可能已经重新开始，请刷新后查看。",
          "Could not restore this task. It may have restarted already; refresh to check."
        )
      );
    }
  };

  const handleTriage = async (
    id: string,
    action: FeedbackTriageAction,
    note?: string
  ) => {
    try {
      await triageFeedback.mutateAsync({ id, action, note });
    } catch {
      toast.error(
        copy(
          "暂时无法保存维护判断，请刷新后重试。",
          "Could not save this decision. Refresh and try again."
        )
      );
      return;
    }

    try {
      const result = await syncFeedback.mutateAsync({ id });
      if (result.status === "succeeded")
        toast.success(
          action === "accept"
            ? copy("已纳入本机迭代待办", "Added to the local improvement queue")
            : action === "needs_info"
              ? copy("已请提交人补充", "Requested more information")
              : action === "duplicate"
                ? copy("已标记为相似问题", "Marked as related")
                : copy("已暂缓处理", "Deferred")
        );
      else
        toast.message(
          result.status === "not_configured"
            ? copy(
                "维护判断已保存在本机，等待飞书连接后同步。",
                "The decision is saved locally and will sync when Feishu is available."
              )
            : copy(
                "维护判断已保存在本机，本次同步尚未完成，可以稍后重试。",
                "The decision is saved locally. Sync is incomplete and can be retried later."
              )
        );
    } catch {
      toast.message(
        copy(
          "维护判断已保存在本机，等待飞书连接后同步。",
          "The decision is saved locally and will sync when Feishu is available."
        )
      );
    } finally {
      await Promise.all([feedbackInbox.refetch(), overview.refetch()]);
    }
  };

  const handleRefreshInbox = async () => {
    try {
      const result = await refreshInbox.mutateAsync();
      await feedbackInbox.refetch();
      if (result.status === "succeeded")
        toast.success(copy("收件箱已刷新", "Inbox refreshed"));
      else
        toast.message(
          result.status === "not_configured"
            ? copy(
                "当前显示本机记录，等待飞书连接后可刷新团队收件箱。",
                "Local records are shown. The team inbox can refresh when Feishu is available."
              )
            : copy(
                "本机记录保持不变，本次刷新尚未完成，可以稍后再试。",
                "Local records are unchanged. Refresh is incomplete and can be retried later."
              )
        );
    } catch {
      toast.message(
        copy(
          "当前仍显示本机记录，连接恢复后可再次刷新。",
          "Local records remain visible. Try again when the connection is available."
        )
      );
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <Navbar />
      <main className="app-page pb-14">
        <header className="max-w-5xl border-b border-foreground pb-7">
          <p className="finance-kicker">PRODUCT IMPROVEMENT</p>
          <h1 className="page-heading mt-3">
            {copy("维护者迭代台", "Maintainer workspace")}
          </h1>
          <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-muted-foreground">
            {copy(
              "集中查看团队已确认上报的问题，逐条判断后交给本机 Codex 处理和验证。",
              "Review confirmed team feedback, decide what to take forward, and let the local Codex handle each accepted improvement."
            )}
          </p>
        </header>

        <div className="mt-5">
          {capabilities.isLoading ? (
            <Skeleton
              className="h-56"
              aria-label={copy("正在确认维护权限", "Checking access")}
            />
          ) : capabilities.error || !capabilities.data?.maintainerMode ? (
            <section className="section-shell p-6 text-center" role="alert">
              <h2 className="text-sm font-bold">
                {copy("此页面仅在产品维护端提供", "Maintainer access only")}
              </h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {copy(
                  "你仍然可以通过“问题反馈”上报使用中的问题。",
                  "You can still report issues from the Feedback page."
                )}
              </p>
              <Button asChild variant="outline" className="mt-5">
                <a href="/feedback">{copy("前往问题反馈", "Go to feedback")}</a>
              </Button>
            </section>
          ) : overview.isLoading ? (
            <div className="space-y-5" aria-busy="true">
              <Skeleton className="h-20" />
              <div className="grid gap-5 lg:grid-cols-2">
                <Skeleton className="h-96" />
                <Skeleton className="h-96" />
              </div>
            </div>
          ) : overview.error || !overview.data ? (
            <section className="section-shell p-6 text-center" role="alert">
              <h2 className="text-sm font-bold">
                {copy("迭代工作台暂未连接", "Workspace unavailable")}
              </h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {copy(
                  "请双击桌面上的 Co-founder Investment Office 后重试。",
                  "Open Co-founder Investment Office from the desktop and try again."
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-5 gap-2"
                onClick={() => void overview.refetch()}
                disabled={overview.isFetching}
              >
                <RefreshCw
                  className={`size-4 ${overview.isFetching ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                {copy("重新连接", "Try again")}
              </Button>
            </section>
          ) : (
            <>
              {feedbackInbox.isLoading ? (
                <Skeleton className="mb-5 h-[32rem]" />
              ) : feedbackInbox.error ? (
                <section
                  className="section-shell mb-5 p-6 text-center"
                  role="alert"
                >
                  <h2 className="text-sm font-bold">
                    {copy("团队反馈暂未连接", "Team feedback is unavailable")}
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {copy(
                      "本机迭代仍可继续；稍后刷新即可重新读取团队反馈。",
                      "Local improvements remain available. Refresh later to reconnect team feedback."
                    )}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 gap-2"
                    onClick={() => void feedbackInbox.refetch()}
                    disabled={feedbackInbox.isFetching}
                  >
                    <RefreshCw
                      className={`size-4 ${feedbackInbox.isFetching ? "animate-spin" : ""}`}
                      aria-hidden="true"
                    />
                    {copy("重新连接", "Try again")}
                  </Button>
                </section>
              ) : (
                <div className="mb-5">
                  <MaintainerFeedbackInbox
                    items={feedbackInbox.data ?? []}
                    selectedId={selectedFeedbackId}
                    isTriaging={triageFeedback.isPending}
                    isRefreshing={
                      refreshInbox.isPending || feedbackInbox.isFetching
                    }
                    copy={copy}
                    onSelect={setSelectedFeedbackId}
                    onTriage={(id, action, note) =>
                      void handleTriage(id, action, note)
                    }
                    onRefresh={() => void handleRefreshInbox()}
                  />
                </div>
              )}
              <IterationVersionBar
                version={overview.data.version}
                copy={copy}
              />
              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <IterationComposer
                  description={description}
                  category={category}
                  qualityMode={qualityMode}
                  isSubmitting={create.isPending}
                  copy={copy}
                  onDescriptionChange={setDescription}
                  onCategoryChange={setCategory}
                  onQualityModeChange={setQualityMode}
                  onSubmit={() => void submit()}
                />
                <CurrentIteration
                  item={current}
                  codexLaunchAvailable={
                    overview.data.version.codexLaunchAvailable
                  }
                  isOpeningCodex={openCodex.isPending}
                  isDeciding={decide.isPending}
                  isRequeueing={requeueExpired.isPending}
                  copy={copy}
                  onOpenCodex={() => void handleOpenCodex()}
                  onRequeue={id => void handleRequeue(id)}
                  onDecide={(id, action, note) =>
                    void handleDecision(id, action, note)
                  }
                />
              </div>
              <IterationHistory items={history} copy={copy} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
