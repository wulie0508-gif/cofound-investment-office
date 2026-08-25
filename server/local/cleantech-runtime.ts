import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type CleanTechCapabilityState =
  | "ready"
  | "unavailable_auth_required"
  | "unavailable_runtime";

type CleanTechRuntime = {
  configured: boolean;
  releaseRoot: string | null;
  releaseVersion: string | null;
  pythonPath: string | null;
  financeAuditReady: boolean;
  catalogMatchReady: boolean;
  reason: string | null;
};

export type CleanTechProfileTags = Partial<
  Record<
    "industry" | "stage" | "need" | "technology" | "geography" | "market",
    string[]
  >
>;

function readReleaseVersion(root: string) {
  const manifestPath = path.join(root, "RELEASE-MANIFEST.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf8")
    ) as Record<string, unknown>;
    for (const key of ["version", "release_version", "releaseVersion"])
      if (typeof manifest[key] === "string") return manifest[key] as string;
  } catch {
    return null;
  }
  return null;
}

function resolvePython(root: string) {
  const configured = process.env.COF_CLEANTECH_PYTHON?.trim();
  const candidates = [
    configured ? path.resolve(configured) : null,
    path.join(root, ".venv", "Scripts", "python.exe"),
    path.join(root, ".venv-new", "Scripts", "python.exe"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

export function inspectCleanTechRuntime(): CleanTechRuntime {
  const configuredRoot = process.env.COF_CLEANTECH_RELEASE_ROOT?.trim();
  if (!configuredRoot)
    return {
      configured: false,
      releaseRoot: null,
      releaseVersion: null,
      pythonPath: null,
      financeAuditReady: false,
      catalogMatchReady: false,
      reason: "尚未配置不可变的 CleanTech 发布版",
    };
  const root = path.resolve(configuredRoot);
  const modulePath = path.join(root, "src", "cleantech_finance", "audit.py");
  if (!fs.existsSync(modulePath))
    return {
      configured: true,
      releaseRoot: root,
      releaseVersion: readReleaseVersion(root),
      pythonPath: null,
      financeAuditReady: false,
      catalogMatchReady: false,
      reason: "CleanTech 发布版缺少财务审计模块",
    };
  const pythonPath = resolvePython(root);
  const catalogModules = [
    "cli.py",
    "feishu_readonly_adapter.py",
    "shanghai_policy_gateway.py",
    "project_opportunity_gateway.py",
  ];
  const catalogMatchReady =
    Boolean(pythonPath) &&
    catalogModules.every(fileName =>
      fs.existsSync(path.join(root, "src", "cleantech_finance", fileName))
    );
  return {
    configured: true,
    releaseRoot: root,
    releaseVersion: readReleaseVersion(root),
    pythonPath,
    financeAuditReady: Boolean(pythonPath),
    catalogMatchReady,
    reason: pythonPath ? null : "CleanTech 发布版尚未配置独立 Python 运行时",
  };
}

export function getCleanTechEnhancementStatus() {
  const runtime = inspectCleanTechRuntime();
  const accepted = process.env.COF_CLEANTECH_FEISHU_READY === "1";
  const configExists = (name: string) => {
    const configured = process.env[name]?.trim();
    if (!configured) return false;
    const absolute = path.resolve(configured);
    return fs.existsSync(absolute) && fs.statSync(absolute).isFile();
  };
  const catalogStatus = (configName: string): CleanTechCapabilityState => {
    if (!runtime.catalogMatchReady || !configExists(configName))
      return "unavailable_runtime";
    return accepted ? "ready" : "unavailable_auth_required";
  };
  const policyStatus = catalogStatus("COF_POLICY_BASE_CONFIG");
  const projectStatus = catalogStatus("COF_PROJECT_BASE_CONFIG");
  return {
    provider: "cleantech-finance-sidecar",
    authority: "CleanTech Finance rules remain authoritative",
    runtime: {
      configured: runtime.configured,
      releaseVersion: runtime.releaseVersion,
      financeAuditReady: runtime.financeAuditReady,
      reason: runtime.reason,
    },
    capabilities: {
      financialEvidenceAudit: {
        status: (runtime.financeAuditReady
          ? "ready"
          : "unavailable_runtime") as CleanTechCapabilityState,
        validatedDimensions: ["profitability-unit-economics", "cash-runway"],
        networkRequired: false,
      },
      policyReferenceMatch: {
        status: policyStatus,
        catalog: "飞书政策主库（上海为主，含欧洲与东南亚）",
        configPresent: configExists("COF_POLICY_BASE_CONFIG"),
        acceptanceConfirmed: accepted,
        writeEnabled: false,
      },
      projectOpportunityMatch: {
        status: projectStatus,
        catalog: "飞书项目需求库（由欧洲与巴西公开 API 管线维护）",
        configPresent: configExists("COF_PROJECT_BASE_CONFIG"),
        acceptanceConfirmed: accepted,
        writeEnabled: false,
      },
    },
    boundaries: {
      cofoundRemainsProjectAuthority: true,
      cleanTechRulesCopiedIntoCofound: false,
      feishuReadPerformed: false,
      feishuWritePerformed: false,
      automaticExecution: false,
    },
  };
}

function validateOfflineManifest(manifestPath: string) {
  const absolute = path.resolve(manifestPath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile())
    throw new Error("CleanTech manifest 不存在");
  const payload = JSON.parse(fs.readFileSync(absolute, "utf8")) as {
    sources?: Array<{ path?: unknown }>;
  };
  if (!Array.isArray(payload.sources) || payload.sources.length === 0)
    throw new Error("CleanTech manifest 必须包含本地 sources");
  for (const source of payload.sources) {
    if (typeof source.path !== "string" || !source.path.trim())
      throw new Error("离线财务审计要求每个 source 都提供本地 path");
    const sourcePath = path.resolve(path.dirname(absolute), source.path);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile())
      throw new Error(`CleanTech 本地证据文件不存在：${source.path}`);
  }
  return absolute;
}

function runProcess(
  executable: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    stdin?: string;
    timeoutMessage?: string;
  }
) {
  return new Promise<{ exitCode: number; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(executable, args, {
        cwd: options.cwd,
        env: options.env,
        windowsHide: true,
        stdio: [
          options.stdin === undefined ? "ignore" : "pipe",
          "pipe",
          "pipe",
        ],
      });
      let stdout = "";
      let stderr = "";
      const maxCharacters = 5_000_000;
      const append = (current: string, chunk: Buffer) =>
        (current + chunk.toString("utf8")).slice(0, maxCharacters);
      child.stdout!.on("data", chunk => {
        stdout = append(stdout, chunk as Buffer);
      });
      child.stderr!.on("data", chunk => {
        stderr = append(stderr, chunk as Buffer);
      });
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(options.timeoutMessage ?? "CleanTech 任务运行超时"));
      }, options.timeoutMs);
      child.once("error", error => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("close", code => {
        clearTimeout(timeout);
        resolve({ exitCode: code ?? -1, stdout, stderr });
      });
      if (options.stdin !== undefined) child.stdin!.end(options.stdin, "utf8");
    }
  );
}

