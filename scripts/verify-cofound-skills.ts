import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "plugins", "cofound-bp-desk");
const skillsRoot = path.join(root, "skills");
const primarySkills = [
  "analyze-local-bp",
  "review-early-stage-investment",
  "assess-market-first",
  "assess-founder-first",
  "assess-long-term-value",
  "improve-investment-bp",
] as const;
const enhancementSkills = [
  "enhance-cleantech-project",
  "review-cleantech-financial-evidence",
  "match-shanghai-cleantech-policies",
  "match-cleantech-project-opportunities",
] as const;
const productIterationSkills = ["iterate-cofound-product"] as const;
const productFeedbackSkills = ["diagnose-cofound-feedback"] as const;
const expectedSkills = [
  ...primarySkills,
  ...enhancementSkills,
  ...productIterationSkills,
  ...productFeedbackSkills,
] as const;
const specialistSkills = primarySkills.slice(1);
const investmentJudgmentSkills = primarySkills.slice(1, 5);

function read(filePath: string) {
  assert.ok(fs.existsSync(filePath), `Missing ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

for (const skillName of expectedSkills) {
  const skillDir = path.join(skillsRoot, skillName);
  const skillMd = read(path.join(skillDir, "SKILL.md"));
  const openAiYaml = read(path.join(skillDir, "agents", "openai.yaml"));
  const frontmatter = skillMd.match(/^---\s*\n([\s\S]*?)\n---/u)?.[1] ?? "";

  assert.match(frontmatter, new RegExp(`name:\\s*${skillName}`));
  assert.match(frontmatter, /description:\s*["']?.{30,}/u);
  assert.ok(
    openAiYaml.includes(`$${skillName}`),
    `${skillName} default prompt must explicitly invoke its Skill`
  );

  for (const match of skillMd.matchAll(
    /\]\((?!https?:\/\/)([^)#]+\.md)(?:#[^)]+)?\)/gu
  )) {
    assert.ok(
      fs.existsSync(path.resolve(skillDir, match[1])),
      `${skillName} references missing file ${match[1]}`
    );
  }
}

const router = read(path.join(skillsRoot, "analyze-local-bp", "SKILL.md"));
const normalizedRouter = router.replace(/\s+/gu, " ");
for (const skillName of specialistSkills) {
  assert.ok(
    router.includes(`$${skillName}`),
    `Primary router does not reference ${skillName}`
  );
}
for (const adaptiveInvariant of [
  "## Open analysis workspace",
  "not a fixed scorecard or an intent-classification pipeline",
  "Do not force it into an intent enum",
  "verified_resource",
  "search_direction",
  "Use any specialist investment or enhancement Skill only when the user names it or it materially improves the requested work",
  "Do not equate every analysis request with a fixed investment review",
  "It is an open workspace capability protocol, not an intent router",
  "In an ordinary Codex conversation, no lens is required",
  "Codex conversation",
  "Dashboard write-back",
  "The schema is a record of the analysis, not a limit on the conversation",
  "are reasoning aids, not mandatory headings",
]) {
  assert.ok(
    normalizedRouter.includes(adaptiveInvariant),
    `Primary router missing adaptive-analysis invariant: ${adaptiveInvariant}`
  );
}
for (const forbiddenRouterPattern of [
  "select exactly one investment judgment Skill by default",
  "| User intent or project condition",
  "must apply the routing table below",
]) {
  assert.ok(
    !normalizedRouter.includes(forbiddenRouterPattern),
    `Primary Skill still behaves like a fixed intent router: ${forbiddenRouterPattern}`
  );
}
assert.ok(
  router.includes("stay in `$analyze-local-bp`"),
  "Workspace-only operations must stay in the primary skill"
);
for (const skillName of enhancementSkills) {
  assert.ok(
    router.includes(`$${skillName}`),
    `Primary router does not reference optional enhancement ${skillName}`
  );
}
assert.ok(
  router.includes("zero or more independent enhancement Skills"),
  "Primary router must keep enhancements separate from the one-primary-Skill rule"
);
for (const expected of [
  "Never pass `improve-investment-bp`",
  "For policy matching, pass only",
  "project-opportunity matching",
  "matcher does not accept `stage`",
]) {
  assert.ok(
    router.includes(expected),
    `Primary router missing boundary: ${expected}`
  );
}
for (const toolName of [
  "prepare_investment_analysis",
  "read_prepared_analysis_pages",
  "complete_investment_analysis",
]) {
  assert.ok(router.includes(toolName), `Primary router must use ${toolName}`);
  for (const skillName of investmentJudgmentSkills) {
    const specialist = read(path.join(skillsRoot, skillName, "SKILL.md"));
    assert.ok(
      specialist.includes(toolName),
      `${skillName} must use ${toolName}`
    );
  }
}
for (const taskToolName of [
  "claim_pending_investment_analysis",
  "update_investment_analysis_task",
  "complete_investment_analysis_task",
  "fail_investment_analysis_task",
]) {
  assert.ok(
    router.includes(taskToolName),
    `Primary router must use website task tool ${taskToolName}`
  );
}
for (const taskBindingInvariant of [
  "Include `task_id` only when continuing the exact website-created task currently claimed",
  "call `prepare_investment_analysis` with `task_id` set to the exact task ID claimed in step 1",
  "Never omit, substitute or reuse another task ID on this website path",
]) {
  assert.ok(
    normalizedRouter.includes(taskBindingInvariant),
    `Primary Skill missing source-task binding: ${taskBindingInvariant}`
  );
}
for (const [heartbeatInvariant, heartbeatPattern] of [
  ["10-minute cadence", /at least once\s+every 10 minutes/u],
  ["30-minute lease", /`lease_seconds: 1800`/u],
  ["terminal stop", /Stop heartbeats after/u],
] as const) {
  assert.match(
    router,
    heartbeatPattern,
    `Primary router missing analysis heartbeat invariant: ${heartbeatInvariant}`
  );
}
for (const skillName of investmentJudgmentSkills) {
  const specialist = read(path.join(skillsRoot, skillName, "SKILL.md"));
  for (const expected of [
    "analysis-schema.md#codex-investment-judgment-write-back",
    'schemaVersion: "1.0"',
    "stale",
  ]) {
    assert.ok(
      specialist.includes(expected),
      `${skillName} missing write-back invariant: ${expected}`
    );
  }
}

const analysisContract = read(
  path.join(skillsRoot, "analyze-local-bp", "references", "analysis-schema.md")
);
for (const expected of [
  '"schemaVersion": "1.0"',
  '"positiveSignals"',
  '"keyRisks"',
  '"frameworkSections"',
  '"unresolvedQuestions"',
  '"nextActions"',
  '"aiSuggestion"',
  '"confidence"',
  "Do not add provenance fields inside",
  "A stale run is historical evidence",
  "adaptive analysis",
  "[verified_resource]",
  "[search_direction]",
]) {
  assert.ok(
    analysisContract.includes(expected),
    `Analysis write-back contract missing: ${expected}`
  );
}

const adaptiveAnalysis = read(
  path.join(
    skillsRoot,
    "analyze-local-bp",
    "references",
    "adaptive-analysis.md"
  )
);
const normalizedAdaptiveAnalysis = adaptiveAnalysis.replace(/\s+/gu, " ");
for (const expected of [
  "Follow the user's brief naturally",
  "Do not pre-classify it into an intent enum",
  "Use only the capabilities that help",
  "These are capabilities, not intent classes or a required sequence",
  "Conversation and dashboard are different layers",
  "The Codex conversation is the primary analysis surface",
  "User judgment restatement",
  "What holds",
  "Counter-case",
  "Enhanced judgment",
  "verified_resource",
  "search_direction",
  "do not invent a person's name, policy title, grant, customer, order, tender, program, or URL",
  "current server contract remains `schemaVersion: \"1.0\"`",
  "selected specialist Skill remains the persisted run identity",
  "applies only when the website explicitly created a structured analysis task",
  "not an output schema for ordinary Codex conversation",
]) {
  assert.ok(
    normalizedAdaptiveAnalysis.includes(expected),
    `Adaptive-analysis contract missing: ${expected}`
  );
}
for (const forbiddenAdaptivePattern of [
  "Before choosing an investment lens, identify four things",
  "`goal`:",
  "`requested_lens`:",
]) {
  assert.ok(
    !normalizedAdaptiveAnalysis.includes(forbiddenAdaptivePattern),
    `Adaptive analysis still requires intent pre-classification: ${forbiddenAdaptivePattern}`
  );
}

