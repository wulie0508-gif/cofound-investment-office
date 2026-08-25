import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const baseUrl = (
  process.env.COF_BP_DESK_URL || "http://127.0.0.1:4010"
).replace(/\/$/, "");
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const inferredProjectRoot = path.resolve(scriptDirectory, "..", "..", "..");
const projectRoot = path.resolve(
  process.env.COF_BP_DESK_ROOT || inferredProjectRoot
);
const startScript = path.join(projectRoot, "scripts", "start-local.ps1");
const loopbackService = ["127.0.0.1", "localhost"].includes(
  new URL(baseUrl).hostname
);
let adminCookie = "";
let startupPromise = null;
const FEISHU_CONFIRMATION_TTL_MS = 15 * 60 * 1000;
const feishuConfirmationPlans = new Map();

const codexAnalysisClaimSchema = {
  type: "object",
  properties: {
    title: { type: "string", maxLength: 180 },
    detail: { type: "string", maxLength: 3000 },
    basis: {
      type: "string",
      enum: ["evidence", "inference", "missing_information"],
    },
    evidence: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          fieldKey: { type: ["string", "null"] },
          page: { type: ["integer", "null"], minimum: 1 },
          quote: { type: ["string", "null"], maxLength: 1200 },
        },
        required: ["fieldKey", "page", "quote"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "detail", "basis", "evidence"],
  additionalProperties: false,
};

const codexAnalysisResultSchema = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["1.0"] },
    summary: { type: "string", maxLength: 4000 },
    positiveSignals: {
      type: "array",
      maxItems: 12,
      items: codexAnalysisClaimSchema,
    },
    keyRisks: {
      type: "array",
      maxItems: 12,
      items: codexAnalysisClaimSchema,
    },
    frameworkSections: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          key: { type: "string", maxLength: 100 },
          title: { type: "string", maxLength: 180 },
          assessment: {
            type: "string",
            enum: ["supportive", "mixed", "concern", "unknown"],
          },
          detail: { type: "string", maxLength: 3000 },
          evidence: codexAnalysisClaimSchema.properties.evidence,
          counterarguments: {
            type: "array",
            maxItems: 8,
            items: { type: "string", maxLength: 1200 },
          },
          unresolvedQuestions: {
            type: "array",
            maxItems: 8,
            items: { type: "string", maxLength: 800 },
          },
        },
        required: [
          "key",
          "title",
          "assessment",
          "detail",
          "evidence",
          "counterarguments",
          "unresolvedQuestions",
        ],
        additionalProperties: false,
      },
    },
    unresolvedQuestions: {
      type: "array",
      maxItems: 20,
      items: { type: "string", maxLength: 800 },
    },
    nextActions: {
      type: "array",
      maxItems: 12,
      items: { type: "string", maxLength: 800 },
    },
    aiSuggestion: {
      type: "string",
      enum: [
        "新导入",
        "已解析",
        "已完成初筛",
        "信息不足",
        "已有商业信号",
        "商业信号较强",
        "高风险待核实",
      ],
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: [
    "schemaVersion",
    "summary",
    "positiveSignals",
    "keyRisks",
    "frameworkSections",
    "unresolvedQuestions",
    "nextActions",
    "aiSuggestion",
    "confidence",
  ],
  additionalProperties: false,
};

