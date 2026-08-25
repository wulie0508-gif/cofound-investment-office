import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import type {
  AnalysisPayload,
  CodexAnalysisFactSnapshot,
  CodexAnalysisLauncherMode,
  CodexAnalysisRequestContext,
  CodexAnalysisRun,
  CodexAnalysisTask,
  CodexAnalysisTaskClaim,
  CodexAnalysisTaskMode,
  CodexInvestmentAnalysisResult,
  CodexInvestmentAnalysisSkill,
  CustomFieldDefinition,
  CustomFieldType,
  ManagementDecision,
  MaterialCategory,
  OptimizationRecommendation,
  ProjectDetail,
  ProjectFilters,
  ProjectListItem,
  ProjectStatus,
  PreparedCodexAnalysisRun,
  ShareMode,
} from "../../shared/bp";
import {
  CODEX_ANALYSIS_TASK_MODES,
  CODEX_INVESTMENT_ANALYSIS_SKILLS,
  INDUSTRY_CATEGORIES,
  normalizeAnalysisStatus,
  normalizeIndustryCategory,
  normalizeManagementDecision,
} from "../../shared/bp";
import { codexInvestmentAnalysisResultSchema } from "./codex-analysis-schema";

type ProjectRow = Record<string, unknown>;
type SQLInputValue = string | number | bigint | null | Uint8Array;

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite"
) as typeof import("node:sqlite");

const now = () => new Date().toISOString();
const CODEX_ANALYSIS_SKILL_VERSION = "1.0.0";
const CODEX_ANALYSIS_PROMPT_VERSION = "cofound-investment-analysis/v2-adaptive";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  return value;
}

function stableJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

function sha256Json(value: unknown) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function normalizeAnalysisBrief(value: string | null | undefined) {
  if (value === null || value === undefined) return null;
  const normalized = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return null;
  if (normalized.length > 1_200)
    throw new Error("分析需求不能超过 1200 个字符");
  return normalized;
}

function normalizeAnalysisRequestContext(input: {
  userPrompt?: string | null;
}): CodexAnalysisRequestContext {
  return {
    userPrompt: normalizeAnalysisBrief(input.userPrompt),
  };
}

const DEFAULT_FIELD_DEFINITIONS = [
  {
    key: "default_project_source",
    label: "项目来源",
    fieldType: "select",
    options: [
      "创始人直投",
      "内部推荐",
      "FA 推荐",
      "机构转介",
      "活动接触",
      "其他",
    ],
    showInList: false,
  },
  {
    key: "default_owner",
    label: "项目负责人",
    fieldType: "text",
    options: [],
    showInList: true,
  },
  {
    key: "default_priority",
    label: "内部优先级",
    fieldType: "select",
    options: ["高", "中", "低"],
    showInList: true,
  },
  {
    key: "default_location",
    label: "项目所在地",
    fieldType: "text",
    options: [],
    showInList: false,
  },
  {
    key: "default_referrer",
    label: "引荐人 / 联系人",
    fieldType: "text",
    options: [],
    showInList: false,
  },
  {
    key: "default_next_action",
    label: "下一步动作",
    fieldType: "text",
    options: [],
    showInList: false,
  },
  {
    key: "default_follow_up_date",
    label: "下次跟进日期",
    fieldType: "date",
    options: [],
    showInList: true,
  },
  {
    key: "default_planned_investment",
    label: "计划投资金额（万元）",
    fieldType: "number",
    options: [],
    showInList: false,
  },
  {
    key: "default_coinvestors",
    label: "联合投资方",
    fieldType: "text",
    options: [],
    showInList: false,
  },
  {
    key: "default_internal_note",
    label: "内部备注",
    fieldType: "text",
    options: [],
    showInList: false,
  },
] as const;

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toProjectListItem(row: ProjectRow): ProjectListItem {
  return {
    id: String(row.id),
    name: String(row.name),
    product: typeof row.product === "string" ? row.product : null,
    industry: normalizeIndustryCategory(
      typeof row.industry === "string" ? row.industry : null
    ),
    fundingRound:
      typeof row.funding_round === "string" ? row.funding_round : null,
    fundingAmount: toNullableNumber(row.funding_amount),
    fundingCurrency: String(row.funding_currency ?? "CNY"),
    orderAmount: toNullableNumber(row.order_amount),
    hasLoi: Boolean(row.has_loi),
    revenueAmount: toNullableNumber(row.revenue_amount),
    grossMargin: toNullableNumber(row.gross_margin),
    runwayMonths: toNullableNumber(row.runway_months),
    aiStatus: normalizeAnalysisStatus(String(row.ai_status)),
    managementStatus: normalizeManagementDecision(
      String(row.management_status)
    ),
    statusLocked: Boolean(row.status_locked),
    analysisState: String(
      row.analysis_state
    ) as ProjectListItem["analysisState"],
    tags: parseJson<string[]>(row.tags_json, []),
    importedAt: String(row.imported_at),
    updatedAt: String(row.updated_at),
    archivedAt: typeof row.archived_at === "string" ? row.archived_at : null,
    shareMode: String(row.share_mode) as ProjectListItem["shareMode"],
    syncState: String(row.sync_state) as ProjectListItem["syncState"],
    localVersion: Number(row.local_version ?? 1),
    remoteVersion: Number(row.remote_version ?? 0),
    customFields: [],
  };
}