const optimizer = read(
  path.join(skillsRoot, "improve-investment-bp", "SKILL.md")
);
for (const safeguard of [
  "Never overwrite the original BP",
  "Never invent TAM",
  "Do not publish, share, or change project management status",
  "fact snapshot",
]) {
  assert.ok(optimizer.includes(safeguard), `Optimizer missing: ${safeguard}`);
}

const productIterator = read(
  path.join(skillsRoot, "iterate-cofound-product", "SKILL.md")
);

const feedbackDiagnoser = read(
  path.join(skillsRoot, "diagnose-cofound-feedback", "SKILL.md")
);
const normalizedFeedbackDiagnoser = feedbackDiagnoser.replace(/\s+/gu, " ");
for (const safeguard of [
  "list_product_feedback",
  "submit_product_feedback",
  "claim_product_feedback",
  "update_product_feedback_progress",
  "renew_product_feedback_claim",
  "mark_product_feedback_needs_attention",
  "complete_product_feedback_diagnosis",
  "sync_product_feedback",
  "$iterate-cofound-product",
  "not permission to inspect unrelated private data",
  "Do not open BP originals",
  "Never merge, push, deploy, publish",
  "source locations",
  "raw prompts",
  "A successful local trial is still only evidence for the maintainer",
  "does not approve implementation",
  "Do not create a Base, table, field, or record as a workaround",
  "references/feishu-handoff.md",
]) {
  assert.ok(
    normalizedFeedbackDiagnoser.includes(safeguard),
    `Product feedback Skill missing: ${safeguard}`
  );
}
const feedbackHandoff = read(
  path.join(
    skillsRoot,
    "diagnose-cofound-feedback",
    "references",
    "feishu-handoff.md"
  )
);
for (const expected of [
  "Allowed content",
  "Forbidden content",
  "Business status",
  "Transport status",
  "fail closed",
]) {
  assert.ok(
    feedbackHandoff.includes(expected),
    `Feedback handoff contract missing: ${expected}`
  );
}
const normalizedProductIterator = productIterator.replace(/\s+/gu, " ");
for (const safeguard of [
  "list_product_iterations",
  "claim_product_iteration",
  "update_product_iteration_progress",
  "renew_product_iteration_claim",
  "mark_product_iteration_needs_attention",
  "complete_product_iteration",
  "preflight_approved_product_iteration",
  "finalize_approved_product_iteration",
  "Never reset, clean, stash, discard, overwrite",
  "operating boundary, not a hard security sandbox",
  "Tool availability is not permission",
  "isolated Git worktree",
  "For every `quick`, `standard`, and `deep` task",
  "`codex/iteration-<safe-id>`",
  "git check-ref-format --branch",
  "git worktree add",
  "create one normal commit",
  "git rev-parse HEAD",
  "`quick`",
  "`standard`",
  "`deep`",
  "manufacture content or spend",
  "Before website approval, do not merge into the primary branch",
  "deploying or publishing to Vercel",
  "Feishu content",
  "BP originals",
  "strict website result contract",
  "private `claim_token`",
  "private MCP task state",
  "candidate_ref",
  '"changes"',
  '"passed | warning | failed"',
  "Every field in `result` is directly visible to a non-technical user",
  "Never put a branch name, commit ID, SHA, worktree location, file path",
  "in `summary`, `changes`, `checks`, or `risks`",
  "must start with exactly one `/`",
  "must not be an HTTP(S) URL",
  "website reports it as `approved`",
  "recorded website approval is the only authority",
  "do not read a branch or commit from the user-visible result",
  "git status --porcelain",
  "git merge-base --is-ancestor HEAD <candidate-ref>",
  "git merge --ff-only <candidate-ref>",
  "Do not merge the movable task branch name",
  "applied_ref",
  "internal tool inputs only",
  "never copy them into progress, `result`, a preview URL",
  "stop and do not call finalize",
]) {
  assert.ok(
    normalizedProductIterator.includes(safeguard),
    `Product iteration Skill missing: ${safeguard}`
  );
}
const preflightInstructionIndex = normalizedProductIterator.indexOf(
  "Call `preflight_approved_product_iteration`"
);
const exactMergeInstructionIndex = normalizedProductIterator.indexOf(
  "`git merge --ff-only <candidate-ref>`"
);
assert.ok(
  preflightInstructionIndex >= 0 &&
    exactMergeInstructionIndex > preflightInstructionIndex,
  "Product iteration Skill must preflight the frozen candidate before merging it"
);
for (const forbiddenInstruction of [
  "bind and report the current primary",
  "Reviewed relative file",
  "HTTP(S) review target",
]) {
  assert.ok(
    !normalizedProductIterator.includes(forbiddenInstruction),
    `Product iteration Skill still encourages technical output: ${forbiddenInstruction}`
  );
}
const visibleResultExample =
  productIterator.match(/```json\s*([\s\S]*?)```/u)?.[1] ?? "";
