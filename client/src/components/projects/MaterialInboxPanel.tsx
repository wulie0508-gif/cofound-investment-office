import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { MATERIAL_CATEGORY_LABELS } from "@shared/bp";
import { FileStack, Inbox, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function MaterialRow({
  material,
  projects,
  onAssigned,
}: {
  material: {
    id: string;
    originalName: string;
    category: keyof typeof MATERIAL_CATEGORY_LABELS;
    suggestedProjectId: string | null;
  };
  projects: Array<{ id: string; name: string }>;
  onAssigned: () => void;
}) {
  const [projectId, setProjectId] = useState(material.suggestedProjectId ?? "");
  const assign = trpc.materials.assign.useMutation();
  const submit = async () => {
    if (!projectId) return toast.error("请先选择归属项目");
    try {
      await assign.mutateAsync({ materialId: material.id, projectId });
      toast.success("资料已归入项目");
      onAssigned();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "归档失败");
    }
  };
  return (
    <li className="grid gap-3 border-t border-border px-5 py-4 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-center sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {material.originalName}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {MATERIAL_CATEGORY_LABELS[material.category]}
        </p>
      </div>
      <select
        value={projectId}
        onChange={event => setProjectId(event.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        aria-label={`选择 ${material.originalName} 的归属项目`}
      >
        <option value="">选择归属项目</option>
        {projects.map(project => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={submit}
        disabled={assign.isPending || !projectId}
      >
        {assign.isPending && <Loader2 className="size-4 animate-spin" />}
        归入项目
      </Button>
    </li>
  );
}

export function MaterialInboxPanel() {
  const query = trpc.materials.inbox.useQuery(undefined, {
    refetchInterval: 5_000,
  });
  const items = query.data?.items ?? [];
  return (
    <section
      className="section-shell mt-6"
      aria-labelledby="material-inbox-title"
    >
      <div className="flex items-start justify-between gap-4 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <Inbox className="mt-0.5 size-5 text-signal" aria-hidden="true" />
          <div>
            <h2 id="material-inbox-title" className="font-semibold">
              待归档资料
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              系统不能可靠判断归属的资料先留在这里，由负责人选择项目；不会自动创建错误项目。
            </p>
          </div>
        </div>
        <span className="finance-number rounded-md border border-border bg-muted/45 px-2.5 py-1 text-xs font-bold">
          {query.isLoading ? "…" : items.length}
        </span>
      </div>
      {query.error ? (
        <p className="border-t border-border px-5 py-5 text-sm text-destructive">
          {query.error.message}
        </p>
      ) : items.length ? (
        <ul className="border-t border-border">
          {items.map(material => (
            <MaterialRow
              key={material.id}
              material={material}
              projects={query.data?.projects ?? []}
              onAssigned={() => query.refetch()}
            />
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-3 border-t border-border px-5 py-5 text-sm text-muted-foreground sm:px-6">
          <FileStack className="size-4" aria-hidden="true" />
          暂无待归档资料；已识别归属的附件会直接进入对应项目。
        </div>
      )}
    </section>
  );
}
