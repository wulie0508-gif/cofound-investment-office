---
name: analyze-local-bp
description: "Use Cofound's open Codex-first workspace to work naturally with local BP projects: retrieve evidence, answer questions, find BP problems, challenge or strengthen an investment view, recommend traceable resources, and manage project context. Specialist Skills are optional tools, not a required route."
---

# Analyze local BP

Use the `cofoundBpDesk` MCP tools. Keep every original file on the user's machine unless the user explicitly asks to publish selected fields or selected files to the controlled sharing layer.

## Workflow

1. Call `cofound_health` before a write operation. It normally starts the local service automatically. If automatic recovery fails, ask the user to double-click the desktop `Co-founder Investment Office` shortcut; do not substitute a cloud upload.
2. Find an existing project with `list_bp_projects`, or import a user-specified local path with `import_bp_file`. Use `scan_bp_folder` only when the user identifies a folder to scan.
   - Use `import_bp_file` only for the primary BP or a true BP version. Use `import_project_material` for financial models, diligence files, legal documents, contracts, product documents, research, meeting notes and other supporting files. If the project is unknown, leave it in the pending material inbox and use `list_pending_materials` before assigning it.
   - When the user asks to receive project material from WeChat, call `get_wechat_bp_inbox_status`. On first use, explain that initialization only baselines old files, then call `initialize_wechat_bp_inbox` after the user agrees. Ask them to send `存入项目库` and then the file to their own File Transfer Assistant before calling `receive_wechat_bp_files`.
   - The WeChat operation is local and asynchronous. Poll `get_wechat_bp_inbox_status` until it succeeds or fails; never claim that Vercel can read WeChat or the local attachment directory.
3. Use `list_custom_fields`, `create_custom_field`, and `set_project_custom_field` when the leader asks to extend the project list or maintain team-specific fields. Do not replace or rename the system's evidence-backed core investment fields; custom fields are the adjustable management layer.
4. Read the project with `get_bp_project`. Treat non-null facts as source-backed only when their evidence page/segment and quote are present.
5. Answer the user's current brief before applying a generic framework. Separate facts from interpretation, missing information, and suggestions; never present a suggestion or derived check as source text.
6. Say “not disclosed” for missing facts. Do not estimate revenue, orders, customers, margin, burn, runway, valuation, or team credentials from unrelated clues.
7. Use `analyze_bp_project` to refresh the deterministic local analysis when requested or when a new version was just imported.
   - When the user explicitly asks to refresh several projects, use `analyze_bp_batch` with concurrency `2` by default and never above `3`. Do not run two writes against the same project concurrently.
8. Update the actual pipeline status with `update_bp_status` only when the user asks. Preserve the distinction between `aiStatus` and `managementStatus`; use `locked: true` when the user wants later analyses not to overwrite the human status.

## Open analysis workspace

Analysis is an enhancement of the user's thinking, not a fixed scorecard or an
intent-classification pipeline. Read
[references/adaptive-analysis.md](references/adaptive-analysis.md) before an
investment analysis, BP problem review, thought-challenge, or resource request.

1. Understand the user's request from the conversation as Codex normally
   would. Do not force it into an intent enum, form, workflow choice, or fixed
   analysis sequence.
2. Retrieve the deterministic facts and narrative evidence that are useful to
   the answer. A factual lookup does not require an investment run.
3. When it helps the user's reasoning, distinguish their current view, what the
   evidence supports, the strongest counter-case, and a more robust conclusion.
   These are useful reasoning moves, not mandatory headings for every reply.
4. Use any specialist investment or enhancement Skill only when the user names
   it or it materially improves the requested work. Do not run a Skill merely
   because it is installed or because the project matches a category.
5. Distinguish a `verified_resource` from a `search_direction` in the reasoning
   and make that source status clear to the user, without forcing a fixed
   response template. A specific person, policy, order, tender, program or URL
   is allowed only when an authorized tool or supplied source verifies it.
6. Do not contact a resource, publish, share, write to Feishu, or perform any
   other external action without separate explicit authorization.

Use two output layers:

