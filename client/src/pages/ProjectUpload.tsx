import Navbar from "@/components/Navbar";
import {
  FileDropzone,
  validateBpFile,
} from "@/components/projects/FileDropzone";
import { MaterialInboxPanel } from "@/components/projects/MaterialInboxPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FolderSearch,
  Loader2,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function ProjectUpload() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const projectsQuery = trpc.projects.list.useQuery({});
  const scanMutation = trpc.projects.scan.useMutation();
  const wechatStatus = trpc.wechatInbox.status.useQuery(undefined, {
    refetchInterval: 2_500,
  });
  const initializeWechat = trpc.wechatInbox.initialize.useMutation();
  const scanWechat = trpc.wechatInbox.scan.useMutation();
  const reportedWechatJob = useRef("");
  const [file, setFile] = useState<File | null>(null);
  const [projectId, setProjectId] = useState(
    () => new URLSearchParams(window.location.search).get("projectId") ?? ""
  );
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [directory, setDirectory] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const job = wechatStatus.data?.scanJob;
    if (
      !job ||
      !["succeeded", "failed"].includes(job.state) ||
      reportedWechatJob.current === job.id
    ) {
      return;
    }
    reportedWechatJob.current = job.id;
    if (job.state === "succeeded") {
      toast.success(job.message);
      void utils.projects.list.invalidate();
    } else {
      toast.error(job.message);
    }
  }, [utils.projects.list, wechatStatus.data?.scanJob]);

  const chooseFile = (next: File | null) => {
    if (next) {
      const error = validateBpFile(next);
      if (error) {
        toast.error(error);
        return;
      }
    }
    setFile(next);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      toast.error("请先选择 BP 文件");
      return;
    }
    setImporting(true);
    try {
      const body = new FormData();
      body.append("file", file);
      if (projectId) body.append("projectId", projectId);
      if (projectName.trim()) body.append("projectName", projectName.trim());
      if (description.trim()) body.append("description", description.trim());
      const response = await fetch("/api/import", { method: "POST", body });
      const result = (await response.json()) as {
        projectId?: string;
        duplicate?: boolean;
        versionNumber?: number;
        aiStatus?: string;
        error?: string;
      };
      if (!response.ok || !result.projectId)
        throw new Error(result.error || "导入失败");
      await utils.projects.list.invalidate();
      toast.success(
        result.duplicate
          ? "检测到相同文件，已定位到已有版本"
          : `本地导入完成：v${result.versionNumber} | ${result.aiStatus}`
      );
      navigate(`/projects/${result.projectId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const scan = async () => {
    if (!directory.trim()) return toast.error("请输入本机文件夹绝对路径");
    try {
      const result = await scanMutation.mutateAsync({
        directory: directory.trim(),
      });
      await utils.projects.list.invalidate();
      toast.success(
        `扫描完成：发现 ${result.discovered} 份，处理 ${result.imported.length} 份`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "扫描失败");
    }
  };

  const establishWechatBaseline = async () => {
    try {
      const result = await initializeWechat.mutateAsync();
      await wechatStatus.refetch();
      toast.success(
        `安全基线已建立；${result.baselineFiles} 个已有文件不会导入`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法建立微信基线");
    }
  };

  const receiveFromWechat = async () => {
    try {
      const job = await scanWechat.mutateAsync();
      reportedWechatJob.current = job.id;
      await wechatStatus.refetch();
      toast.info("已开始检查文件传输助手；可以留在本页等待结果");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法启动微信接收");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <Navbar />
      <main className="app-page max-w-[1240px]">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          返回工作台
        </Link>
        <div className="mb-7 max-w-3xl">
          <p className="finance-kicker">LOCAL IMPORT</p>
          <h1 className="page-heading mt-3">导入或扫描 BP</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            文件写入本地数据目录后计算哈希、解析、建立版本关系并完成初筛。此流程没有云端上传步骤。
          </p>
        </div>

        <form
          onSubmit={submit}
          className="section-shell max-w-3xl space-y-5 p-5 sm:p-6"
        >
          <FileDropzone file={file} onFile={chooseFile} disabled={importing} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project-version">版本关系</Label>
              <select
                id="project-version"
                value={projectId}
                onChange={event => setProjectId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">自动识别为新项目或新版本</option>
                {projectsQuery.data?.items.map(project => (
                  <option key={project.id} value={project.id}>
                    加入「{project.name}」的新版本
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-name">项目名称（可选）</Label>
              <Input
                id="project-name"
                value={projectName}
                onChange={event => setProjectName(event.target.value)}
                placeholder="优先使用 BP 中的公司名称"
                disabled={Boolean(projectId)}
                className="bg-background"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">管理备注（可选）</Label>
            <Textarea
              id="description"
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="仅作为本地管理备注，不作为原始事实证据"
              className="min-h-24 bg-background"
            />
          </div>
          <div className="flex items-start gap-3 rounded-md border border-signal/25 bg-signal/5 p-4 text-sm">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0 text-signal"
              aria-hidden="true"
            />
            <p className="leading-6 text-muted-foreground">
              默认仅保存在本机。优化建议与原始事实分开保存，未识别字段保持为空。
            </p>
          </div>
          <Button
            type="submit"
            disabled={importing || !file}
            className="w-full gap-2 sm:w-auto"
          >
            {importing && (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            )}
            {importing ? "正在导入、解析并初筛…" : "导入并完成初筛"}
          </Button>
          <p
            className="text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {importing
              ? "请保持此页面打开；PDF/Office 解析在本机进程中进行。"
              : "相同 SHA-256 的文件不会重复入库。"}
          </p>
        </form>

        <section
          className="section-shell mt-6"
          aria-labelledby="wechat-inbox-title"
        >
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <MessageSquareText
                className="mt-0.5 size-5 shrink-0 text-signal"
                aria-hidden="true"
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="wechat-inbox-title" className="font-semibold">
                    微信项目资料收件箱
                  </h2>
                  {wechatStatus.data?.initialized ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-foreground/20 bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
                      <CheckCircle2 className="size-3" aria-hidden="true" />
                      已连接
                    </span>
                  ) : (
                    <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      待建立基线
                    </span>
                  )}
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  复用你已经跑通的私人知识库微信入口，但使用独立口令；BP、财务模型、尽调附件和其它项目资料都可以进入，不复制私人知识库和历史消息。
                </p>
              </div>
            </div>
            <div className="shrink-0 rounded-lg border border-border bg-muted/45 px-3 py-2 text-xs font-semibold">
              口令：{wechatStatus.data?.triggerPhrase ?? "存入项目库"}
            </div>
          </div>

          <div className="grid border-t border-border bg-muted/20 md:grid-cols-3">
            <div className="border-b border-border p-5 md:border-b-0 md:border-r">
              <p className="field-label">建立连接</p>
              <p className="mt-2 text-sm font-semibold">建立安全基线</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                只登记现有文件签名，绝不会把微信里的旧文件批量导入。
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={establishWechatBaseline}
                disabled={
                  initializeWechat.isPending ||
                  !wechatStatus.data?.available ||
                  wechatStatus.data?.scanJob.state === "running"
                }
              >
                {initializeWechat.isPending && (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                )}
                {wechatStatus.data?.initialized
                  ? "重新建立基线"
                  : "建立安全基线"}
              </Button>
            </div>
            <div className="border-b border-border p-5 md:border-b-0 md:border-r">
              <p className="field-label">发送资料</p>
              <p className="mt-2 text-sm font-semibold">先发口令，再发资料</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                给自己的文件传输助手发送“
                {wechatStatus.data?.triggerPhrase ?? "存入项目库"}”，随后发送
                BP、Excel、图片、压缩包或其它项目附件。
              </p>
            </div>
            <div className="p-5">
              <p className="field-label">检查归档</p>
              <p className="mt-2 text-sm font-semibold">检查、分类并归档</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                BP
                自动进入初筛；其它资料关联已有项目，无法判断的进入下方待归档区。
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-4 gap-2"
                onClick={receiveFromWechat}
                disabled={
                  !wechatStatus.data?.initialized ||
                  scanWechat.isPending ||
                  wechatStatus.data?.scanJob.state === "running"
                }
              >
                {wechatStatus.data?.scanJob.state === "running" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <MessageSquareText className="size-4" aria-hidden="true" />
                )}
                {wechatStatus.data?.scanJob.state === "running"
                  ? "正在检查…"
                  : "检查并接收"}
              </Button>
            </div>
          </div>

          <div
            className="flex items-start gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground sm:px-6"
            role="status"
            aria-live="polite"
          >
            {wechatStatus.data?.scanJob.state === "failed" ? (
              <AlertTriangle
                className="mt-0.5 size-3.5 shrink-0 text-destructive"
                aria-hidden="true"
              />
            ) : (
              <ShieldCheck
                className="mt-0.5 size-3.5 shrink-0 text-signal"
                aria-hidden="true"
              />
            )}
            <span>
              {!wechatStatus.data?.available
                ? "尚未检测到本机微信文件目录或微信路由器。"
                : wechatStatus.data.scanJob.state === "idle"
                  ? "微信读取只在本机发生；无法确认 filehelper 时会直接停止。"
                  : wechatStatus.data.scanJob.message}
            </span>
          </div>
        </section>

        <MaterialInboxPanel />

        <section
          className="section-shell mt-6 p-5 sm:p-6"
          aria-labelledby="scan-title"
        >
          <div className="flex items-start gap-3">
            <FolderSearch
              className="mt-0.5 size-5 text-signal"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <h2 id="scan-title" className="font-semibold">
                扫描本机文件夹
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                递归扫描最多 500 份受支持文件；跳过符号链接，逐份去重和分析。
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={directory}
                  onChange={event => setDirectory(event.target.value)}
                  placeholder="例如 D:\BP收件箱"
                  className="bg-background"
                  aria-label="本机扫描文件夹绝对路径"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={scan}
                  disabled={scanMutation.isPending}
                  className="gap-2"
                >
                  {scanMutation.isPending && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  开始扫描
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