function ftsQuery(search: string) {
  return search
    .trim()
    .split(/\s+/u)
    .map(part => part.replace(/["*:^(){}\[\]]/g, "").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map(part => `"${part}"*`)
    .join(" AND ");
}

export type LocalDatabaseOptions = {
  dataDir?: string;
  dbPath?: string;
};

export class LocalDatabase {
  readonly dataDir: string;
  readonly filesDir: string;
  readonly dbPath: string;
  readonly connection: InstanceType<typeof DatabaseSync>;

  constructor(options: LocalDatabaseOptions = {}) {
    this.dataDir = path.resolve(
      options.dataDir ??
        process.env.COF_BP_DATA_DIR ??
        path.join(process.cwd(), "data")
    );
    this.filesDir = path.join(this.dataDir, "files");
    this.dbPath =
      options.dbPath ?? path.join(this.dataDir, "cofound-bp-desk.sqlite");
    fs.mkdirSync(this.filesDir, { recursive: true });
    this.connection = new DatabaseSync(this.dbPath);
    this.connection.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;"
    );
    this.migrate();
  }

  close() {
    this.connection.close();
  }

  private migrate() {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL,
        product TEXT,
        industry TEXT,
        funding_round TEXT,
        funding_amount REAL,
        funding_currency TEXT NOT NULL DEFAULT 'CNY',
        order_amount REAL,
        order_currency TEXT NOT NULL DEFAULT 'CNY',
        has_loi INTEGER NOT NULL DEFAULT 0,
        revenue_amount REAL,
        revenue_currency TEXT NOT NULL DEFAULT 'CNY',
        customer_summary TEXT,
        gross_margin REAL,
        monthly_burn REAL,
        runway_months REAL,
        team_summary TEXT,
        business_model TEXT,
        funding_use TEXT,
        description TEXT,
        ai_status TEXT NOT NULL DEFAULT '新导入',
        management_status TEXT NOT NULL DEFAULT '待判断',
        status_locked INTEGER NOT NULL DEFAULT 0,
        analysis_state TEXT NOT NULL DEFAULT 'pending',
        latest_file_id TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        imported_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        share_mode TEXT NOT NULL DEFAULT 'local_only' CHECK (share_mode IN ('local_only','fields_only','selected_files')),
        sync_state TEXT NOT NULL DEFAULT 'local_only' CHECK (sync_state IN ('local_only','pending','synced','conflict','error')),
        local_version INTEGER NOT NULL DEFAULT 1,
        remote_version INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_projects_name_key ON projects(name_key);
      CREATE INDEX IF NOT EXISTS idx_projects_filters ON projects(industry, funding_round, management_status, imported_at);

      CREATE TABLE IF NOT EXISTS project_files (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        original_name TEXT NOT NULL,
        stored_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL UNIQUE,
        version_number INTEGER NOT NULL,
        previous_file_id TEXT REFERENCES project_files(id),
        extraction_status TEXT NOT NULL CHECK (extraction_status IN ('parsed','unsupported','failed')),
        extraction_error TEXT,
        extracted_text TEXT NOT NULL DEFAULT '',
        page_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        share_mode TEXT NOT NULL DEFAULT 'local_only' CHECK (share_mode IN ('local_only','fields_only','selected_files')),
        sync_state TEXT NOT NULL DEFAULT 'local_only' CHECK (sync_state IN ('local_only','pending','synced','conflict','error')),
        local_version INTEGER NOT NULL DEFAULT 1,
        remote_version INTEGER NOT NULL DEFAULT 0,
        UNIQUE(project_id, version_number)
      );

      CREATE TABLE IF NOT EXISTS analysis_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        file_id TEXT NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
        schema_version TEXT NOT NULL,
        engine TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        recommendations_json TEXT NOT NULL,
        ai_status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_analysis_project_created ON analysis_runs(project_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS codex_analysis_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_file_id TEXT NOT NULL,
        source_file_sha256 TEXT NOT NULL,
        project_local_version INTEGER NOT NULL,
        fact_snapshot_json TEXT NOT NULL,
        fact_snapshot_hash TEXT NOT NULL,
        source_pages_json TEXT NOT NULL DEFAULT '[]',
        skill_name TEXT NOT NULL,
        skill_version TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        source_task_id TEXT,
        request_context_json TEXT,
        model_name TEXT,
        status TEXT NOT NULL CHECK (status IN ('prepared','completed','stale','failed')),
        result_json TEXT,
        error_detail TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        stale_at TEXT,
        stale_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_codex_analysis_project_created
        ON codex_analysis_runs(project_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_codex_analysis_status
        ON codex_analysis_runs(status, created_at DESC);

      CREATE TABLE IF NOT EXISTS codex_analysis_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_file_id TEXT NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
        source_file_version INTEGER NOT NULL,
        project_local_version INTEGER NOT NULL,
        requested_by TEXT NOT NULL,
        user_prompt TEXT,
        request_context_hash TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL CHECK (mode IN (
          'auto',
          'review-early-stage-investment',
          'assess-market-first',
          'assess-founder-first',
          'assess-long-term-value'
        )),
        status TEXT NOT NULL CHECK (status IN (
          'queued','claimed','analyzing','completed','failed','superseded'
        )),
        selected_skill TEXT,
        router_reason TEXT,
        run_id TEXT REFERENCES codex_analysis_runs(id),
        codex_thread_id TEXT,
        codex_turn_id TEXT,
        launcher_mode TEXT CHECK (
          launcher_mode IS NULL OR launcher_mode IN ('app_server','desktop_fallback')
        ),
        launcher_error TEXT,
        launch_token_hash TEXT,
        launch_expires_at TEXT,
        claimed_by TEXT,
        claimed_at TEXT,
        claim_token_hash TEXT,
        lease_expires_at TEXT,
        progress_message TEXT,
        error_detail TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_codex_analysis_tasks_project_created
        ON codex_analysis_tasks(project_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_codex_analysis_tasks_queue
        ON codex_analysis_tasks(status, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_codex_analysis_tasks_active_request
        ON codex_analysis_tasks(
          project_id, source_file_id, project_local_version, requested_by, mode,
          request_context_hash
        )
        WHERE status IN ('queued','claimed','analyzing');

      CREATE TABLE IF NOT EXISTS project_fields (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        field_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence REAL NOT NULL,
        evidence_json TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, field_key)
      );

      CREATE TABLE IF NOT EXISTS field_definitions (
        field_key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        field_type TEXT NOT NULL CHECK (field_type IN ('text','number','date','boolean','select')),
        options_json TEXT NOT NULL DEFAULT '[]',
        show_in_list INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_materials (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        suggested_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        original_name TEXT NOT NULL,
        stored_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL CHECK (category IN ('bp','financial_model','due_diligence','company_legal','contracts_orders','product_material','market_research','meeting_notes','other')),
        extraction_status TEXT NOT NULL CHECK (extraction_status IN ('parsed','unsupported','failed')),
        extraction_error TEXT,
        extracted_text TEXT NOT NULL DEFAULT '',
        page_count INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','attached')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_project_materials_project ON project_materials(project_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_project_materials_state ON project_materials(state, created_at DESC);

      CREATE TABLE IF NOT EXISTS status_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source TEXT NOT NULL CHECK (source IN ('system','ai','human')),
        status TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS collaboration_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin','internal','external')),
        state TEXT NOT NULL DEFAULT 'invited' CHECK (state IN ('invited','active','suspended')),
        password_hash TEXT,
        language_preference TEXT NOT NULL DEFAULT 'bilingual' CHECK (language_preference IN ('bilingual','zh-CN','en')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_signed_in_at TEXT
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES collaboration_users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        ip TEXT,
        user_agent TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash);

      CREATE TABLE IF NOT EXISTS auth_login_attempts (
        attempt_key TEXT PRIMARY KEY,
        failures INTEGER NOT NULL,
        window_started_at TEXT NOT NULL,
        blocked_until TEXT
      );

      CREATE TABLE IF NOT EXISTS auth_email_otps (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL COLLATE NOCASE,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        consumed_at TEXT,
        created_at TEXT NOT NULL,
        ip TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_auth_email_otps_email_created
        ON auth_email_otps(email, created_at DESC);

      CREATE TABLE IF NOT EXISTS invitations (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL COLLATE NOCASE,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('internal','external')),
        token_hash TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','accepted','revoked','expired')),
        expires_at TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES collaboration_users(id),
        created_at TEXT NOT NULL,
        accepted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS publications (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
        share_token TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','paused','expired')),
        share_mode TEXT NOT NULL CHECK (share_mode IN ('fields_only','selected_files')),
        security_mode TEXT NOT NULL DEFAULT 'trusted' CHECK (security_mode IN ('trusted','high_security')),
        local_version INTEGER NOT NULL DEFAULT 1,
        remote_version INTEGER NOT NULL DEFAULT 0,
        sync_state TEXT NOT NULL DEFAULT 'pending' CHECK (sync_state IN ('pending','synced','conflict','error')),
        expires_at TEXT,
        annotation_enabled INTEGER NOT NULL DEFAULT 1,
        download_enabled INTEGER NOT NULL DEFAULT 0,
        access_mode TEXT NOT NULL DEFAULT 'open' CHECK (access_mode IN ('open','passcode','member_email')),
        access_code_hash TEXT,
        annotation_revision INTEGER NOT NULL DEFAULT 0,
        remote_share_url TEXT,
        published_at TEXT,
        created_by TEXT NOT NULL REFERENCES collaboration_users(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS publication_fields (
        publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
        field_key TEXT NOT NULL,
        PRIMARY KEY(publication_id, field_key)
      );

      CREATE TABLE IF NOT EXISTS publication_files (
        publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
        file_id TEXT NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
        object_key TEXT,
        PRIMARY KEY(publication_id, file_id)
      );

      CREATE TABLE IF NOT EXISTS publication_members (
        publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES collaboration_users(id) ON DELETE CASCADE,
        can_view_fields INTEGER NOT NULL DEFAULT 1,
        can_view_files INTEGER NOT NULL DEFAULT 0,
        can_request_download INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        PRIMARY KEY(publication_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS publication_snapshots (
        id TEXT PRIMARY KEY,
        publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
        remote_version INTEGER NOT NULL,
        source_local_version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(publication_id, remote_version)
      );

      CREATE TABLE IF NOT EXISTS share_annotations (
        id TEXT PRIMARY KEY,
        publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
        file_id TEXT REFERENCES project_files(id) ON DELETE CASCADE,
        field_key TEXT,
        page_number INTEGER,
        parent_id TEXT REFERENCES share_annotations(id) ON DELETE CASCADE,
        author_name TEXT NOT NULL,
        author_email TEXT,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_share_annotations_publication_revision
        ON share_annotations(publication_id, revision);

      CREATE TABLE IF NOT EXISTS collaboration_jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('publish','sync','verify','watermarked_download')),
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        publication_id TEXT REFERENCES publications(id) ON DELETE CASCADE,
        payload_json TEXT NOT NULL DEFAULT '{}',
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','succeeded','failed','conflict')),
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        error TEXT,
        available_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_collaboration_jobs_queue ON collaboration_jobs(state, available_at, created_at);

      CREATE TABLE IF NOT EXISTS verification_results (
        publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
        field_key TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('supported','partial','not_found','conflict')),
        detail TEXT NOT NULL,
        evidence_page INTEGER,
        checked_at TEXT NOT NULL,
        PRIMARY KEY(publication_id, field_key)
      );

      CREATE TABLE IF NOT EXISTS download_requests (
        id TEXT PRIMARY KEY,
        publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
        file_id TEXT NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
        requester_id TEXT NOT NULL REFERENCES collaboration_users(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','rejected','expired','downloaded')),
        reviewer_id TEXT REFERENCES collaboration_users(id),
        reviewer_note TEXT,
        requested_at TEXT NOT NULL,
        decided_at TEXT,
        expires_at TEXT
      );

      CREATE TABLE IF NOT EXISTS download_tokens (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE REFERENCES download_requests(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id TEXT REFERENCES collaboration_users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        detail_json TEXT NOT NULL DEFAULT '{}',
        ip TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);

      CREATE TABLE IF NOT EXISTS operation_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('started','succeeded','failed','partial','cancelled')),
        occurred_at TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        project_id TEXT,
        file_sha256 TEXT,
        app_version TEXT NOT NULL,
        actor_kind TEXT NOT NULL CHECK (actor_kind IN ('human','codex','system')),
        actor_id TEXT NOT NULL,
        actor_name TEXT,
        skill_name TEXT,
        skill_version TEXT,
        model_name TEXT,
        prompt_version TEXT,
        error_code TEXT,
        error_message TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_operation_ledger_operation
        ON operation_ledger(operation_id, id);
      CREATE INDEX IF NOT EXISTS idx_operation_ledger_recent
        ON operation_ledger(occurred_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_operation_ledger_project
        ON operation_ledger(project_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_operation_ledger_type_status
        ON operation_ledger(operation_type, status, occurred_at DESC);

      CREATE TRIGGER IF NOT EXISTS operation_ledger_no_update
      BEFORE UPDATE ON operation_ledger
      BEGIN
        SELECT RAISE(ABORT, 'operation_ledger is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS operation_ledger_no_delete
      BEFORE DELETE ON operation_ledger
      BEGIN
        SELECT RAISE(ABORT, 'operation_ledger is append-only');
      END;

      CREATE TABLE IF NOT EXISTS iteration_tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        request_text TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('interface','analysis','workflow','sharing','data','other')),
        quality TEXT NOT NULL CHECK (quality IN ('quick','standard','deep')),
        status TEXT NOT NULL DEFAULT 'ready_for_codex' CHECK (status IN ('ready_for_codex','working','checking','needs_attention','ready','approved','completed','paused')),
        round INTEGER NOT NULL DEFAULT 1 CHECK (round >= 1),
        requested_by TEXT NOT NULL,
        claimed_by TEXT,
        claimed_model TEXT,
        base_ref TEXT,
        claim_token_hash TEXT,
        lease_expires_at TEXT,
        feedback TEXT,
        result_json TEXT,
        candidate_ref TEXT,
        applied_ref TEXT,
        source_feedback_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        claimed_at TEXT,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_iteration_tasks_queue
        ON iteration_tasks(status, created_at, id);
      CREATE INDEX IF NOT EXISTS idx_iteration_tasks_category
        ON iteration_tasks(category, updated_at DESC);

      CREATE TABLE IF NOT EXISTS iteration_task_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES iteration_tasks(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL CHECK (event_type IN ('created','claimed','progress_updated','needs_attention','result_submitted','accepted','revision_requested','paused','finalized')),
        from_status TEXT CHECK (from_status IS NULL OR from_status IN ('ready_for_codex','working','checking','needs_attention','ready','approved','completed','paused')),
        to_status TEXT NOT NULL CHECK (to_status IN ('ready_for_codex','working','checking','needs_attention','ready','approved','completed','paused')),
        actor_kind TEXT NOT NULL CHECK (actor_kind IN ('human','codex','system')),
        actor_name TEXT NOT NULL,
        round INTEGER NOT NULL CHECK (round >= 1),
        detail_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_iteration_task_events_task
        ON iteration_task_events(task_id, id);

      CREATE TRIGGER IF NOT EXISTS iteration_task_events_no_update
      BEFORE UPDATE ON iteration_task_events
      BEGIN
        SELECT RAISE(ABORT, 'iteration_task_events is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS iteration_task_events_no_delete
      BEFORE DELETE ON iteration_task_events
      BEGIN
        SELECT RAISE(ABORT, 'iteration_task_events is append-only');
      END;

      CREATE TABLE IF NOT EXISTS product_feedback (
        id TEXT PRIMARY KEY,
        origin_key TEXT NOT NULL UNIQUE,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('local','remote')),
        source_feedback_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        expected_outcome TEXT,
        category TEXT NOT NULL CHECK (category IN ('interface','analysis','workflow','sharing','data','other')),
        impact TEXT NOT NULL CHECK (impact IN ('minor','inconvenient','blocked')),
        diagnosis_status TEXT NOT NULL CHECK (diagnosis_status IN ('awaiting_diagnosis','ready_for_codex','working','checking','needs_attention','ready')),
        diagnosis_round INTEGER NOT NULL DEFAULT 1 CHECK (diagnosis_round >= 1),
        reporter_name TEXT NOT NULL,
        claimed_by TEXT,
        claimed_model TEXT,
        claim_token_hash TEXT,
        lease_expires_at TEXT,
        claimed_at TEXT,
        diagnosis_json TEXT,
        trial_fix_status TEXT NOT NULL DEFAULT 'not_attempted' CHECK (trial_fix_status IN ('not_attempted','not_available','passed','failed')),
        sync_status TEXT NOT NULL CHECK (sync_status IN ('pending','synced','failed')),
        triage_status TEXT NOT NULL DEFAULT 'new' CHECK (triage_status IN ('new','needs_info','duplicate','deferred','accepted','completed')),
        remote_record_id TEXT,
        last_remote_sequence INTEGER,
        last_remote_outbox_id TEXT,
        maintainer_iteration_id TEXT,
        maintainer_note TEXT,
        triaged_by TEXT,
        triaged_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        diagnosed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_product_feedback_list
        ON product_feedback(triage_status, diagnosis_status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_product_feedback_sync
        ON product_feedback(sync_status, updated_at);

      CREATE TABLE IF NOT EXISTS product_feedback_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feedback_id TEXT NOT NULL REFERENCES product_feedback(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL CHECK (event_type IN ('created','claimed','progress_updated','needs_attention','diagnosis_completed','outbox_synced','outbox_failed','remote_ingested','triage_changed','iteration_created','maintenance_completed')),
        actor_kind TEXT NOT NULL CHECK (actor_kind IN ('human','codex','system')),
        actor_name TEXT NOT NULL,
        detail_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_product_feedback_events_feedback
        ON product_feedback_events(feedback_id, id);

      CREATE TRIGGER IF NOT EXISTS product_feedback_events_no_update
      BEFORE UPDATE ON product_feedback_events
      BEGIN
        SELECT RAISE(ABORT, 'product_feedback_events is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS product_feedback_events_no_delete
      BEFORE DELETE ON product_feedback_events
      BEGIN
        SELECT RAISE(ABORT, 'product_feedback_events is append-only');
      END;

      CREATE TABLE IF NOT EXISTS product_feedback_outbox (
        id TEXT PRIMARY KEY,
        feedback_id TEXT NOT NULL REFERENCES product_feedback(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('initial_submission','diagnosis_update','maintenance_update')),
        sequence INTEGER NOT NULL CHECK (sequence >= 1),
        payload_json TEXT NOT NULL,
        payload_sha256 TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','synced','failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        remote_record_id TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced_at TEXT,
        UNIQUE(feedback_id, sequence)
      );
      CREATE INDEX IF NOT EXISTS idx_product_feedback_outbox_pending
        ON product_feedback_outbox(status, created_at, id);

      CREATE TABLE IF NOT EXISTS feishu_inbox_receipts (
        remote_file_token TEXT PRIMARY KEY,
        remote_name TEXT NOT NULL,
        remote_modified_time TEXT,
        sha256 TEXT NOT NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        file_id TEXT REFERENCES project_files(id) ON DELETE SET NULL,
        version_number INTEGER,
        status TEXT NOT NULL CHECK (status IN ('imported','restored','skipped_duplicate','failed')),
        last_seen_at TEXT NOT NULL,
        imported_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_feishu_inbox_receipts_project
        ON feishu_inbox_receipts(project_id, last_seen_at DESC);

      CREATE TABLE IF NOT EXISTS email_outbox (
        id TEXT PRIMARY KEY,
        recipient TEXT NOT NULL,
        template TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','sent','failed')),
        error TEXT,
        created_at TEXT NOT NULL,
        sent_at TEXT
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS project_search USING fts5(
        project_id UNINDEXED,
        name,
        product,
        industry,
        content,
        fields,
        tokenize='unicode61 remove_diacritics 2'
      );

      INSERT OR REPLACE INTO app_settings(key, value) VALUES ('schema_version', '11');
    `);

    const projectColumns = new Set(
      (
        this.connection.prepare("PRAGMA table_info(projects)").all() as Array<{
          name: string;
        }>
      ).map(column => column.name)
    );
    if (!projectColumns.has("archived_at"))
      this.connection.exec("ALTER TABLE projects ADD COLUMN archived_at TEXT");
    this.connection.exec(
      "UPDATE projects SET archived_at = updated_at WHERE archived = 1 AND archived_at IS NULL"
    );

    const iterationTaskColumns = new Set(
      (
        this.connection
          .prepare("PRAGMA table_info(iteration_tasks)")
          .all() as Array<{ name: string }>
      ).map(column => column.name)
    );
    const addIterationTaskColumn = (name: string, definition: string) => {
      if (!iterationTaskColumns.has(name))
        this.connection.exec(
          `ALTER TABLE iteration_tasks ADD COLUMN ${name} ${definition}`
        );
    };
    addIterationTaskColumn("base_ref", "TEXT");
    addIterationTaskColumn("claim_token_hash", "TEXT");
    addIterationTaskColumn("lease_expires_at", "TEXT");
    addIterationTaskColumn("candidate_ref", "TEXT");
    addIterationTaskColumn("applied_ref", "TEXT");
    addIterationTaskColumn("source_feedback_id", "TEXT");
    this.connection.exec(`
      CREATE INDEX IF NOT EXISTS idx_iteration_tasks_lease
        ON iteration_tasks(status, lease_expires_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_iteration_tasks_source_feedback
        ON iteration_tasks(source_feedback_id)
        WHERE source_feedback_id IS NOT NULL;
    `);

    const productFeedbackColumns = new Set(
      (
        this.connection
          .prepare("PRAGMA table_info(product_feedback)")
          .all() as Array<{ name: string }>
      ).map(column => column.name)
    );
    const addProductFeedbackColumn = (name: string, definition: string) => {
      if (!productFeedbackColumns.has(name))
        this.connection.exec(
          `ALTER TABLE product_feedback ADD COLUMN ${name} ${definition}`
        );
    };
    addProductFeedbackColumn("maintainer_note", "TEXT");
    addProductFeedbackColumn("triaged_by", "TEXT");
    addProductFeedbackColumn("triaged_at", "TEXT");
    addProductFeedbackColumn("source_feedback_id", "TEXT");
    this.connection.exec(
      "UPDATE product_feedback SET source_feedback_id = id WHERE source_feedback_id IS NULL"
    );

    const publicationColumns = new Set(
      (
        this.connection
          .prepare("PRAGMA table_info(publications)")
          .all() as Array<{
          name: string;
        }>
      ).map(column => column.name)
    );
    const addPublicationColumn = (name: string, definition: string) => {
      if (!publicationColumns.has(name))
        this.connection.exec(
          `ALTER TABLE publications ADD COLUMN ${name} ${definition}`
        );
    };
    addPublicationColumn("share_token", "TEXT");
    addPublicationColumn("annotation_enabled", "INTEGER NOT NULL DEFAULT 1");
    addPublicationColumn("download_enabled", "INTEGER NOT NULL DEFAULT 0");
    addPublicationColumn("access_mode", "TEXT NOT NULL DEFAULT 'open'");
    addPublicationColumn("access_code_hash", "TEXT");
    addPublicationColumn("annotation_revision", "INTEGER NOT NULL DEFAULT 0");
    addPublicationColumn("remote_share_url", "TEXT");
    const codexAnalysisColumns = new Set(
      (
        this.connection
          .prepare("PRAGMA table_info(codex_analysis_runs)")
          .all() as Array<{ name: string }>
      ).map(column => column.name)
    );
    if (!codexAnalysisColumns.has("source_pages_json"))
      this.connection.exec(
        "ALTER TABLE codex_analysis_runs ADD COLUMN source_pages_json TEXT NOT NULL DEFAULT '[]'"
      );
    if (!codexAnalysisColumns.has("source_task_id"))
      this.connection.exec(
        "ALTER TABLE codex_analysis_runs ADD COLUMN source_task_id TEXT"
      );
    if (!codexAnalysisColumns.has("request_context_json"))
      this.connection.exec(
        "ALTER TABLE codex_analysis_runs ADD COLUMN request_context_json TEXT"
      );
    const codexAnalysisTaskColumns = new Set(
      (
        this.connection
          .prepare("PRAGMA table_info(codex_analysis_tasks)")
          .all() as Array<{ name: string }>
      ).map(column => column.name)
    );
    if (!codexAnalysisTaskColumns.has("launch_token_hash"))
      this.connection.exec(
        "ALTER TABLE codex_analysis_tasks ADD COLUMN launch_token_hash TEXT"
      );
    if (!codexAnalysisTaskColumns.has("launch_expires_at"))
      this.connection.exec(
        "ALTER TABLE codex_analysis_tasks ADD COLUMN launch_expires_at TEXT"
      );
    if (!codexAnalysisTaskColumns.has("user_prompt"))
      this.connection.exec(
        "ALTER TABLE codex_analysis_tasks ADD COLUMN user_prompt TEXT"
      );
    if (!codexAnalysisTaskColumns.has("request_context_hash"))
      this.connection.exec(
        "ALTER TABLE codex_analysis_tasks ADD COLUMN request_context_hash TEXT NOT NULL DEFAULT ''"
      );
    this.connection.exec(`
      DROP INDEX IF EXISTS idx_codex_analysis_tasks_active_request;
      CREATE UNIQUE INDEX idx_codex_analysis_tasks_active_request
        ON codex_analysis_tasks(
          project_id, source_file_id, project_local_version, requested_by, mode,
          request_context_hash
        )
        WHERE status IN ('queued','claimed','analyzing');
    `);
    this.connection.exec(`
      UPDATE publications
      SET access_mode = 'member_email'
      WHERE access_mode = 'open'
        AND access_code_hash IS NULL
        AND EXISTS (
          SELECT 1 FROM publication_members pm
          WHERE pm.publication_id = publications.id
        )
    `);
    const collaborationUserColumns = new Set(
      (
        this.connection
          .prepare("PRAGMA table_info(collaboration_users)")
          .all() as Array<{ name: string }>
      ).map(column => column.name)
    );
    if (!collaborationUserColumns.has("language_preference"))
      this.connection.exec(
        "ALTER TABLE collaboration_users ADD COLUMN language_preference TEXT NOT NULL DEFAULT 'bilingual'"
      );
    const publicationsWithoutToken = this.connection
      .prepare(
        "SELECT id FROM publications WHERE share_token IS NULL OR share_token = ''"
      )
      .all() as Array<{ id: string }>;
    for (const publication of publicationsWithoutToken) {
      const shareToken = crypto.randomBytes(24).toString("base64url");
      this.connection
        .prepare("UPDATE publications SET share_token = ? WHERE id = ?")
        .run(shareToken, publication.id);
    }
    this.connection.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_publications_share_token ON publications(share_token)"
    );
    const fieldStamp = now();
    const insertDefaultField = this.connection.prepare(`
      INSERT OR IGNORE INTO field_definitions(
        field_key, label, field_type, options_json, show_in_list, active,
        sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `);
    DEFAULT_FIELD_DEFINITIONS.forEach((field, index) => {
      insertDefaultField.run(
        field.key,
        field.label,
        field.fieldType,
        JSON.stringify(field.options),
        field.showInList ? 1 : 0,
        index,
        fieldStamp,
        fieldStamp
      );
    });
  }

  transaction<T>(work: () => T): T {
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const value = work();
      this.connection.exec("COMMIT");
      return value;
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }

  countProjects() {
    return Number(
      (
        this.connection
          .prepare("SELECT COUNT(*) AS count FROM projects WHERE archived = 0")
          .get() as { count: number }
      ).count
    );
  }

  findFileByHash(sha256: string) {
    return this.connection
      .prepare(
        `SELECT id, project_id, version_number, extraction_status,
          stored_path, sha256
         FROM project_files WHERE sha256 = ?`
      )
      .get(sha256) as
      | {
          id: string;
          project_id: string;
          version_number: number;
          extraction_status: "parsed" | "unsupported" | "failed";
          stored_path: string;
          sha256: string;
        }
      | undefined;
  }

  getFeishuInboxReceipt(remoteFileToken: string) {
    return this.connection
      .prepare(
        `SELECT remote_file_token, remote_name, remote_modified_time, sha256,
                project_id, file_id, version_number, status, last_seen_at,
                imported_at
         FROM feishu_inbox_receipts WHERE remote_file_token = ?`
      )
      .get(remoteFileToken) as ProjectRow | undefined;
  }

  upsertFeishuInboxReceipt(input: {
    remoteFileToken: string;
    remoteName: string;
    remoteModifiedTime: string | null;
    sha256: string;
    projectId: string | null;
    fileId: string | null;
    versionNumber: number | null;
    status: "imported" | "restored" | "skipped_duplicate" | "failed";
    importedAt: string | null;
  }) {
    const stamp = now();
    this.connection
      .prepare(
        `INSERT INTO feishu_inbox_receipts(
          remote_file_token, remote_name, remote_modified_time, sha256,
          project_id, file_id, version_number, status, last_seen_at, imported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(remote_file_token) DO UPDATE SET
          remote_name = excluded.remote_name,
          remote_modified_time = excluded.remote_modified_time,
          sha256 = excluded.sha256,
          project_id = excluded.project_id,
          file_id = excluded.file_id,
          version_number = excluded.version_number,
          status = excluded.status,
          last_seen_at = excluded.last_seen_at,
          imported_at = excluded.imported_at`
      )
      .run(
        input.remoteFileToken,
        input.remoteName,
        input.remoteModifiedTime,
        input.sha256,
        input.projectId,
        input.fileId,
        input.versionNumber,
        input.status,
        stamp,
        input.importedAt
      );
  }

  findProjectByNameKey(nameKey: string) {
    return this.connection
      .prepare(
        "SELECT * FROM projects WHERE name_key = ? ORDER BY updated_at DESC LIMIT 1"
      )
      .get(nameKey) as ProjectRow | undefined;
  }

  getProjectRow(id: string) {
    return this.connection
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow | undefined;
  }

  getActiveProject(id: string) {
    const row = this.getProjectRow(id);
    if (!row || Boolean(row.archived)) return null;
    return this.getProject(id);
  }

  createProject(input: {
    id: string;
    name: string;
    nameKey: string;
    description?: string | null;
  }) {
    const createdAt = now();
    this.connection
      .prepare(
        `
      INSERT INTO projects(
        id, name, name_key, description, management_status, imported_at, updated_at
      ) VALUES (?, ?, ?, ?, '待判断', ?, ?)
    `
      )
      .run(
        input.id,
        input.name,
        input.nameKey,
        input.description ?? null,
        createdAt,
        createdAt
      );
    this.addStatusEvent(
      input.id,
      "system",
      "新导入",
      "原文件已写入本地待处理队列"
    );
  }

  isProjectArchived(projectId: string) {
    const row = this.connection
      .prepare("SELECT archived FROM projects WHERE id = ?")
      .get(projectId) as { archived: number } | undefined;
    if (!row) throw new Error("项目不存在");
    return Boolean(row.archived);
  }

  archiveProject(
    projectId: string,
    note?: string,
    source: "system" | "ai" | "human" = "human"
  ) {
    const project = this.getProjectRow(projectId);
    if (!project) throw new Error("项目不存在");
    const stamp = now();
    const result = this.connection
      .prepare(
        `UPDATE projects
         SET archived = 1, archived_at = COALESCE(archived_at, ?), updated_at = ?
         WHERE id = ? AND archived = 0`
      )
      .run(stamp, stamp, projectId);
    if (result.changes === 0) {
      return false;
    }
    this.addStatusEvent(
      projectId,
      source,
      normalizeManagementDecision(String(project.management_status)),
      note ?? "已移入本机回收站；原文件、版本与分析历史均保留"
    );
    return true;
  }

  restoreProject(
    projectId: string,
    note?: string,
    source: "system" | "ai" | "human" = "human"
  ) {
    const project = this.getProjectRow(projectId);
    if (!project) throw new Error("项目不存在");
    const stamp = now();
    const result = this.connection
      .prepare(
        `UPDATE projects
         SET archived = 0, archived_at = NULL, updated_at = ?
         WHERE id = ? AND archived = 1`
      )
      .run(stamp, projectId);
    if (result.changes === 0) {
      return false;
    }
    this.addStatusEvent(
      projectId,
      source,
      normalizeManagementDecision(String(project.management_status)),
      note ?? "已从本机回收站恢复"
    );
    return true;
  }

  listArchivedProjects(): ProjectListItem[] {
    return this.connection
      .prepare(
        `SELECT * FROM projects
         WHERE archived = 1
         ORDER BY archived_at DESC, updated_at DESC`
      )
      .all()
      .map(row => {
        const project = toProjectListItem(row as ProjectRow);
        project.customFields = this.customFieldsForProject(project.id, true);
        return project;
      });
  }

  nextVersion(projectId: string) {
    const row = this.connection
      .prepare(
        "SELECT COALESCE(MAX(version_number), 0) + 1 AS version FROM project_files WHERE project_id = ?"
      )
      .get(projectId) as { version: number };
    return Number(row.version);
  }

  getLatestFile(projectId: string) {
    return this.connection
      .prepare(
        "SELECT * FROM project_files WHERE project_id = ? ORDER BY version_number DESC LIMIT 1"
      )
      .get(projectId) as ProjectRow | undefined;
  }

  private buildCodexFactSnapshot(projectId: string) {
    const project = this.getProjectRow(projectId);
    if (!project) throw new Error("项目不存在");
    if (Boolean(project.archived))
      throw new Error("项目位于回收站，请先恢复后再进行 Codex 分析");
    const latestFile = this.getLatestFile(projectId);
    if (!latestFile) throw new Error("项目没有可分析的本地文件");
    const analysisRow = this.connection
      .prepare(
        `SELECT payload_json FROM analysis_runs
         WHERE project_id = ? AND file_id = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(projectId, String(latestFile.id)) as
      | { payload_json: string }
      | undefined;
    const payload = analysisRow
      ? parseJson<AnalysisPayload | null>(analysisRow.payload_json, null)
      : null;
    if (!payload)
      throw new Error(
        "当前文件尚未完成基础事实分析，请先运行 analyze_bp_project"
      );

    const facts = this.connection
      .prepare(
        `SELECT field_key, value_json, source, confidence, evidence_json
         FROM project_fields
         WHERE project_id = ? AND source IN ('source_document','human_correction')
         ORDER BY field_key`
      )
      .all(projectId)
      .map(row => {
        const value = row as ProjectRow;
        return {
          key: String(value.field_key),
          value: parseJson(value.value_json, null),
          source: String(value.source),
          confidence: Number(value.confidence),
          evidence: parseJson<{
            page: number | null;
            quote: string | null;
            verificationStatus?: "missing" | "confirmed" | "ambiguous";
            ambiguityReasons?: AnalysisPayload["facts"][string]["ambiguityReasons"];
            candidates?: AnalysisPayload["facts"][string]["candidates"];
          } | null>(value.evidence_json, null),
        };
      });

    const snapshot: CodexAnalysisFactSnapshot = {
      projectId,
      projectName: String(project.name),
      localVersion: Number(project.local_version ?? 1),
      sourceFile: {
        id: String(latestFile.id),
        sha256: String(latestFile.sha256),
        versionNumber: Number(latestFile.version_number),
      },
      facts,
      deterministicAnalysis: {
        schemaVersion: payload.schemaVersion,
        engine: payload.engine,
        summary: payload.summary,
        tags: payload.tags,
        risks: payload.risks,
        missingInformation: payload.missingInformation,
        ambiguousInformation: payload.ambiguousInformation,
        commercialChecks: payload.commercialChecks,
        aiStatus: payload.aiStatus,
      },
    };
    return { snapshot, hash: sha256Json(snapshot) };
  }

  private mapCodexAnalysisRun(row: ProjectRow): CodexAnalysisRun {
    const requestContext = parseJson<CodexAnalysisRequestContext | null>(
      row.request_context_json,
      null
    );
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      sourceFileId: String(row.source_file_id),
      sourceFileSha256: String(row.source_file_sha256),
      projectLocalVersion: Number(row.project_local_version),
      factSnapshotHash: String(row.fact_snapshot_hash),
      skillName: String(row.skill_name) as CodexInvestmentAnalysisSkill,
      skillVersion: String(row.skill_version),
      promptVersion: String(row.prompt_version),
      requestedBy: String(row.requested_by),
      sourceTaskId:
        typeof row.source_task_id === "string" ? row.source_task_id : null,
      requestContext,
      modelName: typeof row.model_name === "string" ? row.model_name : null,
      status: String(row.status) as CodexAnalysisRun["status"],
      result: parseJson<CodexInvestmentAnalysisResult | null>(
        row.result_json,
        null
      ),
      errorDetail:
        typeof row.error_detail === "string" ? row.error_detail : null,
      createdAt: String(row.created_at),
      completedAt:
        typeof row.completed_at === "string" ? row.completed_at : null,
      staleAt: typeof row.stale_at === "string" ? row.stale_at : null,
      staleReason:
        typeof row.stale_reason === "string" ? row.stale_reason : null,
    };
  }

  private mapCodexAnalysisTask(row: ProjectRow): CodexAnalysisTask {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      sourceFileId: String(row.source_file_id),
      sourceFileVersion: Number(row.source_file_version),
      projectLocalVersion: Number(row.project_local_version),
      requestedBy: String(row.requested_by),
      mode: String(row.mode) as CodexAnalysisTaskMode,
      userPrompt: typeof row.user_prompt === "string" ? row.user_prompt : null,
      status: String(row.status) as CodexAnalysisTask["status"],
      selectedSkill:
        typeof row.selected_skill === "string"
          ? (row.selected_skill as CodexInvestmentAnalysisSkill)
          : null,
      routerReason:
        typeof row.router_reason === "string" ? row.router_reason : null,
      runId: typeof row.run_id === "string" ? row.run_id : null,
      codexThreadId:
        typeof row.codex_thread_id === "string" ? row.codex_thread_id : null,
      codexTurnId:
        typeof row.codex_turn_id === "string" ? row.codex_turn_id : null,
      launcherMode:
        typeof row.launcher_mode === "string"
          ? (row.launcher_mode as CodexAnalysisLauncherMode)
          : null,
      launcherError:
        typeof row.launcher_error === "string" ? row.launcher_error : null,
      claimedBy: typeof row.claimed_by === "string" ? row.claimed_by : null,
      claimedAt: typeof row.claimed_at === "string" ? row.claimed_at : null,
      leaseExpiresAt:
        typeof row.lease_expires_at === "string" ? row.lease_expires_at : null,
      progressMessage:
        typeof row.progress_message === "string" ? row.progress_message : null,
      errorDetail:
        typeof row.error_detail === "string" ? row.error_detail : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      completedAt:
        typeof row.completed_at === "string" ? row.completed_at : null,
    };
  }

  private codexAnalysisTaskClaimTokenHash(token: string) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private codexAnalysisTaskVersionIsCurrent(row: ProjectRow) {
    const project = this.getProjectRow(String(row.project_id));
    const latestFile = this.getLatestFile(String(row.project_id));
    return Boolean(
      project &&
        !project.archived &&
        latestFile &&
        Number(project.local_version ?? 1) ===
          Number(row.project_local_version) &&
        String(latestFile.id) === String(row.source_file_id) &&
        Number(latestFile.version_number) === Number(row.source_file_version)
    );
  }

  private supersedeCodexAnalysisTaskRow(row: ProjectRow) {
    if (!["queued", "claimed", "analyzing"].includes(String(row.status)))
      return;
    const timestamp = now();
    this.connection
      .prepare(
        `UPDATE codex_analysis_tasks
         SET status = 'superseded', error_detail = ?, completed_at = ?,
             updated_at = ?, lease_expires_at = NULL,
             launch_token_hash = NULL, launch_expires_at = NULL
         WHERE id = ? AND status IN ('queued','claimed','analyzing')`
      )
      .run(
        "项目版本已经变化，请基于当前版本重新创建分析任务",
        timestamp,
        timestamp,
        String(row.id)
      );
  }

  refreshCodexAnalysisTaskSuperseded(projectId?: string) {
    const rows = this.connection
      .prepare(
        `SELECT * FROM codex_analysis_tasks
         WHERE status IN ('queued','claimed','analyzing')
           AND (? IS NULL OR project_id = ?)`
      )
      .all(projectId ?? null, projectId ?? null) as ProjectRow[];
    for (const row of rows)
      if (!this.codexAnalysisTaskVersionIsCurrent(row))
        this.supersedeCodexAnalysisTaskRow(row);
  }

  createCodexAnalysisTask(input: {
    projectId: string;
    mode: CodexAnalysisTaskMode;
    requestedBy: string;
    userPrompt?: string;
  }): { task: CodexAnalysisTask; reused: boolean } {
    if (!CODEX_ANALYSIS_TASK_MODES.includes(input.mode))
      throw new Error("不支持的 Codex 分析视角");
    const requestedBy = input.requestedBy.trim();
    if (!requestedBy) throw new Error("Codex 分析任务必须记录发起人");
    const requestContext = normalizeAnalysisRequestContext(input);
    const requestContextHash = requestContext.userPrompt
      ? sha256Json(requestContext)
      : "";
    const { snapshot } = this.buildCodexFactSnapshot(input.projectId);
    return this.transaction(() => {
      this.refreshCodexAnalysisTaskSuperseded(input.projectId);
      const existing = this.connection
        .prepare(
          `SELECT * FROM codex_analysis_tasks
           WHERE project_id = ? AND source_file_id = ?
             AND project_local_version = ? AND requested_by = ? AND mode = ?
             AND request_context_hash = ?
             AND status IN ('queued','claimed','analyzing')
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(
          input.projectId,
          snapshot.sourceFile.id,
          snapshot.localVersion,
          requestedBy,
          input.mode,
          requestContextHash
        ) as ProjectRow | undefined;
      if (existing)
        return { task: this.mapCodexAnalysisTask(existing), reused: true };

      const id = `cat_${crypto.randomUUID()}`;
      const timestamp = now();
      this.connection
        .prepare(
          `INSERT INTO codex_analysis_tasks(
            id, project_id, source_file_id, source_file_version,
            project_local_version, requested_by, mode, status,
            user_prompt, request_context_hash,
            progress_message, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.projectId,
          snapshot.sourceFile.id,
          snapshot.sourceFile.versionNumber,
          snapshot.localVersion,
          requestedBy,
          input.mode,
          requestContext.userPrompt,
          requestContextHash,
          "等待 Codex 领取",
          timestamp,
          timestamp
        );
      return {
        task: this.getCodexAnalysisTask(id) as CodexAnalysisTask,
        reused: false,
      };
    });
  }

  getCodexAnalysisTask(taskId: string) {
    const row = this.connection
      .prepare("SELECT * FROM codex_analysis_tasks WHERE id = ?")
      .get(taskId) as ProjectRow | undefined;
    return row ? this.mapCodexAnalysisTask(row) : null;
  }

  listCodexAnalysisTasks(projectId: string, limit = 10) {
    if (!this.getProjectRow(projectId)) throw new Error("项目不存在");
    this.refreshCodexAnalysisTaskSuperseded(projectId);
    return this.connection
      .prepare(
        `SELECT * FROM codex_analysis_tasks
         WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`
      )
      .all(projectId, Math.max(1, Math.min(50, Math.trunc(limit))))
      .map(row => this.mapCodexAnalysisTask(row as ProjectRow));
  }

  getCurrentCodexAnalysisTask(projectId: string) {
    if (!this.getProjectRow(projectId)) throw new Error("项目不存在");
    this.refreshCodexAnalysisTaskSuperseded(projectId);
    const row = this.connection
      .prepare(
        `SELECT * FROM codex_analysis_tasks
         WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(projectId) as ProjectRow | undefined;
    return row ? this.mapCodexAnalysisTask(row) : null;
  }

  reserveCodexAnalysisTaskLaunch(input: {
    taskId: string;
    ttlSeconds: number;
  }): { task: CodexAnalysisTask; launchToken: string } | null {
    return this.transaction(() => {
      const row = this.connection
        .prepare("SELECT * FROM codex_analysis_tasks WHERE id = ?")
        .get(input.taskId) as ProjectRow | undefined;
      if (!row) throw new Error("Codex 分析任务不存在");
      if (!this.codexAnalysisTaskVersionIsCurrent(row)) {
        this.supersedeCodexAnalysisTaskRow(row);
        throw new Error("项目版本已经变化，分析任务已失效");
      }
      const timestamp = now();
      const status = String(row.status);
      const leaseExpired =
        ["claimed", "analyzing"].includes(status) &&
        typeof row.lease_expires_at === "string" &&
        row.lease_expires_at <= timestamp;
      if (status !== "queued" && !leaseExpired) return null;

      const launchToken = crypto.randomBytes(32).toString("base64url");
      const launchExpiresAt = new Date(
        Date.parse(timestamp) +
          Math.max(30, Math.min(300, input.ttlSeconds)) * 1_000
      ).toISOString();
      const update = this.connection
        .prepare(
          `UPDATE codex_analysis_tasks
           SET launch_token_hash = ?, launch_expires_at = ?, updated_at = ?
           WHERE id = ?
             AND (
               (
                 status = 'queued'
                 AND (
                   launch_token_hash IS NULL OR launch_expires_at IS NULL
                   OR launch_expires_at <= ?
                 )
               )
               OR (status IN ('claimed','analyzing') AND lease_expires_at <= ?)
             )`
        )
        .run(
          this.codexAnalysisTaskClaimTokenHash(launchToken),
          launchExpiresAt,
          timestamp,
          input.taskId,
          timestamp,
          timestamp
        );
      if (Number(update.changes) !== 1) return null;
      return {
        task: this.getCodexAnalysisTask(input.taskId) as CodexAnalysisTask,
        launchToken,
      };
    });
  }

  recordCodexAnalysisTaskLaunch(input: {
    taskId: string;
    launchToken: string;
    launcherMode: CodexAnalysisLauncherMode;
    launcherError?: string | null;
    codexThreadId?: string | null;
    codexTurnId?: string | null;
  }): { task: CodexAnalysisTask; recorded: boolean } {
    return this.transaction(() => {
      const row = this.connection
        .prepare("SELECT * FROM codex_analysis_tasks WHERE id = ?")
        .get(input.taskId) as ProjectRow | undefined;
      if (!row) throw new Error("Codex 分析任务不存在");
      const providedHash = this.codexAnalysisTaskClaimTokenHash(
        input.launchToken
      );
      if (String(row.launch_token_hash ?? "") !== providedHash)
        return { task: this.mapCodexAnalysisTask(row), recorded: false };

      const timestamp = now();
      this.connection
        .prepare(
          `UPDATE codex_analysis_tasks
           SET launcher_mode = ?, launcher_error = ?,
               codex_thread_id = COALESCE(?, codex_thread_id),
               codex_turn_id = COALESCE(?, codex_turn_id), updated_at = ?
           WHERE id = ? AND launch_token_hash = ?`
        )
        .run(
          input.launcherMode,
          input.launcherError?.trim() || null,
          input.codexThreadId?.trim() || null,
          input.codexTurnId?.trim() || null,
          timestamp,
          input.taskId,
          providedHash
        );
      return {
        task: this.getCodexAnalysisTask(input.taskId) as CodexAnalysisTask,
        recorded: true,
      };
    });
  }

  releaseCodexAnalysisTaskLaunch(taskId: string, launchToken: string) {
    this.connection
      .prepare(
        `UPDATE codex_analysis_tasks
         SET launch_token_hash = NULL, launch_expires_at = NULL
         WHERE id = ? AND launch_token_hash = ?`
      )
      .run(taskId, this.codexAnalysisTaskClaimTokenHash(launchToken));
    return this.getCodexAnalysisTask(taskId);
  }

  failCodexAnalysisTaskFromLaunch(input: {
    taskId: string;
    launchToken: string;
    errorDetail: string;
    codexThreadId?: string | null;
    codexTurnId?: string | null;
  }) {
    return this.transaction(() => {
      const row = this.connection
        .prepare("SELECT * FROM codex_analysis_tasks WHERE id = ?")
        .get(input.taskId) as ProjectRow | undefined;
      if (!row) return null;
      const providedHash = this.codexAnalysisTaskClaimTokenHash(
        input.launchToken
      );
      if (String(row.launch_token_hash ?? "") !== providedHash)
        return this.mapCodexAnalysisTask(row);
      if (!["queued", "claimed", "analyzing"].includes(String(row.status)))
        return this.mapCodexAnalysisTask(row);
      if (!this.codexAnalysisTaskVersionIsCurrent(row)) {
        this.supersedeCodexAnalysisTaskRow(row);
        return this.getCodexAnalysisTask(input.taskId);
      }

      const timestamp = now();
      this.connection
        .prepare(
          `UPDATE codex_analysis_tasks
           SET status = 'failed', error_detail = ?, progress_message = ?,
               codex_thread_id = COALESCE(?, codex_thread_id),
               codex_turn_id = COALESCE(?, codex_turn_id),
               launch_token_hash = NULL, launch_expires_at = NULL,
               lease_expires_at = NULL, completed_at = ?, updated_at = ?
           WHERE id = ? AND launch_token_hash = ?
             AND status IN ('queued','claimed','analyzing')`
        )
        .run(
          input.errorDetail.trim(),
          "Codex 会话未完成，可重新发起",
          input.codexThreadId?.trim() || null,
          input.codexTurnId?.trim() || null,
          timestamp,
          timestamp,
          input.taskId,
          providedHash
        );
      return this.getCodexAnalysisTask(input.taskId);
    });
  }

  claimCodexAnalysisTask(input: {
    taskId?: string;
    claimedBy: string;
    leaseSeconds: number;
    codexThreadId?: string;
    codexTurnId?: string;
  }): CodexAnalysisTaskClaim | null {
    const claimedBy = input.claimedBy.trim();
    if (!claimedBy) throw new Error("领取分析任务必须记录 Codex 身份");
    return this.transaction(() => {
      this.refreshCodexAnalysisTaskSuperseded();
      const timestamp = now();
      const row = input.taskId
        ? (this.connection
            .prepare("SELECT * FROM codex_analysis_tasks WHERE id = ?")
            .get(input.taskId) as ProjectRow | undefined)
        : (this.connection
            .prepare(
              `SELECT * FROM codex_analysis_tasks
               WHERE status = 'queued'
                  OR (status IN ('claimed','analyzing') AND lease_expires_at <= ?)
               ORDER BY created_at, id LIMIT 1`
            )
            .get(timestamp) as ProjectRow | undefined);
      if (!row) {
        if (input.taskId) throw new Error("Codex 分析任务不存在");
        return null;
      }
      const status = String(row.status);
      const canReclaim =
        ["claimed", "analyzing"].includes(status) &&
        typeof row.lease_expires_at === "string" &&
        row.lease_expires_at <= timestamp;
      if (status !== "queued" && !canReclaim)
        throw new Error(`任务当前状态为 ${status}，不能重复领取`);
      if (!this.codexAnalysisTaskVersionIsCurrent(row)) {
        this.supersedeCodexAnalysisTaskRow(row);
        throw new Error("项目版本已经变化，分析任务已失效");
      }
      if (
        canReclaim &&
        (typeof row.launch_expires_at !== "string" ||
          row.launch_expires_at <= timestamp)
      )
        this.connection
          .prepare(
            `UPDATE codex_analysis_tasks
             SET launch_token_hash = NULL, launch_expires_at = NULL
             WHERE id = ?`
          )
          .run(String(row.id));

      const claimToken = crypto.randomBytes(32).toString("base64url");
      const leaseExpiresAt = new Date(
        Date.parse(timestamp) +
          Math.max(60, Math.min(3_600, input.leaseSeconds)) * 1_000
      ).toISOString();
      const update = this.connection
        .prepare(
          `UPDATE codex_analysis_tasks
           SET status = 'claimed', claimed_by = ?, claimed_at = ?,
               claim_token_hash = ?, lease_expires_at = ?,
               codex_thread_id = COALESCE(?, codex_thread_id),
               codex_turn_id = COALESCE(?, codex_turn_id),
               progress_message = ?, error_detail = NULL, updated_at = ?
           WHERE id = ? AND (
             status = 'queued'
             OR (status IN ('claimed','analyzing') AND lease_expires_at <= ?)
           )`
        )
        .run(
          claimedBy,
          timestamp,
          this.codexAnalysisTaskClaimTokenHash(claimToken),
          leaseExpiresAt,
          input.codexThreadId?.trim() || null,
          input.codexTurnId?.trim() || null,
          "Codex 已领取，正在准备分析",
          timestamp,
          String(row.id),
          timestamp
        );
      if (Number(update.changes) !== 1)
        throw new Error("分析任务已被另一个 Codex 会话领取");
      return {
        task: this.getCodexAnalysisTask(String(row.id)) as CodexAnalysisTask,
        claimToken,
      };
    });
  }

  private requireCodexAnalysisTaskClaim(taskId: string, claimToken: string) {
    const row = this.connection
      .prepare("SELECT * FROM codex_analysis_tasks WHERE id = ?")
      .get(taskId) as ProjectRow | undefined;
    if (!row) throw new Error("Codex 分析任务不存在");
    const providedHash = this.codexAnalysisTaskClaimTokenHash(claimToken);
    const storedHash =
      typeof row.claim_token_hash === "string" ? row.claim_token_hash : "";
    if (
      storedHash.length !== providedHash.length ||
      !crypto.timingSafeEqual(
        Buffer.from(storedHash),
        Buffer.from(providedHash)
      )
    )
      throw new Error("分析任务领取凭据无效");
    if (!this.codexAnalysisTaskVersionIsCurrent(row)) {
      this.supersedeCodexAnalysisTaskRow(row);
      throw new Error("项目版本已经变化，分析任务已失效");
    }
    const status = String(row.status);
    if (!["claimed", "analyzing", "completed", "failed"].includes(status))
      throw new Error(`任务当前状态为 ${status}，不能继续处理`);
    if (
      ["claimed", "analyzing"].includes(status) &&
      (typeof row.lease_expires_at !== "string" ||
        row.lease_expires_at <= now())
    )
      throw new Error("分析任务领取租约已经过期，请重新领取");
    return row;
  }

  progressCodexAnalysisTask(input: {
    taskId: string;
    claimToken: string;
    message: string;
    selectedSkill?: CodexInvestmentAnalysisSkill;
    routerReason?: string;
    codexThreadId?: string;
    codexTurnId?: string;
    leaseSeconds: number;
  }) {
    return this.transaction(() => {
      const row = this.requireCodexAnalysisTaskClaim(
        input.taskId,
        input.claimToken
      );
      if (!["claimed", "analyzing"].includes(String(row.status)))
        throw new Error("已结束的分析任务不能更新进度");
      const selectedSkill =
        input.selectedSkill ??
        (typeof row.selected_skill === "string"
          ? (row.selected_skill as CodexInvestmentAnalysisSkill)
          : undefined);
      if (selectedSkill && row.mode !== "auto" && selectedSkill !== row.mode)
        throw new Error("Codex 选择的分析视角与用户指定视角不一致");
      const timestamp = now();
      const leaseExpiresAt = new Date(
        Date.parse(timestamp) +
          Math.max(60, Math.min(3_600, input.leaseSeconds)) * 1_000
      ).toISOString();
      this.connection
        .prepare(
          `UPDATE codex_analysis_tasks
           SET status = 'analyzing', progress_message = ?,
               selected_skill = COALESCE(?, selected_skill),
               router_reason = COALESCE(?, router_reason),
               codex_thread_id = COALESCE(?, codex_thread_id),
               codex_turn_id = COALESCE(?, codex_turn_id),
               lease_expires_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          input.message.trim(),
          selectedSkill ?? null,
          input.routerReason?.trim() || null,
          input.codexThreadId?.trim() || null,
          input.codexTurnId?.trim() || null,
          leaseExpiresAt,
          timestamp,
          input.taskId
        );
      return this.getCodexAnalysisTask(input.taskId) as CodexAnalysisTask;
    });
  }

  completeCodexAnalysisTask(input: {
    taskId: string;
    claimToken: string;
    runId: string;
    selectedSkill: CodexInvestmentAnalysisSkill;
    routerReason: string;
    codexThreadId?: string;
    codexTurnId?: string;
  }) {
    return this.transaction(() => {
      const taskRow = this.requireCodexAnalysisTaskClaim(
        input.taskId,
        input.claimToken
      );
      if (String(taskRow.status) === "completed") {
        if (String(taskRow.run_id) === input.runId)
          return this.mapCodexAnalysisTask(taskRow);
        throw new Error("分析任务已经关联其他完成结果");
      }
      if (!["claimed", "analyzing"].includes(String(taskRow.status)))
        throw new Error("当前分析任务不能完成");
      if (taskRow.mode !== "auto" && input.selectedSkill !== taskRow.mode)
        throw new Error("完成结果使用的分析视角与用户指定视角不一致");
      const runRow = this.connection
        .prepare("SELECT * FROM codex_analysis_runs WHERE id = ?")
        .get(input.runId) as ProjectRow | undefined;
      if (!runRow) throw new Error("关联的 Codex 分析结果不存在");
      if (String(runRow.status) !== "completed")
        throw new Error("关联的 Codex 分析尚未完成");
      if (
        String(runRow.project_id) !== String(taskRow.project_id) ||
        String(runRow.source_file_id) !== String(taskRow.source_file_id) ||
        Number(runRow.project_local_version) !==
          Number(taskRow.project_local_version)
      )
        throw new Error("关联结果不属于任务冻结的项目版本");
      if (String(runRow.skill_name) !== input.selectedSkill)
        throw new Error("关联结果的 Skill 与任务路由结果不一致");
      if (
        typeof runRow.source_task_id === "string" &&
        runRow.source_task_id !== input.taskId
      )
        throw new Error("关联结果绑定了另一条用户分析请求");

      const timestamp = now();
      this.connection
        .prepare(
          `UPDATE codex_analysis_tasks
           SET status = 'completed', selected_skill = ?, router_reason = ?,
                run_id = ?, codex_thread_id = COALESCE(?, codex_thread_id),
                codex_turn_id = COALESCE(?, codex_turn_id),
                progress_message = ?, error_detail = NULL,
                lease_expires_at = NULL,
                launch_token_hash = NULL, launch_expires_at = NULL,
                completed_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          input.selectedSkill,
          input.routerReason.trim(),
          input.runId,
          input.codexThreadId?.trim() || null,
          input.codexTurnId?.trim() || null,
          "分析已完成",
          timestamp,
          timestamp,
          input.taskId
        );
      return this.getCodexAnalysisTask(input.taskId) as CodexAnalysisTask;
    });
  }

  failCodexAnalysisTask(input: {
    taskId: string;
    claimToken: string;
    errorDetail: string;
    codexThreadId?: string;
    codexTurnId?: string;
  }) {
    return this.transaction(() => {
      const row = this.requireCodexAnalysisTaskClaim(
        input.taskId,
        input.claimToken
      );
      if (String(row.status) === "failed")
        return this.mapCodexAnalysisTask(row);
      if (!["claimed", "analyzing"].includes(String(row.status)))
        throw new Error("当前分析任务不能标记失败");
      const timestamp = now();
      this.connection
        .prepare(
          `UPDATE codex_analysis_tasks
           SET status = 'failed', error_detail = ?, progress_message = ?,
                codex_thread_id = COALESCE(?, codex_thread_id),
                codex_turn_id = COALESCE(?, codex_turn_id),
                lease_expires_at = NULL,
                launch_token_hash = NULL, launch_expires_at = NULL,
                completed_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          input.errorDetail.trim(),
          "分析未完成，可重新发起",
          input.codexThreadId?.trim() || null,
          input.codexTurnId?.trim() || null,
          timestamp,
          timestamp,
          input.taskId
        );
      return this.getCodexAnalysisTask(input.taskId) as CodexAnalysisTask;
    });
  }

  private validateCodexAnalysisEvidence(
    snapshot: CodexAnalysisFactSnapshot,
    result: CodexInvestmentAnalysisResult,
    sourcePages: Array<{ page: number; text: string }>
  ) {
    const factsByKey = new Map(snapshot.facts.map(fact => [fact.key, fact]));
    const knownPages = new Set<number>();
    const knownQuotes: string[] = [];
    for (const fact of snapshot.facts) {
      if (fact.evidence?.page) knownPages.add(fact.evidence.page);
      if (fact.evidence?.quote) knownQuotes.push(fact.evidence.quote);
    }
    for (const risk of snapshot.deterministicAnalysis.risks)
      for (const page of risk.evidencePages) knownPages.add(page);
    for (const check of snapshot.deterministicAnalysis.commercialChecks)
      for (const page of check.evidencePages) knownPages.add(page);
    for (const page of sourcePages) {
      knownPages.add(page.page);
      if (page.text) knownQuotes.push(page.text);
    }

    const normalizeQuote = (value: string) =>
      value.replace(/\s+/gu, " ").trim().toLocaleLowerCase("zh-CN");
    const quoteIsKnown = (quote: string) => {
      const candidate = normalizeQuote(quote);
      return knownQuotes.some(value => {
        const known = normalizeQuote(value);
        return known.includes(candidate) || candidate.includes(known);
      });
    };

    const claims = [...result.positiveSignals, ...result.keyRisks];
    const evidenceGroups = [
      ...claims.map(claim => ({
        title: claim.title,
        basis: claim.basis,
        evidence: claim.evidence,
      })),
      ...result.frameworkSections.map(section => ({
        title: section.title,
        basis: "inference" as const,
        evidence: section.evidence,
      })),
    ];
    for (const claim of evidenceGroups) {
      if (claim.basis === "evidence" && claim.evidence.length === 0)
        throw new Error(`判断“${claim.title}”缺少证据引用`);
      for (const reference of claim.evidence) {
        const fact = reference.fieldKey
          ? factsByKey.get(reference.fieldKey)
          : undefined;
        if (reference.fieldKey && !fact)
          throw new Error(
            `证据字段 ${reference.fieldKey} 不在冻结的事实快照中`
          );
        if (
          reference.page !== null &&
          reference.page !== fact?.evidence?.page &&
          !knownPages.has(reference.page)
        )
          throw new Error(`证据页码 ${reference.page} 不在冻结的事实快照中`);
        if (reference.quote !== null && !quoteIsKnown(reference.quote))
          throw new Error("证据短引文不在冻结的事实快照中");
      }
    }
  }

  prepareCodexAnalysis(input: {
    projectId: string;
    skillName: CodexInvestmentAnalysisSkill;
    requestedBy: string;
    force?: boolean;
    taskId?: string;
  }): PreparedCodexAnalysisRun {
    if (!CODEX_INVESTMENT_ANALYSIS_SKILLS.includes(input.skillName))
      throw new Error("不支持的投资分析 Skill");
    if (!input.requestedBy.trim()) throw new Error("Codex 分析必须记录操作者");
    let sourceTaskId: string | null = null;
    let requestContext: CodexAnalysisRequestContext | null = null;
    if (input.taskId) {
      const taskRow = this.connection
        .prepare("SELECT * FROM codex_analysis_tasks WHERE id = ?")
        .get(input.taskId) as ProjectRow | undefined;
      if (!taskRow) throw new Error("关联的 Codex 分析任务不存在");
      if (String(taskRow.project_id) !== input.projectId)
        throw new Error("关联任务不属于当前项目");
      if (!["claimed", "analyzing"].includes(String(taskRow.status)))
        throw new Error("关联任务尚未被当前 Codex 会话领取");
      if (String(taskRow.claimed_by ?? "") !== input.requestedBy.trim())
        throw new Error("分析操作者与任务领取身份不一致");
      if (
        typeof taskRow.lease_expires_at !== "string" ||
        taskRow.lease_expires_at <= now()
      )
        throw new Error("关联任务的领取租约已经过期");
      if (!this.codexAnalysisTaskVersionIsCurrent(taskRow))
        throw new Error("关联任务绑定的项目版本已经失效");
      if (taskRow.mode !== "auto" && String(taskRow.mode) !== input.skillName)
        throw new Error("分析 Skill 与用户指定视角不一致");
      if (
        typeof taskRow.selected_skill === "string" &&
        taskRow.selected_skill !== input.skillName
      )
        throw new Error("分析 Skill 与任务已记录的路由不一致");
      sourceTaskId = String(taskRow.id);
      requestContext = normalizeAnalysisRequestContext({
        userPrompt:
          typeof taskRow.user_prompt === "string" ? taskRow.user_prompt : null,
      });
    }
    const { snapshot, hash } = this.buildCodexFactSnapshot(input.projectId);
    if (!input.force) {
      const existing = this.connection
        .prepare(
          `SELECT * FROM codex_analysis_runs
           WHERE project_id = ? AND skill_name = ? AND fact_snapshot_hash = ?
             AND skill_version = ? AND prompt_version = ? AND requested_by = ?
             AND ((? IS NULL AND source_task_id IS NULL) OR source_task_id = ?)
             AND status = 'prepared'
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(
          input.projectId,
          input.skillName,
          hash,
          CODEX_ANALYSIS_SKILL_VERSION,
          CODEX_ANALYSIS_PROMPT_VERSION,
          input.requestedBy.trim(),
          sourceTaskId,
          sourceTaskId
        ) as ProjectRow | undefined;
      if (existing)
        return {
          ...this.mapCodexAnalysisRun(existing),
          factSnapshot: parseJson<CodexAnalysisFactSnapshot>(
            existing.fact_snapshot_json,
            snapshot
          ),
        };
    }

    const id = `ca_${crypto.randomUUID()}`;
    const createdAt = now();
    this.connection
      .prepare(
        `INSERT INTO codex_analysis_runs(
          id, project_id, source_file_id, source_file_sha256,
          project_local_version, fact_snapshot_json, fact_snapshot_hash,
          skill_name, skill_version, prompt_version, requested_by,
          source_task_id, request_context_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'prepared', ?)`
      )
      .run(
        id,
        input.projectId,
        snapshot.sourceFile.id,
        snapshot.sourceFile.sha256,
        snapshot.localVersion,
        stableJson(snapshot),
        hash,
        input.skillName,
        CODEX_ANALYSIS_SKILL_VERSION,
        CODEX_ANALYSIS_PROMPT_VERSION,
        input.requestedBy.trim(),
        sourceTaskId,
        requestContext ? stableJson(requestContext) : null,
        createdAt
      );
    const row = this.connection
      .prepare("SELECT * FROM codex_analysis_runs WHERE id = ?")
      .get(id) as ProjectRow;
    return { ...this.mapCodexAnalysisRun(row), factSnapshot: snapshot };
  }

  completeCodexAnalysis(input: {
    runId: string;
    modelName: string;
    result: CodexInvestmentAnalysisResult;
  }) {
    if (!input.modelName.trim()) throw new Error("Codex 分析必须记录模型名称");
    const validatedResult = codexInvestmentAnalysisResultSchema.parse(
      input.result
    );
    const row = this.connection
      .prepare("SELECT * FROM codex_analysis_runs WHERE id = ?")
      .get(input.runId) as ProjectRow | undefined;
    if (!row) throw new Error("Codex 分析任务不存在");
    const current = this.mapCodexAnalysisRun(row);
    if (current.status === "completed") {
      if (stableJson(current.result) === stableJson(validatedResult))
        return current;
      throw new Error("Codex 分析任务已经完成，不能覆盖历史结果");
    }
    if (current.status !== "prepared")
      throw new Error("Codex 分析任务已失效，请基于当前事实重新创建");

    const { hash } = this.buildCodexFactSnapshot(current.projectId);
    if (hash !== current.factSnapshotHash) {
      this.refreshCodexAnalysisStaleness(current.projectId);
      throw new Error("事实快照或源文件已经变化，请重新创建分析任务");
    }

    const snapshot = parseJson<CodexAnalysisFactSnapshot>(
      row.fact_snapshot_json,
      null as unknown as CodexAnalysisFactSnapshot
    );
    if (!snapshot) throw new Error("Codex 分析任务缺少冻结的事实快照");
    this.validateCodexAnalysisEvidence(
      snapshot,
      validatedResult,
      parseJson<Array<{ page: number; text: string }>>(
        row.source_pages_json,
        []
      )
    );

    const completedAt = now();
    this.connection
      .prepare(
        `UPDATE codex_analysis_runs SET
          status = 'completed', model_name = ?, result_json = ?,
          completed_at = ?, error_detail = NULL
         WHERE id = ?`
      )
      .run(
        input.modelName.trim(),
        stableJson(validatedResult),
        completedAt,
        input.runId
      );
    return this.mapCodexAnalysisRun(
      this.connection
        .prepare("SELECT * FROM codex_analysis_runs WHERE id = ?")
        .get(input.runId) as ProjectRow
    );
  }

  listCodexAnalysisRuns(projectId: string, limit = 10) {
    if (!this.getProjectRow(projectId)) throw new Error("项目不存在");
    return this.connection
      .prepare(
        `SELECT * FROM codex_analysis_runs
         WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`
      )
      .all(projectId, Math.max(1, Math.min(50, Math.trunc(limit))))
      .map(row => this.mapCodexAnalysisRun(row as ProjectRow));
  }

  getPreparedCodexAnalysisSource(runId: string) {
    const row = this.connection
      .prepare(
        `SELECT r.id AS run_id, r.status, r.source_file_id,
          r.source_file_sha256, f.original_name, f.stored_path, f.mime_type,
          f.page_count, p.archived
         FROM codex_analysis_runs r
         JOIN project_files f ON f.id = r.source_file_id
         JOIN projects p ON p.id = r.project_id
         WHERE r.id = ?`
      )
      .get(runId) as ProjectRow | undefined;
    if (!row) throw new Error("Codex 分析任务或绑定原文件不存在");
    if (Boolean(row.archived))
      throw new Error("项目位于回收站，请先恢复后再读取分析原文");
    return {
      runId: String(row.run_id),
      status: String(row.status) as CodexAnalysisRun["status"],
      sourceFileId: String(row.source_file_id),
      sourceFileSha256: String(row.source_file_sha256),
      originalName: String(row.original_name),
      storedPath: this.resolveStoredFile(String(row.stored_path)),
      mimeType: String(row.mime_type),
      pageCount: Number(row.page_count),
    };
  }

  recordPreparedCodexAnalysisPages(
    runId: string,
    pages: Array<{ page: number; text: string }>
  ) {
    const row = this.connection
      .prepare(
        "SELECT status, source_pages_json FROM codex_analysis_runs WHERE id = ?"
      )
      .get(runId) as ProjectRow | undefined;
    if (!row) throw new Error("Codex 分析任务不存在");
    if (String(row.status) !== "prepared")
      throw new Error("只有准备中的 Codex 分析任务可以补充原文证据");
    const merged = new Map(
      parseJson<Array<{ page: number; text: string }>>(
        row.source_pages_json,
        []
      ).map(page => [page.page, page])
    );
    for (const page of pages) merged.set(page.page, page);
    this.connection
      .prepare(
        "UPDATE codex_analysis_runs SET source_pages_json = ? WHERE id = ?"
      )
      .run(
        stableJson([...merged.values()].sort((a, b) => a.page - b.page)),
        runId
      );
  }

  markCodexAnalysisRunsStale(projectId: string, reason: string) {
    const staleAt = now();
    this.connection
      .prepare(
        `UPDATE codex_analysis_runs SET status = 'stale', stale_at = ?, stale_reason = ?
         WHERE project_id = ? AND status IN ('prepared','completed')`
      )
      .run(staleAt, reason, projectId);
  }

  private refreshCodexAnalysisStaleness(projectId: string) {
    let hash: string;
    try {
      hash = this.buildCodexFactSnapshot(projectId).hash;
    } catch {
      return;
    }
    const staleAt = now();
    this.connection
      .prepare(
        `UPDATE codex_analysis_runs SET status = 'stale', stale_at = ?,
          stale_reason = '基础事实分析已经变化'
         WHERE project_id = ? AND status IN ('prepared','completed')
           AND fact_snapshot_hash != ?`
      )
      .run(staleAt, projectId, hash);
  }

  insertFile(input: {
    id: string;
    projectId: string;
    originalName: string;
    storedPath: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    versionNumber: number;
    previousFileId: string | null;
    extractionStatus: "parsed" | "unsupported" | "failed";
    extractionError: string | null;
    extractedText: string;
    pageCount: number;
  }) {
    const createdAt = now();
    this.connection
      .prepare(
        `
      INSERT INTO project_files(
        id, project_id, original_name, stored_path, mime_type, size_bytes, sha256,
        version_number, previous_file_id, extraction_status, extraction_error,
        extracted_text, page_count, created_at, local_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        input.id,
        input.projectId,
        input.originalName,
        input.storedPath,
        input.mimeType,
        input.sizeBytes,
        input.sha256,
        input.versionNumber,
        input.previousFileId,
        input.extractionStatus,
        input.extractionError,
        input.extractedText,
        input.pageCount,
        createdAt,
        input.versionNumber
      );
    this.connection
      .prepare(
        `
      UPDATE projects
      SET latest_file_id = ?, local_version = ?, updated_at = ?, analysis_state = 'pending'
      WHERE id = ?
    `
      )
      .run(input.id, input.versionNumber, createdAt, input.projectId);
    if (input.extractionStatus === "parsed") {
      this.addStatusEvent(
        input.projectId,
        "system",
        "已解析",
        `已解析 ${input.pageCount} 页/段本地内容`
      );
    }
    this.markCodexAnalysisRunsStale(input.projectId, "项目原文件版本已经变化");
    this.refreshCodexAnalysisTaskSuperseded(input.projectId);
  }

  saveAnalysis(
    projectId: string,
    fileId: string,
    analysisId: string,
    payload: AnalysisPayload,
    recommendations: OptimizationRecommendation[]
  ) {
    const createdAt = now();
    const fact = (key: string) => {
      const item = payload.facts[key];
      return item?.verificationStatus === "ambiguous"
        ? null
        : (item?.value ?? null);
    };
    const numberFact = (key: string) => {
      const value = fact(key);
      return typeof value === "number" ? value : null;
    };
    const textFact = (key: string) => {
      const value = fact(key);
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };

    this.transaction(() => {
      this.connection
        .prepare(
          `
        INSERT INTO analysis_runs(
          id, project_id, file_id, schema_version, engine, payload_json,
          recommendations_json, ai_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          analysisId,
          projectId,
          fileId,
          payload.schemaVersion,
          payload.engine,
          JSON.stringify(payload),
          JSON.stringify(recommendations),
          payload.aiStatus,
          createdAt
        );

      for (const [key, value] of Object.entries(payload.facts)) {
        this.connection
          .prepare(
            `
          INSERT INTO project_fields(project_id, field_key, value_json, source, confidence, evidence_json, updated_at)
          VALUES (?, ?, ?, 'source_document', ?, ?, ?)
          ON CONFLICT(project_id, field_key) DO UPDATE SET
            value_json = excluded.value_json,
            source = excluded.source,
            confidence = excluded.confidence,
            evidence_json = excluded.evidence_json,
            updated_at = excluded.updated_at
        `
          )
          .run(
            projectId,
            key,
            JSON.stringify(value.value),
            value.confidence,
            JSON.stringify({
              page: value.page,
              quote: value.quote,
              verificationStatus: value.verificationStatus,
              ambiguityReasons: value.ambiguityReasons,
              candidates: value.candidates,
            }),
            createdAt
          );
      }

      const current = this.getProjectRow(projectId);
      const locked = Boolean(current?.status_locked);
      const companyName = textFact("company");
      this.connection
        .prepare(
          `
        UPDATE projects SET
          name = COALESCE(?, name),
          name_key = COALESCE(?, name_key),
          product = ?, industry = ?, funding_round = ?, funding_amount = ?,
          order_amount = ?, has_loi = ?, revenue_amount = ?, customer_summary = ?,
          gross_margin = ?, monthly_burn = ?, runway_months = ?, team_summary = ?,
          business_model = ?, funding_use = ?, ai_status = ?,
          analysis_state = 'done', tags_json = ?, updated_at = ?
        WHERE id = ?
      `
        )
        .run(
          companyName,
          companyName ? normalizeProjectName(companyName) : null,
          textFact("product"),
          textFact("industry"),
          textFact("fundingRound"),
          numberFact("fundingAmount"),
          numberFact("orderAmount"),
          fact("hasLoi") === true ? 1 : 0,
          numberFact("revenueAmount"),
          textFact("customers"),
          numberFact("grossMargin"),
          numberFact("monthlyBurn"),
          numberFact("runwayMonths"),
          textFact("team"),
          textFact("businessModel"),
          textFact("fundingUse"),
          payload.aiStatus,
          JSON.stringify(payload.tags),
          createdAt,
          projectId
        );

      this.addStatusEvent(
        projectId,
        "system",
        "已完成初筛",
        `分析 schema ${payload.schemaVersion}`
      );
      this.addStatusEvent(
        projectId,
        "ai",
        payload.aiStatus,
        "基于本地材料和确定性规则的初筛状态"
      );
      if (
        !locked &&
        normalizeManagementDecision(String(current?.management_status)) ===
          "待判断"
      ) {
        this.addStatusEvent(
          projectId,
          "system",
          "待判断",
          "等待负责人给出管理判断"
        );
      }
      const latestFile = this.getLatestFile(projectId);
      this.refreshSearch(
        projectId,
        String(latestFile?.extracted_text ?? ""),
        payload
      );
    });
    this.refreshCodexAnalysisStaleness(projectId);
  }

  markAnalysisFailed(projectId: string, message: string) {
    this.connection
      .prepare(
        "UPDATE projects SET analysis_state = 'failed', ai_status = '信息不足', updated_at = ? WHERE id = ?"
      )
      .run(now(), projectId);
    this.addStatusEvent(projectId, "ai", "信息不足", message);
  }

  addStatusEvent(
    projectId: string,
    source: "system" | "ai" | "human",
    status: ProjectStatus,
    note?: string
  ) {
    this.connection
      .prepare(
        "INSERT INTO status_events(project_id, source, status, note, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(projectId, source, status, note ?? null, now());
  }

  updateManagementStatus(
    projectId: string,
    status: ManagementDecision,
    locked: boolean,
    note?: string
  ) {
    if (this.isProjectArchived(projectId))
      throw new Error("项目位于回收站，请先恢复后再修改管理判断");
    const result = this.connection
      .prepare(
        "UPDATE projects SET management_status = ?, status_locked = ?, updated_at = ? WHERE id = ?"
      )
      .run(status, locked ? 1 : 0, now(), projectId);
    if (result.changes === 0) throw new Error("项目不存在");
    this.addStatusEvent(
      projectId,
      "human",
      status,
      note ?? (locked ? "人工更新并锁定" : "人工更新")
    );
  }

  updateShareMode(projectId: string, shareMode: ShareMode) {
    if (this.isProjectArchived(projectId))
      throw new Error("项目位于回收站，请先恢复后再修改共享边界");
    const result = this.connection
      .prepare(
        "UPDATE projects SET share_mode = ?, sync_state = 'local_only', updated_at = ? WHERE id = ?"
      )
      .run(shareMode, now(), projectId);
    if (result.changes === 0) throw new Error("项目不存在");
  }

  private mapFieldDefinition(row: ProjectRow): CustomFieldDefinition {
    return {
      key: String(row.field_key),
      label: String(row.label),
      fieldType: String(row.field_type) as CustomFieldType,
      options: parseJson<string[]>(row.options_json, []),
      showInList: Boolean(row.show_in_list),
      active: Boolean(row.active),
      sortOrder: Number(row.sort_order),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  listFieldDefinitions(activeOnly = false) {
    return this.connection
      .prepare(
        `SELECT * FROM field_definitions ${activeOnly ? "WHERE active = 1" : ""}
         ORDER BY sort_order, created_at`
      )
      .all()
      .map(row => this.mapFieldDefinition(row as ProjectRow));
  }

  createFieldDefinition(input: {
    label: string;
    fieldType: CustomFieldType;
    options?: string[];
    showInList?: boolean;
  }) {
    const stamp = now();
    const key = `custom_${crypto.randomUUID().replace(/-/g, "")}`;
    const nextOrder = this.connection
      .prepare(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM field_definitions"
      )
      .get() as { value: number };
    this.connection
      .prepare(
        `INSERT INTO field_definitions(
          field_key, label, field_type, options_json, show_in_list, active,
          sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
      )
      .run(
        key,
        input.label.trim(),
        input.fieldType,
        JSON.stringify(input.options ?? []),
        input.showInList ? 1 : 0,
        Number(nextOrder.value),
        stamp,
        stamp
      );
    return this.listFieldDefinitions().find(field => field.key === key)!;
  }

  updateFieldDefinition(
    key: string,
    input: {
      label?: string;
      options?: string[];
      showInList?: boolean;
      active?: boolean;
      sortOrder?: number;
    }
  ) {
    const current = this.connection
      .prepare("SELECT * FROM field_definitions WHERE field_key = ?")
      .get(key) as ProjectRow | undefined;
    if (!current) throw new Error("自定义字段不存在");
    this.connection
      .prepare(
        `UPDATE field_definitions SET
          label = ?, options_json = ?, show_in_list = ?, active = ?,
          sort_order = ?, updated_at = ? WHERE field_key = ?`
      )
      .run(
        input.label?.trim() || String(current.label),
        JSON.stringify(input.options ?? parseJson(current.options_json, [])),
        input.showInList === undefined
          ? Number(current.show_in_list)
          : input.showInList
            ? 1
            : 0,
        input.active === undefined
          ? Number(current.active)
          : input.active
            ? 1
            : 0,
        input.sortOrder ?? Number(current.sort_order),
        now(),
        key
      );
    return this.listFieldDefinitions().find(field => field.key === key)!;
  }

  setCustomFieldValue(projectId: string, fieldKey: string, value: unknown) {
    if (!this.getProjectRow(projectId)) throw new Error("项目不存在");
    if (this.isProjectArchived(projectId))
      throw new Error("项目位于回收站，请先恢复后再修改字段");
    const definition = this.connection
      .prepare(
        "SELECT field_key, field_type, options_json FROM field_definitions WHERE field_key = ? AND active = 1"
      )
      .get(fieldKey) as ProjectRow | undefined;
    if (!definition) throw new Error("自定义字段不存在或已停用");
    const fieldType = String(definition.field_type) as CustomFieldType;
    if (value !== null) {
      if (fieldType === "number" && typeof value !== "number")
        throw new Error("该字段需要数字值");
      if (fieldType === "boolean" && typeof value !== "boolean")
        throw new Error("该字段需要是/否值");
      if (
        ["text", "date", "select"].includes(fieldType) &&
        typeof value !== "string"
      )
        throw new Error("该字段需要文本值");
      if (
        fieldType === "select" &&
        !parseJson<string[]>(definition.options_json, []).includes(
          String(value)
        )
      )
        throw new Error("该选项不在字段定义中");
    }
    const stamp = now();
    this.connection
      .prepare(
        `INSERT INTO project_fields(
          project_id, field_key, value_json, source, confidence, evidence_json, updated_at
        ) VALUES (?, ?, ?, 'human_input', 1, NULL, ?)
        ON CONFLICT(project_id, field_key) DO UPDATE SET
          value_json = excluded.value_json,
          source = 'human_input', confidence = 1, evidence_json = NULL,
          updated_at = excluded.updated_at`
      )
      .run(projectId, fieldKey, JSON.stringify(value), stamp);
    this.connection
      .prepare("UPDATE projects SET updated_at = ? WHERE id = ?")
      .run(stamp, projectId);
    return this.customFieldsForProject(projectId, false);
  }

  private customFieldsForProject(projectId: string, listOnly: boolean) {
    return this.connection
      .prepare(
        `SELECT d.*, f.value_json
         FROM field_definitions d
         LEFT JOIN project_fields f
           ON f.field_key = d.field_key AND f.project_id = ?
         WHERE d.active = 1 ${listOnly ? "AND d.show_in_list = 1" : ""}
         ORDER BY d.sort_order, d.created_at`
      )
      .all(projectId)
      .map(row => {
        const definition = this.mapFieldDefinition(row as ProjectRow);
        return {
          ...definition,
          value: parseJson((row as ProjectRow).value_json, null),
        };
      });
  }

  listProjectIdentities() {
    return this.connection
      .prepare(
        "SELECT id, name, name_key FROM projects WHERE archived = 0 ORDER BY updated_at DESC"
      )
      .all()
      .map(row => ({
        id: String((row as ProjectRow).id),
        name: String((row as ProjectRow).name),
        nameKey: String((row as ProjectRow).name_key),
      }));
  }

  findMaterialByHash(sha256: string) {
    return this.connection
      .prepare("SELECT * FROM project_materials WHERE sha256 = ?")
      .get(sha256) as ProjectRow | undefined;
  }

  insertMaterial(input: {
    id: string;
    projectId: string | null;
    suggestedProjectId: string | null;
    originalName: string;
    storedPath: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    category: MaterialCategory;
    extractionStatus: "parsed" | "unsupported" | "failed";
    extractionError: string | null;
    extractedText: string;
    pageCount: number;
  }) {
    const stamp = now();
    this.connection
      .prepare(
        `INSERT INTO project_materials(
          id, project_id, suggested_project_id, original_name, stored_path,
          mime_type, size_bytes, sha256, category, extraction_status,
          extraction_error, extracted_text, page_count, state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.projectId,
        input.suggestedProjectId,
        input.originalName,
        input.storedPath,
        input.mimeType,
        input.sizeBytes,
        input.sha256,
        input.category,
        input.extractionStatus,
        input.extractionError,
        input.extractedText,
        input.pageCount,
        input.projectId ? "attached" : "pending",
        stamp,
        stamp
      );
    if (input.projectId) {
      this.connection
        .prepare("UPDATE projects SET updated_at = ? WHERE id = ?")
        .run(stamp, input.projectId);
    }
  }

  private mapMaterial(row: ProjectRow) {
    return {
      id: String(row.id),
      projectId: typeof row.project_id === "string" ? row.project_id : null,
      suggestedProjectId:
        typeof row.suggested_project_id === "string"
          ? row.suggested_project_id
          : null,
      originalName: String(row.original_name),
      mimeType: String(row.mime_type),
      sizeBytes: Number(row.size_bytes),
      sha256: String(row.sha256),
      category: String(row.category) as MaterialCategory,
      extractionStatus: String(row.extraction_status) as
        | "parsed"
        | "unsupported"
        | "failed",
      extractionError:
        typeof row.extraction_error === "string" ? row.extraction_error : null,
      pageCount: Number(row.page_count),
      state: String(row.state) as "pending" | "attached",
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      url: `/api/materials/${String(row.id)}`,
    };
  }

  listPendingMaterials() {
    return this.connection
      .prepare(
        "SELECT * FROM project_materials WHERE state = 'pending' ORDER BY created_at DESC LIMIT 100"
      )
      .all()
      .map(row => this.mapMaterial(row as ProjectRow));
  }

  listProjectMaterials(projectId: string) {
    return this.connection
      .prepare(
        "SELECT * FROM project_materials WHERE project_id = ? AND state = 'attached' ORDER BY created_at DESC"
      )
      .all(projectId)
      .map(row => this.mapMaterial(row as ProjectRow));
  }

  assignMaterial(materialId: string, projectId: string) {
    if (!this.getProjectRow(projectId)) throw new Error("项目不存在");
    if (this.isProjectArchived(projectId))
      throw new Error("项目位于回收站，请先恢复后再归入补充材料");
    const stamp = now();
    const result = this.connection
      .prepare(
        `UPDATE project_materials SET project_id = ?, state = 'attached',
         updated_at = ? WHERE id = ?`
      )
      .run(projectId, stamp, materialId);
    if (result.changes === 0) throw new Error("资料不存在");
    this.connection
      .prepare("UPDATE projects SET updated_at = ? WHERE id = ?")
      .run(stamp, projectId);
    return this.connection
      .prepare("SELECT * FROM project_materials WHERE id = ?")
      .get(materialId) as ProjectRow;
  }

  getMaterial(materialId: string) {
    return this.connection
      .prepare("SELECT * FROM project_materials WHERE id = ?")
      .get(materialId) as ProjectRow | undefined;
  }

  private refreshSearch(
    projectId: string,
    content: string,
    payload: AnalysisPayload
  ) {
    const project = this.getProjectRow(projectId);
    if (!project) return;
    this.connection
      .prepare("DELETE FROM project_search WHERE project_id = ?")
      .run(projectId);
    this.connection
      .prepare(
        `
      INSERT INTO project_search(project_id, name, product, industry, content, fields)
      VALUES (?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        projectId,
        String(project.name),
        String(project.product ?? ""),
        String(project.industry ?? ""),
        content,
        JSON.stringify(payload.facts)
      );
  }

  listProjects(filters: ProjectFilters = {}): ProjectListItem[] {
    const conditions = ["p.archived = 0"];
    const params: SQLInputValue[] = [];
    if (filters.search?.trim()) {
      const like = `%${filters.search.trim()}%`;
      const match = ftsQuery(filters.search);
      conditions.push(`(
        p.name LIKE ? OR p.product LIKE ? OR p.industry LIKE ? OR
        p.id IN (SELECT project_id FROM project_search WHERE project_search MATCH ?) OR
        p.id IN (SELECT project_id FROM project_fields WHERE value_json LIKE ?)
      )`);
      params.push(
        like,
        like,
        like,
        match || `"${filters.search.trim()}"`,
        like
      );
    }
    if (filters.rounds?.length) {
      conditions.push(
        `p.funding_round IN (${filters.rounds.map(() => "?").join(",")})`
      );
      params.push(...filters.rounds);
    }
    if (filters.importedAfter) {
      conditions.push("p.imported_at >= ?");
      params.push(filters.importedAfter);
    }
    if (filters.importedBefore) {
      conditions.push("p.imported_at <= ?");
      params.push(filters.importedBefore);
    }
    if (filters.traction === "orders")
      conditions.push("p.order_amount IS NOT NULL AND p.order_amount > 0");
    if (filters.traction === "revenue")
      conditions.push("p.revenue_amount IS NOT NULL AND p.revenue_amount > 0");
    if (filters.traction === "loi") conditions.push("p.has_loi = 1");

    const statement = this.connection.prepare(`
      SELECT p.* FROM projects p
      WHERE ${conditions.join(" AND ")}
      ORDER BY p.updated_at DESC
    `);
    const rows = statement.all(...params).map(row => {
      const project = toProjectListItem(row as ProjectRow);
      project.customFields = this.customFieldsForProject(project.id, true);
      return project;
    });
    return rows.filter(project => {
      const industryMatches =
        !filters.industries?.length ||
        (project.industry !== null &&
          filters.industries.includes(project.industry));
      const statusMatches =
        !filters.statuses?.length ||
        filters.statuses.includes(project.managementStatus);
      return industryMatches && statusMatches;
    });
  }

  filterOptions() {
    const presentIndustries = this.connection
      .prepare(
        "SELECT DISTINCT industry AS value FROM projects WHERE archived = 0 AND industry IS NOT NULL AND industry != '' ORDER BY industry"
      )
      .all()
      .map(row =>
        normalizeIndustryCategory(String((row as { value: string }).value))
      )
      .filter((value): value is NonNullable<typeof value> => value !== null);
    const industries = INDUSTRY_CATEGORIES.filter(category =>
      presentIndustries.includes(category)
    );
    const rounds = this.connection
      .prepare(
        "SELECT DISTINCT funding_round AS value FROM projects WHERE archived = 0 AND funding_round IS NOT NULL AND funding_round != '' ORDER BY funding_round"
      )
      .all()
      .map(row => String((row as { value: string }).value));
    return { industries, rounds };
  }

  getProject(id: string): ProjectDetail | null {
    const row = this.getProjectRow(id);
    if (!row) return null;
    const files = this.connection
      .prepare(
        "SELECT * FROM project_files WHERE project_id = ? ORDER BY version_number DESC"
      )
      .all(id)
      .map(file => {
        const value = file as ProjectRow;
        return {
          id: String(value.id),
          projectId: String(value.project_id),
          originalName: String(value.original_name),
          mimeType: String(value.mime_type),
          sizeBytes: Number(value.size_bytes),
          sha256: String(value.sha256),
          versionNumber: Number(value.version_number),
          previousFileId:
            typeof value.previous_file_id === "string"
              ? value.previous_file_id
              : null,
          extractionStatus: String(value.extraction_status) as
            | "parsed"
            | "unsupported"
            | "failed",
          extractionError:
            typeof value.extraction_error === "string"
              ? value.extraction_error
              : null,
          pageCount: Number(value.page_count),
          createdAt: String(value.created_at),
          shareMode: String(value.share_mode) as ProjectListItem["shareMode"],
          syncState: String(value.sync_state) as ProjectListItem["syncState"],
          localVersion: Number(value.local_version),
          remoteVersion: Number(value.remote_version),
          url: `/api/files/${String(value.id)}`,
        };
      });
    const analysisRow = this.connection
      .prepare(
        "SELECT payload_json, recommendations_json FROM analysis_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(id) as
      | { payload_json: string; recommendations_json: string }
      | undefined;
    const fields = this.connection
      .prepare(
        "SELECT * FROM project_fields WHERE project_id = ? ORDER BY field_key"
      )
      .all(id)
      .map(field => {
        const value = field as ProjectRow;
        return {
          key: String(value.field_key),
          value: parseJson(value.value_json, null),
          source: String(value.source),
          confidence: Number(value.confidence),
          evidence: parseJson<{
            page: number | null;
            quote: string | null;
            verificationStatus?: "missing" | "confirmed" | "ambiguous";
            ambiguityReasons?: AnalysisPayload["facts"][string]["ambiguityReasons"];
            candidates?: AnalysisPayload["facts"][string]["candidates"];
          } | null>(value.evidence_json, null),
        };
      });
    const statusHistory = this.connection
      .prepare(
        "SELECT id, source, status, note, created_at FROM status_events WHERE project_id = ? ORDER BY id DESC"
      )
      .all(id)
      .map(event => {
        const value = event as ProjectRow;
        return {
          id: Number(value.id),
          source: String(value.source) as "system" | "ai" | "human",
          status: String(value.status) as ProjectStatus,
          note: typeof value.note === "string" ? value.note : null,
          createdAt: String(value.created_at),
        };
      });

    return {
      ...toProjectListItem(row),
      customFields: this.customFieldsForProject(id, false),
      description: typeof row.description === "string" ? row.description : null,
      customerSummary:
        typeof row.customer_summary === "string" ? row.customer_summary : null,
      monthlyBurn: toNullableNumber(row.monthly_burn),
      teamSummary:
        typeof row.team_summary === "string" ? row.team_summary : null,
      businessModel:
        typeof row.business_model === "string" ? row.business_model : null,
      fundingUse: typeof row.funding_use === "string" ? row.funding_use : null,
      files,
      materials: this.listProjectMaterials(id),
      analysis: analysisRow
        ? parseJson<AnalysisPayload | null>(analysisRow.payload_json, null)
        : null,
      codexAnalyses: this.listCodexAnalysisRuns(id),
      recommendations: analysisRow
        ? parseJson<OptimizationRecommendation[]>(
            analysisRow.recommendations_json,
            []
          )
        : [],
      fields,
      statusHistory,
    };
  }

  getFile(fileId: string) {
    return this.connection
      .prepare("SELECT * FROM project_files WHERE id = ?")
      .get(fileId) as ProjectRow | undefined;
  }

  resolveStoredFile(storedPath: string) {
    const absolute = path.resolve(this.dataDir, storedPath);
    if (!absolute.startsWith(this.dataDir + path.sep))
      throw new Error("非法文件路径");
    return absolute;
  }
}

export function normalizeProjectName(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[（(]?完全虚构[)）]?/g, "")
    .replace(/(?:[-_\s]*(?:v|ver|version|版本)\s*\d+(?:\.\d+)*)$/i, "")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

let defaultDatabase: LocalDatabase | undefined;

export function getDatabase() {
  defaultDatabase ??= new LocalDatabase();
  return defaultDatabase;
}
