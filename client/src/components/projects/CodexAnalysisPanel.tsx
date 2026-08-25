import type { CodexAnalysisTaskMode } from "@shared/bp";
import { Button } from "@/components/ui/button";
import { useCollaborationSession } from "@/hooks/useCollaborationSession";
import { trpc } from "@/lib/trpc";
import {
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CodexAnalysisBrief } from "./CodexAnalysisBrief";
import { CodexAnalysisTaskProgress } from "./CodexAnalysisTaskProgress";
import {
  analysisTaskIsLive,
  analysisTaskNeedsRestart,
} from "./codex-analysis-options";

export function CodexAnalysisPanel({
  projectId,
  onUpdateFacts,
  updatingFacts,
  onAnalysisUpdated,
}: {
  projectId: string;
  onUpdateFacts: () => void;
  updatingFacts: boolean;
  onAnalysisUpdated: () => void;
}) {
  const session = useCollaborationSession();
  const [mode, setMode] = useState<CodexAnalysisTaskMode>("auto");
  const [objective, setObjective] = useState("");
  const [showStructuredAnalysis, setShowStructuredAnalysis] = useState(false);
  const lastCompletedId = useRef<string | null>(null);
  const tasks = trpc.codexAnalysisTasks.list.useQuery(
    { projectId, limit: 8 },
    {
      refetchInterval: query => {
        const rows = query.state.data ?? [];
        return rows.some(task => analysisTaskIsLive(task)) ? 2_500 : false;
      },
    }
  );
  const create = trpc.codexAnalysisTasks.create.useMutation();
  const openWorkspace = trpc.codexWorkspace.openProject.useMutation();
  const rows = tasks.data ?? [];
  const latest = rows[0] ?? null;
  const liveTask = rows.find(task => analysisTaskIsLive(task)) ?? null;
  const displayedTask = liveTask ?? latest;
  const taskIsLive = liveTask !== null;
  const taskNeedsRestart = !taskIsLive && analysisTaskNeedsRestart(latest);
  const displayedMode =
    liveTask?.mode ?? (taskNeedsRestart ? latest?.mode : mode) ?? mode;
  const structuredAnalysisVisible = showStructuredAnalysis || taskIsLive;

  useEffect(() => {
    if (latest?.status !== "completed" || lastCompletedId.current === latest.id)
      return;
    lastCompletedId.current = latest.id;
    onAnalysisUpdated();
  }, [latest?.id, latest?.status, onAnalysisUpdated]);

  const openProjectInCodex = async () => {
    try {
      const result = await openWorkspace.mutateAsync({
        projectId,
        requestedBy: session.user?.name.trim() || "本机使用者",
      });
      if (result.launched) {
        toast.success("已在 Codex 中打开项目，可以直接开始对话");
      } else if (result.threadId) {
        toast.warning("项目对话已创建，请从 Codex 任务列表打开");
      } else {
        toast.error(result.error || "暂时无法打开 Codex 项目对话");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法打开 Codex");
    }
  };

  const startAnalysis = async () => {
    try {
      const request = {
        projectId,
        mode: taskNeedsRestart && latest ? latest.mode : mode,
        requestedBy: session.user?.name.trim() || "本机使用者",
        userPrompt: objective.trim() || undefined,
      };
      const result = await create.mutateAsync(request);
      await tasks.refetch();
      if (result.launch.error) {
        toast.warning(
          result.launch.launched
            ? "分析已启动，但 Codex 窗口未自动打开；可点击“在 Codex 中继续”"
            : "任务已保存；请打开 Codex 处理 Cofound 分析待办"
        );
      } else if (
        result.launch.mode === "app_server" &&
        result.launch.launched
      ) {
        toast.success(
          result.reused ? "已打开现有分析任务" : "Codex 分析已启动"
        );
      } else if (result.launch.launched) {
        toast.success("分析任务已创建，Codex 已打开");
      } else {
        toast.warning("任务已保存；请打开 Codex 处理 Cofound 分析待办");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法创建分析任务");
    }
  };

  return (
    <section
      className="section-shell mt-5"
      aria-labelledby="codex-analysis-title"
    >
      <div className="section-bar items-start">
        <div>
          <p className="finance-kicker">CODEX INVESTMENT ANALYSIS</p>
          <h2 id="codex-analysis-title" className="section-title mt-1">
            用 Codex 分析
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            先进入绑定当前项目的自由对话；需要留档时，再生成可复核的结构化结论。
          </p>
        </div>
        <BrainCircuit
          className="mt-0.5 size-5 shrink-0 text-signal"
          aria-hidden="true"
        />
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <h3 className="text-sm font-bold">开放项目工作区</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Codex 会带上当前项目 ID、事实和资料入口。进入后可以自由提问、检索
              BP、讨论你的判断、查找问题或调用已安装的 Skill。
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="w-full gap-2 lg:w-auto"
            disabled={openWorkspace.isPending}
            onClick={openProjectInCodex}
          >
            {openWorkspace.isPending ? (
              <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ExternalLink className="size-4" aria-hidden="true" />
            )}
            {openWorkspace.isPending ? "正在打开…" : "在 Codex 中打开项目"}
          </Button>
        </div>
      </div>

      <div className="border-t border-border">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30 sm:px-5"
          aria-expanded={structuredAnalysisVisible}
          aria-controls="codex-structured-analysis"
          onClick={() => setShowStructuredAnalysis(current => !current)}
        >
          <span>
            <span className="block text-sm font-bold">
              生成并保存结构化分析
            </span>
            <span className="mt-0.5 block text-[11px] leading-5 text-muted-foreground">
              可选：将一次分析固定到当前事实版本，写回看板供后续复核。
            </span>
          </span>
          {structuredAnalysisVisible ? (
            <ChevronUp className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          )}
        </button>
      </div>

      {structuredAnalysisVisible ? (
        <div
          id="codex-structured-analysis"
          className="grid border-t border-border lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]"
        >
          <div className="p-4 sm:p-5 lg:border-r lg:border-border">
            <CodexAnalysisBrief
              mode={displayedMode}
              objective={objective}
              disabled={taskIsLive || taskNeedsRestart}
              onModeChange={setMode}
              onObjectiveChange={setObjective}
            />

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {taskIsLive ? (
                <Button type="button" className="flex-1 gap-2" disabled>
                  <BrainCircuit className="size-4" aria-hidden="true" />
                  Codex 正在后台分析
                </Button>
              ) : (
                <Button
                  type="button"
                  className="flex-1 gap-2"
                  disabled={create.isPending}
                  onClick={startAnalysis}
                >
                  <BrainCircuit className="size-4" aria-hidden="true" />
                  {create.isPending
                    ? "正在启动…"
                    : taskNeedsRestart
                      ? "重新启动分析"
                      : "生成并保存分析"}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={updatingFacts || taskIsLive}
                onClick={onUpdateFacts}
              >
                <RefreshCw
                  className={`size-4 ${updatingFacts ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                更新事实
              </Button>
            </div>
            <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
              <ShieldCheck
                className="mt-0.5 size-3.5 shrink-0 text-signal"
                aria-hidden="true"
              />
              Codex 读取当前项目证据并回写判断，不会覆盖负责人的管理状态。
            </p>
          </div>

          <div className="border-t border-border bg-muted/20 lg:border-t-0">
            {tasks.isLoading ? (
              <div
                className="min-h-40 animate-pulse p-5"
                aria-busy="true"
                aria-label="正在加载分析任务"
              >
                <div className="h-3 w-28 bg-muted" />
                <div className="mt-4 h-5 w-40 bg-muted" />
                <div className="mt-6 h-1 w-full bg-muted" />
              </div>
            ) : tasks.error ? (
              <div className="min-h-40 p-5" role="alert">
                <h3 className="text-sm font-bold text-destructive">
                  无法读取分析进度
                </h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {tasks.error.message}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => tasks.refetch()}
                >
                  重试
                </Button>
              </div>
            ) : (
              <CodexAnalysisTaskProgress task={displayedTask} />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
