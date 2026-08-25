import { AnnotationPanel } from "@/components/share/AnnotationPanel";
import { ShareAccessGate } from "@/components/share/ShareEmailGate";
import { LinkShareShell } from "@/components/share/LinkShareShell";
import { ShareInvestmentFacts } from "@/components/share/ShareInvestmentFacts";
import { ShareFileViewer } from "@/components/share/ShareFileViewer";
import { Skeleton } from "@/components/ui/skeleton";
import { shareApi } from "@/lib/share-api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";

export default function LinkSharePage() {
  const { token = "" } = useParams<{ token: string }>();
  const client = useQueryClient();
  const auth = useQuery({
    queryKey: ["link-share", token, "auth"],
    queryFn: () => shareApi.authStatus(token),
    enabled: token.length >= 20,
    staleTime: 30_000,
  });
  const canLoadProject = Boolean(
    auth.data && (!auth.data.required || auth.data.authenticated)
  );
  const query = useQuery({
    queryKey: ["link-share", token],
    queryFn: () => shareApi.project(token),
    enabled: token.length >= 20 && canLoadProject,
    refetchInterval: 10_000,
  });

  return (
    <LinkShareShell>
      {auth.isLoading ? (
        <div className="grid gap-5 lg:grid-cols-12">
          <Skeleton className="h-[720px] lg:col-span-8" />
          <Skeleton className="h-[720px] lg:col-span-4" />
        </div>
      ) : auth.error ? (
        <div className="mx-auto mt-16 max-w-xl border border-destructive/40 bg-card p-8 text-center">
          <h1 className="text-xl font-semibold">无法核验分享权限</h1>
          <p role="alert" className="mt-3 text-sm text-muted-foreground">
            {auth.error.message}
          </p>
        </div>
      ) : auth.data?.required && !auth.data.authenticated ? (
        <ShareAccessGate
          token={token}
          accessMode={
            auth.data.accessMode === "passcode" ? "passcode" : "member_email"
          }
          providerConfigured={auth.data.providerConfigured}
          onVerified={() => {
            client.invalidateQueries({ queryKey: ["link-share", token] });
          }}
        />
      ) : query.isLoading ? (
        <div className="grid gap-5 lg:grid-cols-12">
          <Skeleton className="h-[720px] lg:col-span-8" />
          <Skeleton className="h-[720px] lg:col-span-4" />
        </div>
      ) : query.error || !query.data ? (
        <div className="mx-auto mt-16 max-w-xl border border-destructive/40 bg-card p-8 text-center">
          <h1 className="text-xl font-semibold">无法打开这个项目</h1>
          <p role="alert" className="mt-3 text-sm text-muted-foreground">
            {query.error?.message ?? "分享链接不存在或已经停止。"}
          </p>
        </div>
      ) : (
        <>
          <header className="mb-6 grid gap-5 border-b border-foreground pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground">
                项目分享包 <span lang="en">Project Share Package</span>
              </p>
              <h1 className="mt-3 text-[2rem] font-bold leading-tight tracking-[-0.045em] sm:text-[2.65rem]">
                {query.data.name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                本页汇总本次授权披露的原件、投资要点与协作批注。
              </p>
            </div>
            <dl className="grid grid-cols-3 divide-x divide-border border border-border bg-card text-center lg:min-w-[330px]">
              <div className="px-3 py-3">
                <dt className="text-[10px] text-muted-foreground">原件</dt>
                <dd className="mt-1 font-mono text-sm font-bold tabular-nums">
                  {query.data.files.length}
                </dd>
              </div>
              <div className="px-3 py-3">
                <dt className="text-[10px] text-muted-foreground">披露字段</dt>
                <dd className="mt-1 font-mono text-sm font-bold tabular-nums">
                  {query.data.fields.length}
                </dd>
              </div>
              <div className="px-3 py-3">
                <dt className="text-[10px] text-muted-foreground">协作</dt>
                <dd className="mt-1 text-sm font-bold">
                  {query.data.annotationEnabled ? "可批注" : "只读"}
                </dd>
              </div>
            </dl>
          </header>

          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              <ShareFileViewer files={query.data.files} />
              <ShareInvestmentFacts fields={query.data.fields} />
            </div>
            <aside className="self-start lg:sticky lg:top-6 lg:col-span-4">
              <AnnotationPanel project={query.data} />
            </aside>
          </div>
        </>
      )}
    </LinkShareShell>
  );
}
