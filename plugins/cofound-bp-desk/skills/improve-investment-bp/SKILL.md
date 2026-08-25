---
name: improve-investment-bp
description: "Improve an early-stage investment BP after Cofound has extracted its evidence-backed facts or completed an investment review. Use when the user asks to optimize, rewrite, restructure, polish, beautify, or prepare a pitch deck; preserve the original, never invent traction or market data, and keep every proposed claim bound to the current project version and fact snapshot."
---

# Improve investment BP

Use this as a downstream improvement skill, not as a substitute for investment analysis. The goal is to make a BP easier to understand and verify while preserving its factual boundary.

## Prepare the evidence base

1. Call `cofound_health`, then read the named project with `get_bp_project`.
2. Identify the current primary BP version, source SHA-256, deterministic facts, evidence locations, missing information, risks, and the most recent investment analysis supplied in the conversation.
3. Bind the work to that project version and a written fact snapshot. If a human correction changes a material fact, mark earlier recommendations that depended on it as outdated and recommend rerunning this skill.
4. If the user has not completed an investment analysis, use `$analyze-local-bp` to choose one primary analysis skill first. Do not run every investment lens by default.
5. Do not pass `improve-investment-bp` to `prepare_investment_analysis` or
   `complete_investment_analysis`; those tools accept only the four investment
   judgment Skills. Record the source analysis run ID and fact snapshot hash in
   the change brief when they are available.

## Choose one mode

- `audit-only`: critique the existing BP and prioritize changes. Use this by default when only a PDF is available.
- `rewrite-plan`: produce the revised narrative, page plan, draft copy, evidence requests, and visual direction without editing a file.
- `edit-copy`: create a new editable copy only when an editable source exists, suitable document or presentation tooling is available, and the user explicitly asks for a generated revision.

Never overwrite the original BP. Keep the source file and any revised output as separate versions.

## Improve the BP

Read [references/bp-optimization-framework.md](references/bp-optimization-framework.md), then:

1. State the intended reader, financing stage, ask, and the one-sentence investment thesis the deck should make legible.
2. Build an evidence ledger with three labels: `已核验`, `待补证据`, and `不得写入`. Every proposed number, customer claim, comparison, quotation, and credential must have one label.
3. Restructure the narrative around the decision sequence: problem, why now, solution, evidence, business model, market and competition, team, financing, risks, and next proof point. Do not force a page that the evidence cannot support.
4. Convert analysis findings into targeted changes. Address contradictions and missing proof before visual polish.
5. Recommend visual hierarchy, charts, tables, diagrams, and page density based on the decision being supported. Do not use decoration to imply certainty.
6. If editing a copy, preserve source numbers and citations, add a change log, and visually verify the rendered result. If the editable source or rendering tools are unavailable, return a production-ready change brief instead of pretending a file was edited.

## Safety and quality rules

- Never invent TAM, traction, customers, orders, revenue, margins, partnerships, logos, quotations, credentials, or benchmark data.
- Never convert an inference into company-disclosed fact. Mark inferred language explicitly or omit it from the proposed deck.
- Never hide a material risk by moving it out of the main narrative.
- Do not publish, share, or change project management status unless the user separately asks for that action.
- Do not claim that a prettier BP improves the underlying investment quality.

## Output contract

Return, in order:

1. bound project version, source hash prefix, and fact snapshot used;
2. mode and intended audience;
3. current narrative diagnosis;
4. proposed investment story in one paragraph;
5. page-by-page plan with purpose, evidence, and proposed copy;
6. evidence ledger and unresolved inputs;
7. visual system and chart recommendations;
8. prioritized change list and change log;
9. generated file path only if a new copy was actually created and verified.

Use `第 N 页/段：“short quote”` for evidence. Keep facts, inferences, missing information, and editorial suggestions visibly separate.
