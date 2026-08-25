import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type BrowserContext, type Page } from "playwright";

const baseUrl = "http://127.0.0.1:4010";
const artifacts = path.resolve("artifacts");
fs.mkdirSync(artifacts, { recursive: true });
const email = "browser.demo@cofound.local";
const name = "浏览器演示访客";
const consoleErrors: string[] = [];

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

function watch(page: Page, label: string) {
  page.on("console", message => {
    if (message.type() === "error")
      consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on("pageerror", error =>
    consoleErrors.push(`${label}: ${String(error)}`)
  );
}

async function loginGuest(context: BrowserContext, _inviteUrl?: string) {
  const page = await context.newPage();
  watch(page, "guest");
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const requested = await api<{ previewCode: string | null }>(
    page,
    "/api/auth/email/request",
    { method: "POST", body: { email, name } }
  );
  if (!requested.previewCode)
    throw new Error(
      "Browser verification requires local-preview email OTP mode"
    );
  await api(page, "/api/auth/email/verify", {
    method: "POST",
    body: { email, token: requested.previewCode, name },
  });
  await page.goto(`${baseUrl}/portal`, { waitUntil: "networkidle" });
  return page;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});
try {
  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const admin = await adminContext.newPage();
  watch(admin, "admin");
  await admin.goto(baseUrl, { waitUntil: "networkidle" });
  await api(admin, "/api/auth/local-admin", { method: "POST" });
  await admin.goto(`${baseUrl}/collaboration`, { waitUntil: "networkidle" });
  await admin.getByRole("heading", { name: "团队共享与外部发布" }).waitFor();

  let users = await api<Array<{ id: string; email: string; state: string }>>(
    admin,
    "/api/collaboration/users"
  );
  let demoUser = users.find(user => user.email === email);
  let inviteUrl: string | undefined;
  if (!demoUser) {
    const invitation = await api<{ inviteUrl: string }>(
      admin,
      "/api/collaboration/invitations",
      { method: "POST", body: { email, name, role: "external" } }
    );
    inviteUrl = invitation.inviteUrl;
  } else if (demoUser.state !== "active") {
    await api(admin, `/api/collaboration/users/${demoUser.id}`, {
      method: "PATCH",
      body: { state: "active" },
    });
  }

  const guestContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  const guest = await loginGuest(guestContext, inviteUrl);
  users = await api(admin, "/api/collaboration/users");
  demoUser = users.find(user => user.email === email)!;

  const projects = await api<Array<{ id: string; fundingRound?: string }>>(
    admin,
    "/api/local/projects"
  );
  const targetProject =
    projects.find(item => item.fundingRound === "天使") ?? projects[0];
  const project = await api<{
    id: string;
    name: string;
    fields: Array<{ key: string; value: unknown }>;
    files: Array<{ id: string }>;
  }>(admin, `/api/local/projects/${targetProject.id}`);
  const publication = await api<{ id: string }>(
    admin,
    `/api/collaboration/projects/${project.id}/publication`,
    {
      method: "PUT",
      body: {
        shareMode: "selected_files",
        securityMode: "high_security",
        selectedFields: project.fields
          .filter(field => field.value !== null)
          .map(field => field.key),
        selectedFileIds: [project.files[0].id],
        expiresAt: null,
        members: [
          {
            userId: demoUser.id,
            canViewFields: true,
            canViewFiles: true,
            canRequestDownload: true,
          },
        ],
      },
    }
  );
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await api<{ state: string; syncState: string }>(
      admin,
      `/api/collaboration/publications/${publication.id}`
    );
    if (current.state === "published" && current.syncState === "synced") break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  await admin.goto(`${baseUrl}/collaboration`, { waitUntil: "networkidle" });
  await admin.screenshot({
    path: path.join(artifacts, "collaboration-admin-desktop.png"),
    fullPage: true,
  });
  const adminAxe = await new AxeBuilder({ page: admin })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  await admin.setViewportSize({ width: 320, height: 800 });
  await admin.goto(`${baseUrl}/collaboration/projects/${project.id}`, {
    waitUntil: "networkidle",
  });
  await admin
    .getByRole("heading", { name: new RegExp(`配置共享.*${project.name}`) })
    .waitFor();
  const adminOverflow = await admin.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  );
  await admin.screenshot({
    path: path.join(artifacts, "share-settings-narrow.png"),
    fullPage: true,
  });

  await guest.goto(`${baseUrl}/portal`, { waitUntil: "networkidle" });
  await guest.getByRole("heading", { name: "共享项目" }).waitFor();
  await guest.screenshot({
    path: path.join(artifacts, "portal-guest-desktop.png"),
    fullPage: true,
  });
  const portalAxe = await new AxeBuilder({ page: guest })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  await guest.getByRole("link", { name: new RegExp(project.name) }).click();
  await guest.getByRole("heading", { name: project.name }).waitFor();
  await guest.getByRole("button", { name: "受控查看" }).click();
  await guest.locator('img[alt*="已烧入访问者水印"]').first().waitFor();
  await guest.waitForFunction(() =>
    Array.from(document.images).some(
      image =>
        image.alt.includes("已烧入访问者水印") &&
        image.complete &&
        image.naturalWidth > 0
    )
  );
  await guest.screenshot({
    path: path.join(artifacts, "secure-file-viewer-desktop.png"),
    fullPage: true,
  });
  await guest.getByPlaceholder("订单、收入、客户…").fill("收入");
  await guest.getByRole("button", { name: "搜索" }).click();
  await guest
    .getByText(/段落|没有匹配结果/)
    .first()
    .waitFor();
  const downloadEntryCount = await guest
    .getByRole("button", { name: /申请下载|直接下载|生成一次性链接/ })
    .count();

  await guest.setViewportSize({ width: 320, height: 800 });
  await guest.goto(`${baseUrl}/portal`, { waitUntil: "networkidle" });
  const portalOverflow = await guest.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  );
  await guest.screenshot({
    path: path.join(artifacts, "portal-guest-narrow.png"),
    fullPage: true,
  });

  const report = {
    ok:
      downloadEntryCount === 0 &&
      !adminOverflow &&
      !portalOverflow &&
      consoleErrors.length === 0 &&
      adminAxe.violations.length === 0 &&
      portalAxe.violations.length === 0,
    project: project.name,
    publicationId: publication.id,
    adminOverflow,
    portalOverflow,
    downloadEntryCount,
    adminAxeViolations: adminAxe.violations.map(item => ({
      id: item.id,
      nodes: item.nodes.map(node => node.target),
    })),
    portalAxeViolations: portalAxe.violations.map(item => ({
      id: item.id,
      nodes: item.nodes.map(node => node.target),
    })),
    consoleErrors,
    screenshots: [
      "collaboration-admin-desktop.png",
      "share-settings-narrow.png",
      "portal-guest-desktop.png",
      "secure-file-viewer-desktop.png",
      "portal-guest-narrow.png",
    ],
  };
  await api(admin, `/api/collaboration/publications/${publication.id}/pause`, {
    method: "POST",
  });
  await api(admin, `/api/collaboration/users/${demoUser.id}`, {
    method: "PATCH",
    body: { state: "suspended" },
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await browser.close();
}