const tools = [
  {
    name: "cofound_health",
    title: "Open Cofound BP Desk",
    description:
      "Ensure the loopback-only Cofound BP Desk service is running, starting it automatically when possible.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "list_bp_projects",
    title: "List local BP projects",
    description: "Search and filter projects in the local SQLite BP library.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string" },
        industry: { type: "string" },
        round: { type: "string" },
        status: { type: "string" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_bp_project",
    title: "Get BP analysis",
    description:
      "Get facts, evidence, risks, recommendations, versions and statuses for one local project.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string" } },
      required: ["project_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "list_recycled_bp_projects",
    title: "List projects in the local recycle bin",
    description:
      "List projects hidden from the active local workspace. Files, versions, analyses, Feishu copies and external shares are retained.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "move_bp_project_to_recycle_bin",
    title: "Move a local BP project to the recycle bin",
    description:
      "Hide one project from the local workspace without deleting local files, version history, analyses, Feishu copies, or external shares. Call only after clearly explaining those boundaries and receiving an explicit confirmation; map that intent to confirmed=true.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", minLength: 3, maxLength: 160 },
        confirmed: { type: "boolean", const: true },
      },
      required: ["project_id", "confirmed"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "restore_bp_project",
    title: "Restore a project from the local recycle bin",
    description:
      "Restore one recycled project with its original ID, files, facts, versions and analyses.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", minLength: 3, maxLength: 160 },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "import_bp_file",
    title: "Import local BP file",
    description:
      "Import a user-specified local BP path, hash-dedupe it, create a version and analyze it without cloud upload.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        project_id: { type: "string" },
      },
      required: ["file_path"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "scan_bp_folder",
    title: "Scan local BP folder",
    description:
      "Recursively scan a user-specified local folder for supported BP files, up to 500 files.",
    inputSchema: {
      type: "object",
      properties: { directory: { type: "string" } },
      required: ["directory"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "import_project_material",
    title: "Import project material",
    description:
      "Import a local financial model, diligence file, contract, product document, research report, meeting note or other project material without treating it as a BP version.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        project_id: { type: "string" },
        category: {
          type: "string",
          enum: [
            "financial_model",
            "due_diligence",
            "company_legal",
            "contracts_orders",
            "product_material",
            "market_research",
            "meeting_notes",
            "other",
          ],
        },
      },
      required: ["file_path"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "list_pending_materials",
    title: "List unassigned materials",
    description:
      "List locally received project materials whose project could not be identified reliably.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "assign_project_material",
    title: "Assign project material",
    description: "Assign one pending local material to an existing BP project.",
    inputSchema: {
      type: "object",
      properties: {
        material_id: { type: "string" },
        project_id: { type: "string" },
      },
      required: ["material_id", "project_id"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "list_custom_fields",
    title: "List custom project fields",
    description:
      "List leader-defined project field definitions and whether they appear in the project list.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "create_custom_field",
    title: "Create custom project field",
    description:
      "Create a reusable local project field such as owner, internal priority or next follow-up date.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string" },
        field_type: {
          type: "string",
          enum: ["text", "number", "date", "boolean", "select"],
        },
        options: { type: "array", items: { type: "string" } },
        show_in_list: { type: "boolean" },
      },
      required: ["label", "field_type"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "set_project_custom_field",
    title: "Set project custom field",
    description:
      "Set one leader-defined custom field value on a local project.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        field_key: { type: "string" },
        value: { type: ["string", "number", "boolean", "null"] },
      },
      required: ["project_id", "field_key", "value"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_wechat_bp_inbox_status",
    title: "Check WeChat BP inbox",
    description:
      "Check the local File Transfer Assistant BP inbox, its trigger phrase, baseline state and current scan job.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "initialize_wechat_bp_inbox",
    title: "Initialize WeChat BP inbox",
    description:
      "Create a safe baseline of existing local WeChat files so historical attachments are never bulk-imported.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "receive_wechat_bp_files",
    title: "Receive BP from WeChat",
    description:
      "Start the local scoped File Transfer Assistant scan and import only a new BP paired with the configured BP trigger.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "analyze_bp_project",
    title: "Reanalyze local BP",
    description:
      "Re-run the evidence-constrained local analysis on the latest project version.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string" } },
      required: ["project_id"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "analyze_bp_batch",
    title: "Analyze a BP batch",
    description:
      "Re-run deterministic local analysis for several projects with bounded concurrency suitable for a personal laptop.",
    inputSchema: {
      type: "object",
      properties: {
        project_ids: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 12,
        },
        concurrency: {
          type: "integer",
          minimum: 1,
          maximum: 3,
          default: 2,
        },
      },
      required: ["project_ids"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "claim_pending_investment_analysis",
    title: "Claim a Cofound investment-analysis task",
    description:
      "Claim one queued Cofound analysis task with an exclusive lease. Returns an opaque claim token; never returns BP text or a local file path. Use the requested mode: auto routes through the primary Skill, while an explicit mode must be respected.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        claimed_by: { type: "string", minLength: 1, maxLength: 120 },
        lease_seconds: {
          type: "integer",
          minimum: 60,
          maximum: 3600,
          default: 1800,
        },
        codex_thread_id: { type: "string", maxLength: 200 },
        codex_turn_id: { type: "string", maxLength: 200 },
      },
      required: ["claimed_by"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "update_investment_analysis_task",
    title: "Update Cofound analysis progress",
    description:
      "Move a claimed analysis task into analyzing and renew its lease. This call is repeatable and is the progress heartbeat for long analysis: call it at least every 10 minutes until completion or failure, normally with lease_seconds 1800. It may record the selected Skill and routing reason but never saves an investment conclusion.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        claim_token: { type: "string", minLength: 32, maxLength: 256 },
        message: {
          type: "string",
          minLength: 1,
          maxLength: 500,
          description:
            "Short user-readable progress or heartbeat message. Never include BP text, evidence quotes, paths, hashes, secrets, or the claim token.",
        },
        selected_skill: {
          type: "string",
          enum: [
            "review-early-stage-investment",
            "assess-market-first",
            "assess-founder-first",
            "assess-long-term-value",
          ],
        },
        router_reason: { type: "string", minLength: 1, maxLength: 1000 },
        codex_thread_id: { type: "string", maxLength: 200 },
        codex_turn_id: { type: "string", maxLength: 200 },
        lease_seconds: {
          type: "integer",
          minimum: 60,
          maximum: 3600,
          default: 1800,
          description:
            "Lease duration renewed from this call. Use 1800 seconds with the required 10-minute heartbeat cadence.",
        },
      },
      required: ["task_id", "claim_token", "message"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "complete_investment_analysis_task",
    title: "Link a completed analysis to its Cofound task",
    description:
      "After complete_investment_analysis succeeds, link that immutable run to the leased task. Validates project version and selected Skill; never changes the human management status.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        claim_token: { type: "string", minLength: 32, maxLength: 256 },
        run_id: { type: "string" },
        selected_skill: {
          type: "string",
          enum: [
            "review-early-stage-investment",
            "assess-market-first",
            "assess-founder-first",
            "assess-long-term-value",
          ],
        },
        router_reason: { type: "string", minLength: 1, maxLength: 1000 },
        codex_thread_id: { type: "string", maxLength: 200 },
        codex_turn_id: { type: "string", maxLength: 200 },
      },
      required: [
        "task_id",
        "claim_token",
        "run_id",
        "selected_skill",
        "router_reason",
      ],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "fail_investment_analysis_task",
    title: "Report a failed Cofound analysis task",
    description:
      "Close a leased Cofound analysis task as failed with a concise recoverable error. Do not include BP text, secrets, or long debug dumps.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        claim_token: { type: "string", minLength: 32, maxLength: 256 },
        error_detail: { type: "string", minLength: 1, maxLength: 2000 },
        codex_thread_id: { type: "string", maxLength: 200 },
        codex_turn_id: { type: "string", maxLength: 200 },
      },
      required: ["task_id", "claim_token", "error_detail"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "prepare_investment_analysis",
    title: "Prepare evidence-bound Codex analysis",
    description:
      "Freeze the current local file and deterministic fact snapshot before a Codex investment Skill forms judgments. Pass task_id only when continuing an exact website-created analysis task so the run is bound to that request context. Reuses an unfinished run for the same snapshot unless force is true.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        skill_name: {
          type: "string",
          enum: [
            "review-early-stage-investment",
            "assess-market-first",
            "assess-founder-first",
            "assess-long-term-value",
          ],
        },
        requested_by: { type: "string", maxLength: 120 },
        task_id: {
          type: "string",
          description:
            "Optional exact website-created Cofound analysis task ID. Omit for ordinary Codex analysis.",
        },
        force: { type: "boolean", default: false },
      },
      required: ["project_id", "skill_name", "requested_by"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "complete_investment_analysis",
    title: "Save evidence-bound Codex analysis",
    description:
      "Validate and save a structured Codex investment judgment only when the prepared fact snapshot still matches the current local project. Never changes the human management status.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        model_name: { type: "string", minLength: 1, maxLength: 160 },
        result: codexAnalysisResultSchema,
      },
      required: ["run_id", "model_name", "result"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "read_prepared_analysis_pages",
    title: "Read pages bound to a prepared analysis",
    description:
      "Read up to eight selected pages from the exact local file frozen by prepare_investment_analysis. Verifies SHA-256 and never switches to a newer project file.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        page_numbers: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          uniqueItems: true,
          items: { type: "integer", minimum: 1, maximum: 10000 },
        },
      },
      required: ["run_id", "page_numbers"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "update_bp_status",
    title: "Update BP management status",
    description:
      "Update the human management status and optionally lock it against later AI overwrites.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        status: { type: "string" },
        locked: { type: "boolean" },
        note: { type: "string" },
      },
      required: ["project_id", "status", "locked"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "submit_product_feedback",
    title: "Submit Cofound product feedback",
    description:
      "Create one local product-feedback report after the user clearly asks to report an observed Cofound product problem. The local service supplies the signed-in display name and queues a privacy-safe handoff; do not use this for BP contents, investment judgments, or debug dumps.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", minLength: 1, maxLength: 4000 },
        expected_outcome: { type: "string", minLength: 1, maxLength: 2000 },
        category: {
          type: "string",
          enum: [
            "interface",
            "analysis",
            "workflow",
            "sharing",
            "data",
            "other",
          ],
        },
        impact: {
          type: "string",
          enum: ["minor", "inconvenient", "blocked"],
        },
      },
      required: ["description", "category", "impact"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "list_product_feedback",
    title: "List Cofound product feedback",
    description:
      "List local teammate feedback and its diagnosis, synchronization, and maintainer-triage state. This returns product-maintenance summaries only, not BP data or raw diagnostics.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: [
            "awaiting_diagnosis",
            "ready_for_codex",
            "working",
            "checking",
            "needs_attention",
            "ready",
          ],
        },
        sync_status: {
          type: "string",
          enum: ["pending", "synced", "failed"],
        },
        triage_status: {
          type: "string",
          enum: ["new", "needs_info", "duplicate", "deferred", "accepted"],
        },
        source: { type: "string", enum: ["local", "remote"] },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "claim_product_feedback",
    title: "Claim a Cofound feedback diagnosis",
    description:
      "Claim one open product-feedback report for diagnosis by this local Codex. The private claimToken returned by the service is only for later MCP integrity calls and must never appear in visible feedback or Feishu.",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: { type: "string", minLength: 8, maxLength: 160 },
        claimed_by: { type: "string", minLength: 1, maxLength: 120 },
        model_name: { type: "string", minLength: 1, maxLength: 200 },
      },
      required: ["feedback_id", "claimed_by", "model_name"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "update_product_feedback_progress",
    title: "Update feedback diagnosis progress",
    description:
      "Post a short working or checking update for a claimed product-feedback report. Use product language only; never include paths, source locations, commands, logs, tokens, project data, or external links.",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: { type: "string", minLength: 8, maxLength: 160 },
        claim_token: { type: "string", minLength: 32, maxLength: 256 },
        status: { type: "string", enum: ["working", "checking"] },
        message: { type: "string", minLength: 1, maxLength: 1000 },
      },
      required: ["feedback_id", "claim_token", "status"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "renew_product_feedback_claim",
    title: "Renew a feedback diagnosis claim",
    description:
      "Renew the private lease for a long-running feedback diagnosis without creating a visible progress message.",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: { type: "string", minLength: 8, maxLength: 160 },
        claim_token: { type: "string", minLength: 32, maxLength: 256 },
      },
      required: ["feedback_id", "claim_token"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "mark_product_feedback_needs_attention",
    title: "Return feedback for attention",
    description:
      "Stop a claimed feedback diagnosis safely when it cannot continue. The visible reason must be non-technical and privacy-safe.",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: { type: "string", minLength: 8, maxLength: 160 },
        claim_token: { type: "string", minLength: 32, maxLength: 256 },
        message: { type: "string", minLength: 1, maxLength: 1000 },
      },
      required: ["feedback_id", "claim_token", "message"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "complete_product_feedback_diagnosis",
    title: "Complete a Cofound feedback diagnosis",
    description:
      "Store one privacy-safe structured diagnosis and queue a new synchronization snapshot. Completion does not accept, implement, release, deploy, or publish the proposed adjustment.",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: { type: "string", minLength: 8, maxLength: 160 },
        claim_token: { type: "string", minLength: 32, maxLength: 256 },
        model_name: { type: "string", minLength: 1, maxLength: 200 },
        trial_fix_status: {
          type: "string",
          enum: ["not_attempted", "not_available", "passed", "failed"],
        },
        diagnosis: {
          type: "object",
          properties: {
            summary: { type: "string", minLength: 1, maxLength: 4000 },
            proposedActions: {
              type: "array",
              maxItems: 50,
              items: { type: "string", minLength: 1, maxLength: 1000 },
            },
            checks: {
              type: "array",
              maxItems: 50,
              items: {
                type: "object",
                properties: {
                  label: { type: "string", minLength: 1, maxLength: 200 },
                  status: {
                    type: "string",
                    enum: ["passed", "warning", "failed"],
                  },
                  summary: { type: "string", minLength: 1, maxLength: 1000 },
                },
                required: ["label", "status", "summary"],
                additionalProperties: false,
              },
            },
            risks: {
              type: "array",
              maxItems: 50,
              items: { type: "string", minLength: 1, maxLength: 1000 },
            },
            openQuestions: {
              type: "array",
              maxItems: 50,
              items: { type: "string", minLength: 1, maxLength: 1000 },
            },
          },
          required: [
            "summary",
            "proposedActions",
            "checks",
            "risks",
            "openQuestions",
          ],
          additionalProperties: false,
        },
      },
      required: [
        "feedback_id",
        "claim_token",
        "model_name",
        "trial_fix_status",
        "diagnosis",
      ],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "sync_product_feedback",
    title: "Synchronize one product-feedback report",
    description:
      "Send the pending privacy-safe snapshots for exactly one local feedback report to the configured internal Feishu maintenance ledger. If the ledger is not configured, the report remains saved locally. This never creates a Base, table, field, or attachment.",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: { type: "string", minLength: 8, maxLength: 160 },
      },
      required: ["feedback_id"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "refresh_product_feedback_status",
    title: "Refresh my feedback status",
    description:
      "Read only the configured Feishu rows that match this installation's own local feedback keys and apply newer maintainer-status updates. It must not enumerate the team's full maintenance inbox.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "refresh_maintenance_feedback",
    title: "Refresh the maintainer feedback inbox",
    description:
      "On the maintainer installation only, pull the internal Feishu product-feedback ledger into the local review inbox. This does not accept, edit, implement, or release any report.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "triage_product_feedback",
    title: "Triage one product-feedback report",
    description:
      "On the maintainer installation only, record one plain-language decision. Accepting creates exactly one formal local iteration task; other actions require a note for the reporter. The decision queues a safe Feishu status update but does not change code or release a version.",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: { type: "string", minLength: 8, maxLength: 160 },
        action: {
          type: "string",
          enum: ["needs_info", "duplicate", "deferred", "accept"],
        },
        note: { type: "string", minLength: 1, maxLength: 2000 },
      },
      required: ["feedback_id", "action"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "close_product_feedback_maintenance",
    title: "Close completed product feedback",
    description:
      "On the maintainer installation only, mark an accepted feedback report completed after its linked formal iteration is already completed. This queues a safe status update and does not itself modify or release code.",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: { type: "string", minLength: 8, maxLength: 160 },
        note: { type: "string", minLength: 1, maxLength: 2000 },
      },
      required: ["feedback_id"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "list_product_iterations",
    title: "List Cofound product iteration tasks",
    description:
      "List product-code iteration tasks submitted through the local Cofound web workbench. Use this only for product maintenance tasks, never for BP analysis or project-file processing.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "claim_product_iteration",
    title: "Claim a Cofound product iteration",
    description:
      "Claim one queued web iteration task for this Codex run. The response includes a private claimToken and lease expiry for later MCP calls; never copy either into progress, website results, preview URLs, or user-facing text. Claiming is a coordination lock, not permission to merge, deploy, publish, write Feishu, or process BP originals.",
    inputSchema: {
      type: "object",
      properties: {
        iteration_id: { type: "string", minLength: 1, maxLength: 200 },
        claimed_by: { type: "string", minLength: 1, maxLength: 120 },
        model_name: { type: "string", minLength: 1, maxLength: 160 },
      },
      required: ["iteration_id", "claimed_by", "model_name"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "update_product_iteration_progress",
    title: "Update product iteration progress",
    description:
      "Post a short, user-facing working or checking update for a claimed web iteration task. Do not include secrets, claim tokens, Git identifiers, file paths, raw commands, prompts, logs, or large diffs.",
    inputSchema: {
      type: "object",
      properties: {
        iteration_id: { type: "string", minLength: 1, maxLength: 200 },
        claim_token: {
          type: "string",
          minLength: 32,
          maxLength: 256,
          description:
            "Private claimToken returned by claim_product_iteration. Pass only as MCP integrity input and never place it in user-visible text.",
        },
        status: { type: "string", enum: ["working", "checking"] },
        message: { type: "string", minLength: 1, maxLength: 2000 },
      },
      required: ["iteration_id", "claim_token", "status", "message"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "mark_product_iteration_needs_attention",
    title: "Return a product iteration for attention",
    description:
      "Stop a claimed product iteration safely when it cannot continue. Use plain product language only; do not include claim tokens, Git identifiers, file paths, raw commands, Feishu/Vercel details, or BP contents in the message.",
    inputSchema: {
      type: "object",
      properties: {
        iteration_id: { type: "string", minLength: 1, maxLength: 200 },
        claim_token: {
          type: "string",
          minLength: 32,
          maxLength: 256,
          description:
            "Private claimToken returned by claim_product_iteration.",
        },
        message: { type: "string", minLength: 1, maxLength: 2000 },
      },
      required: ["iteration_id", "claim_token", "message"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "renew_product_iteration_claim",
    title: "Renew a product iteration claim",
    description:
      "Renew the private lease for a long-running claimed product iteration without adding a user-visible progress message. Keep the claim token inside MCP calls only.",
    inputSchema: {
      type: "object",
      properties: {
        iteration_id: { type: "string", minLength: 1, maxLength: 200 },
        claim_token: {
          type: "string",
          minLength: 32,
          maxLength: 256,
          description:
            "Private claimToken returned by claim_product_iteration.",
        },
      },
      required: ["iteration_id", "claim_token"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "complete_product_iteration",
    title: "Return a product iteration for review",
    description:
      "Return the claimed task's structured result to the web workbench for human review. Every result value is non-technical UI copy: never include Git identifiers, paths, commands, tokens, or external URLs. Completion does not approve, merge, deploy, publish, or finalize the change.",
    inputSchema: {
      type: "object",
      properties: {
        iteration_id: { type: "string", minLength: 1, maxLength: 200 },
        claim_token: {
          type: "string",
          minLength: 32,
          maxLength: 256,
          description:
            "Private claimToken returned by claim_product_iteration.",
        },
        model_name: { type: "string", minLength: 1, maxLength: 160 },
        candidate_ref: {
          type: "string",
          minLength: 40,
          maxLength: 64,
          pattern: "^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$",
          description:
            "Private full task-worktree commit ID read immediately before completion. Never include it in the visible result.",
        },
        result: {
          type: "object",
          description:
            "Strict website-review result with a concise summary, change list, checks, risks, and optional safe preview URL.",
          properties: {
            summary: { type: "string", minLength: 1, maxLength: 4000 },
            changes: {
              type: "array",
              maxItems: 100,
              items: { type: "string", minLength: 1, maxLength: 1000 },
            },
            checks: {
              type: "array",
              maxItems: 100,
              items: {
                type: "object",
                properties: {
                  label: { type: "string", minLength: 1, maxLength: 200 },
                  status: {
                    type: "string",
                    enum: ["passed", "warning", "failed"],
                  },
                  summary: {
                    type: "string",
                    minLength: 1,
                    maxLength: 1000,
                  },
                },
                required: ["label", "status", "summary"],
                additionalProperties: false,
              },
            },
            risks: {
              type: "array",
              maxItems: 100,
              items: { type: "string", minLength: 1, maxLength: 1000 },
            },
            previewUrl: {
              type: "string",
              minLength: 1,
              maxLength: 2048,
              pattern: "^/(?!/)[^\\\\]*$",
              description:
                "Optional route inside the running local Cofound website. External, scheme-relative, file, and filesystem URLs are forbidden.",
            },
          },
          required: ["summary", "changes", "checks", "risks"],
          additionalProperties: false,
        },
      },
      required: [
        "iteration_id",
        "claim_token",
        "model_name",
        "candidate_ref",
        "result",
      ],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "preflight_approved_product_iteration",
    title: "Preflight an approved product iteration",
    description:
      "Before any local merge, verify that the exact private candidate_ref still matches the candidate frozen when the website approved the task. This check does not merge, write files, deploy, publish, call Feishu, or process BP originals.",
    inputSchema: {
      type: "object",
      properties: {
        iteration_id: { type: "string", minLength: 1, maxLength: 200 },
        candidate_ref: {
          type: "string",
          minLength: 40,
          maxLength: 64,
          pattern: "^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$",
          description:
            "Private full commit ID read from the fixed task branch immediately before the merge preflight.",
        },
      },
      required: ["iteration_id", "candidate_ref"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "finalize_approved_product_iteration",
    title: "Finalize an approved product iteration",
    description:
      "Record completion only after preflight_approved_product_iteration succeeds for the exact candidate, that candidate is fast-forward merged locally, and post-merge checks pass. Supply the resulting local HEAD as applied_ref. The service rechecks the frozen candidate and current HEAD; it does not run Git, merge code, run tests, deploy, or write Feishu.",
    inputSchema: {
      type: "object",
      properties: {
        iteration_id: { type: "string", minLength: 1, maxLength: 200 },
        applied_ref: {
          type: "string",
          minLength: 40,
          maxLength: 64,
          pattern: "^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$",
          description:
            "Full 40- or 64-character hex commit ID read from the primary checkout after the approved fast-forward merge and post-merge verification.",
        },
      },
      required: ["iteration_id", "applied_ref"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_internal_storage_status",
    title: "Inspect internal Feishu storage",
    description:
      "Read the Cofound internal-storage configuration and synchronization readiness without uploading or changing any BP file.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "plan_feishu_team_inbox_pull",
    title: "Inspect the enterprise Feishu team inbox",
    description:
      "Read-only inspection of the designated enterprise shared team inbox. Shows filenames and whether they will be imported, restored, skipped, or left unsupported. Never changes or deletes a remote file.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "pull_feishu_team_inbox",
    title: "Import BPs from the enterprise Feishu team inbox",
    description:
      "Serially download supported files from the designated enterprise shared inbox, verify bytes, deduplicate, import new BP versions, and restore recycled projects when the same original is found. Remote files are never moved, overwritten, or deleted.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "plan_project_feishu_sync",
    title: "Plan an internal BP sync",
    description:
      "Read-only preflight for one project's internal Feishu archive. Return only the project name/ID, BP or supporting-material names and BP versions, target folder, and whether each file will be added or skipped as a duplicate. Never show a hash, plan ID, token or remote technical filename. Planning does not upload, overwrite or delete files.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", minLength: 1, maxLength: 200 },
        requested_by: { type: "string", minLength: 1, maxLength: 120 },
      },
      required: ["project_id", "requested_by"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "sync_project_to_feishu",
    title: "Append a project to internal Feishu storage",
    description:
      "Execute the most recent unexpired plan cached privately by plan_project_feishu_sync. Call only after the user clearly confirms with wording such as ‘确定发送’, ‘确认发送’, ‘OK’ or ‘Yes’; map that affirmative intent to confirmed=true. Do not call for an ambiguous or negative reply. The backend accepts only the boolean confirmation and never parses arbitrary natural-language text. The cached binding is one-time, append-only and never overwrites or deletes an existing file.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", minLength: 1, maxLength: 200 },
        confirmed: {
          type: "boolean",
          const: true,
          description:
            "Set to true only after the user clearly confirms the latest displayed plan.",
        },
      },
      required: ["project_id", "confirmed"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "list_operation_ledger",
    title: "Read the Cofound operation ledger",
    description:
      "Read recent append-only operational events and optionally filter them by operation type, status or project.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        operation_type: { type: "string", minLength: 1, maxLength: 120 },
        status: { type: "string", minLength: 1, maxLength: 80 },
        project_id: { type: "string", minLength: 1, maxLength: 200 },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_cleantech_enhancement_status",
    title: "Inspect optional CleanTech enhancements",
    description:
      "Report whether the immutable CleanTech Finance runtime, offline financial audit, policy catalog and project-opportunity catalog are available. Never authenticates or reads Feishu.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "run_cleantech_financial_evidence_audit",
    title: "Run offline CleanTech financial evidence audit",
    description:
      "Run the two end-to-end validated CleanTech Finance dimensions from a local manifest through a configured immutable release. Produces local artifacts only; no model or Feishu calls and no investment rating.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        manifest_path: { type: "string", maxLength: 2000 },
        requested_by: { type: "string", maxLength: 120 },
      },
      required: ["project_id", "manifest_path", "requested_by"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "run_cleantech_policy_match",
    title: "Match a CleanTech project to governed policy references",
    description:
      "Run the configured CleanTech Finance read-only Feishu policy gateway for one evidence-backed clean-energy project. Sends only allowlisted generic tags, never the BP, company identity, financing data, file paths, notes or credentials. Requires explicit clean-energy applicability and user-scoped Feishu authentication.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", minLength: 1, maxLength: 200 },
        requested_by: { type: "string", minLength: 1, maxLength: 120 },
        clean_energy_applicable: { type: "boolean" },
        as_of: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        profile_tags: {
          type: "object",
          properties: {
            industry: {
              type: "array",
              maxItems: 20,
              items: { type: "string", minLength: 1, maxLength: 80 },
            },
            stage: {
              type: "array",
              maxItems: 20,
              items: { type: "string", minLength: 1, maxLength: 80 },
            },
            need: {
              type: "array",
              maxItems: 20,
              items: { type: "string", minLength: 1, maxLength: 80 },
            },
            technology: {
              type: "array",
              maxItems: 20,
              items: { type: "string", minLength: 1, maxLength: 80 },
            },
            geography: {
              type: "array",
              maxItems: 20,
              items: { type: "string", minLength: 1, maxLength: 80 },
            },
            market: {
              type: "array",
              maxItems: 20,
              items: { type: "string", minLength: 1, maxLength: 80 },
            },
          },
          additionalProperties: false,
        },
      },
      required: [
        "project_id",
        "requested_by",
        "clean_energy_applicable",
        "profile_tags",
      ],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "run_cleantech_project_opportunity_match",
    title: "Match governed CleanTech project and tender opportunities",
    description:
      "Run the configured CleanTech Finance read-only Feishu opportunity gateway for European and Brazilian projects, procurement demands and tenders. Sends only allowlisted generic tags and never refreshes source APIs or writes Feishu.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", minLength: 1, maxLength: 200 },
        requested_by: { type: "string", minLength: 1, maxLength: 120 },
        clean_energy_applicable: { type: "boolean" },
        as_of: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        profile_tags: {
          type: "object",
          properties: {
            industry: {
              type: "array",
              maxItems: 20,
              items: { type: "string", minLength: 1, maxLength: 80 },
            },
            need: {
              type: "array",
              maxItems: 20,
              items: { type: "string", minLength: 1, maxLength: 80 },
            },
            technology: {
              type: "array",
              maxItems: 20,
              items: { type: "string", minLength: 1, maxLength: 80 },
            },
            geography: {
              type: "array",
              maxItems: 20,
              items: { type: "string", minLength: 1, maxLength: 80 },
            },
            market: {
              type: "array",
              maxItems: 20,
              items: { type: "string", minLength: 1, maxLength: 80 },
            },
          },
          additionalProperties: false,
        },
      },
      required: [
        "project_id",
        "requested_by",
        "clean_energy_applicable",
        "profile_tags",
      ],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "list_shared_publications",
    title: "List controlled publications",
    description:
      "List every selectively shared BP publication, its isolated link, boundary, versions, annotations and sync state.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "list_share_annotations",
    title: "List shared BP annotations",
    description:
      "Read the current Vercel Lite annotation inbox for every synchronized BP publication, including per-project retrieval errors. This is a full read-only snapshot and does not expose link credentials.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "list_collaborators",
    title: "List BP collaborators",
    description:
      "List internal and external website accounts and how many project grants each has.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "publish_bp_project",
    title: "Publish selected BP content",
    description:
      "Create or update a lightweight project snapshot from explicit field and file selections; downloads remain disabled.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        share_mode: { type: "string", enum: ["fields_only", "selected_files"] },
        security_mode: { type: "string", enum: ["trusted", "high_security"] },
        selected_fields: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
        },
        selected_file_ids: { type: "array", items: { type: "string" } },
        expires_at: {
          type: ["string", "null"],
          description: "ISO-8601 timestamp or null.",
        },
        annotation_enabled: { type: "boolean" },
        members: {
          type: "array",
          items: {
            type: "object",
            properties: {
              user_id: { type: "string" },
              can_view_fields: { type: "boolean" },
              can_view_files: { type: "boolean" },
              can_request_download: { type: "boolean" },
            },
            required: [
              "user_id",
              "can_view_fields",
              "can_view_files",
              "can_request_download",
            ],
            additionalProperties: false,
          },
        },
      },
      required: [
        "project_id",
        "share_mode",
        "security_mode",
        "selected_fields",
        "selected_file_ids",
        "members",
      ],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "sync_shared_project",
    title: "Synchronize shared BP",
    description:
      "Publish the latest local version to an existing controlled publication using the persistent job queue.",
    inputSchema: {
      type: "object",
      properties: { publication_id: { type: "string" } },
      required: ["publication_id"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "invite_collaborator",
    title: "Invite BP collaborator",
    description:
      "Create a seven-day website invitation for a named internal or external collaborator.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        role: { type: "string", enum: ["internal", "external"] },
      },
      required: ["name", "email", "role"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "list_download_requests",
    title: "List BP download requests",
    description:
      "List pending and historical controlled-file download requests for administrator review.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "decide_download_request",
    title: "Decide BP download request",
    description:
      "Approve or reject one download request; approved users receive only a watermarked review PDF.",
    inputSchema: {
      type: "object",
      properties: {
        request_id: { type: "string" },
        approve: { type: "boolean" },
        note: { type: "string" },
      },
      required: ["request_id", "approve"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_collaboration_activity",
    title: "Get sharing jobs and audit",
    description:
      "Read recent asynchronous job states and collaboration audit events.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

async function serviceIsHealthy() {
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data?.ok === true;
  } catch {
    return false;
  }
}

async function startLocalService() {
  if (!loopbackService) return;
  if (!fs.existsSync(startScript)) {
    throw new Error(
      `本地服务未启动，且未找到自动启动脚本：${startScript}。请在 Codex 中打开完整的 Cofound Investment Office 工程。`
    );
  }

  const child = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      startScript,
      "-NoBrowser",
    ],
    {
      cwd: projectRoot,
      stdio: "ignore",
      windowsHide: true,
    }
  );
  let launchError = null;
  child.once("error", error => {
    launchError = error;
  });

  for (let attempt = 0; attempt < 240; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (launchError) {
      throw new Error(`本地服务启动器运行失败：${launchError.message}`);
    }
    if (await serviceIsHealthy()) return;
  }
  throw new Error(
    "Cofound 本地服务自动启动超时。请双击桌面的 Co-founder Investment Office，并让 Codex 检查 data/server.stderr.log。"
  );
}

async function ensureLocalService() {
  if (!loopbackService || (await serviceIsHealthy())) return;
  if (!startupPromise) {
    startupPromise = startLocalService().finally(() => {
      startupPromise = null;
    });
  }
  await startupPromise;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
      }
    }
  );
  await Promise.all(runners);
  return results;
}

async function ensureAdminSession() {
  if (adminCookie) return;
  const response = await fetch(`${baseUrl}/api/auth/local-admin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  const raw = response.headers.get("set-cookie");
  if (!raw) throw new Error("本机管理员会话未返回凭据");
  adminCookie = raw.split(";")[0];
}

async function request(route, options = {}, admin = false) {
  let response;
  try {
    await ensureLocalService();
    if (admin) await ensureAdminSession();
    response = await fetch(`${baseUrl}${route}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(admin ? { cookie: adminCookie } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `无法连接本地 Cofound BP Desk（${detail}）。请双击桌面的 Co-founder Investment Office；若仍失败，让 Codex 检查 data/server.stderr.log。`
    );
  }
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && admin) adminCookie = "";
    throw new Error(
      data.error || `Cofound BP Desk 请求失败（HTTP ${response.status}）`
    );
  }
  return data;
}

const sensitiveResultKeys = new Set([
  "token",
  "accesstoken",
  "refreshtoken",
  "appaccesstoken",
  "tenantaccesstoken",
  "accesscode",
  "sharecode",
  "verificationcode",
  "password",
  "authorization",
  "cookie",
  "body",
  "documentbody",
  "documenttext",
  "documentcontent",
  "rawcontent",
  "pagecontent",
  "sourcecontent",
  "rawtext",
  "extractedtext",
  "filecontent",
]);

const locatorResultKeys = new Set([
  "url",
  "driveurl",
  "baseurl",
  "folderurl",
  "fileurl",
  "documenturl",
  "shareurl",
  "publicationurl",
]);

function normalizeResultKey(key) {
  return String(key)
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function redactLocator(value) {
  if (typeof value !== "string") return "[configured]";
  try {
    const parsed = new URL(value);
    return `${parsed.origin}/[redacted-locator]`;
  } catch {
    return "[configured]";
  }
}

function sanitizeInternalStorageResult(value) {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeInternalStorageResult(item));
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const normalizedKey = normalizeResultKey(key);
      if (
        sensitiveResultKeys.has(normalizedKey) ||
        normalizedKey.endsWith("token") ||
        normalizedKey.includes("accesscode") ||
        normalizedKey.includes("sharecode")
      ) {
        return [key, "[redacted]"];
      }
      if (locatorResultKeys.has(normalizedKey)) {
        return [key, redactLocator(item)];
      }
      return [key, sanitizeInternalStorageResult(item)];
    })
  );
}

