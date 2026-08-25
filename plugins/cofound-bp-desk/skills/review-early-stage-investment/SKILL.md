---
name: review-early-stage-investment
description: Run Cofound's evidence-first core screen for a local Angel, Pre-A, or A-round project. Use for an overall first investment review, commercial and financing consistency check, or next-step recommendation; use a dedicated market-first, founder-first, or long-term-value skill when the user requests one of those lenses.
---

# Review early-stage investment

Use the `cofoundBpDesk` MCP tools. This is Cofound's default judgment layer on top of deterministic local facts. It does not replace extraction or silently change management decisions.

## Required boundary

1. Call `cofound_health`, then identify the project with `list_bp_projects` or the project ID supplied by the analysis studio.
2. Read the latest project with `get_bp_project`. Refresh deterministic extraction with `analyze_bp_project` only when the user requests it or the current version has not been analyzed.
3. Call `prepare_investment_analysis` with this project,
   `skill_name: "review-early-stage-investment"`, and the current local display
   name when known. From this point, use only its frozen `factSnapshot` as the
   factual basis. Keep the returned run ID.
   Use `read_prepared_analysis_pages` for relevant narrative pages when the
   standard fact ledger is insufficient; it remains bound to the same file SHA.
4. Treat source-backed numbers, dates, rounds, customer counts and page locations as facts only when evidence is present. Never repair missing facts by inference.
5. Reconcile commercial facts before judging traction: orders, LOIs, revenue, delivered value, acceptance, invoices, payments, paying customers and customer concentration are not interchangeable.
6. Reconcile financing facts: round, amount, pre/post-money basis, use of proceeds, cash, burn and runway. Mark incompatible periods, units or currencies as unresolved.
7. Label every non-source conclusion as an inference. Do not change management status, custom fields, sharing boundaries or publications unless the user separately asks for that write.
8. After forming the judgment, read the
   [shared write-back contract](../analyze-local-bp/references/analysis-schema.md#codex-investment-judgment-write-back),
   then call `complete_investment_analysis` with the prepared run ID, actual
   model name and the exact structured result contract. Evidence-based
   signals and risks must cite real field keys, pages and short quotes from the
   frozen snapshot. If completion reports a stale snapshot, prepare a new run
   and re-analyze; never overwrite history.

## Core screen

- State the product, target customer, business model, current round and requested amount from evidence.
- Identify the single strongest decision-relevant positive signal.
- Identify up to three risks most likely to invalidate the opportunity.
- Convert contradictions and missing facts into neutral unresolved questions.
- Recommend the lowest-cost next action that could materially change the decision.

## Output contract

- State the project name, local version and source SHA-256 prefix.
- Separate `已披露事实`, `框架判断`, `反证与风险`, `尚未解决的问题`, and `下一步验证`.
- Cite key facts as `第 N 页/段：“short quote”`.
- For each major judgment, name the evidence used and the strongest plausible counterargument.
- End with the current AI suggestion and actual management status; never silently overwrite the latter.
- The saved result must include `summary`, `positiveSignals`, `keyRisks`,
  `frameworkSections`, `unresolvedQuestions`, `nextActions`, `aiSuggestion`,
  and `confidence`, with `schemaVersion: "1.0"`.
