---
name: assess-market-first
description: Assess a Cofound local early-stage project through a market-first seven-lens framework covering market position, founder fit, evidence, resilience, terms, investor fit, and exit hypotheses. Use when the user asks about track quality, timing, category leadership, market ceiling, or a Sequoia-inspired perspective; do not treat this as an official institutional scorecard.
---

# Assess market first

Use the `cofoundBpDesk` MCP tools. Apply this skill only after deterministic local facts exist.

## Workflow

1. Call `cofound_health`, then read the exact project and latest local version with `get_bp_project`.
2. Call `prepare_investment_analysis` with
   `skill_name: "assess-market-first"`. Use only the returned frozen
   `factSnapshot` as the factual basis and keep the run ID.
   Use `read_prepared_analysis_pages` for relevant market, competition and
   customer narrative pages that are absent from the standard fact ledger.
3. Keep disclosed facts, inferences, missing information and recommendations separate. Cite facts by page/segment.
4. Read [references/market-first-lenses.md](references/market-first-lenses.md), then assess all seven lenses. Use `未披露` when the material cannot support a lens.
5. Test the optimistic market thesis against substitution, policy, incumbent response, demand contraction and acquisition-cost pressure.
6. Treat sector benchmarks and numeric thresholds as comparison scenarios, not universal death lines. State the source and stage whenever using one.
7. Read the
   [shared write-back contract](../analyze-local-bp/references/analysis-schema.md#codex-investment-judgment-write-back),
   then save the structured judgment with `complete_investment_analysis` using
   `schemaVersion: "1.0"` and the actual model name. Use only
   real field keys, pages and short quotes from the frozen snapshot for
   evidence references. If the run is stale, prepare again and re-analyze; do
   not overwrite a completed run.
8. Do not change management status or publish data unless the user separately requests that write.

## Output contract

- State the project, local version and SHA-256 prefix.
- Provide `市场判断摘要` followed by a seven-row assessment: evidence, inference, counterargument and unresolved evidence for each lens.
- Separate near-term commercial proof from long-term market potential.
- End with `成立条件`, `否决条件`, `下一步验证`, current AI suggestion and actual management status.
- Map the judgment into the save contract fields `summary`,
  `positiveSignals`, `keyRisks`, `frameworkSections`, `unresolvedQuestions`,
  `nextActions`, `aiSuggestion`, and `confidence`.
