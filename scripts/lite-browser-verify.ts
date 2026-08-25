import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "playwright";
import type {
  LinkShareProject,
  PublicationDetail,
} from "../shared/collaboration";

const baseUrl = "http://127.0.0.1:4010";
const verifyRemote = process.env.COF_BP_LITE_VERIFY_REMOTE === "1";
const keepPublished = process.env.COF_BP_LITE_KEEP_TEST_PUBLISHED === "1";
const requestedProjectId = process.env.COF_BP_VERIFY_PROJECT_ID?.trim();
const requestedFileId = process.env.COF_BP_VERIFY_FILE_ID?.trim();
const artifacts = path.resolve("artifacts");
fs.mkdirSync(artifacts, { recursive: true });
const consoleErrors: string[] = [];
const annotationBody = `请核实订单金额是否已经形成真实回款。同步测试 ${Date.now().toString(36)}`;
const verificationAccessCode = "246810";

function watch(page: Page, label: string) {
  page.on("console", message => {
    if (
      message.type() === "error" &&
      !message
        .text()
        .startsWith(
          "Failed to load resource: the server responded with a status of 404"
        )
    )
      consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on("response", response => {
    if (
      response.status() >= 400 &&
      !response.url().includes(`token=${"x".repeat(32)}`)
    )
      consoleErrors.push(
        `${label}: HTTP ${response.status()} ${response.url()}`
      );
  });
  page.on("pageerror", error =>
    consoleErrors.push(`${label}: ${String(error)}`)
  );
}

async function api<T>(
  page: Page,
  route: string,
  init: { method?: string; body?: unknown } = {}
) {
  return page.evaluate(
    async ({ route, init }) => {
      const response = await fetch(route, {
        method: init.method,
        headers: init.body ? { "content-type": "application/json" } : undefined,
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || `HTTP ${response.status}`);
      return result;
    },
    { route, init }
  ) as Promise<T>;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});

let admin: Page | null = null;
let publicationId: string | null = null;
let remoteShareToken: string | null = null;
let remoteShareOrigin: string | null = null;

async function unlockShare(page: Page) {
  const gate = page.getByRole("heading", { name: "输入项目访问码" });
  await gate.waitFor({ timeout: 60_000 });
  await page.getByLabel("六位数字项目访问码").fill(verificationAccessCode);
  await page.getByRole("button", { name: "验证并打开项目" }).click();
}

try {
  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  admin = await adminContext.newPage();
  watch(admin, "admin");
  await admin.goto(baseUrl, { waitUntil: "networkidle" });
  await api(admin, "/api/auth/local-admin", { method: "POST" });
  await admin.goto(`${baseUrl}/collaboration`, { waitUntil: "networkidle" });

  const projects = await api<Array<{ id: string; fundingRound?: string }>>(
    admin,
    "/api/local/projects"
  );
  const target = requestedProjectId
    ? projects.find(project => project.id === requestedProjectId)
    : (projects.find(project => project.fundingRound === "天使") ??
      projects[0]);
  if (!target)
    throw new Error(
      requestedProjectId
        ? `未找到指定验收项目 ${requestedProjectId}`
        : "没有可用于分享验收的本地项目"
    );
  const project = await api<{
    id: string;
    name: string;
    fields: Array<{ key: string; value: unknown }>;
    files: Array<{ id: string; originalName?: string }>;
  }>(admin, `/api/local/projects/${target.id}`);
  const selectedFile = requestedFileId
    ? project.files.find(file => file.id === requestedFileId)
    : project.files[0];
  if (!selectedFile)
    throw new Error(
      requestedFileId
        ? `项目中不存在指定验收文件 ${requestedFileId}`
        : "项目没有可分享的 BP 文件"
    );
  const publication = await api<PublicationDetail>(
    admin,
    `/api/collaboration/projects/${project.id}/publication`,
    {
      method: "PUT",
      body: {
        shareMode: "selected_files",
        securityMode: "trusted",
        accessMode: "passcode",
        accessCode: verificationAccessCode,
        selectedFields: project.fields
          .filter(field => field.value !== null)
          .map(field => field.key),
        selectedFileIds: [selectedFile.id],
        expiresAt: null,
        annotationEnabled: true,
        members: [],
      },
    }
  );
  publicationId = publication.id;

  let current = publication;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    current = await api<PublicationDetail>(
      admin,
      `/api/collaboration/publications/${publication.id}`
    );
    if (
      current.state === "published" &&
      current.syncState === "synced" &&
      (!verifyRemote || Boolean(current.remoteShareUrl))
    )
      break;
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  if (current.state !== "published") throw new Error("分享快照未完成发布");
  if (verifyRemote && !current.remoteShareUrl)
    throw new Error("Vercel Lite 远端分享链接尚未生成");
  const shareUrl = verifyRemote
    ? current.remoteShareUrl!
    : `${baseUrl}${current.shareUrl}`;
  if (verifyRemote) {
    remoteShareToken = current.shareToken;
    remoteShareOrigin = new URL(shareUrl).origin;
  }

  const viewerAContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const viewerBContext = await browser.newContext({
    viewport: { width: 1100, height: 820 },
  });
  const viewerA = await viewerAContext.newPage();
  const viewerB = await viewerBContext.newPage();
  watch(viewerA, "viewer-a");
  watch(viewerB, "viewer-b");
  await Promise.all([
    viewerA.goto(shareUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    }),
    viewerB.goto(shareUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    }),
  ]);
  await Promise.all([unlockShare(viewerA), unlockShare(viewerB)]);
  await Promise.all([
    viewerA
      .getByRole("heading", { name: project.name })
      .waitFor({ timeout: 60_000 }),
    viewerB
      .getByRole("heading", { name: project.name })
      .waitFor({ timeout: 60_000 }),
  ]);

  await viewerA.getByPlaceholder("例如：Cassian").fill("协作测试甲");
  await viewerA
    .getByPlaceholder("写下问题、判断或需要对方补充的内容…")
    .fill(annotationBody);
  await viewerA.getByRole("button", { name: "发布批注" }).click();
  await viewerA.getByText("批注已同步").waitFor();

  const synchronized = viewerB.getByText(annotationBody);
  await synchronized.waitFor({ timeout: 8_000 });
  const articleB = viewerB.locator("article", { has: synchronized });
  await articleB.getByRole("button", { name: "标记解决" }).click();
  const articleA = viewerA.locator("article", {
    hasText: annotationBody,
  });
  await articleA.getByText("已解决").waitFor({ timeout: 8_000 });

  const share = await api<LinkShareProject>(
    viewerA,
    `/api/lite?action=share&token=${encodeURIComponent(current.shareToken)}`
  );
  const fileResponse = await viewerA.evaluate(async viewerUrl => {
    const response = await fetch(viewerUrl);
    await response.arrayBuffer();
    return {
      ok: response.ok,
      disposition: response.headers.get("content-disposition"),
    };
  }, share.files[0].viewerUrl);
  const invalidStatus = await viewerA.evaluate(async () => {
    const response = await fetch(
      `/api/lite?action=share&token=${"x".repeat(32)}`
    );
    return response.status;
  });
  const explicitDownloadControls = await viewerA
    .getByRole("button", { name: /下载/u })
    .count();
  const downloadAttributes = await viewerA.locator("[download]").count();
  const axe = await new AxeBuilder({ page: viewerA })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  await viewerA.screenshot({
    path: path.join(artifacts, "lite-share-collaboration-desktop.png"),
    fullPage: true,
  });

  await viewerA.setViewportSize({ width: 320, height: 800 });
  await viewerA.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  const overflow = await viewerA.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  );
  await viewerA.screenshot({
    path: path.join(artifacts, "lite-share-collaboration-narrow.png"),
    fullPage: true,
  });

  const report = {
    ok:
      fileResponse.ok &&
      fileResponse.disposition?.startsWith("inline") &&
      invalidStatus === 404 &&
      explicitDownloadControls === 0 &&
      downloadAttributes === 0 &&
      !overflow &&
      axe.violations.length === 0 &&
      consoleErrors.length === 0,
    project: project.name,
    projectId: project.id,
    selectedFileId: selectedFile.id,
    selectedFileName: selectedFile.originalName ?? null,
    target: verifyRemote ? "vercel" : "local",
    shareUrl,
    revision: share.revision,
    fileDisposition: fileResponse.disposition,
    invalidTokenStatus: invalidStatus,
    explicitDownloadControls,
    downloadAttributes,
    overflow,
    axeViolations: axe.violations.map(item => item.id),
    consoleErrors,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  if (!keepPublished && admin && publicationId) {
    let pauseError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await api(
          admin,
          `/api/collaboration/publications/${publicationId}/pause`,
          { method: "POST" }
        );
        pauseError = null;
        break;
      } catch (error) {
        pauseError = error;
        await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)));
      }
    }
    if (pauseError) {
      console.error(`无法暂停验收分享：${String(pauseError)}`);
      process.exitCode = 1;
    } else if (verifyRemote && remoteShareOrigin && remoteShareToken) {
      let verificationError: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const cleanupContext = await browser.newContext();
        try {
          const response = await cleanupContext.request.get(
            `${remoteShareOrigin}/api/lite?action=share&token=${encodeURIComponent(remoteShareToken)}`,
            { timeout: 60_000 }
          );
          if (response.status() !== 404)
            throw new Error(`暂停后远端仍返回 HTTP ${response.status()}`);
          verificationError = null;
          break;
        } catch (error) {
          verificationError = error;
          await new Promise(resolve =>
            setTimeout(resolve, 750 * (attempt + 1))
          );
        } finally {
          await cleanupContext.close();
        }
      }
      if (verificationError) {
        console.error(`无法确认远端分享已经下线：${String(verificationError)}`);
        process.exitCode = 1;
      }
    }
  }
  await browser.close();
}
