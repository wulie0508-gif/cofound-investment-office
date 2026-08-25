import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "playwright";

const baseUrl = process.env.COF_BP_UI_VERIFY_URL ?? "http://127.0.0.1:4010";
const localMode =
  new URL(baseUrl).hostname === "127.0.0.1" ||
  new URL(baseUrl).hostname === "localhost";
const artifacts = path.resolve("artifacts");
fs.mkdirSync(artifacts, { recursive: true });
const errors: string[] = [];

function axeDetails(result: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return result.violations.map(item => ({
    id: item.id,
    nodes: item.nodes.map(node => ({
      target: node.target,
      summary: node.failureSummary,
    })),
  }));
}

function watch(page: Page) {
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", error => errors.push(`page: ${String(error)}`));
  page.on("response", response => {
    if (response.status() >= 500)
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  watch(page);
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 45_000 });

  if (localMode) {
    await page.getByRole("heading", { name: "项目工作台" }).waitFor();
    const workspaceStatus = page.getByLabel("工作台时间与本地服务状态");
    await workspaceStatus.waitFor();
    const workspaceStatusOk =
      (await workspaceStatus.getByText("今日工作台").count()) === 1 &&
      (await workspaceStatus.getByText("本机数据").count()) === 1;
    const roundFilter = page.getByLabel("融资轮次");
    await roundFilter.selectOption({ label: "Pre-A" });
    await page.getByRole("button", { name: "查看结果" }).click();
    await page.waitForTimeout(350);
    const filteredRounds = await page
      .locator(
        'section[aria-labelledby="deal-list-title"] a[href^="/projects/"]'
      )
      .allTextContents();
    const roundFilterOk =
      filteredRounds.length > 0 &&
      filteredRounds.every(text => text.includes("Pre-A"));
    await page.getByLabel("管理判断").selectOption({ label: "补充材料" });
    await roundFilter.selectOption("");
    await page.getByRole("button", { name: "查看结果" }).click();
    await page.waitForTimeout(350);
    const filteredStatuses = await page
      .locator(
        'section[aria-labelledby="deal-list-title"] a[href^="/projects/"]'
      )
      .allTextContents();
    const statusFilterOk =
      filteredStatuses.length > 0 &&
      filteredStatuses.every(text => text.includes("补充材料"));
    await page.getByRole("button", { name: "重置" }).click();
    await page.waitForTimeout(350);
    await page.getByRole("button", { name: "本月" }).click();
    await page.waitForTimeout(350);
    const dateShortcutCount = await page
      .locator(
        'section[aria-labelledby="deal-list-title"] a[href^="/projects/"]'
      )
      .count();
    await page.getByRole("button", { name: "重置" }).click();
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(artifacts, "finance-dashboard-desktop.png"),
      fullPage: true,
    });
    const dashboardAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const firstProject = page
      .locator(
        'section[aria-labelledby="deal-list-title"] a[href^="/projects/"]'
      )
      .first();
    await firstProject.click();
    await page.waitForURL(/\/projects\//u);
    await page.getByText("事实底稿").waitFor();
    const projectPath = new URL(page.url()).pathname;
    await page.screenshot({
      path: path.join(artifacts, "finance-project-detail-desktop.png"),
      fullPage: true,
    });
    await page.goto(`${baseUrl}${projectPath}/analysis`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await page.getByRole("heading", { name: "Codex 投资分析" }).waitFor();
    await page.getByRole("radio", { name: /智能选择主框架/u }).waitFor();
    await page.getByRole("heading", { name: "已内置 10 个 Skill" }).waitFor();
    await page.getByText("$improve-investment-bp", { exact: true }).waitFor();
    await page.getByRole("radio", { name: /市场优先七维/u }).click();
    await page.getByText("赛道卡位", { exact: true }).waitFor();
    const analysisStudioAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await page.screenshot({
      path: path.join(artifacts, "finance-analysis-studio-desktop.png"),
      fullPage: true,
    });
    const localAdminSession = await page.request.post(
      `${baseUrl}/api/auth/local-admin`
    );
    if (!localAdminSession.ok()) {
      errors.push(
        `local admin bootstrap failed: ${localAdminSession.status()}`
      );
    }
    await page.goto(`${baseUrl}/collaboration`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await page.getByRole("heading", { name: "团队共享与外部发布" }).waitFor();
    await page.screenshot({
      path: path.join(artifacts, "finance-collaboration-desktop.png"),
      fullPage: true,
    });
    const shareConfigHref = await page
      .getByRole("link", { name: "调整权限" })
      .first()
      .getAttribute("href");
    if (!shareConfigHref) {
      errors.push("published project share configuration link is missing");
    } else {
      await page.goto(`${baseUrl}${shareConfigHref}`, {
        waitUntil: "networkidle",
        timeout: 45_000,
      });
      await page.getByRole("heading", { name: "字段级权限" }).waitFor();
      await page.getByText("链接 + 六位访问码", { exact: true }).waitFor();
      await page.screenshot({
        path: path.join(artifacts, "finance-share-config-desktop.png"),
        fullPage: true,
      });
    }

    await page.goto(`${baseUrl}/collaboration/annotations`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await page.getByRole("heading", { name: "批注收件箱" }).waitFor();
    const annotationsAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await page.screenshot({
      path: path.join(artifacts, "finance-annotation-inbox-desktop.png"),
      fullPage: true,
    });

    await page.goto(`${baseUrl}/demo/share`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await page
      .getByRole("heading", { name: "澄川储能科技（完全虚构）" })
      .waitFor();
    const shareDemoAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await page.screenshot({
      path: path.join(artifacts, "finance-share-demo-desktop.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: /三年财务模型 v2/u }).click();
    await page.getByRole("heading", { name: "模型口径" }).waitFor();
    const shareDemoFileSwitchOk =
      (await page.getByRole("heading", { name: "模型口径" }).count()) === 1;
    await page.getByRole("button", { name: "下一页" }).click();
    await page.getByRole("heading", { name: "收入结构" }).waitFor();
    await page.getByLabel("跳转页码").fill("10");
    await page.getByLabel("跳转页码").press("Enter");
    await page.getByRole("heading", { name: "三年预测" }).waitFor();
    const shareDemoPageNavigationOk =
      (await page.getByRole("heading", { name: "三年预测" }).count()) === 1;
    await page.getByRole("button", { name: /商业计划书 BP v3/u }).click();
    await page.getByRole("button", { name: "重新模拟访问码" }).click();
    await page.getByRole("heading", { name: "输入六位访问码" }).waitFor();
    await page.getByLabel("六位数字访问码").fill("284731");
    await page.getByRole("button", { name: "验证并打开项目" }).click();
    await page
      .getByRole("heading", { name: "澄川储能科技（完全虚构）" })
      .waitFor();

    await page.goto(`${baseUrl}/projects/new`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await page.getByRole("heading", { name: "微信项目资料收件箱" }).waitFor();
    await page.getByRole("heading", { name: "待归档资料" }).waitFor();
    const materialsAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await page.screenshot({
      path: path.join(artifacts, "finance-material-inbox-desktop.png"),
      fullPage: true,
    });

    await page.goto(`${baseUrl}/settings/fields`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await page.getByRole("heading", { name: "项目字段设置" }).waitFor();
    const fieldsAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await page.screenshot({
      path: path.join(artifacts, "finance-field-settings-desktop.png"),
      fullPage: true,
    });
    await page.goto(`${baseUrl}/settings`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await page.getByRole("heading", { name: /个人账户与设置/u }).waitFor();
    const languageSelectorHidden =
      (await page.getByRole("radio").count()) === 0;
    const settingsAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await page.screenshot({
      path: path.join(artifacts, "finance-account-settings-desktop.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 45_000 });
    await page.getByRole("heading", { name: "项目工作台" }).waitFor();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    );
    const overflowElements = await page.evaluate(() =>
      Array.from(document.querySelectorAll("body *"))
        .map(element => ({
          tag: element.tagName,
          className: element.getAttribute("class"),
          right: Math.round(element.getBoundingClientRect().right),
          width: Math.round(element.getBoundingClientRect().width),
        }))
        .filter(item => item.right > document.documentElement.clientWidth + 1)
        .slice(0, 8)
    );
    await page.screenshot({
      path: path.join(artifacts, "finance-dashboard-mobile.png"),
      fullPage: true,
    });
    await page.goto(`${baseUrl}/settings/fields`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await page.getByRole("heading", { name: "项目字段设置" }).waitFor();
    const fieldsMobileOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    );
    await page.goto(`${baseUrl}/settings`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await page.getByRole("heading", { name: /个人账户与设置/u }).waitFor();
    const settingsMobileOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    );
    await page.goto(`${baseUrl}/collaboration`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await page.getByRole("heading", { name: "团队共享与外部发布" }).waitFor();
    const collaborationMobileOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    );
    await page.goto(`${baseUrl}${projectPath}/analysis`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await page.getByRole("heading", { name: "Codex 投资分析" }).waitFor();
    const analysisStudioMobileOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    );
    let shareConfigMobileOverflow = false;
    if (shareConfigHref) {
      await page.goto(`${baseUrl}${shareConfigHref}`, {
        waitUntil: "networkidle",
        timeout: 45_000,
      });
      await page.getByRole("heading", { name: "字段级权限" }).waitFor();
      shareConfigMobileOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
      );
      await page.screenshot({
        path: path.join(artifacts, "finance-share-config-mobile.png"),
        fullPage: true,
      });
    }
    await page.goto(`${baseUrl}/demo/share`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await page
      .getByRole("heading", { name: "澄川储能科技（完全虚构）" })
      .waitFor();
    const shareDemoMobileOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    );
    await page.screenshot({
      path: path.join(artifacts, "finance-share-demo-mobile.png"),
      fullPage: true,
    });
    const loginContext = await browser.newContext({
      viewport: { width: 1100, height: 820 },
    });
    const loginPage = await loginContext.newPage();
    watch(loginPage);
    await loginPage.goto(`${baseUrl}/login`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    await loginPage.getByRole("heading", { name: /邮箱验证登录/u }).waitFor();
    const loginAxe = await new AxeBuilder({ page: loginPage })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await loginPage.screenshot({
      path: path.join(artifacts, "finance-login-desktop.png"),
      fullPage: true,
    });
    await loginContext.close();
    const report = {
      ok:
        !overflow &&
        !fieldsMobileOverflow &&
        !settingsMobileOverflow &&
        !collaborationMobileOverflow &&
        !analysisStudioMobileOverflow &&
        !shareConfigMobileOverflow &&
        !shareDemoMobileOverflow &&
        roundFilterOk &&
        statusFilterOk &&
        workspaceStatusOk &&
        dateShortcutCount > 0 &&
        languageSelectorHidden &&
        dashboardAxe.violations.length === 0 &&
        materialsAxe.violations.length === 0 &&
        fieldsAxe.violations.length === 0 &&
        settingsAxe.violations.length === 0 &&
        annotationsAxe.violations.length === 0 &&
        analysisStudioAxe.violations.length === 0 &&
        shareDemoAxe.violations.length === 0 &&
        shareDemoFileSwitchOk &&
        shareDemoPageNavigationOk &&
        loginAxe.violations.length === 0 &&
        errors.length === 0,
      target: "local",
      overflow,
      overflowElements,
      roundFilterOk,
      statusFilterOk,
      workspaceStatusOk,
      dateShortcutCount,
      languageSelectorHidden,
      axeViolations: axeDetails(dashboardAxe),
      materialsAxeViolations: axeDetails(materialsAxe),
      fieldsAxeViolations: axeDetails(fieldsAxe),
      settingsAxeViolations: axeDetails(settingsAxe),
      annotationsAxeViolations: axeDetails(annotationsAxe),
      analysisStudioAxeViolations: axeDetails(analysisStudioAxe),
      shareDemoAxeViolations: axeDetails(shareDemoAxe),
      shareDemoFileSwitchOk,
      shareDemoPageNavigationOk,
      loginAxeViolations: loginAxe.violations.map(item => ({
        id: item.id,
        targets: item.nodes.map(node => node.target),
      })),
      fieldsMobileOverflow,
      settingsMobileOverflow,
      collaborationMobileOverflow,
      analysisStudioMobileOverflow,
      shareConfigMobileOverflow,
      shareDemoMobileOverflow,
      errors,
    };
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } else {
    await page.getByRole("heading", { name: "单项目资料室" }).waitFor();
    const input = page.getByLabel("分享链接 / 访问码");
    await input.fill("invalid");
    await page.getByRole("button", { name: "验证并打开" }).click();
    await page.getByRole("alert").waitFor();
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await page.screenshot({
      path: path.join(artifacts, "finance-vercel-entry.png"),
      fullPage: true,
    });
    const report = {
      ok: axe.violations.length === 0 && errors.length === 0,
      target: baseUrl,
      axeViolations: axe.violations.map(item => item.id),
      errors,
    };
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  }
} finally {
  await browser.close();
}
