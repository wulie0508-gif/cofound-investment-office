---
name: review-cleantech-financial-evidence
description: "Run the optional deterministic CleanTech Finance evidence audit for profitability and unit economics plus cash runway. Use when a clean-energy project has a prepared local CleanTech manifest and the user explicitly asks for financial evidence validation; do not turn its dimension signals into an investment rating."
---

# Review CleanTech financial evidence

Use the configured immutable CleanTech Finance release through the Cofound MCP
adapter. The CleanTech rule library is the only authority for extraction,
calculation, rule application and validation.

## Workflow

1. Confirm the intended Cofound project and explicit clean-energy scope. Return
   `not_applicable` for an unrelated project and `needs_input` when the material
   cannot establish the product, technology or use case.
2. Call `get_cleantech_enhancement_status`. Continue only when
   `financialEvidenceAudit.status` is `ready`; otherwise return the exact
   `unavailable_runtime` reason.
3. Require a user-reviewed local CleanTech manifest whose sources all resolve to
   local evidence files. If it is absent, return `needs_input`; do not treat the
   BP fact snapshot alone as an audited financial statement.
4. Call `run_cleantech_financial_evidence_audit` with the project ID, manifest
   path and the current local display name.
5. Report only the two end-to-end validated dimensions:
   `profitability-unit-economics` and `cash-runway`. Treat all other financial
   dimensions as authored and the adoption-risk framework as retrieval
   scaffolding unless a later validated release says otherwise.
6. Separate source facts, deterministic calculations, rule output and
   human-review gaps. Preserve entity, period, currency, unit, accounting scope,
   citations, rule version and digests.
7. Read the
   [shared enhancement envelope](../enhance-cleantech-project/references/enhancement-result-contract.md).
   Bind the result to the current Cofound project version and source SHA-256,
   include the CleanTech release, manifest/report digests and run time, and keep
   `persistence.state` as `conversation_only` unless a real enhancement-save
   tool confirms otherwise.

## Guardrails

- This is offline deterministic evidence review: zero model calls in the engine
  and no Feishu access.
- Do not issue an aggregate score, investment rating, buy/sell/credit opinion or
  universal threshold across unlike subindustries.
- Do not alter Cofound facts, AI status, management status, source files,
  sharing scope or permissions.
- A failed validation is a result to review, not a reason to improvise a signal.

## Output contract

- applicability and honest terminal status;
- Cofound project binding and manifest SHA-256;
- CleanTech release, validated dimension names and deterministic artifact
  digests;
- source facts, calculations, rule results and review gaps as separate groups;
- `codexInterpretation` limited to implications, gaps and next verification;
- no call to `complete_investment_analysis` and no claim of dashboard
  persistence.