- **Codex conversation:** follow the user's question freely, ask or answer
  follow-ups, compare interpretations, and iteratively strengthen the user's
  thinking. Do not compress this work merely to fit the dashboard schema.
- **Dashboard write-back:** save only a stable, evidence-bound and comparable
  summary through the existing structured result contract. The schema is a
  record of the analysis, not a limit on the conversation.

## Traceable Codex judgment

When the user's brief requires a persisted investment judgment, do not analyze
the mutable project response and do not stop after writing an answer in chat.
The persisted judgment path supports exactly the four investment Skills listed
below; BP editing and CleanTech enhancements use their own result contracts.

1. Select one of `$review-early-stage-investment`,
   `$assess-market-first`, `$assess-founder-first`, or
   `$assess-long-term-value`.
2. Call `prepare_investment_analysis` with the project ID, the selected
   `skill_name`, and the current local display name when known. Include
   `task_id` only when continuing the exact website-created task currently
   claimed; omit it for an ordinary Codex conversation. If it reports that
   deterministic facts are missing, call `analyze_bp_project` once and retry
   with the same task binding, if any.
3. Treat the returned `factSnapshot` as the only factual input to the selected
   Skill. Keep its `runId`, source SHA-256, local version, Skill version, prompt
   version and fact snapshot hash together.
4. When the selected framework needs narrative evidence that is not represented
   by a standard fact, call `read_prepared_analysis_pages` for up to eight
   relevant pages at a time. This tool is bound to the prepared run and verifies
   the source SHA-256; do not read a mutable latest file instead.
5. Before saving, read
   [references/analysis-schema.md](references/analysis-schema.md), produce the
   brief-first adaptive judgment, then call `complete_investment_analysis`.
   The selected Skill identifies the analytical lens and provenance; it does
   not require a generic framework-only response. Populate the
   exact structured `result` contract: `summary`, `positiveSignals`,
   `keyRisks`, `frameworkSections`, `unresolvedQuestions`, `nextActions`,
   `aiSuggestion`, and `confidence`.
   Every evidence reference must use a real `fieldKey`, page and short quote
   from the frozen snapshot. Label unsupported interpretation as `inference`
   and absent information as `missing_information`.
6. If completion says the task is stale, do not overwrite it. Prepare a new run
   from the current facts and repeat the judgment. A completed historical run
   is immutable.
7. `aiSuggestion` is analysis output only. Never copy it into
   `managementStatus` unless the user separately and explicitly asks to update
   the management decision.
8. Never pass `improve-investment-bp` or a CleanTech enhancement name to
   `prepare_investment_analysis`; the server rejects them. If the frozen
   snapshot shows that the selected lens is materially wrong, leave that
   prepared run unfinished, select the correct one of the four supported
   judgment Skills, and prepare a new run before reasoning.

### Website-created analysis task

The local project page may open a Codex thread with an opaque Cofound analysis
task ID. In that case, treat the website as a task launcher, not as an analysis
engine, and complete the following handoff before answering the user:

1. Call `claim_pending_investment_analysis` with the exact `task_id` from the
   launch message and the current local display name. Never claim a different
   queued task when an exact ID was supplied. Keep the returned `claimToken`
   private to this turn.
2. Read `task.mode` from the claim response:
   - `auto` means choose one supported investment Skill as the persisted lens
     using professional judgment and the available project context. This is a
     website task requirement, not a rule for ordinary Codex conversations;
   - one of the four explicit Skill names means the user deliberately selected
     that perspective. Respect it, and describe any fit limitation inside the
     judgment instead of silently switching to another lens.
3. Call `update_investment_analysis_task` immediately after selecting the Skill,
   with `lease_seconds: 1800`. Persist a short user-readable routing reason,
   then call `prepare_investment_analysis` with `task_id` set to the exact task
   ID claimed in step 1 and continue with the frozen-evidence workflow above.
   Never omit, substitute or reuse another task ID on this website path; this
   binds the run's provenance and request context to the originating task.
