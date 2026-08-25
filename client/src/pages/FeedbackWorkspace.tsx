import Navbar from "@/components/Navbar";
import { FeedbackComposer } from "@/components/feedback/FeedbackComposer";
import { FeedbackDiagnosisCard } from "@/components/feedback/FeedbackDiagnosisCard";
import type {
  FeedbackCategory,
  FeedbackImpact,
} from "@/components/feedback/feedback-model";
import { MyFeedbackList } from "@/components/feedback/MyFeedbackList";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiLanguage } from "@/contexts/UiLanguageContext";
import { trpc } from "@/lib/trpc";
import { MessageSquareText, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function FeedbackWorkspace() {
  const { copy } = useUiLanguage();
  const [description, setDescription] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("interface");
  const [impact, setImpact] = useState<FeedbackImpact>("inconvenient");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const feedback = trpc.productFeedback.list.useQuery(
    { source: "local", limit: 50 },
    { refetchInterval: 5_000, refetchOnWindowFocus: false, retry: false }
  );
  const iterationOverview = trpc.iterations.overview.useQuery(undefined, {
    staleTime: 30_000,
    retry: false,
  });
  const create = trpc.productFeedback.create.useMutation();
  const sync = trpc.productFeedback.sync.useMutation();
  const refreshStatus = trpc.productFeedback.refreshStatus.useMutation();
  const openCodex = trpc.iterations.openCodex.useMutation();
  const [hasRefreshedStatus, setHasRefreshedStatus] = useState(false);

  const items = feedback.data ?? [];
  const selected =
    items.find(item => item.id === selectedId) ?? items[0] ?? null;

  useEffect(() => {
    if (!selectedId && items[0]) setSelectedId(items[0].id);
  }, [items, selectedId]);

  useEffect(() => {
    if (hasRefreshedStatus) return;
    setHasRefreshedStatus(true);
    void refreshStatus
      .mutateAsync()
      .then(() => feedback.refetch())
      .catch(() => undefined);
  }, [feedback, hasRefreshedStatus, refreshStatus]);

  const submit = async () => {
    let item;
    try {
      item = await create.mutateAsync({
        description: description.trim(),
        ...(expectedOutcome.trim()
          ? { expectedOutcome: expectedOutcome.trim() }
          : {}),
        category,
        impact,
      });
      setDescription("");
      setExpectedOutcome("");
      setCategory("interface");
      setImpact("inconvenient");
      setSelectedId(item.id);
    } catch {
      toast.error(
        copy(
          "暂时无法保存，请确认本地工作台已经启动。",
          "Could not save this feedback. Make sure the local workspace is running."
        )
      );
      return;
    }

    try {
      const result = await sync.mutateAsync({ id: item.id });
      if (result.status === "succeeded")
        toast.success(
          copy(
            "问题已上报，后续进度会显示在这里。",
            "Feedback was reported. Future progress will appear here."
          )
        );
      else
        toast.message(
          result.status === "not_configured"
            ? copy(
                "问题已保存在本机，等待飞书连接后同步。",
                "Feedback is saved locally and will sync when Feishu is available."
              )
            : copy(
                "问题已保存在本机，本次同步尚未完成，可以稍后重试。",
                "Feedback is saved locally. Sync is not complete and can be retried later."
              )
        );
    } catch {
      toast.message(
        copy(
          "问题已保存在本机，等待飞书连接后自动同步。",
          "Feedback is saved locally and will sync when Feishu is available."
        )
      );
    } finally {
      await feedback.refetch();
    }
  };

  const refreshFeedbackStatus = async () => {
    try {
      const result = await refreshStatus.mutateAsync();
      await feedback.refetch();
      if (result.status === "succeeded")
        toast.success(copy("进度已刷新", "Progress refreshed"));
      else
        toast.message(
          result.status === "not_configured"
            ? copy(
                "当前显示本机记录，等待飞书连接后可刷新团队进度。",
                "Local records are shown. Team progress can refresh when Feishu is available."
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

  const retrySync = async (id: string) => {
    try {
      const result = await sync.mutateAsync({ id });
      await feedback.refetch();
      if (result.status === "succeeded")
        toast.success(copy("反馈已重新同步", "Feedback synced"));
      else
        toast.message(
          result.status === "not_configured"
            ? copy(
                "反馈已保存在本机，等待飞书连接后可以再次同步。",
                "Feedback is saved locally and can sync when Feishu is available."
              )
            : copy(
                "反馈仍保存在本机，本次同步尚未完成，可以稍后重试。",
                "Feedback remains saved locally. Sync is incomplete and can be retried later."
              )
        );
    } catch {
      toast.message(
        copy(
          "反馈已保存在本机，等待飞书连接后可以再次同步。",
          "Feedback is saved locally and can sync when Feishu is available."
        )
      );
    }
  };

  const handleOpenCodex = async () => {
    try {
      await openCodex.mutateAsync();
      toast.success(
        copy(
          "Codex 已打开，请说“整理 Cofound 问题反馈”。",
          "Codex is open. Ask it to review Cofound feedback."
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

  return (
    <div className="min-h-[100dvh] bg-background">
      <Navbar />
      <main className="app-page pb-14">
        <header className="max-w-5xl border-b border-foreground pb-7">
          <p className="finance-kicker">TEAM FEEDBACK</p>
          <h1 className="page-heading mt-3">{copy("问题反馈", "Feedback")}</h1>
          <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-muted-foreground">
            {copy(
              "描述使用中遇到的问题，自己的 Codex 会先在本机整理；已确认的内容将同步给企业内部维护者。",
              "Describe an issue and let your own Codex review it locally. Confirmed content is shared with the internal maintainer."
            )}
          </p>
        </header>

        {feedback.isLoading ? (
          <div className="mt-5 space-y-5" aria-busy="true">
            <div className="grid gap-5 lg:grid-cols-2">
              <Skeleton className="h-[42rem]" />
              <Skeleton className="h-[32rem]" />
            </div>
            <Skeleton className="h-80" />
          </div>
        ) : feedback.error ? (
          <section className="section-shell mt-5 p-6 text-center" role="alert">
            <h2 className="text-sm font-bold">
              {copy("问题反馈暂未连接", "Feedback is unavailable")}
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
              onClick={() => void feedback.refetch()}
              disabled={feedback.isFetching}
            >
              <RefreshCw
                className={`size-4 ${feedback.isFetching ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {copy("重新连接", "Try again")}
            </Button>
          </section>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <FeedbackComposer
                description={description}
                expectedOutcome={expectedOutcome}
                category={category}
                impact={impact}
                isSubmitting={create.isPending}
                copy={copy}
                onDescriptionChange={setDescription}
                onExpectedOutcomeChange={setExpectedOutcome}
                onCategoryChange={setCategory}
                onImpactChange={setImpact}
                onSubmit={() => void submit()}
              />
              {selected ? (
                <FeedbackDiagnosisCard
                  item={selected}
                  codexLaunchAvailable={
                    iterationOverview.data?.version.codexLaunchAvailable ??
                    false
                  }
                  isOpeningCodex={openCodex.isPending}
                  isRetrying={sync.isPending}
                  copy={copy}
                  onOpenCodex={() => void handleOpenCodex()}
                  onRetrySync={() => void retrySync(selected.id)}
                />
              ) : (
                <section
                  className="section-shell"
                  aria-labelledby="feedback-empty-title"
                >
                  <div className="p-8 text-center sm:p-12" role="status">
                    <MessageSquareText
                      className="mx-auto size-7 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <h2
                      id="feedback-empty-title"
                      className="mt-4 text-sm font-bold"
                    >
                      {copy("还没有正在查看的反馈", "No feedback selected")}
                    </h2>
                    <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted-foreground">
                      {copy(
                        "完成左侧表单后，可以在这里查看同步状态和 Codex 整理结果。",
                        "Submit the form to view sync status and the Codex diagnosis here."
                      )}
                    </p>
                  </div>
                </section>
              )}
            </div>

            <MyFeedbackList
              items={items}
              selectedId={selected?.id ?? null}
              isRefreshing={refreshStatus.isPending || feedback.isFetching}
              copy={copy}
              onSelect={setSelectedId}
              onRefresh={() => void refreshFeedbackStatus()}
            />
          </div>
        )}
      </main>
    </div>
  );
}
