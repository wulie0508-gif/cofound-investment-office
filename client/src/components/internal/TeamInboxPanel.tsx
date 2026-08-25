import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUiLanguage } from "@/contexts/UiLanguageContext";
import { trpc } from "@/lib/trpc";
import { CloudDownload, Inbox, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const actionLabel = {
  download_and_import: ["准备导入", "Ready to import"],
  restore_after_verification: ["校验后恢复", "Verify and restore"],
  skip_already_imported: ["已经同步", "Already synced"],
  unsupported: ["暂不支持", "Unsupported"],
} as const;

export function TeamInboxPanel({
  connected,
  onCompleted,
}: {
  connected: boolean;
  onCompleted?: () => void;
}) {
  const { copy } = useUiLanguage();
  const plan = trpc.internalStorage.planInbox.useMutation();
  const pull = trpc.internalStorage.pullInbox.useMutation();

  const inspect = async () => {
    try {
      await plan.mutateAsync();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "无法读取团队收件箱"
      );
    }
  };

  const importFiles = async () => {
    try {
      const result = await pull.mutateAsync();
      toast.success(
        copy(
          `团队资料处理完成：导入 ${result.imported}，恢复 ${result.restored}，跳过 ${result.skipped}`,
          `Team files processed: ${result.imported} imported, ${result.restored} restored, ${result.skipped} skipped`
        )
      );
      await plan.mutateAsync();
      onCompleted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "团队资料导入失败");
    }
  };

  const items = plan.data?.items ?? [];
  const actionable = items.some(item =>
    ["download_and_import", "restore_after_verification"].includes(item.action)
  );

  return (
    <section className="section-shell mt-5" aria-labelledby="team-inbox-title">
      <div className="section-bar">
        <div>
          <h2 id="team-inbox-title" className="section-title">
            {copy("团队收件箱", "Team inbox")}
          </h2>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {copy(
              "同事把新 BP 放入企业共享收件箱后，可在这里下载、去重并加入本地工作台。飞书原件不会被移动或删除。",
              "Download, deduplicate, and import BPs placed by teammates in the enterprise shared inbox. Remote originals are never moved or deleted."
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={!connected || plan.isPending || pull.isPending}
          onClick={inspect}
        >
          <RefreshCw
            className={`size-3.5 ${plan.isPending ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {copy("检查新资料", "Check inbox")}
        </Button>
      </div>

      {!connected ? (
        <p className="px-5 py-6 text-sm font-medium text-muted-foreground">
          {copy(
            "飞书企业共享目录连接成功后，团队收件箱会在这里可用。",
            "The team inbox becomes available after the enterprise shared folder is connected."
          )}
        </p>
      ) : plan.data ? (
        <>
          {items.length ? (
            <div className="divide-y divide-border">
              {items.map((item, index) => {
                const [zh, en] = actionLabel[item.action];
                return (
                  <div
                    key={`${item.remoteName}-${index}`}
                    className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">
                        {item.remoteName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.sizeBytes === null
                          ? copy("大小未返回", "Size unavailable")
                          : `${Math.max(1, Math.round(item.sizeBytes / 1024)).toLocaleString("zh-CN")} KB`}
                      </p>
                    </div>
                    <Badge variant="outline">{copy(zh, en)}</Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <Inbox
                className="mx-auto size-7 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-bold">
                {copy("团队收件箱目前为空", "The team inbox is empty")}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 border-t border-border bg-muted/25 px-5 py-4">
            <p className="text-xs font-medium leading-5 text-muted-foreground">
              {copy(
                "同一份文件不会重复建版本；若项目在回收站，重新拉取会先校验再恢复。",
                "The same file never creates a duplicate version; recycled projects are verified before restoration."
              )}
            </p>
            <Button
              className="shrink-0 gap-2"
              disabled={!actionable || pull.isPending}
              onClick={importFiles}
            >
              <CloudDownload className="size-4" aria-hidden="true" />
              {pull.isPending
                ? copy("正在导入", "Importing")
                : copy("导入到本机", "Import locally")}
            </Button>
          </div>
        </>
      ) : (
        <p className="px-5 py-8 text-sm font-medium text-muted-foreground">
          {copy(
            "点击“检查新资料”读取企业共享收件箱；这一步不会修改飞书内容。",
            "Check the enterprise shared inbox. This read-only step does not change Feishu content."
          )}
        </p>
      )}
    </section>
  );
}