const POLICY_PROFILE_DIMENSIONS = [
  "industry",
  "stage",
  "need",
  "technology",
  "geography",
  "market",
] as const;

const PROJECT_PROFILE_DIMENSIONS = [
  "industry",
  "need",
  "technology",
  "geography",
  "market",
] as const;

function normalizeProfileTags(
  value: CleanTechProfileTags,
  allowedDimensions: readonly string[]
) {
  const unknownKeys = Object.keys(value).filter(
    key => !allowedDimensions.includes(key)
  );
  if (unknownKeys.length > 0)
    throw new Error(`CleanTech 查询包含未允许字段：${unknownKeys.join("、")}`);
  const normalized: Record<string, string[]> = {};
  for (const dimension of allowedDimensions) {
    const tags = value[dimension as keyof CleanTechProfileTags];
    if (tags === undefined) continue;
    if (!Array.isArray(tags) || tags.length > 20)
      throw new Error(`CleanTech 查询字段 ${dimension} 最多允许 20 个标签`);
    const safeTags = tags.map(tag => {
      if (typeof tag !== "string")
        throw new Error(`CleanTech 查询字段 ${dimension} 只能包含文本标签`);
      const normalizedTag = tag.trim();
      if (!normalizedTag || normalizedTag.length > 80)
        throw new Error(`CleanTech 查询字段 ${dimension} 包含空值或过长标签`);
      return normalizedTag;
    });
    if (safeTags.length > 0) normalized[dimension] = [...new Set(safeTags)];
  }
  return normalized;
}