function cacheFeishuConfirmationPlan(projectId, plan) {
  const now = Date.now();
  for (const [key, value] of feishuConfirmationPlans) {
    if (value.expiresAt <= now) feishuConfirmationPlans.delete(key);
  }
  if (
    !plan ||
    typeof plan !== "object" ||
    typeof plan.planId !== "string" ||
    !plan.planId ||
    typeof plan.requestedBy !== "string" ||
    !plan.requestedBy ||
    !plan.project ||
    plan.project.id !== projectId ||
    typeof plan.project.name !== "string" ||
    typeof plan.targetFolder !== "string" ||
    !Array.isArray(plan.items)
  ) {
    throw new Error("飞书同步预检返回不完整，请重新生成计划");
  }
  const files = plan.items.map(item => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.fileId !== "string" ||
      typeof item.fileName !== "string" ||
      !["BP", "补充材料"].includes(item.fileType) ||
      !["add_new", "skip_duplicate"].includes(item.expectedAction)
    ) {
      throw new Error("飞书同步预检文件清单不完整，请重新生成计划");
    }
    return {
      fileId: item.fileId,
      fileType: item.fileType,
      fileName: item.fileName,
      bpVersion:
        Number.isInteger(item.bpVersion) && item.bpVersion > 0
          ? item.bpVersion
          : null,
      expectedAction: item.expectedAction,
    };
  });
  const cached = {
    planId: plan.planId,
    requestedBy: plan.requestedBy,
    project: { id: plan.project.id, name: plan.project.name },
    targetFolder: plan.targetFolder,
    files,
    expiresAt: now + FEISHU_CONFIRMATION_TTL_MS,
  };
  feishuConfirmationPlans.set(projectId, cached);
  return cached;
}