4. Until a terminal task call succeeds, use
   `update_investment_analysis_task` as the progress heartbeat at least once
   every 10 minutes, always with the same task ID and private claim token and
   with `lease_seconds: 1800`. A milestone progress update also counts as that
   interval's heartbeat. Keep the message short and user-readable; do not put BP
   text, evidence quotes, file paths, hashes, secrets or the claim token in it.
   Each successful call renews the lease for 30 minutes, leaving time for a
   delayed call without allowing a long analysis to silently lose its claim.
   If a heartbeat reports an expired or lost claim, stop using that token and
   ask the user to launch a fresh task; do not write a result to the stale task.
   If it reports a terminal task, stop heartbeats and report that terminal
   state instead of starting another task automatically.
5. After `complete_investment_analysis` succeeds, call
   `complete_investment_analysis_task` with the immutable `runId`, selected
   Skill and the same routing reason. Completion links the result to the
   website task; it does not change `managementStatus`. Stop heartbeats after
   this terminal call succeeds.
6. If a recoverable error prevents completion while the claim is still valid,
   call
   `fail_investment_analysis_task` once with a concise, non-sensitive reason.
   Do not include BP text, file paths, hashes, stack traces, secrets or the
   private claim token in that reason. Stop heartbeats after this terminal call
   succeeds.
7. If the claim response reports `superseded`, stop. The project changed after
   the click, so a new task must bind the current version rather than analyzing
   stale material.

The launch message and task row contain identifiers and routing intent only.
Always obtain facts through the existing Cofound tools; never expect the
website or the Codex launch command to embed BP text or a source-file path.

## Optional specialist tools

Treat this Skill as the normal natural-language entrance to the whole product.
It is an open workspace capability protocol, not an intent router. The
dashboard is a visible management and review surface; it is not required for
routine import, search, analysis, status, or bounded sharing operations that
can be completed through the tools above.

Do not equate every analysis request with a fixed investment review. Basic
retrieval, BP issue finding, workspace operations, free-form reasoning and
resource search direction may stay in this primary Skill. The available lenses
are `$review-early-stage-investment`, `$assess-market-first`,
`$assess-founder-first`, and `$assess-long-term-value`; they are optional and
replaceable. Use one only when the user selects it, it adds clear value, or a
website-created structured task requires a persisted lens.
In an ordinary Codex conversation, no lens is required.

For a persisted judgment, `prepare_investment_analysis` freezes the facts for
the selected Skill; the frozen snapshot, not a later project read, is the input
to the judgment.

Requests to rewrite, restructure, polish, beautify, or prepare the deck route to
the downstream `$improve-investment-bp` Skill. Import, retrieval, custom-field
editing, status changes, or bounded sharing without an investment judgment stay
in `$analyze-local-bp`.
In short, workspace-only operations stay in `$analyze-local-bp`.

Usage rules:

1. Do not ask the user to choose a framework before helping them. Continue the
   natural-language task directly unless a choice would materially affect the
   requested result.
2. If a specialist Skill is used, state which one and why it adds value. Do not
   make the framework the headline.
3. Do not run all investment Skills by default. Use multiple lenses only when
   the user explicitly requests comparison or it clearly improves a multi-part
   request.
4. Each persisted lens gets its own prepared run. When comparing lenses, bind
   every run to the same project version, source SHA-256 and deterministic fact
   snapshot hash; stop if those bindings differ.
5. Treat `$improve-investment-bp` as a downstream editorial action. It may consume an analysis, but it must not rewrite deterministic facts or conceal risks.
6. Specialist sections are optional tools. Omit irrelevant sections instead of filling a predetermined template.

## Optional project enhancements

The one-primary-Skill rule applies to investment judgment. A project may also
use zero or more independent enhancement Skills when the user explicitly asks
for them.

| Explicit user intent                                                                                   | Optional enhancement                     |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Ask which CleanTech enhancement fits a financial, policy, tender or market-entry question              | `$enhance-cleantech-project`             |
| Match a clean-energy project to current Shanghai policy candidates, support tools, or application gaps | `$match-shanghai-cleantech-policies`     |
| Audit clean-energy profitability, unit economics, cash or runway from a prepared local manifest        | `$review-cleantech-financial-evidence`   |
| Match a clean-energy project to European or Brazilian procurement, tender or order leads               | `$match-cleantech-project-opportunities` |