assert.ok(
  visibleResultExample,
  "Product iteration Skill needs a result example"
);
for (const forbiddenVisibleKey of [
  "branch",
  "commit",
  "sha",
  "worktree",
  "path",
  "appliedRef",
  "applied_ref",
]) {
  assert.doesNotMatch(
    visibleResultExample,
    new RegExp(`"${forbiddenVisibleKey}"\\s*:`, "iu"),
    `Visible iteration result must not expose ${forbiddenVisibleKey}`
  );
}
const parsedVisibleResultExample = JSON.parse(visibleResultExample) as {
  summary: string;
  changes: string[];
  checks: Array<{ label: string; status: string; summary: string }>;
  risks: string[];
  previewUrl?: string;
};
const visibleResultText = [
  parsedVisibleResultExample.summary,
  ...parsedVisibleResultExample.changes,
  ...parsedVisibleResultExample.checks.flatMap(check => [
    check.label,
    check.summary,
  ]),
  ...parsedVisibleResultExample.risks,
].join("\n");
for (const forbiddenVisibleValue of [
  /\b(?:git|commit|branch|worktree|sha(?:-?256)?)\b/iu,
  /\b(?:[a-f0-9]{40}|[a-f0-9]{64})\b/iu,
  /\b[A-Za-z]:[\\/]/u,
  /(?:^|\s)(?:pnpm|npm|yarn|node|tsx|npx|powershell|cmd|bash|sh|curl|wget)(?:\s|$)/iu,
]) {
  assert.doesNotMatch(
    visibleResultText,
    forbiddenVisibleValue,
    "Visible iteration result example must contain product language only"
  );
}
if (parsedVisibleResultExample.previewUrl) {
  assert.match(parsedVisibleResultExample.previewUrl, /^\/(?!\/)[^\\]*$/u);
}

