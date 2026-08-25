import { Badge } from "@/components/ui/badge";
import { LockKeyhole } from "lucide-react";
import { projectStatusLabel, type ProjectStatus } from "@shared/bp";

function statusStyle(status: ProjectStatus) {
  if (["信息不足", "高风险待核实", "暂不推进", "暂缓"].includes(status)) {
    return "border-destructive/40 bg-destructive/5 text-destructive";
  }
  if (
    [
      "商业信号较强",
      "安排沟通",
      "进入尽调",
      "已投资",
      "建议约谈",
      "建议尽调",
    ].includes(status)
  ) {
    return "border-foreground bg-foreground text-background";
  }
  if (["归档", "新导入", "待判断"].includes(status)) {
    return "border-border bg-muted/70 text-muted-foreground";
  }
  return "border-foreground/35 bg-card text-foreground";
}

export function StatusBadge({
  status,
  locked = false,
}: {
  status: ProjectStatus;
  locked?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className={`gap-1 rounded-md px-2.5 py-1 text-xs font-bold ${statusStyle(status)}`}
    >
      {locked && <LockKeyhole className="size-3" aria-label="人工锁定" />}
      {projectStatusLabel(status)}
    </Badge>
  );
}
