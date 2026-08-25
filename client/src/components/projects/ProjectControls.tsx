import { StatusBadge } from "@/components/projects/StatusBadge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  MANAGEMENT_DECISIONS,
  type ProjectDetail,
  type ManagementDecision,
} from "@shared/bp";
import { ArrowRight, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

export function ProjectControls({
  project,
  onUpdated,
}: {
  project: ProjectDetail;
  onUpdated: () => void;
}) {
  const [status, setStatus] = useState<ManagementDecision>(
    project.managementStatus
  );
  const [locked, setLocked] = useState(project.statusLocked);
  const updateStatus = trpc.projects.updateStatus.useMutation();
  const syncStateLabel = {
    local_only: "仅本地",
    pending: "等待同步",
    synced: "已同步",
    conflict: "存在冲突",
    error: "同步失败",
  }[project.syncState];

  useEffect(() => {
    setStatus(project.managementStatus);
    setLocked(project.statusLocked);
  }, [project]);

  const saveStatus = async () => {
    try {
      await updateStatus.mutateAsync({ id: project.id, status, locked });
      toast.success(locked ? "管理状态已更新并锁定" : "管理状态已更新");
      onUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
    }
  };

  return (
    <aside className="space-y-5" aria-label="项目管理控制">
      <section className="section-shell p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">项目判断</h2>
          <span className="text-[10px] font-bold text-muted-foreground">
            负责人可调整
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="mb-2 font-semibold text-muted-foreground">系统初筛</p>
            <StatusBadge status={project.aiStatus} />
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="mb-2 font-semibold text-muted-foreground">管理判断</p>
            <StatusBadge
              status={project.managementStatus}
              locked={project.statusLocked}
            />
          </div>
        </div>
        <label className="mt-4 block text-xs text-muted-foreground">
          管理判断
          <select
            value={status}
            onChange={event =>
              setStatus(event.target.value as ManagementDecision)
            }
            className="mt-1 h-10 w-full rounded-md border border-input bg-card px-3 text-sm font-semibold text-foreground"
          >
            {MANAGEMENT_DECISIONS.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 flex items-start gap-2 rounded-md border border-border p-3 text-sm">
          <input
            type="checkbox"
            checked={locked}
            onChange={event => setLocked(event.target.checked)}
            className="mt-0.5 size-4 accent-[var(--color-primary)]"
          />
          <span>
            <span className="flex items-center gap-1.5 font-medium">
              <LockKeyhole className="size-3.5" />
              人工锁定
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              锁定后重新分析只更新系统初筛，不覆盖管理判断。
            </span>
          </span>
        </label>
        <Button
          onClick={saveStatus}
          disabled={updateStatus.isPending}
          className="mt-3 w-full gap-2"
        >
          <Save className="size-4" />
          保存状态
        </Button>
      </section>

      <section className="section-shell p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4 text-signal" />
          共享边界
        </h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          默认仅本机。进入协作发布后，逐项选择共享字段、文件、账号、安全模式与到期时间。
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <dt>同步状态</dt>
            <dd className="mt-1 font-medium text-foreground">
              {syncStateLabel}
            </dd>
          </div>
          <div>
            <dt>本地 / 远端版本</dt>
            <dd className="mt-1 font-medium text-foreground">
              {project.localVersion} / {project.remoteVersion}
            </dd>
          </div>
        </dl>
        <Link href={`/collaboration/projects/${project.id}`}>
          <Button variant="outline" className="mt-4 w-full gap-2">
            配置共享与权限
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </section>
    </aside>
  );
}
