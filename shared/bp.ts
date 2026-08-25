export const FUNDING_ROUNDS = ["天使", "Pre-A", "A", "A+"] as const;

export const ANALYSIS_STATUSES = [
  "新导入",
  "已解析",
  "已完成初筛",
  "信息不足",
  "已有商业信号",
  "商业信号较强",
  "高风险待核实",
] as const;

export const MANAGEMENT_DECISIONS = [
  "待判断",
  "继续了解",
  "补充材料",
  "安排沟通",
  "进入尽调",
  "持续跟踪",
  "暂不推进",
  "已投资",
  "归档",
] as const;

export const LEGACY_PROJECT_STATUSES = [
  "建议继续接触",
  "建议约谈",
  "建议尽调",
  "持续观察",
  "暂缓",
] as const;

export const PROJECT_STATUSES = [
  ...ANALYSIS_STATUSES,
  ...MANAGEMENT_DECISIONS,
  ...LEGACY_PROJECT_STATUSES,
] as const;

export const INDUSTRY_CATEGORIES = [
  "人工智能与数据",
  "企业服务与 SaaS",
  "先进制造与工业科技",
  "机器人与自动化",
  "半导体与硬科技",
  "新能源与气候科技",
  "汽车与出行",
  "医疗健康",
  "消费与零售",
  "金融科技",
  "物流与供应链",
  "教育科技",
  "内容、文娱与社交",
  "农业与食品科技",
  "其他",
] as const;

const industryRules: Array<{
  category: (typeof INDUSTRY_CATEGORIES)[number];
  pattern: RegExp;
}> = [
  {
    category: "机器人与自动化",
    pattern: /机器人|自动化|无人机|具身智能|机器视觉/iu,
  },
  {
    category: "半导体与硬科技",
    pattern: /半导体|芯片|集成电路|光电|量子|新材料/iu,
  },
  {
    category: "新能源与气候科技",
    pattern:
      /新能源|储能|光伏|风电|氢能|双碳|清洁能源|气候|碳管理|节能|能效|能源数字化|能源管理|电力|电网/iu,
  },
  { category: "医疗健康", pattern: /医疗|医药|生物|诊断|医院|健康|生命科学/iu },
  {
    category: "先进制造与工业科技",
    pattern: /先进制造|智能制造|工业软件|工业科技|高端装备|工厂|制造/iu,
  },
  {
    category: "人工智能与数据",
    pattern: /人工智能|\bAI\b|大模型|机器学习|数据智能|计算机视觉/iu,
  },
  {
    category: "企业服务与 SaaS",
    pattern: /企业服务|SaaS|协同办公|人力资源|营销科技|财税|法务科技/iu,
  },
  { category: "汽车与出行", pattern: /汽车|出行|车联网|自动驾驶|交通科技/iu },
  {
    category: "消费与零售",
    pattern: /消费|零售|电商|品牌|智能硬件|美妆|家居|宠物/iu,
  },
  {
    category: "金融科技",
    pattern: /金融科技|支付|保险科技|财富管理|证券|银行科技/iu,
  },
  { category: "物流与供应链", pattern: /物流|供应链|仓储|货运|航运/iu },
  { category: "教育科技", pattern: /教育|培训|学习平台|职业教育/iu },
  { category: "内容、文娱与社交", pattern: /内容|文娱|游戏|社交|媒体|短剧/iu },
  { category: "农业与食品科技", pattern: /农业|食品科技|农产品|养殖|种植/iu },
];

export const SHARE_MODES = [
  "local_only",
  "fields_only",
  "selected_files",
] as const;
export const SYNC_STATES = [
  "local_only",
  "pending",
  "synced",
  "conflict",
  "error",
] as const;

export const MATERIAL_CATEGORIES = [
  "bp",
  "financial_model",
  "due_diligence",
  "company_legal",
  "contracts_orders",
  "product_material",
  "market_research",
  "meeting_notes",
  "other",
] as const;

export const MATERIAL_CATEGORY_LABELS: Record<
  (typeof MATERIAL_CATEGORIES)[number],
  string
> = {
  bp: "BP / 商业计划书",
  financial_model: "财务模型与预测",
  due_diligence: "尽调材料",
  company_legal: "公司与法律文件",
  contracts_orders: "合同、订单与客户证明",
  product_material: "产品与技术资料",
  market_research: "市场与行业资料",
  meeting_notes: "会议纪要",
  other: "其他资料",
};