function confirmationPlanForUser(cached) {
  return {
    project: {
      name: cached.project.name,
      id: cached.project.id,
    },
    targetFeishuFolder: cached.targetFolder,
    files: cached.files.map(file => ({
      type: file.fileType,
      name: file.fileName,
      bpVersion: file.bpVersion,
      expectedAction: file.expectedAction === "add_new" ? "新增" : "重复，跳过",
    })),
  };
}

function consumeFeishuConfirmationPlan(projectId) {
  const cached = feishuConfirmationPlans.get(projectId);
  if (!cached) {
    throw new Error("没有可确认的飞书发送计划，请先重新生成计划");
  }
  feishuConfirmationPlans.delete(projectId);
  if (cached.expiresAt <= Date.now()) {
    throw new Error("飞书发送计划已过期，请重新生成计划后再确认");
  }
  return cached;
}

function syncReceiptForUser(receipt, cached) {
  const resultByFile = new Map(
    (Array.isArray(receipt?.items) ? receipt.items : []).map(item => [
      item.fileId,
      item,
    ])
  );
  return {
    project: {
      name: cached.project.name,
      id: cached.project.id,
    },
    targetFeishuFolder: cached.targetFolder,
    result: receipt?.status === "succeeded" ? "发送完成" : "发送失败",
    files: cached.files.map(file => {
      const item = resultByFile.get(file.fileId);
      const status =
        item?.status === "succeeded"
          ? "已新增"
          : item?.status === "skipped_existing"
            ? "重复，已跳过"
            : "未完成";
      return {
        type: file.fileType,
        name: file.fileName,
        bpVersion: file.bpVersion,
        status,
        ...(item?.error ? { message: String(item.error) } : {}),
      };
    }),
    ...(receipt?.error ? { message: String(receipt.error) } : {}),
  };
}