const mcpServer = read(path.join(root, "scripts", "mcp-server.mjs"));
for (const prepareTaskBindingPart of [
  "Pass task_id only when continuing an exact website-created analysis task",
  "Optional exact website-created Cofound analysis task ID",
  "taskId: args.task_id",
]) {
  assert.ok(
    mcpServer.includes(prepareTaskBindingPart),
    `MCP prepare_investment_analysis missing task binding: ${prepareTaskBindingPart}`
  );
}
assert.match(
  mcpServer,
  /name:\s*"prepare_investment_analysis"[\s\S]*?task_id:\s*\{[\s\S]*?required:\s*\["project_id",\s*"skill_name",\s*"requested_by"\]/u,
  "prepare_investment_analysis must accept optional task_id without breaking ordinary callers"
);
for (const toolName of [
  "claim_pending_investment_analysis",
  "update_investment_analysis_task",
  "complete_investment_analysis_task",
  "fail_investment_analysis_task",
]) {
  assert.ok(
    mcpServer.includes(`name: "${toolName}"`),
    `MCP server missing analysis task tool ${toolName}`
  );
  assert.ok(
    mcpServer.includes(`name === "${toolName}"`),
    `MCP server missing analysis task dispatcher ${toolName}`
  );
}
for (const heartbeatContract of [
  "progress heartbeat for long analysis",
  "at least every 10 minutes",
  "Use 1800 seconds with the required 10-minute heartbeat cadence",
  "leaseSeconds: args.lease_seconds ?? 1800",
]) {
  assert.ok(
    mcpServer.includes(heartbeatContract),
    `MCP analysis task tool missing heartbeat contract: ${heartbeatContract}`
  );
}
for (const toolName of [
  "submit_product_feedback",
  "list_product_feedback",
  "claim_product_feedback",
  "update_product_feedback_progress",
  "renew_product_feedback_claim",
  "mark_product_feedback_needs_attention",
  "complete_product_feedback_diagnosis",
  "sync_product_feedback",
  "refresh_product_feedback_status",
  "refresh_maintenance_feedback",
  "triage_product_feedback",
  "close_product_feedback_maintenance",
]) {
  assert.ok(
    mcpServer.includes(`name: "${toolName}"`),
    `MCP server missing product feedback tool ${toolName}`
  );
  assert.ok(
    mcpServer.includes(`name === "${toolName}"`),
    `MCP server missing dispatcher for ${toolName}`
  );
}
for (const route of [
  'request("/api/local/product-feedback"',
  "/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/claim",
  "/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/progress",
  "/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/heartbeat",
  "/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/needs-attention",
  "/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/complete",
  "/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/sync",
  'request("/api/local/product-feedback/refresh-status"',
  'request("/api/local/product-feedback/refresh-maintainer-inbox"',
  "/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/triage",
  "/api/local/product-feedback/${encodeURIComponent(args.feedback_id)}/close-maintenance",
]) {
  assert.ok(
    mcpServer.includes(route),
    `MCP server missing feedback route ${route}`
  );
}
for (const payloadKey of [
  "description: args.description",
  "expectedOutcome: args.expected_outcome",
  "category: args.category",
  "impact: args.impact",
  "claimedBy: args.claimed_by",
  "modelName: args.model_name",
  "claimToken: args.claim_token",
  "diagnosis: args.diagnosis",
  "trialFixStatus: args.trial_fix_status",
  "action: args.action",
  "note: args.note",
]) {
  assert.ok(
    mcpServer.includes(payloadKey),
    `MCP server missing feedback payload mapping ${payloadKey}`
  );
}

for (const toolName of [
  "list_product_iterations",
  "claim_product_iteration",
  "update_product_iteration_progress",
  "renew_product_iteration_claim",
  "mark_product_iteration_needs_attention",
  "complete_product_iteration",
  "preflight_approved_product_iteration",
  "finalize_approved_product_iteration",
]) {
  assert.ok(
    mcpServer.includes(`name: "${toolName}"`),
    `MCP server missing product iteration tool ${toolName}`
  );
  assert.ok(
    mcpServer.includes(`name === "${toolName}"`),
    `MCP server missing dispatcher for ${toolName}`
  );
}
for (const route of [
  'request("/api/local/iterations")',
  "/api/local/iterations/${encodeURIComponent(args.iteration_id)}/claim",
  "/api/local/iterations/${encodeURIComponent(args.iteration_id)}/progress",
  "/api/local/iterations/${encodeURIComponent(args.iteration_id)}/heartbeat",
  "/api/local/iterations/${encodeURIComponent(args.iteration_id)}/needs-attention",
  "/api/local/iterations/${encodeURIComponent(args.iteration_id)}/complete",
  "/api/local/iterations/${encodeURIComponent(args.iteration_id)}/preflight-finalize",
  "/api/local/iterations/${encodeURIComponent(args.iteration_id)}/finalize",
]) {
  assert.ok(mcpServer.includes(route), `MCP server missing route ${route}`);
}
for (const payloadKey of [
  "claimedBy: args.claimed_by",
  "modelName: args.model_name",
  "status: args.status",
  "message: args.message",
  "claimToken: args.claim_token",
  "candidateRef: args.candidate_ref",
  "result: args.result",
  "appliedRef: args.applied_ref",
]) {
  assert.ok(
    mcpServer.includes(payloadKey),
    `MCP server missing iteration payload mapping ${payloadKey}`
  );
}
for (const claimContractPart of [
  "response includes a private claimToken and lease expiry",
  'required: ["iteration_id", "claim_token", "status", "message"]',
  'required: ["iteration_id", "claim_token", "message"]',
  'required: ["iteration_id", "claim_token"]',
  "claimToken: args.claim_token",
  "candidateRef: args.candidate_ref",
  'pattern: "^/(?!/)[^\\\\\\\\]*$"',
  "External, scheme-relative, file, and filesystem URLs are forbidden",
]) {
  assert.ok(
    mcpServer.includes(claimContractPart),
    `MCP server missing private iteration contract ${claimContractPart}`
  );
}
assert.match(
  mcpServer,
  /required:\s*\[\s*"iteration_id",\s*"claim_token",\s*"model_name",\s*"candidate_ref",\s*"result",?\s*\]/u,
  "Completion must require claim_token and candidate_ref outside the visible result"
);
for (const preflightContractPart of [
  'required: ["iteration_id", "candidate_ref"]',
  "preflight_approved_product_iteration succeeds for the exact candidate",
  "body: JSON.stringify({ candidateRef: args.candidate_ref })",
]) {
  assert.ok(
    mcpServer.includes(preflightContractPart),
    `MCP server missing finalize preflight contract ${preflightContractPart}`
  );
}
for (const finalizeContractPart of [
  'required: ["iteration_id", "applied_ref"]',
  'pattern: "^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$"',
  "body: JSON.stringify({ appliedRef: args.applied_ref })",
  "it does not run Git, merge code, run tests, deploy, or write Feishu",
]) {
  assert.ok(
    mcpServer.includes(finalizeContractPart),
    `MCP server missing finalize safety contract ${finalizeContractPart}`
  );
}
for (const resultContractPart of [
  'required: ["summary", "changes", "checks", "risks"]',
  'enum: ["passed", "warning", "failed"]',
  "additionalProperties: false",
]) {
  assert.ok(
    mcpServer.includes(resultContractPart),
    `MCP server missing strict iteration result contract ${resultContractPart}`
  );
}

const policyEnhancement = read(
  path.join(skillsRoot, "match-shanghai-cleantech-policies", "SKILL.md")
);
for (const safeguard of [
  "Run only when the user explicitly asks",
  "not_applicable",
  "Do not modify deterministic project facts",
  "Do not publish, share, sync",
  "do not pretend it was written",
]) {
  assert.ok(
    policyEnhancement.includes(safeguard),
    `Policy enhancement missing: ${safeguard}`
  );
}

const cleanTechRouter = read(
  path.join(skillsRoot, "enhance-cleantech-project", "SKILL.md")
);
for (const expected of [
  "$review-cleantech-financial-evidence",
  "$match-shanghai-cleantech-policies",
  "$match-cleantech-project-opportunities",
  "not_applicable",
  "needs_input",
  "Do not auto-run",
  "independent optional Skills",
  "enhancement-result-contract.md",
  "input to `complete_investment_analysis`",
  "conversation-only",
]) {
  assert.ok(
    cleanTechRouter.includes(expected),
    `CleanTech router missing: ${expected}`
  );
}

const enhancementContract = read(
  path.join(
    skillsRoot,
    "enhance-cleantech-project",
    "references",
    "enhancement-result-contract.md"
  )
);
for (const expected of [
  "cofound-cleantech-enhancement/v1",
  "projectBinding",
  "factSnapshotHash",
  "authoritativeResult",
  "codexInterpretation",
  "conversation_only",
  "complete_investment_analysis",
  "stale",
]) {
  assert.ok(
    enhancementContract.includes(expected),
    `Enhancement result contract missing: ${expected}`
  );
}

const cleanTechFinance = read(
  path.join(skillsRoot, "review-cleantech-financial-evidence", "SKILL.md")
);
for (const expected of [
  "run_cleantech_financial_evidence_audit",
  "profitability-unit-economics",
  "cash-runway",
  "zero model calls",
  "not_applicable",
  "enhancement-result-contract.md",
  "conversation_only",
]) {
  assert.ok(
    cleanTechFinance.includes(expected),
    `CleanTech finance missing: ${expected}`
  );
}

const cleanTechOpportunities = read(
  path.join(skillsRoot, "match-cleantech-project-opportunities", "SKILL.md")
);
for (const expected of [
  "unavailable_auth_required",
  "active_candidate",
  "needs_live_verification",
  "closed_or_stale",
  "Never call them from a single-project analysis",
  "project match-feishu",
  "opportunity-match-contract.md",
  "enhancement-result-contract.md",
  "not_applicable",
  "conversation_only",
]) {
  assert.ok(
    cleanTechOpportunities.includes(expected),
    `CleanTech opportunity matcher missing: ${expected}`
  );
}

const opportunityContract = read(
  path.join(
    skillsRoot,
    "match-cleantech-project-opportunities",
    "references",
    "opportunity-match-contract.md"
  )
);
for (const expected of [
  "cleantech-project-opportunity/v1",
  "project match-feishu",
  "Allowed dimensions are exactly",
  "active_candidate",
  "needs_live_verification",
  "closed_or_stale",
  "candidate-set SHA-256",
  "no_match",
]) {
  assert.ok(
    opportunityContract.includes(expected),
    `Opportunity match contract missing: ${expected}`
  );
}

const plugin = JSON.parse(
  read(path.join(root, ".codex-plugin", "plugin.json"))
) as {
  version: string;
  skills: string;
  interface?: { capabilities?: string[]; defaultPrompt?: string };
};
assert.match(plugin.version, /^0\.13\.0\+codex\.\d{14}$/u);
assert.equal(plugin.skills, "./skills/");
assert.ok(
  (plugin.interface?.defaultPrompt?.length ?? 0) <= 128,
  "Plugin default prompt must fit the Codex manifest limit"
);
assert.ok(
  plugin.interface?.capabilities?.includes("Open workspace capability protocol"),
  "Plugin must advertise the open workspace protocol"
);
for (const capability of [
  "Adaptive brief-first analysis",
  "User thesis challenge and enhancement",
  "Traceable resource recommendations",
]) {
  assert.ok(
    plugin.interface?.capabilities?.includes(capability),
    `Plugin must advertise ${capability}`
  );
}
assert.ok(
  plugin.interface?.capabilities?.includes("Codex App Server analysis tasks"),
  "Plugin must advertise Codex App Server analysis tasks"
);
assert.ok(
  plugin.interface?.capabilities?.includes("Evidence-bound BP optimization"),
  "Plugin must advertise evidence-bound BP optimization"
);
assert.ok(
  plugin.interface?.capabilities?.includes(
    "Optional project enhancement skills"
  ),
  "Plugin must advertise optional enhancement skills"
);
assert.ok(
  plugin.interface?.capabilities?.includes(
    "Read-only Shanghai policy matching"
  ),
  "Plugin must advertise read-only Shanghai policy matching"
);
assert.ok(
  plugin.interface?.capabilities?.includes("CleanTech enhancement routing"),
  "Plugin must advertise CleanTech enhancement routing"
);
assert.ok(
  plugin.interface?.capabilities?.includes("Human-reviewed product iteration"),
  "Plugin must advertise human-reviewed product iteration"
);
assert.ok(
  plugin.interface?.capabilities?.includes("Teammate Codex feedback diagnosis"),
  "Plugin must advertise teammate feedback diagnosis"
);
assert.ok(
  plugin.interface?.capabilities?.includes(
    "Feishu maintenance inbox synchronization"
  ),
  "Plugin must advertise Feishu feedback synchronization"
);

const projectRoot = path.resolve(root, "..", "..");
const marketplace = JSON.parse(
  read(path.join(projectRoot, ".agents", "plugins", "marketplace.json"))
) as {
  name: string;
  plugins?: Array<{ name?: string; source?: { path?: string } }>;
};
assert.equal(marketplace.name, "cofound-local");
assert.ok(
  marketplace.plugins?.some(
    entry =>
      entry.name === "cofound-bp-desk" &&
      entry.source?.path === "./plugins/cofound-bp-desk"
  ),
  "Local marketplace must publish the Cofound plugin"
);
const pluginInstaller = read(
  path.join(projectRoot, "scripts", "install-codex-plugin.ps1")
);
for (const expected of [
  "plugin\", \"marketplace\", \"add",
  "$PluginName@$MarketplaceName",
  "Cofound Codex plugin is ready",
]) {
  assert.ok(
    pluginInstaller.includes(expected),
    `Codex plugin installer missing: ${expected}`
  );
}
assert.ok(
  fs.existsSync(path.join(root, "assets", "cofound-mark.svg")),
  "Plugin icon must be stored under the plugin assets directory"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      skills: expectedSkills.length,
      primaryRouter: primarySkills[0],
      specialists: specialistSkills,
      enhancements: enhancementSkills,
      productIterations: productIterationSkills,
      productFeedback: productFeedbackSkills,
    },
    null,
    2
  )
);
