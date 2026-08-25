---
name: match-cleantech-project-opportunities
description: "Match an evidence-backed clean-energy project to candidate European or Brazilian projects, procurement demands and tenders from the CleanTech Finance Feishu project catalog. Use only when the user explicitly asks for project, tender or order opportunities; authentication failure is unavailable_auth_required, never an empty match."
---

# Match CleanTech project opportunities

This is an optional high-recall reference matcher, not proof of a live tender or
awarded order. Cofound supplies a minimal project profile; CleanTech Finance
owns catalog mapping, quality gates and deterministic recall; Feishu remains the
operational project catalog.

## Workflow

1. Confirm the exact Cofound project and explicitly establish
   `clean_energy_applicable`. Return `not_applicable` for unrelated projects and
   `needs_input` when product, technology or target market is missing.
2. Call `get_cleantech_enhancement_status`. If
   `projectOpportunityMatch.status` is `unavailable_auth_required` or
   `unavailable_runtime`, stop and report that status. Do not attempt a browser
   login, bot identity, stale workbook or direct European/Brazilian API call.
3. Call `run_cleantech_project_opportunity_match` with the current project ID,
   operator name, explicit applicability flag, five-dimension tag plan and
   optional `as_of` date. Send only allowlisted generic tags needed for recall.
   Never send the BP, full project object, company or person names, customers,
   contracts, financing, file paths, internal notes, management state or
   permissions.
4. Preserve the deterministic candidate set. Codex may explain relevance and
   gaps but may not invent, rank or add candidates.
5. Read
   [references/opportunity-match-contract.md](references/opportunity-match-contract.md)
   before interpreting the tool response. The MCP tool uses the CleanTech
   Finance one-shot `project match-feishu` gateway with the operator's
   user-scoped `lark-cli` identity. Do not run the CLI directly or call the
   European or Brazilian collection APIs from this Skill.
6. Read the
   [shared enhancement envelope](../enhance-cleantech-project/references/enhancement-result-contract.md).
   Preserve the source gateway payload under `authoritativeResult`, bind it to
   the current project version and source SHA-256, and keep Codex explanation
   separate.

## Result semantics

Classify every returned record as exactly one of:

- `active_candidate` — current state and deadline both support active review;
- `needs_live_verification` — relevance exists but status or deadline needs an
  official real-time check;
- `closed_or_stale` — closed, awarded, expired or otherwise historical.

Also distinguish `project_lead`, `procurement_demand`, `tender_opportunity`,
`potential_order`, and `awarded_order`. Use `awarded_order` only for a formal
contract, award or equivalent evidence.

The European and Brazilian APIs are administrator-side catalog maintenance
sources. Never call them from a single-project analysis and never update Feishu.
Do not change Cofound facts, management status, sharing scope or permissions.

## Output contract

Return applicability/status, project binding, the five-dimension request plan,
candidate groups, material gaps, smallest next verification, and provenance.
Provenance must include the request/profile snapshot hash, Feishu read time,
catalog hash, candidate-set hash, candidate fingerprints, CleanTech release,
Skill name and `as_of` date. If no dedicated enhancement-save tool confirms a
write, set persistence to `conversation_only`; never send this result to
`complete_investment_analysis`.
