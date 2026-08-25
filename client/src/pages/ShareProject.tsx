import { CollaborationShell } from "@/components/collaboration/CollaborationShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { collaborationApi } from "@/lib/collaboration-api";
import { collaborationLabel } from "@/lib/collaboration-labels";
import { formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  PROJECT_FIELD_GROUPS,
  projectFieldMetadata,
} from "@shared/field-metadata";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SecurityMode, ShareAccessMode } from "@shared/collaboration";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  FileCheck2,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useParams } from "wouter";
import { useCollaborationSession } from "@/hooks/useCollaborationSession";

type MemberDraft = {
  userId: string;
  enabled: boolean;
  canViewFields: boolean;
  canViewFiles: boolean;
  canRequestDownload: boolean;
};

const FIELD_GROUP_ENGLISH = {
  company: "Company & product",
  funding: "Financing",
  traction: "Business traction",
  finance: "Financial quality",
  team: "Team",
} as const;

function toggleSelection(
  items: string[],
  value: string,
  set: (next: string[]) => void
) {
  set(
    items.includes(value)
      ? items.filter(item => item !== value)
      : [...items, value]
  );
}

export default function ShareProject() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const session = useCollaborationSession({ bootstrapAdmin: true });
  const enabled = session.user?.role === "admin";
  const client = useQueryClient();
  const project = trpc.projects.get.useQuery(
    { id: projectId },
    { enabled: enabled && Boolean(projectId) }
  );
  const publications = useQuery({
    queryKey: ["collaboration", "publications"],
    queryFn: collaborationApi.publications,
    enabled,
  });
  const users = useQuery({
    queryKey: ["collaboration", "users"],
    queryFn: collaborationApi.users,
    enabled,
  });
  const existing = publications.data?.find(
    item => item.projectId === projectId
  );
  const detail = useQuery({
    queryKey: ["collaboration", "publication", existing?.id],
    queryFn: () => collaborationApi.publication(existing!.id),
    enabled: enabled && Boolean(existing?.id),
  });
  const [shareMode, setShareMode] = useState<"fields_only" | "selected_files">(
    "fields_only"
  );
  const [securityMode, setSecurityMode] = useState<SecurityMode>("trusted");
  const [accessMode, setAccessMode] = useState<ShareAccessMode>("passcode");
  const [accessCode, setAccessCode] = useState("");
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [annotationEnabled, setAnnotationEnabled] = useState(true);
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const initialized = useRef(false);
  useEffect(() => {
    if (
      !project.data ||
      !users.data ||
      initialized.current ||
      (existing && !detail.data)
    )
      return;
    const prior = detail.data;
    setShareMode(
      prior?.shareMode === "selected_files" ? "selected_files" : "fields_only"
    );
    setSecurityMode(prior?.securityMode ?? "trusted");
    setAccessMode(
      prior?.accessMode === "member_email" ? "member_email" : "passcode"
    );
    setSelectedFields(
      prior?.selectedFields ??
        project.data.fields
          .filter(field => field.value !== null)
          .map(field => field.key)
    );
    setSelectedFiles(prior?.selectedFileIds ?? []);
    setExpiresAt(prior?.expiresAt ? prior.expiresAt.slice(0, 16) : "");
    setAnnotationEnabled(prior?.annotationEnabled ?? true);
    setMembers(
      users.data
        .filter(user => user.role !== "admin" && user.state === "active")
        .map(user => {
          const grant = prior?.members.find(item => item.userId === user.id);
          return {
            userId: user.id,
            enabled: Boolean(grant),
            canViewFields: grant?.canViewFields ?? true,
            canViewFiles: grant?.canViewFiles ?? false,
            canRequestDownload: grant?.canRequestDownload ?? false,
          };
        })
    );
    initialized.current = true;
  }, [detail.data, existing, initialized, project.data, users.data]);
  const save = useMutation({
    mutationFn: () =>
      collaborationApi.configurePublication(projectId, {
        shareMode,
        securityMode: accessMode === "passcode" ? "trusted" : securityMode,
        accessMode,
        accessCode:
          accessMode === "passcode" && accessCode.length === 6
            ? accessCode
            : undefined,
        selectedFields,
        selectedFileIds: shareMode === "selected_files" ? selectedFiles : [],
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        annotationEnabled,
        members:
          accessMode === "member_email"
            ? members
                .filter(member => member.enabled)
                .map(({ enabled: _enabled, ...member }) => member)
            : [],
      }),
    onSuccess: value => {
      toast.success("共享边界已保存，发布任务正在处理");
      client.invalidateQueries({ queryKey: ["collaboration"] });
      client.setQueryData(["collaboration", "publication", value.id], value);
    },
    onError: error => toast.error(error.message),
  });
  const loading =
    project.isLoading ||
    publications.isLoading ||
    users.isLoading ||
    Boolean(existing && detail.isLoading);
  const publication = detail.data;
  const shareUrl = publication?.remoteShareUrl
    ? publication.remoteShareUrl
    : publication?.shareUrl
      ? `${window.location.origin}${publication.shareUrl}`
      : null;
  const customFieldByKey = useMemo(
    () =>
      new Map(
        (project.data?.customFields ?? []).map(field => [field.key, field])
      ),
    [project.data?.customFields]
  );
  const groupedFields = useMemo(
    () =>
      Object.entries(PROJECT_FIELD_GROUPS)
        .map(([group, label]) => ({
          group: group as keyof typeof PROJECT_FIELD_GROUPS,
          label,
          fields: (project.data?.fields ?? []).filter(
            field =>
              projectFieldMetadata(field.key, customFieldByKey.get(field.key))
                .group === group
          ),
        }))
        .filter(item => item.fields.length),
    [customFieldByKey, project.data?.fields]
  );
  const selectedFieldLabels = useMemo(
    () =>
      (project.data?.fields ?? [])
        .filter(field => selectedFields.includes(field.key))
        .map(
          field =>
            projectFieldMetadata(field.key, customFieldByKey.get(field.key))
              .label
        ),
    [customFieldByKey, project.data?.fields, selectedFields]
  );
  const selectedFileNames = useMemo(
    () =>
      (project.data?.files ?? [])
        .filter(file => selectedFiles.includes(file.id))
        .map(file => file.originalName),
    [project.data?.files, selectedFiles]
  );
  const effectiveSecurityMode: SecurityMode =
    accessMode === "passcode" ? "trusted" : securityMode;
  const accessCodeReady =
    accessMode !== "passcode" ||
    accessCode.length === 6 ||
    Boolean(publication?.accessCodeConfigured);
  return (
    <CollaborationShell
      title={project.data ? `配置共享 · ${project.data.name}` : "配置项目共享"}
      description="逐项确认分享字段、原件、访问方式与协作边界。未勾选的内容不会进入共享快照。"
      actions={
        <Link href="/collaboration">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="size-4" />
            返回
          </Button>
        </Link>
      }
    >
      {loading ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      ) : !project.data ? (
        <p role="alert" className="text-destructive">
          项目不存在。
        </p>
      ) : (
        <div>
          <ol className="section-shell mb-6 grid sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["01", "选择范围", "Sharing scope"],
              ["02", "字段与文件", "Fields & files"],
              ["03", "设置访问码", "Link access"],
              ["04", "确认发布", "Review & publish"],
            ].map(([number, label, english], index) => (
              <li
                key={number}
                className={`flex items-center gap-3 px-4 py-3 ${index ? "border-t border-border sm:border-l sm:border-t-0" : ""}`}
              >
                <span className="finance-number text-xs font-bold text-muted-foreground">
                  {number}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    {english}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              <section className="section-shell">
                <div className="section-bar">
                  <h2 className="section-title flex items-center gap-2">
                    <ShieldCheck className="size-4 text-signal" />
                    选择共享内容
                  </h2>
                  <span className="mono-meta">STEP 01 · SCOPE</span>
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-2">
                  {(
                    [
                      {
                        value: "fields_only",
                        title: "只共享所选字段",
                        detail: "外部账号看不到任何原文件。",
                      },
                      {
                        value: "selected_files",
                        title: "共享字段和指定文件",
                        detail: "只有明确勾选的版本进入资料室。",
                      },
                    ] as const
                  ).map(item => (
                    <label
                      key={item.value}
                      className={`selection-tile cursor-pointer p-4 ${shareMode === item.value ? "selection-tile-active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="shareMode"
                        value={item.value}
                        checked={shareMode === item.value}
                        onChange={() => setShareMode(item.value)}
                        className="sr-only"
                      />
                      <span className="font-medium">{item.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {item.detail}
                      </span>
                    </label>
                  ))}
                </div>
              </section>
              <section className="section-shell">
                <div className="section-bar">
                  <h2 className="section-title flex items-center gap-2">
                    <KeyRound className="size-4 text-signal" />
                    分享访问方式
                  </h2>
                  <span className="mono-meta">STEP 03 · LINK ACCESS</span>
                </div>
                <div className="p-5">
                  <p className="text-xs leading-5 text-muted-foreground">
                    首发默认使用单项目链接和六位数字访问码。邮箱验证仅为已有成员分享保留。
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label
                      className={`selection-tile cursor-pointer p-4 ${accessMode === "passcode" ? "selection-tile-active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="accessMode"
                        value="passcode"
                        checked={accessMode === "passcode"}
                        onChange={() => {
                          setAccessMode("passcode");
                          setSecurityMode("trusted");
                        }}
                        className="sr-only"
                      />
                      <span className="block font-medium">
                        链接 + 六位访问码
                      </span>
                      <span className="mt-1 block text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                        LINK + 6-DIGIT PASSCODE
                      </span>
                    </label>
                    <label
                      className={`selection-tile cursor-pointer p-4 ${accessMode === "member_email" ? "selection-tile-active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="accessMode"
                        value="member_email"
                        checked={accessMode === "member_email"}
                        onChange={() => setAccessMode("member_email")}
                        className="sr-only"
                      />
                      <span className="block font-medium">成员邮箱验证</span>
                      <span className="mt-1 block text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                        LEGACY MEMBER EMAIL
                      </span>
                    </label>
                  </div>
                  {accessMode === "passcode" ? (
                    <div className="mt-4 border-t border-border pt-4">
                      <label
                        htmlFor="share-access-code"
                        className="text-xs font-medium text-muted-foreground"
                      >
                        六位数字访问码
                      </label>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input
                          id="share-access-code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          value={accessCode}
                          onChange={event =>
                            setAccessCode(
                              event.target.value.replace(/\D/gu, "").slice(0, 6)
                            )
                          }
                          placeholder={
                            publication?.accessCodeConfigured
                              ? "已设置；留空保持不变"
                              : "输入 6 位数字"
                          }
                          className="h-10 min-w-0 flex-1 border border-input bg-background px-3 font-mono text-base tracking-[0.3em] text-foreground"
                          aria-describedby="share-access-code-help"
                          aria-invalid={
                            Boolean(accessCode.length) &&
                            accessCode.length !== 6
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const value = new Uint32Array(1);
                            crypto.getRandomValues(value);
                            setAccessCode(
                              String(value[0] % 1_000_000).padStart(6, "0")
                            );
                          }}
                        >
                          生成六码
                        </Button>
                      </div>
                      <p
                        id="share-access-code-help"
                        className="mt-2 text-xs leading-5 text-muted-foreground"
                      >
                        访问码只在设置时可见，保存后仅保留安全哈希，不会回显。
                        {publication?.accessCodeConfigured &&
                          " 如需更换，输入新的六位数字后再次同步。"}
                      </p>
                    </div>
                  ) : null}
                </div>
              </section>
              <section className="section-shell">
                <div className="section-bar">
                  <h2 className="section-title">字段级权限</h2>
                  <Badge variant="outline">已选 {selectedFields.length}</Badge>
                </div>
                <div className="space-y-5 p-5">
                  {groupedFields.map(group => (
                    <fieldset key={group.group}>
                      <legend className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
                        {group.label}
                        <span className="text-[10px] font-normal uppercase tracking-[0.08em] text-muted-foreground">
                          {FIELD_GROUP_ENGLISH[group.group]}
                        </span>
                      </legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.fields?.map(field => {
                          const display = projectFieldMetadata(
                            field.key,
                            customFieldByKey.get(field.key)
                          );
                          return (
                            <label
                              key={field.key}
                              className={`selection-tile flex items-start gap-3 p-3 text-sm ${selectedFields.includes(field.key) ? "selection-tile-active" : ""} ${field.value === null ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedFields.includes(field.key)}
                                disabled={field.value === null}
                                onChange={() =>
                                  toggleSelection(
                                    selectedFields,
                                    field.key,
                                    setSelectedFields
                                  )
                                }
                                className="mt-0.5 size-4 accent-[var(--color-primary)]"
                              />
                              <span className="min-w-0">
                                <span className="block font-medium">
                                  {display.label}
                                </span>
                                <span className="mt-0.5 block text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                                  {display.englishLabel}
                                </span>
                                <span className="mt-1 block truncate text-xs text-muted-foreground">
                                  {field.value === null
                                    ? "未披露"
                                    : String(field.value)}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))}
                </div>
              </section>
              {shareMode === "selected_files" ? (
                <section className="section-shell">
                  <div className="section-bar">
                    <h2 className="section-title flex items-center gap-2">
                      <FileCheck2 className="size-4 text-signal" />
                      指定文件
                    </h2>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        已选 {selectedFiles.length} /{" "}
                        {project.data.files.length}
                      </Badge>
                      <span className="mono-meta">STEP 02 · FILES</span>
                    </div>
                  </div>
                  <div className="p-5">
                    <p className="text-xs text-muted-foreground">
                      可以同时选择
                      BP、财务模型和补充材料的指定版本。未勾选文件以及未来上传的新版本不会自动进入分享。
                    </p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {project.data.files.map(file => (
                        <label
                          key={file.id}
                          className={`selection-tile flex cursor-pointer items-center gap-3 p-3 text-sm ${selectedFiles.includes(file.id) ? "selection-tile-active" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedFiles.includes(file.id)}
                            onChange={() =>
                              toggleSelection(
                                selectedFiles,
                                file.id,
                                setSelectedFiles
                              )
                            }
                            className="size-4 accent-[var(--color-primary)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              v{file.versionNumber} · {file.originalName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {file.pageCount} 页/段 · SHA-256{" "}
                              {file.sha256.slice(0, 12)}…
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
            <aside className="space-y-6 lg:col-span-4">
              <section className="section-shell border-foreground bg-foreground p-5 text-background">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-background/55">
                  STEP 04 · REVIEW
                </p>
                <h2 className="mt-2 font-semibold">发布摘要</h2>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-background/55">共享字段</dt>
                    <dd className="finance-number mt-1 font-semibold">
                      {selectedFields.length} 项
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-background/55">共享文件</dt>
                    <dd className="finance-number mt-1 font-semibold">
                      {shareMode === "selected_files"
                        ? selectedFiles.length
                        : 0}{" "}
                      份
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-background/55">访问方式</dt>
                    <dd className="mt-1 font-semibold">
                      {accessMode === "passcode" ? "六位访问码" : "成员邮箱"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-background/55">查看模式</dt>
                    <dd className="mt-1 font-semibold">
                      {collaborationLabel(effectiveSecurityMode)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-5 border-t border-background/20 pt-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-background/55">
                    最终共享内容
                  </p>
                  <p className="mt-2 text-xs leading-5 text-background/80">
                    字段：
                    {selectedFieldLabels.length
                      ? selectedFieldLabels.join("、")
                      : "未选择"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-background/80">
                    原件：
                    {shareMode === "selected_files" && selectedFileNames.length
                      ? selectedFileNames.join("、")
                      : "不共享"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-background/80">
                    最近配置人：
                    {detail.data?.configuredByName ??
                      session.user?.name ??
                      "当前管理员"}
                    {detail.data?.configuredAt
                      ? ` · ${formatDate(detail.data.configuredAt)}`
                      : ""}
                  </p>
                </div>
              </section>
              {shareUrl && (
                <section className="section-shell border-foreground p-5">
                  <h2 className="font-semibold">单项目分享链接</h2>
                  <p className="mt-2 break-all rounded-md border border-border/70 bg-background/70 p-3 text-xs text-muted-foreground">
                    {shareUrl}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={async () => {
                        await navigator.clipboard.writeText(shareUrl);
                        toast.success("分享链接已复制");
                      }}
                    >
                      <Copy className="size-3.5" />
                      复制
                    </Button>
                    <Button asChild variant="outline" className="gap-2">
                      <a href={shareUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-3.5" />
                        预览
                      </a>
                    </Button>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    每个项目只有自己的随机链接，链接之间数据完全隔离。暂停发布后链接立即失效。
                  </p>
                </section>
              )}
              <section className="section-shell p-5">
                <h2 className="flex items-center gap-2 font-semibold">
                  <MessageSquareText className="size-4 text-signal" />
                  批注与下载
                </h2>
                <label className="mt-4 flex items-start gap-3 rounded-sm border border-border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={annotationEnabled}
                    onChange={event =>
                      setAnnotationEnabled(event.target.checked)
                    }
                    className="mt-0.5 size-4 accent-[var(--color-primary)]"
                  />
                  <span>
                    <span className="font-medium">允许协作者添加批注</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      访问码访客填写昵称即可参与；成员邮箱模式会自动带入已验证身份。
                    </span>
                  </span>
                </label>
                <div className="mt-3 rounded-sm border border-border p-3 text-sm">
                  <p className="font-medium">下载入口：关闭</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    分享页只提供在线查看，不显示下载按钮，也不签发下载链接。
                  </p>
                </div>
                <Link
                  href="/collaboration/annotations"
                  className="mt-4 inline-flex text-xs font-semibold text-signal hover:underline"
                >
                  查看批注收件箱
                </Link>
              </section>
              {accessMode === "member_email" ? (
                <>
                  <section className="section-shell p-5">
                    <h2 className="font-semibold">查看安全模式</h2>
                    <div className="mt-4 space-y-3">
                      {(
                        [
                          {
                            value: "trusted",
                            icon: Search,
                            title: "可信分享",
                            detail:
                              "浏览器内查看原件，产品不提供下载按钮；这不是 DRM，也不能阻止截图。",
                          },
                          {
                            value: "high_security",
                            icon: LockKeyhole,
                            title: "高保密",
                            detail:
                              "服务端把每页烧入身份水印并返回图像，另提供独立文本检索。",
                          },
                        ] as const
                      ).map(({ value, icon: Icon, title, detail }) => (
                        <label
                          key={value}
                          className={`selection-tile flex cursor-pointer gap-3 p-3 ${securityMode === value ? "selection-tile-active" : ""}`}
                        >
                          <input
                            type="radio"
                            name="security"
                            className="sr-only"
                            checked={securityMode === value}
                            onChange={() => setSecurityMode(value)}
                          />
                          <Icon className="mt-0.5 size-4 shrink-0 text-signal" />
                          <span>
                            <span className="block text-sm font-medium">
                              {title}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              {detail}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>
                  <section className="section-shell p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      LEGACY · MEMBER EMAIL
                    </p>
                    <h2 className="mt-2 flex items-center gap-2 font-semibold">
                      <Users className="size-4 text-signal" />
                      账号与权限
                    </h2>
                    <div className="mt-4 space-y-3">
                      {members.length ? (
                        members.map((member, index) => {
                          const user = users.data?.find(
                            item => item.id === member.userId
                          );
                          return (
                            <div
                              key={member.userId}
                              className="rounded-sm border border-border p-3"
                            >
                              <label className="flex items-center gap-2 text-sm font-medium">
                                <input
                                  type="checkbox"
                                  checked={member.enabled}
                                  onChange={event =>
                                    setMembers(current =>
                                      current.map((item, i) =>
                                        i === index
                                          ? {
                                              ...item,
                                              enabled: event.target.checked,
                                            }
                                          : item
                                      )
                                    )
                                  }
                                  className="size-4 accent-[var(--color-primary)]"
                                />
                                {user?.name}{" "}
                                <span className="text-xs font-normal text-muted-foreground">
                                  {user ? collaborationLabel(user.role) : ""}
                                </span>
                              </label>
                              {member.enabled && (
                                <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={member.canViewFields}
                                      onChange={e =>
                                        setMembers(current =>
                                          current.map((item, i) =>
                                            i === index
                                              ? {
                                                  ...item,
                                                  canViewFields:
                                                    e.target.checked,
                                                }
                                              : item
                                          )
                                        )
                                      }
                                      className="mr-2 accent-[var(--color-primary)]"
                                    />
                                    查看字段
                                  </label>
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={member.canViewFiles}
                                      onChange={e =>
                                        setMembers(current =>
                                          current.map((item, i) =>
                                            i === index
                                              ? {
                                                  ...item,
                                                  canViewFiles:
                                                    e.target.checked,
                                                }
                                              : item
                                          )
                                        )
                                      }
                                      className="mr-2 accent-[var(--color-primary)]"
                                    />
                                    浏览文件
                                  </label>
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={member.canRequestDownload}
                                      onChange={e =>
                                        setMembers(current =>
                                          current.map((item, i) =>
                                            i === index
                                              ? {
                                                  ...item,
                                                  canRequestDownload:
                                                    e.target.checked,
                                                }
                                              : item
                                          )
                                        )
                                      }
                                      className="mr-2 accent-[var(--color-primary)]"
                                    />
                                    申请下载
                                  </label>
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          尚无已激活的协作者。请先创建邀请。
                        </p>
                      )}
                    </div>
                    <Link
                      href="/collaboration/members"
                      className="mt-3 inline-block text-xs text-primary hover:underline"
                    >
                      管理成员与邀请
                    </Link>
                  </section>
                </>
              ) : null}
              <section className="section-shell p-5">
                <label className="text-xs text-muted-foreground">
                  分享到期时间（可选）
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={event => setExpiresAt(event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  />
                </label>
                <Button
                  className="mt-4 w-full"
                  onClick={() => save.mutate()}
                  disabled={
                    save.isPending ||
                    !selectedFields.length ||
                    !accessCodeReady ||
                    (shareMode === "selected_files" && !selectedFiles.length)
                  }
                >
                  {save.isPending
                    ? "正在保存…"
                    : existing
                      ? "保存并同步"
                      : "发布共享快照"}
                </Button>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  发布前会保存一份独立快照；本地原件不会被修改。任务失败时可在“任务与审计”重试。
                </p>
              </section>
            </aside>
          </div>
        </div>
      )}
    </CollaborationShell>
  );
}
