import Navbar from "@/components/Navbar";
import { AnalysisReview } from "@/components/projects/AnalysisReview";
import { CodexAnalysisHistory } from "@/components/projects/CodexAnalysisHistory";
import { CodexAnalysisPanel } from "@/components/projects/CodexAnalysisPanel";
import { CustomFieldsPanel } from "@/components/projects/CustomFieldsPanel";
import { ProjectControls } from "@/components/projects/ProjectControls";
import { ProjectFactGrid } from "@/components/projects/ProjectFactGrid";
import { ProjectMaterials } from "@/components/projects/ProjectMaterials";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { StatusHistory } from "@/components/projects/StatusHistory";
import { VersionTimeline } from "@/components/projects/VersionTimeline";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, FileWarning, Plus, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation, useParams } from "wouter";

function DetailLoading() {
  return (
    <div
      className="app-page space-y-5"
      aria-busy="true"
      aria-label="正在加载项目详情"
    >
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-12 w-2/3" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-96 lg:col-span-2" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

export default function ProjectDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const query = trpc.projects.get.useQuery({ id }, { enabled: Boolean(id) });
  const analyze = trpc.projects.analyze.useMutation();
  const archive = trpc.projects.archive.useMutation();
  const [, navigate] = useLocation();

  const updateFacts = async () => {
    try {
      const result = await analyze.mutateAsync({ id });
      toast.success(`事实层已更新：${result.aiStatus}`);
      query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法更新事实");
    }
  };

  const moveToRecycleBin = async () => {
    try {
      await archive.mutateAsync({ id });
      toast.success("项目已移入回收站，原文件与历史分析均已保留");
      navigate("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法移入回收站");
    }
  };

  if (query.isLoading)
    return (
      <div className="min-h-[100dvh] bg-background">
        <Navbar />
        <DetailLoading />
      </div>
    );
  if (query.error || !query.data) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <Navbar />
        <main className="mx-auto max-w-2xl px-4 py-20 text-center">
          <FileWarning className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">无法打开项目</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {query.error?.message ?? "项目不存在或已归档"}
          </p>
          <Link href="/">
            <Button variant="outline" className="mt-5">
              返回工作台
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  const project = query.data;
  const shareModeLabel = {
    local_only: "仅本地",
    fields_only: "共享字段",
    selected_files: "共享文件",
  }[project.shareMode];
  return (
    <div className="min-h-[100dvh] bg-background">
      <Navbar />
      <main className="app-page">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          返回工作台
        </Link>

        <header className="mt-5 grid gap-6 border-b border-foreground pb-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0 max-w-4xl">
            <p className="finance-kicker">INVESTMENT MEMO</p>
            <h1 className="page-heading mt-3">{project.name}</h1>
            <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-muted-foreground">
              {project.product || "产品与服务信息待补充"}
            </p>
            {project.description && (
              <p className="mt-3 max-w-3xl border-l-2 border-border pl-3 text-[13px] leading-6 text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/projects/new?projectId=${encodeURIComponent(project.id)}`}
            >
              <Button className="w-full gap-2">
                <Plus className="size-4" />
                导入新版本
              </Button>
            </Link>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 text-destructive">
                  <Trash2 className="size-4" aria-hidden="true" />
                  移入回收站
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>将项目移入回收站？</AlertDialogTitle>
                  <AlertDialogDescription className="leading-6">
                    项目会从工作台隐藏，但本机原文件、所有 BP
                    版本和分析历史都会保留。已同步到飞书的副本和已发布的外部分享不会被删除；如需暂停分享，请在协作发布中单独处理。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={moveToRecycleBin}
                    disabled={archive.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    确认移入回收站
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </header>

        <section
          className="section-shell mt-5 grid grid-cols-2 sm:grid-cols-4"
          aria-label="项目关键信息"
        >
          <div className="p-4 sm:p-5">
            <p className="field-label">管理判断</p>
            <div className="mt-2">
              <StatusBadge
                status={project.managementStatus}
                locked={project.statusLocked}
              />
            </div>
          </div>
          <div className="border-l border-border p-4 sm:p-5">
            <p className="field-label">轮次与行业</p>
            <p className="mt-2 truncate text-[13px] font-bold">
              {project.fundingRound || "轮次未披露"}
            </p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {project.industry || "行业待归类"}
            </p>
          </div>
          <div className="border-t border-border p-4 sm:border-l sm:border-t-0 sm:p-5">
            <p className="field-label">资料边界</p>
            <p className="mt-2 flex items-center gap-2 text-[13px] font-bold">
              <Share2 className="size-3.5 text-signal" aria-hidden="true" />
              {shareModeLabel}
            </p>
          </div>
          <div className="border-l border-t border-border p-4 sm:border-t-0 sm:p-5">
            <p className="field-label">最后更新</p>
            <p className="mono-meta mt-2 text-foreground">
              {formatDate(project.updatedAt)}
            </p>
          </div>
        </section>

        <CodexAnalysisPanel
          projectId={project.id}
          onUpdateFacts={updateFacts}
          updatingFacts={analyze.isPending}
          onAnalysisUpdated={query.refetch}
        />

        {project.codexAnalyses.length ? (
          <div className="mt-5">
            <CodexAnalysisHistory analyses={project.codexAnalyses} />
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-8">
            {project.analysis ? (
              <>
                <ProjectFactGrid facts={project.analysis.facts} />
                <AnalysisReview
                  analysis={project.analysis}
                  recommendations={project.recommendations}
                />
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <FileWarning className="mx-auto size-8 text-muted-foreground" />
                <h2 className="mt-3 font-semibold">尚无可用分析</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  原件仍保存在本地。可点击上方“更新事实”，或上传含可提取文本的新版本。
                </p>
              </div>
            )}
            <ProjectMaterials project={project} />
            <VersionTimeline project={project} />
          </div>
          <div className="space-y-5 lg:col-span-4">
            <CustomFieldsPanel
              projectId={project.id}
              fields={project.customFields}
              onUpdated={() => query.refetch()}
            />
            <ProjectControls
              project={project}
              onUpdated={() => query.refetch()}
            />
            <StatusHistory events={project.statusHistory} />
          </div>
        </div>
      </main>
    </div>
  );
}
