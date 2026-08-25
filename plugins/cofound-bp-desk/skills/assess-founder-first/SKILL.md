---
name: assess-founder-first
description: Assess the founder and founding team of a Cofound local Angel or Pre-A project using evidence of integrity, insight, execution, learning speed, team complementarity, and resilience. Use when the user asks whether to back the people despite sparse company data; do not infer personality or honesty from writing style, education, age, gender, accent, or other proxies.
---

# Assess founder first

Use the `cofoundBpDesk` MCP tools. This lens is most useful when company metrics are naturally sparse but founder quality is decision-relevant.

## Workflow

1. Call `cofound_health` and read the exact latest project with `get_bp_project`.
2. Call `prepare_investment_analysis` with
   `skill_name: "assess-founder-first"`. Use only its frozen `factSnapshot` as
   the factual basis and keep the run ID.
   Use `read_prepared_analysis_pages` for the relevant team and founder pages
   that are not represented by standard facts; keep the same prepared run.
3. Build a founder evidence ledger from disclosed biography, prior work, shipped products, customer discovery, recruiting, delivery, failures and corrections. Cite every item.
4. Assess six dimensions:
   - integrity and consistency of claims;
   - depth of problem and industry insight;
   - demonstrated 0-to-1 execution;
   - learning speed and quality of feedback loops;
   - team complementarity and missing roles;
   - resilience and downside preparation.
5. Never equate missing information with a negative trait. Never infer personality, trustworthiness or capability from presentation style or protected/personal characteristics.
6. Distinguish founder-company fit for this opportunity from a general judgment about the person.
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

- State project version and evidence coverage before the assessment.
- Separate `创始人证据`, `框架判断`, `相反证据`, `尚未解决的问题`, and `面谈验证设计`.
- For each dimension, use `支持 / 混合 / 未知 / 风险` and explain the evidence threshold.
- End with the founder-dependent conditions that would strengthen or invalidate the investment thesis, current AI suggestion and actual management status.
