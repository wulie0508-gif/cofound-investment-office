import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getCleanTechEnhancementStatus,
  runCleanTechFinancialEvidenceAudit,
  runCleanTechPolicyMatch,
  runCleanTechProjectOpportunityMatch,
} from "./cleantech-runtime";

const originalRoot = process.env.COF_CLEANTECH_RELEASE_ROOT;
const originalPython = process.env.COF_CLEANTECH_PYTHON;
const originalFeishuReady = process.env.COF_CLEANTECH_FEISHU_READY;
const originalPolicyConfig = process.env.COF_POLICY_BASE_CONFIG;
const originalProjectConfig = process.env.COF_PROJECT_BASE_CONFIG;
let temporaryDirectory = "";

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cofound-cleantech-runtime-")
  );
  delete process.env.COF_CLEANTECH_RELEASE_ROOT;
  delete process.env.COF_CLEANTECH_PYTHON;
  delete process.env.COF_CLEANTECH_FEISHU_READY;
  delete process.env.COF_POLICY_BASE_CONFIG;
  delete process.env.COF_PROJECT_BASE_CONFIG;
});

afterEach(() => {
  if (originalRoot === undefined) delete process.env.COF_CLEANTECH_RELEASE_ROOT;
  else process.env.COF_CLEANTECH_RELEASE_ROOT = originalRoot;
  if (originalPython === undefined) delete process.env.COF_CLEANTECH_PYTHON;
  else process.env.COF_CLEANTECH_PYTHON = originalPython;
  if (originalFeishuReady === undefined)
    delete process.env.COF_CLEANTECH_FEISHU_READY;
  else process.env.COF_CLEANTECH_FEISHU_READY = originalFeishuReady;
  if (originalPolicyConfig === undefined)
    delete process.env.COF_POLICY_BASE_CONFIG;
  else process.env.COF_POLICY_BASE_CONFIG = originalPolicyConfig;
  if (originalProjectConfig === undefined)
    delete process.env.COF_PROJECT_BASE_CONFIG;
  else process.env.COF_PROJECT_BASE_CONFIG = originalProjectConfig;
  const resolved = path.resolve(temporaryDirectory);
  if (
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
    path.basename(resolved).startsWith("cofound-cleantech-runtime-")
  )
    fs.rmSync(resolved, { recursive: true, force: true });
});

function prepareFakeRelease() {
  const moduleDirectory = path.join(
    temporaryDirectory,
    "src",
    "cleantech_finance"
  );
  fs.mkdirSync(moduleDirectory, { recursive: true });
  for (const fileName of [
    "audit.py",
    "cli.py",
    "feishu_readonly_adapter.py",
    "shanghai_policy_gateway.py",
    "project_opportunity_gateway.py",
  ])
    fs.writeFileSync(path.join(moduleDirectory, fileName), "# fixture\n");
  fs.writeFileSync(
    path.join(temporaryDirectory, "RELEASE-MANIFEST.json"),
    JSON.stringify({ version: "0.5.0-test" })
  );
  process.env.COF_CLEANTECH_RELEASE_ROOT = temporaryDirectory;
  process.env.COF_CLEANTECH_PYTHON = process.execPath;
  const policyConfig = path.join(temporaryDirectory, "policy-config.json");
  const projectConfig = path.join(temporaryDirectory, "project-config.json");
  fs.writeFileSync(policyConfig, "{}\n");
  fs.writeFileSync(projectConfig, "{}\n");
  process.env.COF_POLICY_BASE_CONFIG = policyConfig;
  process.env.COF_PROJECT_BASE_CONFIG = projectConfig;
}

describe("optional CleanTech runtime boundary", () => {
  it("keeps every enhancement unavailable without a frozen release", () => {
    const status = getCleanTechEnhancementStatus();
    expect(status.runtime.configured).toBe(false);
    expect(status.capabilities.financialEvidenceAudit.status).toBe(
      "unavailable_runtime"
    );
    expect(status.capabilities.policyReferenceMatch.status).toBe(
      "unavailable_runtime"
    );
    expect(status.boundaries.feishuReadPerformed).toBe(false);
    expect(status.boundaries.feishuWritePerformed).toBe(false);
  });

  it("separates local finance readiness from Feishu user authentication", () => {
    prepareFakeRelease();
    const beforeAuthentication = getCleanTechEnhancementStatus();
    expect(beforeAuthentication.runtime.releaseVersion).toBe("0.5.0-test");
    expect(
      beforeAuthentication.capabilities.financialEvidenceAudit.status
    ).toBe("ready");
    expect(beforeAuthentication.capabilities.policyReferenceMatch.status).toBe(
      "unavailable_auth_required"
    );

    process.env.COF_CLEANTECH_FEISHU_READY = "1";
    const afterAcceptance = getCleanTechEnhancementStatus();
    expect(afterAcceptance.capabilities.policyReferenceMatch.status).toBe(
      "ready"
    );
    expect(afterAcceptance.capabilities.projectOpportunityMatch.status).toBe(
      "ready"
    );
  });

  it("fails closed instead of falling back to a mutable or system runtime", async () => {
    await expect(
      runCleanTechFinancialEvidenceAudit({
        projectId: "p_test",
        manifestPath: path.join(temporaryDirectory, "manifest.json"),
        requestedBy: "Cassian",
        outputRoot: path.join(temporaryDirectory, "outputs"),
      })
    ).rejects.toThrow("不可变的 CleanTech 发布版");
  });

  it("returns not_applicable without reading Feishu or requiring a runtime", async () => {
    await expect(
      runCleanTechPolicyMatch({
        projectId: "p_non_energy",
        requestedBy: "Test operator",
        cleanEnergyApplicable: false,
        profileTags: {},
      })
    ).resolves.toMatchObject({
      status: "not_applicable",
      boundaries: {
        feishu_read_performed: false,
        feishu_write_performed: false,
      },
    });
    await expect(
      runCleanTechProjectOpportunityMatch({
        projectId: "p_non_energy",
        requestedBy: "Test operator",
        cleanEnergyApplicable: false,
        profileTags: {},
      })
    ).resolves.toMatchObject({
      status: "not_applicable",
      boundaries: {
        feishu_read_performed: false,
        feishu_write_performed: false,
      },
    });
  });

  it("fails closed when the Feishu catalog was not accepted", async () => {
    prepareFakeRelease();
    await expect(
      runCleanTechPolicyMatch({
        projectId: "p_energy",
        requestedBy: "Test operator",
        cleanEnergyApplicable: true,
        profileTags: { geography: ["上海"], technology: ["储能"] },
      })
    ).rejects.toThrow("尚未完成用户认证与数据治理验收");
  });
});