function validateAsOf(asOf: string | undefined) {
  if (asOf === undefined) return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(asOf))
    throw new Error("CleanTech 查询日期必须使用 YYYY-MM-DD");
  return asOf;
}

function resolveCatalogConfig(environmentName: string, label: string) {
  const configured = process.env[environmentName]?.trim();
  if (!configured) throw new Error(`${label}尚未配置`);
  const absolute = path.resolve(configured);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile())
    throw new Error(`${label}不存在`);
  return absolute;
}

async function runCleanTechCatalogCommand(input: {
  projectId: string;
  requestedBy: string;
  cleanEnergyApplicable: boolean;
  profileTags: CleanTechProfileTags;
  asOf?: string;
  capability: "policy" | "project";
}) {
  if (!input.cleanEnergyApplicable)
    return {
      contract_version:
        input.capability === "policy"
          ? "cleantech-shanghai-policy/v1"
          : "cleantech-project-opportunity/v1",
      capability:
        input.capability === "policy"
          ? "shanghai_policy_match"
          : "project_opportunity_match",
      status: "not_applicable",
      applicability: "not_applicable",
      project_id: input.projectId,
      boundaries: {
        feishu_read_performed: false,
        feishu_write_performed: false,
        automatic_execution: false,
      },
    };

  const runtime = inspectCleanTechRuntime();
  if (!runtime.releaseRoot || !runtime.pythonPath || !runtime.catalogMatchReady)
    throw new Error(runtime.reason ?? "CleanTech 飞书匹配运行时不可用");
  if (process.env.COF_CLEANTECH_FEISHU_READY !== "1")
    throw new Error("CleanTech 飞书只读匹配尚未完成用户认证与数据治理验收");

  const policyMatch = input.capability === "policy";
  const profileTags = normalizeProfileTags(
    input.profileTags,
    policyMatch ? POLICY_PROFILE_DIMENSIONS : PROJECT_PROFILE_DIMENSIONS
  );
  const asOf = validateAsOf(input.asOf);
  const baseConfig = resolveCatalogConfig(
    policyMatch ? "COF_POLICY_BASE_CONFIG" : "COF_PROJECT_BASE_CONFIG",
    policyMatch ? "CleanTech 政策库配置" : "CleanTech 项目机会库配置"
  );
  const args = [
    "-m",
    "cleantech_finance.cli",
    policyMatch ? "policy" : "project",
    "match-feishu",
    "-",
    "--base-config",
    baseConfig,
  ];
  if (policyMatch)
    args.push("--attested-by", input.requestedBy.trim() || "Cofound operator");
  args.push("--as-of", asOf);

  const result = await runProcess(runtime.pythonPath, args, {
    cwd: runtime.releaseRoot,
    env: {
      ...process.env,
      PYTHONPATH: path.join(runtime.releaseRoot, "src"),
    },
    timeoutMs: 3 * 60_000,
    timeoutMessage: policyMatch
      ? "CleanTech 政策匹配运行超时"
      : "CleanTech 项目机会匹配运行超时",
    stdin: JSON.stringify({
      clean_energy_applicable: true,
      profile_tags: profileTags,
    }),
  });
  let payload: unknown = null;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    payload = null;
  }
  if (result.exitCode !== 0 || payload === null)
    throw new Error(
      `CleanTech ${policyMatch ? "政策" : "项目机会"}匹配失败（exit ${result.exitCode}）：${result.stderr.slice(0, 1_000)}`
    );
  if (typeof payload !== "object" || Array.isArray(payload))
    throw new Error("CleanTech 匹配返回了无效的结构化结果");
  return {
    ...(payload as Record<string, unknown>),
    cofound_context: {
      project_id: input.projectId,
      requested_by: input.requestedBy,
      provider_release_version: runtime.releaseVersion,
      query_dimensions: Object.keys(profileTags),
    },
  };
}

