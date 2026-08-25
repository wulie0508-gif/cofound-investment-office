import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUiLanguage } from "@/contexts/UiLanguageContext";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleOff,
  Cloud,
  Database,
} from "lucide-react";
import type { InternalStorageOverview } from "./internal-storage-model";

type Copy = (chinese: string, english: string) => string;

export function buildStorageScopePresentation(
  overview: InternalStorageOverview,
  copy: Copy
) {
  const connected = overview.connectionState === "connected";
  const scope = overview.storageScope ?? "unknown";
  const connectionLabel = connected
    ? scope === "enterprise_shared"
      ? copy("企业共享 · 已连接", "Enterprise shared · Connected")
      : scope === "personal"
        ? copy("个人目录 · 已连接", "Personal folder · Connected")
        : copy("已连接 · 目录类型待确认", "Connected · Folder type unconfirmed")
    : overview.connectionState === "unavailable"
      ? copy("飞书暂不可用", "Feishu unavailable")
      : copy("等待飞书配置", "Awaiting Feishu setup");

  if (scope === "enterprise_shared")
    return {
      connectionLabel,
      boundaryDescription: copy(
        "项目判断留在本地，原文件保存在企业共享飞书目录。",
        "Project decisions stay local; original files are kept in the enterprise shared Feishu folder."
      ),
      storageTitle: copy(
        "企业共享资料库（非个人云盘）",
        "Enterprise shared library (not personal storage)"
      ),
      storageDescription: copy(
        "BP 原件与补充材料按项目保存，供团队内部查看和分发。",
        "Original BPs and supporting files are saved by project for internal access and distribution."
      ),
    };

  if (scope === "personal")
    return {
      connectionLabel,
      boundaryDescription: copy(
        "项目判断留在本地；当前连接的是个人飞书目录。",
        "Project decisions stay local; the connected Feishu folder is personal."
      ),
      storageTitle: copy("个人飞书目录", "Personal Feishu folder"),
      storageDescription: copy(
        "当前目录不是企业共享空间。归档敏感材料前，请先确认是否需要切换。",
        "This is not enterprise shared storage. Confirm whether it should be changed before archiving sensitive files."
      ),
    };

  return {
    connectionLabel,
    boundaryDescription: copy(
      "项目判断留在本地；原文件的飞书目录类型尚待确认。",
      "Project decisions stay local; the Feishu folder type for original files is not yet confirmed."
    ),
    storageTitle: copy(
      "飞书资料目录（类型待确认）",
      "Feishu library (type unconfirmed)"
    ),
    storageDescription: copy(
      "确认这是企业共享目录后，再归档需要团队分发的敏感材料。",
      "Confirm that this is enterprise shared storage before archiving sensitive files for team distribution."
    ),
  };
}

export function StorageBoundary({
  overview,
}: {
  overview: InternalStorageOverview;
}) {
  const { copy } = useUiLanguage();
  const connected = overview.connectionState === "connected";
  const presentation = buildStorageScopePresentation(overview, copy);
  const ConnectionIcon = connected ? CheckCircle2 : CircleOff;

  return (
    <section className="section-shell" aria-labelledby="storage-boundary-title">
      <div className="section-bar">
        <div>
          <h2 id="storage-boundary-title" className="section-title">
            {copy("资料保存方式", "Where files are kept")}
          </h2>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {presentation.boundaryDescription}
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            connected
              ? "border-foreground/30 bg-muted/50"
              : "border-border text-muted-foreground"
          }
        >
          <ConnectionIcon className="size-3" aria-hidden="true" />
          {presentation.connectionLabel}
        </Badge>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
              <Database className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="finance-kicker">LOCAL WORKSPACE</p>
              <h3 className="mt-1.5 text-base font-bold">
                {copy("Cofound 本地工作台", "Cofound local workspace")}
              </h3>
            </div>
          </div>
          <p className="mt-4 max-w-xl text-sm font-medium leading-6 text-muted-foreground">
            {copy(
              "项目清单、证据、管理状态与 Codex 分析都在本机查看和更新。",
              "View and update projects, evidence, management status, and Codex analysis on this computer."
            )}
          </p>
        </article>

        <article className="border-t border-border p-5 sm:p-6 lg:border-l lg:border-t-0">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
              <Cloud className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="finance-kicker">INTERNAL DISTRIBUTION</p>
              <h3 className="mt-1.5 truncate text-base font-bold">
                {presentation.storageTitle}
              </h3>
              {overview.driveRootName ? (
                <p className="mt-1 truncate text-xs font-medium text-muted-foreground">
                  {overview.driveRootName}
                </p>
              ) : null}
            </div>
          </div>
          <p className="mt-4 max-w-xl text-sm font-medium leading-6 text-muted-foreground">
            {presentation.storageDescription}
          </p>
          {overview.driveRootUrl ? (
            <Button asChild variant="outline" size="sm" className="mt-4">
              <a href={overview.driveRootUrl} target="_blank" rel="noreferrer">
                {copy("打开飞书目录", "Open Feishu folder")}
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </a>
            </Button>
          ) : null}
        </article>
      </div>
    </section>
  );
}