export const CUSTOM_FIELD_TYPES = [
  "text",
  "number",
  "date",
  "boolean",
  "select",
] as const;

export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];
export type ManagementDecision = (typeof MANAGEMENT_DECISIONS)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type IndustryCategory = (typeof INDUSTRY_CATEGORIES)[number];
export type ShareMode = (typeof SHARE_MODES)[number];
export type SyncState = (typeof SYNC_STATES)[number];
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export type CustomFieldDefinition = {
  key: string;
  label: string;
  fieldType: CustomFieldType;
  options: string[];
  showInList: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectCustomField = CustomFieldDefinition & {
  value: unknown;
};

export function normalizeIndustryCategory(
  value: string | null | undefined
): IndustryCategory | null {
  if (!value?.trim()) return null;
  const exact = INDUSTRY_CATEGORIES.find(category => category === value.trim());
  if (exact) return exact;
  return (
    industryRules.find(rule => rule.pattern.test(value))?.category ?? "其他"
  );
}

export function normalizeManagementDecision(
  value: string | null | undefined
): ManagementDecision {
  const mapping: Record<string, ManagementDecision> = {
    新导入: "待判断",
    已解析: "待判断",
    已完成初筛: "待判断",
    信息不足: "补充材料",
    建议继续接触: "继续了解",
    建议约谈: "安排沟通",
    建议尽调: "进入尽调",
    持续观察: "持续跟踪",
    暂缓: "暂不推进",
    待判断: "待判断",
    继续了解: "继续了解",
    补充材料: "补充材料",
    安排沟通: "安排沟通",
    进入尽调: "进入尽调",
    持续跟踪: "持续跟踪",
    暂不推进: "暂不推进",
    已投资: "已投资",
    归档: "归档",
  };
  return mapping[value ?? ""] ?? "待判断";
}

export function normalizeAnalysisStatus(
  value: string | null | undefined
): AnalysisStatus {
  const mapping: Record<string, AnalysisStatus> = {
    新导入: "新导入",
    已解析: "已解析",
    已完成初筛: "已完成初筛",
    信息不足: "信息不足",
    已有商业信号: "已有商业信号",
    商业信号较强: "商业信号较强",
    高风险待核实: "高风险待核实",
    建议继续接触: "已有商业信号",
    建议约谈: "商业信号较强",
    建议尽调: "商业信号较强",
    持续观察: "已完成初筛",
    暂缓: "高风险待核实",
  };
  return mapping[value ?? ""] ?? "新导入";
}

export function projectStatusLabel(value: ProjectStatus | string) {
  const legacy: Record<string, string> = {
    建议继续接触: "已有商业信号",
    建议约谈: "商业信号较强",
    建议尽调: "商业信号较强",
    持续观察: "已完成初筛",
    暂缓: "高风险待核实",
  };
  return legacy[value] ?? value;
}

export type EvidenceFact = {
  value: string | number | boolean | null;
  raw: string | null;
  page: number | null;
  quote: string | null;
  confidence: number;
  verificationStatus?: "missing" | "confirmed" | "ambiguous";
  ambiguityReasons?: FactAmbiguityReason[];
  candidates?: FactCandidate[];
};

export type FactAmbiguityReason =
  | "multiple_values"
  | "missing_unit"
  | "unknown_currency"
  | "cross_page_fragment";

export type FactCandidate = {
  value: string | number | boolean;
  raw: string;
  page: number;
  quote: string;
};

export type AmbiguousFactIssue = {
  fieldKey: string;
  label: string;
  reasons: FactAmbiguityReason[];
  candidates: FactCandidate[];
};

export type AnalysisItem = {
  level: "low" | "medium" | "high";
  title: string;
  detail: string;
  evidencePages: number[];
  basis: "explicit" | "derived" | "missing_information";
};

export type CommercialCheck = {
  name: string;
  result: "pass" | "attention" | "unknown";
  detail: string;
  evidencePages: number[];
};

export type OptimizationRecommendation = {
  section: string;
  recommendation: string;
  reason: string;
  source: "codex_rule";
};

export type AnalysisPayload = {
  schemaVersion: "1.0" | "1.1";
  engine: "deterministic-local-v1";
  generatedAt: string;
  sourceFileId: string;
  summary: string;
  facts: Record<string, EvidenceFact>;
  tags: string[];
  risks: AnalysisItem[];
  missingInformation: string[];
  ambiguousInformation?: AmbiguousFactIssue[];
  commercialChecks: CommercialCheck[];
  aiStatus: AnalysisStatus;
};

export const CODEX_INVESTMENT_ANALYSIS_SKILLS = [
  "review-early-stage-investment",
  "assess-market-first",
  "assess-founder-first",
  "assess-long-term-value",
] as const;

export const CODEX_ANALYSIS_RUN_STATUSES = [
  "prepared",
  "completed",
  "stale",
  "failed",
] as const;

export const CODEX_ANALYSIS_TASK_MODES = [
  "auto",
  ...CODEX_INVESTMENT_ANALYSIS_SKILLS,
] as const;

export const CODEX_ANALYSIS_TASK_STATUSES = [
  "queued",
  "claimed",
  "analyzing",
  "completed",
  "failed",
  "superseded",
] as const;

export const CODEX_ANALYSIS_LAUNCHER_MODES = [
  "app_server",
  "desktop_fallback",
] as const;

export type CodexInvestmentAnalysisSkill =
  (typeof CODEX_INVESTMENT_ANALYSIS_SKILLS)[number];
export type CodexAnalysisRunStatus =
  (typeof CODEX_ANALYSIS_RUN_STATUSES)[number];
export type CodexAnalysisTaskMode = (typeof CODEX_ANALYSIS_TASK_MODES)[number];
export type CodexAnalysisTaskStatus =
  (typeof CODEX_ANALYSIS_TASK_STATUSES)[number];
export type CodexAnalysisLauncherMode =
  (typeof CODEX_ANALYSIS_LAUNCHER_MODES)[number];

export type CodexAnalysisTask = {
  id: string;
  projectId: string;
  sourceFileId: string;
  sourceFileVersion: number;
  projectLocalVersion: number;
  requestedBy: string;
  mode: CodexAnalysisTaskMode;
  userPrompt: string | null;
  status: CodexAnalysisTaskStatus;
  selectedSkill: CodexInvestmentAnalysisSkill | null;
  routerReason: string | null;
  runId: string | null;
  codexThreadId: string | null;
  codexTurnId: string | null;
  launcherMode: CodexAnalysisLauncherMode | null;
  launcherError: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  leaseExpiresAt: string | null;
  progressMessage: string | null;
  errorDetail: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type CodexAnalysisTaskClaim = {
  task: CodexAnalysisTask;
  claimToken: string;
};

export type CodexAnalysisTaskLaunchResult = {
  task: CodexAnalysisTask;
  reused: boolean;
  launch: {
    launched: boolean;
    mode: CodexAnalysisLauncherMode;
    error: string | null;
    recoverable: true;
  };
};

export type CodexAnalysisEvidenceRef = {
  fieldKey: string | null;
  page: number | null;
  quote: string | null;
};

export type CodexAnalysisClaim = {
  title: string;
  detail: string;
  basis: "evidence" | "inference" | "missing_information";
  evidence: CodexAnalysisEvidenceRef[];
};

export type CodexAnalysisFrameworkSection = {
  key: string;
  title: string;
  assessment: "supportive" | "mixed" | "concern" | "unknown";
  detail: string;
  evidence: CodexAnalysisEvidenceRef[];
  counterarguments: string[];
  unresolvedQuestions: string[];
};

export type CodexAnalysisRequestContext = {
  userPrompt: string | null;
};

export type CodexInvestmentAnalysisResult = {
  schemaVersion: "1.0";
  summary: string;
  positiveSignals: CodexAnalysisClaim[];
  keyRisks: CodexAnalysisClaim[];
  frameworkSections: CodexAnalysisFrameworkSection[];
  unresolvedQuestions: string[];
  nextActions: string[];
  aiSuggestion: AnalysisStatus;
  confidence: "low" | "medium" | "high";
};

export type CodexAnalysisFactSnapshot = {
  projectId: string;
  projectName: string;
  localVersion: number;
  sourceFile: {
    id: string;
    sha256: string;
    versionNumber: number;
  };
  facts: Array<{
    key: string;
    value: unknown;
    source: string;
    confidence: number;
    evidence: {
      page: number | null;
      quote: string | null;
      verificationStatus?: EvidenceFact["verificationStatus"];
      ambiguityReasons?: FactAmbiguityReason[];
      candidates?: FactCandidate[];
    } | null;
  }>;
  deterministicAnalysis: Pick<
    AnalysisPayload,
    | "schemaVersion"
    | "engine"
    | "summary"
    | "tags"
    | "risks"
    | "missingInformation"
    | "ambiguousInformation"
    | "commercialChecks"
    | "aiStatus"
  >;
};

export type CodexAnalysisRun = {
  id: string;
  projectId: string;
  sourceFileId: string;
  sourceFileSha256: string;
  projectLocalVersion: number;
  factSnapshotHash: string;
  skillName: CodexInvestmentAnalysisSkill;
  skillVersion: string;
  promptVersion: string;
  requestedBy: string;
  sourceTaskId: string | null;
  requestContext: CodexAnalysisRequestContext | null;
  modelName: string | null;
  status: CodexAnalysisRunStatus;
  result: CodexInvestmentAnalysisResult | null;
  errorDetail: string | null;
  createdAt: string;
  completedAt: string | null;
  staleAt: string | null;
  staleReason: string | null;
};

export type PreparedCodexAnalysisRun = CodexAnalysisRun & {
  factSnapshot: CodexAnalysisFactSnapshot;
};

export type ProjectListItem = {
  id: string;
  name: string;
  product: string | null;
  industry: string | null;
  fundingRound: string | null;
  fundingAmount: number | null;
  fundingCurrency: string;
  orderAmount: number | null;
  hasLoi: boolean;
  revenueAmount: number | null;
  grossMargin: number | null;
  runwayMonths: number | null;
  aiStatus: AnalysisStatus;
  managementStatus: ManagementDecision;
  statusLocked: boolean;
  analysisState: "pending" | "done" | "failed";
  tags: string[];
  importedAt: string;
  updatedAt: string;
  archivedAt: string | null;
  shareMode: ShareMode;
  syncState: SyncState;
  localVersion: number;
  remoteVersion: number;
  customFields: ProjectCustomField[];
};

export type ProjectMaterial = {
  id: string;
  projectId: string | null;
  suggestedProjectId: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  category: MaterialCategory;
  extractionStatus: "parsed" | "unsupported" | "failed";
  extractionError: string | null;
  pageCount: number;
  state: "pending" | "attached";
  createdAt: string;
  updatedAt: string;
  url: string;
};

export type ProjectFile = {
  id: string;
  projectId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  versionNumber: number;
  previousFileId: string | null;
  extractionStatus: "parsed" | "unsupported" | "failed";
  extractionError: string | null;
  pageCount: number;
  createdAt: string;
  shareMode: ShareMode;
  syncState: SyncState;
  localVersion: number;
  remoteVersion: number;
  url: string;
};

export type ProjectDetail = ProjectListItem & {
  description: string | null;
  customerSummary: string | null;
  monthlyBurn: number | null;
  teamSummary: string | null;
  businessModel: string | null;
  fundingUse: string | null;
  files: ProjectFile[];
  materials: ProjectMaterial[];
  analysis: AnalysisPayload | null;
  codexAnalyses: CodexAnalysisRun[];
  recommendations: OptimizationRecommendation[];
  fields: Array<{
    key: string;
    value: unknown;
    source: string;
    confidence: number;
    evidence: {
      page: number | null;
      quote: string | null;
      verificationStatus?: EvidenceFact["verificationStatus"];
      ambiguityReasons?: FactAmbiguityReason[];
      candidates?: FactCandidate[];
    } | null;
  }>;
  statusHistory: Array<{
    id: number;
    source: "system" | "ai" | "human";
    status: ProjectStatus;
    note: string | null;
    createdAt: string;
  }>;
};

export type ProjectFilters = {
  search?: string;
  industries?: string[];
  rounds?: string[];
  statuses?: ManagementDecision[];
  importedAfter?: string;
  importedBefore?: string;
  traction?: "orders" | "revenue" | "loi";
};

export type ImportResult = {
  projectId: string;
  fileId: string;
  duplicate: boolean;
  versionNumber: number;
  extractionStatus: ProjectFile["extractionStatus"];
  aiStatus: AnalysisStatus;
  restoredFromRecycleBin?: boolean;
};