export function runCleanTechPolicyMatch(input: {
  projectId: string;
  requestedBy: string;
  cleanEnergyApplicable: boolean;
  profileTags: CleanTechProfileTags;
  asOf?: string;
}) {
  return runCleanTechCatalogCommand({ ...input, capability: "policy" });
}

export function runCleanTechProjectOpportunityMatch(input: {
  projectId: string;
  requestedBy: string;
  cleanEnergyApplicable: boolean;
  profileTags: CleanTechProfileTags;
  asOf?: string;
}) {
  return runCleanTechCatalogCommand({ ...input, capability: "project" });
}

export async function runCleanTechFinancialEvidenceAudit(input: {
  projectId: string;
  manifestPath: string;
  requestedBy: string;
  outputRoot: string;
}) {
  const runtime = inspectCleanTechRuntime();
  if (!runtime.financeAuditReady || !runtime.releaseRoot || !runtime.pythonPath)
    throw new Error(runtime.reason ?? "CleanTech 财务审计运行时不可用");
  const manifestPath = validateOfflineManifest(input.manifestPath);
  const safeProjectId = input.projectId.replace(/[^a-zA-Z0-9_-]/gu, "_");
  const runId = `ct_fin_${Date.now()}`;
  const outputDirectory = path.resolve(input.outputRoot, safeProjectId, runId);
  const resolvedOutputRoot = path.resolve(input.outputRoot);
  if (!outputDirectory.startsWith(resolvedOutputRoot + path.sep))
    throw new Error("CleanTech 输出目录越界");
  fs.mkdirSync(outputDirectory, { recursive: true });

  const result = await runProcess(
    runtime.pythonPath,
    [
      "-m",
      "cleantech_finance",
      "audit",
      manifestPath,
      "--only",
      "profitability-unit-economics",
      "cash-runway",
      "--out",
      outputDirectory,
    ],
    {
      cwd: runtime.releaseRoot,
      env: {
        ...process.env,
        PYTHONPATH: path.join(runtime.releaseRoot, "src"),
      },
      timeoutMs: 5 * 60_000,
    }
  );
  let payload: unknown = null;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    payload = null;
  }
  if (![0, 2].includes(result.exitCode) || payload === null)
    throw new Error(
      `CleanTech 财务审计失败（exit ${result.exitCode}）：${result.stderr.slice(0, 1_000)}`
    );
  return {
    runId,
    projectId: input.projectId,
    requestedBy: input.requestedBy,
    providerReleaseVersion: runtime.releaseVersion,
    status: result.exitCode === 0 ? "succeeded" : "failed_validation",
    validatedDimensions: ["profitability-unit-economics", "cash-runway"],
    result: payload,
    boundaries: {
      offlineDeterministic: true,
      modelCalls: 0,
      feishuReadPerformed: false,
      feishuWritePerformed: false,
      investmentRatingProduced: false,
      managementStatusChanged: false,
    },
  };
}