async function callTool(name, args) {
  if (name === "cofound_health") return request("/api/health");
  if (name === "list_bp_projects") {
    const query = new URLSearchParams(
      Object.entries(args || {})
        .filter(([, value]) => typeof value === "string" && value)
        .map(([key, value]) => [key, String(value)])
    );
    return request(`/api/local/projects${query.size ? `?${query}` : ""}`);
  }
  if (name === "get_bp_project")
    return request(
      `/api/local/projects/${encodeURIComponent(args.project_id)}`
    );
  if (name === "list_recycled_bp_projects")
    return request("/api/local/projects/recycle-bin");
  if (name === "move_bp_project_to_recycle_bin") {
    if (args.confirmed !== true)
      throw new Error(
        "请先说明：仅从本地工作台隐藏，原文件、分析历史、飞书副本和外部分享都不会删除；待用户明确确认后再执行"
      );
    return request(
      `/api/local/projects/${encodeURIComponent(args.project_id)}/archive`,
      { method: "POST", body: "{}" }
    );
  }
  if (name === "restore_bp_project")
    return request(
      `/api/local/projects/${encodeURIComponent(args.project_id)}/restore`,
      { method: "POST", body: "{}" }
    );
  if (name === "import_bp_file") {
    return request("/api/local/import-path", {
      method: "POST",
      body: JSON.stringify({
        filePath: args.file_path,
        projectId: args.project_id,
      }),
    });
  }
  if (name === "scan_bp_folder") {
    return request("/api/local/scan", {
      method: "POST",
      body: JSON.stringify({ directory: args.directory }),
    });
  }
  if (name === "import_project_material") {
    return request("/api/local/materials/import-path", {
      method: "POST",
      body: JSON.stringify({
        filePath: args.file_path,
        projectId: args.project_id,
        category: args.category,
      }),
    });
  }
  if (name === "list_pending_materials")
    return request("/api/local/materials/inbox");
  if (name === "assign_project_material")
    return request(
      `/api/local/materials/${encodeURIComponent(args.material_id)}/assign`,
      {
        method: "POST",
        body: JSON.stringify({ projectId: args.project_id }),
      }
    );
  if (name === "list_custom_fields") return request("/api/local/custom-fields");
  if (name === "create_custom_field")
    return request("/api/local/custom-fields", {
      method: "POST",
      body: JSON.stringify({
        label: args.label,
        fieldType: args.field_type,
        options: args.options || [],
        showInList: args.show_in_list ?? false,
      }),
    });
  if (name === "set_project_custom_field")
    return request(
      `/api/local/projects/${encodeURIComponent(args.project_id)}/custom-fields/${encodeURIComponent(args.field_key)}`,
      { method: "POST", body: JSON.stringify({ value: args.value }) }
    );
  if (name === "get_wechat_bp_inbox_status")
    return request("/api/local/wechat/status");
  if (name === "initialize_wechat_bp_inbox")
    return request("/api/local/wechat/initialize", {
      method: "POST",
      body: "{}",
    });
  if (name === "receive_wechat_bp_files")
    return request("/api/local/wechat/scan", {
      method: "POST",
      body: "{}",
    });
  if (name === "analyze_bp_project") {
    return request(
      `/api/local/projects/${encodeURIComponent(args.project_id)}/analyze`,
      { method: "POST", body: "{}" }
    );
  }
  if (name === "analyze_bp_batch") {
    const projectIds = [
      ...new Set(
        (Array.isArray(args.project_ids) ? args.project_ids : []).filter(
          value => typeof value === "string" && value.trim()
        )
      ),
    ].slice(0, 12);
    if (!projectIds.length) throw new Error("至少需要一个项目 ID");
    const concurrency = Math.max(
      1,
      Math.min(3, Number.isInteger(args.concurrency) ? args.concurrency : 2)
    );
    const results = await mapWithConcurrency(
      projectIds,
      concurrency,
      async projectId => {
        try {
          const data = await request(
            `/api/local/projects/${encodeURIComponent(projectId)}/analyze`,
            { method: "POST", body: "{}" }
          );
          return {
            projectId,
            ok: true,
            analysis: {
              aiStatus: data.aiStatus,
              schemaVersion: data.schemaVersion,
            },
          };
        } catch (error) {
          return {
            projectId,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    );
    return {
      requested: projectIds.length,
      succeeded: results.filter(result => result.ok).length,
      failed: results.filter(result => !result.ok).length,
      concurrency,
      results,
    };
  }
  if (name === "claim_pending_investment_analysis") {
    return request("/api/local/codex-analysis-tasks/claim", {
      method: "POST",
      body: JSON.stringify({
        taskId: args.task_id,
        claimedBy: args.claimed_by,
        leaseSeconds: args.lease_seconds ?? 1800,
        codexThreadId: args.codex_thread_id,
        codexTurnId: args.codex_turn_id,
      }),
    });
  }
  if (name === "update_investment_analysis_task") {
    return request(
      `/api/local/codex-analysis-tasks/${encodeURIComponent(args.task_id)}/progress`,
      {
        method: "POST",
        body: JSON.stringify({
          claimToken: args.claim_token,
          message: args.message,
          selectedSkill: args.selected_skill,
          routerReason: args.router_reason,
          codexThreadId: args.codex_thread_id,
          codexTurnId: args.codex_turn_id,
          leaseSeconds: args.lease_seconds ?? 1800,
        }),
      }
    );
  }
  if (name === "complete_investment_analysis_task") {
    return request(
      `/api/local/codex-analysis-tasks/${encodeURIComponent(args.task_id)}/complete`,
      {
        method: "POST",
        body: JSON.stringify({
          claimToken: args.claim_token,
          runId: args.run_id,
          selectedSkill: args.selected_skill,
          routerReason: args.router_reason,
          codexThreadId: args.codex_thread_id,
          codexTurnId: args.codex_turn_id,
        }),
      }
    );
  }
  if (name === "fail_investment_analysis_task") {
    return request(
      `/api/local/codex-analysis-tasks/${encodeURIComponent(args.task_id)}/fail`,
      {
        method: "POST",
        body: JSON.stringify({
          claimToken: args.claim_token,
          errorDetail: args.error_detail,
          codexThreadId: args.codex_thread_id,
          codexTurnId: args.codex_turn_id,
        }),
      }
    );
  }
  if (name === "prepare_investment_analysis") {
    return request(
      `/api/local/projects/${encodeURIComponent(args.project_id)}/codex-analyses/prepare`,
      {
        method: "POST",
        body: JSON.stringify({
          skillName: args.skill_name,
          requestedBy: args.requested_by,
          taskId: args.task_id,
          force: args.force ?? false,
        }),
      }
    );
  }
  if (name === "read_prepared_analysis_pages") {
    return request(
      `/api/local/codex-analyses/${encodeURIComponent(args.run_id)}/pages`,
      {
        method: "POST",
        body: JSON.stringify({ pageNumbers: args.page_numbers }),
      }
    );
  }
  if (name === "complete_investment_analysis") {
    return request(
      `/api/local/codex-analyses/${encodeURIComponent(args.run_id)}/complete`,
      {
        method: "POST",
        body: JSON.stringify({
          modelName: args.model_name,
          result: args.result,
        }),
      }
    );
  }
  if (name === "get_internal_storage_status") {
    return sanitizeInternalStorageResult(
      await request("/api/local/internal-storage/status")
    );
  }
  if (name === "plan_feishu_team_inbox_pull")
    return request("/api/local/internal-storage/inbox/plan");
  if (name === "pull_feishu_team_inbox")
    return request("/api/local/internal-storage/inbox/pull", {
      method: "POST",
      body: "{}",
    });
  if (name === "plan_project_feishu_sync") {
    const projectId = String(args.project_id || "").trim();
    const requestedBy = String(args.requested_by || "").trim();
    if (!projectId) throw new Error("需要项目 ID 才能生成飞书发送计划");
    if (!requestedBy) throw new Error("需要当前用户昵称才能生成飞书发送计划");
    // A failed refresh must never leave an older plan available for consent.
    feishuConfirmationPlans.delete(projectId);
    const plan = await request(
      `/api/local/projects/${encodeURIComponent(projectId)}/feishu-sync/plan`,
      {
        method: "POST",
        body: JSON.stringify({ requestedBy }),
      }
    );
    return confirmationPlanForUser(
      cacheFeishuConfirmationPlan(projectId, plan)
    );
  }
  if (name === "sync_project_to_feishu") {
    if (args.confirmed !== true) {
      throw new Error(
        "请先向用户展示最新飞书发送计划，并在用户明确回复“确定发送”或“OK”后确认"
      );
    }
    const projectId = String(args.project_id || "").trim();
    if (!projectId) throw new Error("需要项目 ID 才能确认飞书发送计划");
    const cached = consumeFeishuConfirmationPlan(projectId);
    const receipt = await request(
      `/api/local/projects/${encodeURIComponent(projectId)}/feishu-sync`,
      {
        method: "POST",
        body: JSON.stringify({
          requestedBy: cached.requestedBy,
          planId: cached.planId,
          confirmed: true,
        }),
      }
    );
    return syncReceiptForUser(receipt, cached);
  }
  if (name === "list_operation_ledger") {
    const query = new URLSearchParams();
    const limit = Number.isInteger(args.limit)
      ? Math.max(1, Math.min(200, args.limit))
      : 50;
    query.set("limit", String(limit));
    if (typeof args.operation_type === "string" && args.operation_type) {
      query.set("operationType", args.operation_type);
    }
    if (typeof args.status === "string" && args.status) {
      query.set("status", args.status);
    }
    if (typeof args.project_id === "string" && args.project_id) {
      query.set("projectId", args.project_id);
    }
    return sanitizeInternalStorageResult(
      await request(`/api/local/operations?${query.toString()}`)
    );
  }
  if (name === "get_cleantech_enhancement_status")
    return request("/api/local/cleantech/status");
  if (name === "run_cleantech_financial_evidence_audit") {
    return request(
      `/api/local/projects/${encodeURIComponent(args.project_id)}/cleantech/financial-audit`,
      {
        method: "POST",
        body: JSON.stringify({
          manifestPath: args.manifest_path,
          requestedBy: args.requested_by,
        }),
      }
    );
  }
  if (name === "run_cleantech_policy_match") {
    return request(
      `/api/local/projects/${encodeURIComponent(args.project_id)}/cleantech/policy-match`,
      {
        method: "POST",
        body: JSON.stringify({
          requestedBy: args.requested_by,
          cleanEnergyApplicable: args.clean_energy_applicable,
          profileTags: args.profile_tags,
          asOf: args.as_of,
        }),
      }
    );
  }
  if (name === "run_cleantech_project_opportunity_match") {
    return request(
      `/api/local/projects/${encodeURIComponent(args.project_id)}/cleantech/project-opportunity-match`,
      {
        method: "POST",
        body: JSON.stringify({
          requestedBy: args.requested_by,
          cleanEnergyApplicable: args.clean_energy_applicable,
          profileTags: args.profile_tags,
          asOf: args.as_of,
        }),
      }
    );
  }
  if (name === "update_bp_status") {
    return request(
      `/api/local/projects/${encodeURIComponent(args.project_id)}/status`,
      {
        method: "POST",
        body: JSON.stringify({
          status: args.status,
          locked: args.locked,
          note: args.note,
        }),
      }
    );
  }
  if (name === "submit_product_feedback") {
    const feedback = await request("/api/local/product-feedback", {
      method: "POST",
      body: JSON.stringify({
        description: args.description,
        expectedOutcome: args.expected_outcome,
        category: args.category,
        impact: args.impact,
      }),
    });
    const synchronization = await request(
      `/api/local/product-feedback/${encodeURIComponent(feedback.id)}/sync`,
      { method: "POST", body: "{}" }
    );
    return { feedback, synchronization };
  }
  if (name === "list_product_feedback") {
    const query = new URLSearchParams();
    if (typeof args.status === "string" && args.status)
      query.set("status", args.status);
    if (typeof args.sync_status === "string" && args.sync_status)
      query.set("syncStatus", args.sync_status);
    if (typeof args.triage_status === "string" && args.triage_status)
      query.set("triageStatus", args.triage_status);
    if (typeof args.source === "string" && args.source)
      query.set("source", args.source);
    if (Number.isInteger(args.limit)) query.set("limit", String(args.limit));
    const suffix = query.size ? `?${query.toString()}` : "";
    return request(`/api/local/product-feedback${suffix}`);
  }
  if (name === "claim_product_feedback") {
    return request(
      `/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/claim`,
      {
        method: "POST",
        body: JSON.stringify({
          claimedBy: args.claimed_by,
          modelName: args.model_name,
        }),
      }
    );
  }
  if (name === "update_product_feedback_progress") {
    return request(
      `/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/progress`,
      {
        method: "POST",
        body: JSON.stringify({
          claimToken: args.claim_token,
          status: args.status,
          message: args.message,
        }),
      }
    );
  }
  if (name === "renew_product_feedback_claim") {
    return request(
      `/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/heartbeat`,
      {
        method: "POST",
        body: JSON.stringify({ claimToken: args.claim_token }),
      }
    );
  }
  if (name === "mark_product_feedback_needs_attention") {
    return request(
      `/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/needs-attention`,
      {
        method: "POST",
        body: JSON.stringify({
          claimToken: args.claim_token,
          message: args.message,
        }),
      }
    );
  }
  if (name === "complete_product_feedback_diagnosis") {
    const feedback = await request(
      `/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/complete`,
      {
        method: "POST",
        body: JSON.stringify({
          claimToken: args.claim_token,
          modelName: args.model_name,
          diagnosis: args.diagnosis,
          trialFixStatus: args.trial_fix_status,
        }),
      }
    );
    const synchronization = await request(
      `/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/sync`,
      { method: "POST", body: "{}" }
    );
    return { feedback, synchronization };
  }
  if (name === "sync_product_feedback") {
    return request(
      `/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/sync`,
      { method: "POST", body: "{}" }
    );
  }
  if (name === "refresh_product_feedback_status") {
    return request("/api/local/product-feedback/refresh-status", {
      method: "POST",
      body: "{}",
    });
  }
  if (name === "refresh_maintenance_feedback") {
    return request("/api/local/product-feedback/refresh-maintainer-inbox", {
      method: "POST",
      body: "{}",
    });
  }
  if (name === "triage_product_feedback") {
    const feedback = await request(
      `/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/triage`,
      {
        method: "POST",
        body: JSON.stringify({ action: args.action, note: args.note }),
      }
    );
    const synchronization = await request(
      `/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/sync`,
      { method: "POST", body: "{}" }
    );
    return { feedback, synchronization };
  }
  if (name === "close_product_feedback_maintenance") {
    const feedback = await request(
      `/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/close-maintenance`,
      {
        method: "POST",
        body: JSON.stringify({ note: args.note }),
      }
    );
    const synchronization = await request(
      `/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/sync`,
      { method: "POST", body: "{}" }
    );
    return { feedback, synchronization };
  }
  if (name === "list_product_iterations") {
    return request("/api/local/iterations");
  }
  if (name === "claim_product_iteration") {
    return request(
      `/api/local/iterations/${encodeURIComponent(args.iteration_id)}/claim`,
      {
        method: "POST",
        body: JSON.stringify({
          claimedBy: args.claimed_by,
          modelName: args.model_name,
        }),
      }
    );
  }
  if (name === "update_product_iteration_progress") {
    return request(
      `/api/local/iterations/${encodeURIComponent(args.iteration_id)}/progress`,
      {
        method: "POST",
        body: JSON.stringify({
          claimToken: args.claim_token,
          status: args.status,
          message: args.message,
        }),
      }
    );
  }
  if (name === "mark_product_iteration_needs_attention") {
    return request(
      `/api/local/iterations/${encodeURIComponent(args.iteration_id)}/needs-attention`,
      {
        method: "POST",
        body: JSON.stringify({
          claimToken: args.claim_token,
          message: args.message,
        }),
      }
    );
  }
  if (name === "renew_product_iteration_claim") {
    return request(
      `/api/local/iterations/${encodeURIComponent(args.iteration_id)}/heartbeat`,
      {
        method: "POST",
        body: JSON.stringify({ claimToken: args.claim_token }),
      }
    );
  }
  if (name === "complete_product_iteration") {
    return request(
      `/api/local/iterations/${encodeURIComponent(args.iteration_id)}/complete`,
      {
        method: "POST",
        body: JSON.stringify({
          claimToken: args.claim_token,
          modelName: args.model_name,
          candidateRef: args.candidate_ref,
          result: args.result,
        }),
      }
    );
  }
  if (name === "preflight_approved_product_iteration") {
    return request(
      `/api/local/iterations/${encodeURIComponent(args.iteration_id)}/preflight-finalize`,
      {
        method: "POST",
        body: JSON.stringify({ candidateRef: args.candidate_ref }),
      }
    );
  }
  if (name === "finalize_approved_product_iteration") {
    return request(
      `/api/local/iterations/${encodeURIComponent(args.iteration_id)}/finalize`,
      {
        method: "POST",
        body: JSON.stringify({ appliedRef: args.applied_ref }),
      }
    );
  }
  if (name === "list_shared_publications")
    return request("/api/collaboration/publications", {}, true);
  if (name === "list_share_annotations")
    return request("/api/collaboration/annotations", {}, true);
  if (name === "list_collaborators")
    return request("/api/collaboration/users", {}, true);
  if (name === "publish_bp_project") {
    return request(
      `/api/collaboration/projects/${encodeURIComponent(args.project_id)}/publication`,
      {
        method: "PUT",
        body: JSON.stringify({
          shareMode: args.share_mode,
          securityMode: args.security_mode,
          selectedFields: args.selected_fields,
          selectedFileIds: args.selected_file_ids,
          expiresAt: args.expires_at ?? null,
          annotationEnabled: args.annotation_enabled ?? true,
          members: (args.members || []).map(member => ({
            userId: member.user_id,
            canViewFields: member.can_view_fields,
            canViewFiles: member.can_view_files,
            canRequestDownload: member.can_request_download,
          })),
        }),
      },
      true
    );
  }
  if (name === "sync_shared_project")
    return request(
      `/api/collaboration/publications/${encodeURIComponent(args.publication_id)}/sync`,
      { method: "POST" },
      true
    );
  if (name === "invite_collaborator")
    return request(
      "/api/collaboration/invitations",
      {
        method: "POST",
        body: JSON.stringify({
          name: args.name,
          email: args.email,
          role: args.role,
        }),
      },
      true
    );
  if (name === "list_download_requests")
    return request("/api/collaboration/download-requests", {}, true);
  if (name === "decide_download_request")
    return request(
      `/api/collaboration/download-requests/${encodeURIComponent(args.request_id)}/decision`,
      {
        method: "POST",
        body: JSON.stringify({ approve: args.approve, note: args.note || "" }),
      },
      true
    );
  if (name === "get_collaboration_activity") {
    const [jobs, audit] = await Promise.all([
      request("/api/collaboration/jobs", {}, true),
      request("/api/collaboration/audit?limit=50", {}, true),
    ]);
    return { jobs, audit };
  }
  throw new Error(`Unknown tool: ${name}`);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(message) {
  if (
    message.method === "notifications/initialized" ||
    message.method === "notifications/cancelled"
  )
    return;
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion || "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "cofound-bp-desk", version: "0.12.0" },
      },
    });
    return;
  }
  if (message.method === "ping") {
    send({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }
  if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools } });
    return;
  }
  if (message.method === "tools/call") {
    try {
      const data = await callTool(
        message.params?.name,
        message.params?.arguments || {}
      );
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: { result: data },
        },
      });
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          isError: true,
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : String(error),
            },
          ],
        },
      });
    }
    return;
  }
  if (message.id !== undefined) {
    send({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32601, message: `Method not found: ${message.method}` },
    });
  }
}

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});
input.on("line", line => {
  if (!line.trim()) return;
  try {
    void handle(JSON.parse(line));
  } catch (error) {
    send({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32700,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});
