import { chromium, type Page } from "playwright";

const localUrl = process.env.COF_BP_LOCAL_URL ?? "http://127.0.0.1:4010";
const targets = [
  {
    name: "杏林智诊（完全虚构）",
    shareMode: "selected_files" as const,
    annotationEnabled: true,
  },
  {
    name: "逐光协作机器人（完全虚构）",
    shareMode: "selected_files" as const,
    annotationEnabled: true,
  },
  {
    name: "矽澜新材（完全虚构）",
    shareMode: "fields_only" as const,
    annotationEnabled: true,
  },
  {
    name: "碳衡数据（完全虚构）",
    shareMode: "selected_files" as const,
    annotationEnabled: false,
  },
];

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
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error || `HTTP ${response.status}`);
      return value;
    },
    { route, init }
  ) as Promise<T>;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});

try {
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await admin.goto(`${localUrl}/collaboration`, { waitUntil: "networkidle" });
  const projects = await api<Array<{ id: string; name: string }>>(
    admin,
    "/api/local/projects"
  );
  const results = [];

  for (const target of targets) {
    const project = projects.find(item => item.name === target.name);
    if (!project) throw new Error(`没有找到项目：${target.name}`);
    const detail = await api<{
      id: string;
      fields: Array<{ key: string; value: unknown }>;
      files: Array<{ id: string }>;
    }>(admin, `/api/local/projects/${project.id}`);
    const publication = await api<{
      id: string;
      state: string;
      syncState: string;
      remoteShareUrl: string | null;
    }>(admin, `/api/collaboration/projects/${project.id}/publication`, {
      method: "PUT",
      body: {
        shareMode: target.shareMode,
        securityMode: "trusted",
        selectedFields: detail.fields
          .filter(field => field.value !== null)
          .map(field => field.key),
        selectedFileIds:
          target.shareMode === "selected_files" ? [detail.files[0].id] : [],
        expiresAt: null,
        annotationEnabled: target.annotationEnabled,
        members: [],
      },
    });

    let current = publication;
    for (let attempt = 0; attempt < 75; attempt += 1) {
      current = await api<typeof publication>(
        admin,
        `/api/collaboration/publications/${publication.id}`
      );
      if (
        current.state === "published" &&
        current.syncState === "synced" &&
        current.remoteShareUrl
      )
        break;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    if (!current.remoteShareUrl)
      throw new Error(`${target.name} 没有生成 Vercel 分享链接`);

    const viewer = await browser.newPage();
    const errors: string[] = [];
    viewer.on("pageerror", error => errors.push(String(error)));
    await viewer.goto(current.remoteShareUrl, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await viewer.getByRole("heading", { name: target.name }).waitFor();
    const downloadControls = await viewer
      .getByRole("button", { name: /下载/u })
      .count();
    const downloadAttributes = await viewer.locator("[download]").count();
    const fileFrames = await viewer
      .locator('iframe[title*="在线查看"]')
      .count();
    const commentButtons = await viewer
      .getByRole("button", { name: "发布批注" })
      .count();
    results.push({
      name: target.name,
      shareMode: target.shareMode,
      annotationEnabled: target.annotationEnabled,
      shareUrl: current.remoteShareUrl,
      downloadControls,
      downloadAttributes,
      fileFrames,
      commentButtons,
      errors,
    });
    await viewer.close();
  }

  const ok = results.every(
    item =>
      item.downloadControls === 0 &&
      item.downloadAttributes === 0 &&
      item.fileFrames === (item.shareMode === "selected_files" ? 1 : 0) &&
      item.commentButtons === (item.annotationEnabled ? 1 : 0) &&
      item.errors.length === 0
  );
  console.log(JSON.stringify({ ok, results }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  await browser.close();
}
