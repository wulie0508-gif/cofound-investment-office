---
name: assess-long-term-value
description: Assess a Cofound local early-stage project through an industrial and long-term-value lens covering value-chain position, operating quality, resource orchestration, durable advantage, capital efficiency, and downside scenarios. Use for industrial technology, enterprise, hardware, or other projects where long cycles and defensibility matter more than a short-term growth headline.
---

# Assess long-term value

Use the `cofoundBpDesk` MCP tools. Apply this lens after reading the latest deterministic facts and evidence.

## Workflow

1. Call `cofound_health`, then read the exact project and current local version with `get_bp_project`.
2. Call `prepare_investment_analysis` with
   `skill_name: "assess-long-term-value"`. Use only its frozen `factSnapshot`
   as the factual basis and keep the run ID.
   Use `read_prepared_analysis_pages` for relevant value-chain, delivery and
   technology narrative pages that are absent from standard facts.
3. Map who pays, who uses, who influences procurement, who bears deployment risk and where economic value accumulates in the chain.
4. Assess six dimensions:
   - value-chain position and bargaining power;
   - operating quality across growth, gross margin, delivery, cash and concentration;
   - orchestration of customers, suppliers, talent, channels and capital;
   - durable advantage in technology, data, network, brand, distribution or cost;
   - capital efficiency and financing path for the actual development cycle;
   - downside scenarios, strategic buyers and paths to liquidity.
5. Reconcile time horizons. Do not compare a hardware deployment cycle with a software sales cycle without adjustment.
6. Treat market size and exit as hypotheses. Do not hide current unit-economic or cash constraints behind a long-term narrative.
7. Read the
   [shared write-back contract](../analyze-local-bp/references/analysis-schema.md#codex-investment-judgment-write-back),
   then save the judgment with `complete_investment_analysis`, the actual model
   name and `schemaVersion: "1.0"`, filling `summary`,
   `positiveSignals`, `keyRisks`, `frameworkSections`, `unresolvedQuestions`,
   `nextActions`, `aiSuggestion`, and `confidence`. Evidence references must use real field
   keys, pages and short quotes from the frozen snapshot. Re-prepare and
   re-analyze if the run is stale; never overwrite history.
8. Do not change management status or publish data unless the user separately requests that write.

## Output contract

- State project version, business stage and evidence coverage.
- Separate `产业位置`, `经营质量`, `长期壁垒`, `资本路径`, `下行情景`, and `尚未解决的问题`.
- Show the strongest compounding mechanism and the strongest reason it may fail.
- End with a three-horizon validation plan, current AI suggestion and actual management status.
