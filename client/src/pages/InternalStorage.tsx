import Navbar from "@/components/Navbar";
import { InternalStorageStatus } from "@/components/internal/InternalStorageStatus";
import { TeamInboxPanel } from "@/components/internal/TeamInboxPanel";
import { EMPTY_INTERNAL_STORAGE_OVERVIEW } from "@/components/internal/internal-storage-model";
import { useUiLanguage } from "@/contexts/UiLanguageContext";
import { trpc } from "@/lib/trpc";

export default function InternalStorage() {
  const { copy } = useUiLanguage();
  const statusQuery = trpc.internalStorage.status.useQuery(undefined, {
    refetchOnWindowFocus: false,
    retry: false,
  });
  const resolvedOverview = statusQuery.data ?? EMPTY_INTERNAL_STORAGE_OVERVIEW;
  const storageScope = resolvedOverview.storageScope ?? "unknown";
  const hasStatusError = Boolean(statusQuery.error);
  const refresh = () => {
    void statusQuery.refetch();
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <Navbar />
      <main className="app-page">
        <header className="max-w-4xl pb-6 lg:pb-7">
          <p className="finance-kicker">INTERNAL RECORDS &amp; DISTRIBUTION</p>
          <h1 className="page-heading mt-3">
            {copy("内部资料归档", "Internal file archive")}
          </h1>
          <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-muted-foreground">
            {copy(
              storageScope === "enterprise_shared"
                ? "在这里确认 BP 与补充材料是否已保存到企业共享飞书目录；项目分析与管理仍在本地工作台完成。"
                : storageScope === "personal"
                  ? "当前连接的是个人飞书目录；项目分析与管理仍在本地工作台完成。"
                  : "在这里确认 BP 与补充材料的飞书归档状态；目录类型未确认时不会标记为企业共享。",
              storageScope === "enterprise_shared"
                ? "Confirm that BPs and supporting files are saved to the enterprise shared Feishu folder while analysis and management remain local."
                : storageScope === "personal"
                  ? "The connected Feishu folder is personal; project analysis and management remain local."
                  : "Review Feishu archive status here. An unconfirmed folder is never labeled as enterprise shared."
            )}
          </p>
        </header>

        {hasStatusError ? (
          <div
            role="alert"
            className="mb-5 rounded-md border border-destructive/35 bg-card px-4 py-3 text-sm font-medium text-destructive"
          >
            {copy(
              "暂时无法读取归档状态。请稍后刷新，或让 Codex 检查飞书连接。",
              "The archive status is temporarily unavailable. Refresh later or ask Codex to check the Feishu connection."
            )}
          </div>
        ) : null}

        <InternalStorageStatus
          overview={resolvedOverview}
          isRefreshing={statusQuery.isFetching}
          onRefresh={refresh}
        />
        <TeamInboxPanel
          connected={
            resolvedOverview.connectionState === "connected" &&
            storageScope === "enterprise_shared"
          }
          onCompleted={refresh}
        />
      </main>
    </div>
  );
}
