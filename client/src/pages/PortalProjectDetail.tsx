import { PortalShell } from "@/components/portal/PortalShell";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { collaborationApi } from "@/lib/collaboration-api";
import { projectFieldMetadata } from "@shared/field-metadata";
import { formatDate } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  FileSearch,
  HelpCircle,
} from "lucide-react";
import { Link, useParams } from "wouter";

const verificationLabel = {
  supported: "证据充分",
  partial: "部分支持",
  not_found: "未找到证据",
  conflict: "存在矛盾",
};
const verificationTone = {
  supported: "border-primary/30 text-primary",
  partial: "border-amber-400/35 text-amber-300",
  not_found: "",
  conflict: "border-destructive/40 text-destructive",
};

export default function PortalProjectDetail() {
  const { publicationId = "" } = useParams<{ publicationId: string }>();
  const query = useQuery({
    queryKey: ["portal", "project", publicationId],
    queryFn: () => collaborationApi.portalProject(publicationId),
  });
  return (
    <PortalShell>
      {query.isLoading ? (
        <Skeleton className="h-[640px]" />
      ) : query.error || !query.data ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 p-6 text-destructive"
        >
          {query.error?.message ?? "项目不存在"}
        </div>
      ) : (
        (() => {
          const project = query.data;
          return (
            <>
              <Link
                href="/portal"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                返回共享项目
              </Link>
              <header className="mt-6 border-b border-border/70 pb-7">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={project.status} />
                  <Badge variant="outline">
                    {project.securityMode === "trusted" ? "可信分享" : "高保密"}
                  </Badge>
                  {project.expiresAt && (
                    <Badge variant="outline">
                      到期 {formatDate(project.expiresAt)}
                    </Badge>
                  )}
                </div>
                <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">
                  {project.name}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {[project.industry, project.fundingRound, project.product]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {project.summary && (
                  <p className="mt-5 max-w-4xl text-sm leading-7 text-muted-foreground">
                    {project.summary}
                  </p>
                )}
              </header>
              <div className="mt-7 grid gap-6 lg:grid-cols-12">
                <div className="space-y-6 lg:col-span-8">
                  <section className="rounded-xl border border-border/80 bg-card">
                    <div className="border-b border-border/70 px-5 py-4">
                      <h2 className="font-semibold">共享字段与自动核实</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        核实状态来自来源值、页码和短引的完整程度，不代表商业真实性尽调。
                      </p>
                    </div>
                    {project.fields.length ? (
                      <dl className="divide-y divide-border/60">
                        {project.fields.map(field => (
                          <div
                            key={field.key}
                            className="grid gap-2 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)_auto]"
                          >
                            <dt className="text-xs text-muted-foreground">
                              {field.label ||
                                projectFieldMetadata(field.key).label}
                              <span className="ml-2 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                                {field.englishLabel ||
                                  projectFieldMetadata(field.key).englishLabel}
                              </span>
                            </dt>
                            <dd className="min-w-0 break-words text-sm">
                              {field.value === null
                                ? "未披露"
                                : typeof field.value === "boolean"
                                  ? field.value
                                    ? "是"
                                    : "否"
                                  : String(field.value)}
                              {field.evidence?.quote && (
                                <blockquote className="mt-2 border-l-2 border-primary/35 pl-3 text-xs leading-5 text-muted-foreground">
                                  第 {field.evidence.page ?? "?"} 页：
                                  {field.evidence.quote}
                                </blockquote>
                              )}
                            </dd>
                            <dd>
                              <Badge
                                variant="outline"
                                className={verificationTone[field.verification]}
                              >
                                {verificationLabel[field.verification]}
                              </Badge>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <div className="p-8 text-sm text-muted-foreground">
                        该账号未获字段查看权限。
                      </div>
                    )}
                  </section>
                  {project.analysis && (
                    <section className="grid gap-5 md:grid-cols-2">
                      <div className="rounded-xl border border-border/80 bg-card p-5">
                        <h2 className="flex items-center gap-2 font-semibold">
                          <AlertTriangle className="size-4 text-amber-300" />
                          风险与关注
                        </h2>
                        <div className="mt-4 space-y-3">
                          {project.analysis.risks.map(risk => (
                            <div
                              key={risk.title}
                              className="rounded-lg border border-border/60 p-3"
                            >
                              <p className="text-sm font-medium">
                                {risk.title}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {risk.detail}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/80 bg-card p-5">
                        <h2 className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="size-4 text-primary" />
                          商业逻辑检查
                        </h2>
                        <div className="mt-4 space-y-3">
                          {project.analysis.commercialChecks.map(check => (
                            <div key={check.name} className="flex gap-3">
                              <span
                                className={`mt-1 size-2 shrink-0 rounded-full ${check.result === "pass" ? "bg-primary" : check.result === "attention" ? "bg-amber-300" : "bg-muted-foreground"}`}
                              />
                              <div>
                                <p className="text-sm font-medium">
                                  {check.name}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                  {check.detail}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                        {project.analysis.missingInformation.length > 0 && (
                          <div className="mt-5 border-t border-border/60 pt-4">
                            <p className="flex items-center gap-2 text-sm font-medium">
                              <HelpCircle className="size-4" />
                              待补信息
                            </p>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                              {project.analysis.missingInformation.map(item => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </section>
                  )}
                </div>
                <aside className="lg:col-span-4">
                  <section className="rounded-xl border border-border/80 bg-card">
                    <div className="border-b border-border/70 px-5 py-4">
                      <h2 className="flex items-center gap-2 font-semibold">
                        <FileSearch className="size-4 text-primary" />
                        授权文件
                      </h2>
                    </div>
                    {project.files.length ? (
                      <div className="divide-y divide-border/60">
                        {project.files.map(file => (
                          <div key={file.id} className="p-4">
                            <p className="break-all text-sm font-medium">
                              {file.originalName}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {file.pageCount} 页/段 ·{" "}
                              {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB
                            </p>
                            <Link
                              href={`/portal/projects/${publicationId}/files/${file.id}`}
                            >
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-3 w-full gap-2"
                              >
                                <Eye className="size-3.5" />
                                受控查看
                              </Button>
                            </Link>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-sm text-muted-foreground">
                        当前共享范围没有文件。
                      </div>
                    )}
                  </section>
                </aside>
              </div>
            </>
          );
        })()
      )}
    </PortalShell>
  );
}