Do not run an enhancement merely because an industry label appears relevant.
For every CleanTech enhancement, keep Cofound as the project/fact system,
CleanTech Finance as the rule and matching authority, and Feishu as the policy
and project catalog.
For policy matching, pass only `industry`, `stage`, `need`, `technology`,
`geography`, and `market`. For project-opportunity matching, pass only
`industry`, `need`, `technology`, `geography`, and `market`; that authoritative
matcher does not accept `stage`. Never pass a full project object, BP text,
internal note or management status. Preserve `not_applicable` and `needs_input`
instead of forcing a match. Enhancement results must not modify facts,
management status or sharing scope, and they are not persisted to the dashboard
unless a real structured save tool confirms the write.

## Internal Feishu archive workflow

Use this only when the user asks to place one local project's BP versions or
supporting materials in the configured internal Feishu archive.

1. Call `plan_project_feishu_sync` with the project ID and the current display
   name. This is a read-only preflight: it checks the user login, index schema
   and duplicate state without creating a folder, uploading a file or writing
   an index record.
2. Show only the returned project name and ID, BP/supporting-material names and
   BP versions, target Feishu folder, and each file's `新增` or `重复，跳过`
   result. Never ask the user to review or repeat a hash, plan ID, token,
   technical remote filename or byte size.
3. Stop and wait for confirmation. A clear reply such as `确定发送`, `确认发送`,
   `OK` or `Yes` is affirmative intent: map it to `confirmed: true` and call
   `sync_project_to_feishu` with only the project ID and that boolean. Do not
   call the tool for a negative or ambiguous reply; ask one concise yes/no
   question instead.
4. The MCP keeps the technical plan binding privately for 15 minutes and
   consumes it after one execution attempt. If it is missing, expired, or the
   local files changed, generate and display a new plan before asking again.
5. Never parse arbitrary confirmation text in a backend request. Natural
   language is interpreted by Codex; the service accepts only literal
   `confirmed: true`, then rebuilds and revalidates the plan before any write.

## Lightweight sharing workflow

1. Call `list_shared_publications` before changing a publication.
2. Treat publishing as a consequential external-sharing action. Restate the project, selected field keys, selected file IDs, and expiry; call `publish_bp_project` only after the user clearly asks to publish or confirms those boundaries.
3. Default to `fields_only`. If the user explicitly names a file, use `selected_files` and `trusted`; never infer permission to share all files or future versions.
4. Use `sync_shared_project` only for a publication that already exists. The service creates a versioned snapshot and never silently resolves a conflict.
5. Return `remoteShareUrl` when available. Explain that the lightweight page supports inline viewing and annotations but deliberately has no download action.
6. Use `get_collaboration_activity` to explain pending, failed, or conflicting jobs and to summarize audit evidence.
7. Account invitations, download approvals, and high-security rendering belong to the optional private-cloud mode. Do not invoke those flows unless the user explicitly asks to use the advanced data room.

Read [references/analysis-schema.md](references/analysis-schema.md) when interpreting raw fields, comparing versions, or explaining status rules.

## Output contract

- Lead with the answer to the user's brief. The ordinary Codex conversation may
  use any structure that best serves the question; `用户判断复述`, `成立点`,
  `反证点`, and `增强后的判断` are reasoning aids, not mandatory headings.
- Cite evidence as `第 N 页/段：“short quote”`.
- Label derived judgments as inferences.
- Keep optimization suggestions under a separate heading.
- Make clear whether a resource is verified or only a search direction; never
  give an unverified specific person, policy, order, tender, program, or URL.
- Keep exploratory reasoning and follow-up discussion in the Codex
  conversation; write back only the stable structured summary needed by the
  dashboard.
- Mention the analyzed local version and SHA-256 prefix when available for
  investment-analysis responses. Do not expose hashes or technical plan IDs in
  the internal Feishu archive workflow.
- End with the current AI suggestion and actual management status.
- After a sharing operation, state the local version, shared version, selected boundary, share URL, annotation state, sync state, and whether any job still needs attention.
