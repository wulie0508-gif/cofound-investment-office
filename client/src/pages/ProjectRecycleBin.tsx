import Navbar from "@/components/Navbar";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiLanguage } from "@/contexts/UiLanguageContext";
import { formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

export default function ProjectRecycleBin() {
  const { copy } = useUiLanguage();
  const query = trpc.projects.recycleBin.useQuery();
  const restore = trpc.projects.restore.useMutation();

  const restoreProject = async (id: string) => {
    try {
      await restore.mutateAsync({ id });
      toast.success(copy("项目已恢复到工作台", "Project restored"));
      await query.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : copy("恢复失败", "Restore failed")
      );
    }
  };

  const items = query.data ?? [];
  return (
    <div className="min-h-[100dvh] bg-background">
      <Navbar />
      <main className="app-page">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {copy("返回项目工作台", "Back to projects")}
        </Link>

        <header className="mt-5 border-b border-foreground pb-7">
          <p className="finance-kicker">LOCAL RECYCLE BIN</p>
          <h1 className="page-heading mt-3">
            {copy("项目回收站", "Project recycle bin")}
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-muted-foreground">
            {copy(
              "这里只隐藏本机项目，不会删除原文件、历史分析、飞书副本或外部分享。重新导入同一份 BP，也会自动恢复对应项目。",
              "Projects are hidden locally only. Source files, analysis history, Feishu copies, and existing external shares remain. Re-importing the same BP restores the project."
            )}
          </p>
        </header>

        <section className="section-shell mt-5" aria-label="已移除项目">
          <div className="section-bar">
            <div className="flex items-center gap-3">
              <Trash2
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="section-title">
                {copy("已移除项目", "Removed projects")}
              </h2>
              <span className="text-xs font-semibold text-muted-foreground">
                {query.isLoading
                  ? copy("正在读取", "Loading")
                  : copy(`${items.length} 个项目`, `${items.length} projects`)}
              </span>
            </div>
          </div>

          {query.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
              ))}
            </div>
          ) : query.error ? (
            <p
              className="p-6 text-sm font-medium text-destructive"
              role="alert"
            >
              {query.error.message}
            </p>
          ) : items.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <p className="font-bold">
                {copy("回收站是空的", "The recycle bin is empty")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {copy(
                  "工作台中的项目都处于正常可用状态。",
                  "All projects in the workspace are active."
                )}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map(project => (
                <article
                  key={project.id}
                  className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-bold">{project.name}</h3>
                      <StatusBadge status={project.managementStatus} />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {project.industry ||
                        copy("行业待归类", "Industry pending")}{" "}
                      ·{" "}
                      {project.fundingRound ||
                        copy("轮次未披露", "Round undisclosed")}
                    </p>
                    <p className="mono-meta mt-1">
                      {copy("移入时间：", "Removed: ")}
                      {project.archivedAt
                        ? formatDate(project.archivedAt)
                        : copy("未记录", "Not recorded")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={restore.isPending}
                    onClick={() => restoreProject(project.id)}
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                    {copy("恢复到工作台", "Restore")}
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
