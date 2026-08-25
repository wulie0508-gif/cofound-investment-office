---
name: match-shanghai-cleantech-policies
description: "Use Cofound's optional Codex-first enhancement to match an evidence-backed clean-energy project against the current Shanghai policy master in Feishu. Use when the user explicitly asks for Shanghai policy candidates, support tools, policy fit, application gaps, or next verification steps; return not_applicable instead of forcing the framework onto unrelated projects."
---

# Match Shanghai CleanTech policies

Use this as an optional project enhancement, not as an investment-rating lens.
Cofound remains the authority for project files, facts, evidence and management
status. CleanTech Finance remains the authority for policy field mapping,
quality gates and deterministic candidate recall. Feishu remains the policy
master maintained by its owner on their own schedule.

## Invocation boundary

- Run only when the user explicitly asks for Shanghai policy matching or
  confirms that this is the desired enhancement. Do not auto-run merely because
  a project is in energy, climate or infrastructure.
- Return `not_applicable` for a non-clean-energy project or a request that
  explicitly targets a non-Shanghai geography.
- Return `needs_input` if Shanghai is not an explicit target or the material has
  no usable industry, technology or market signal. Ask only for the smallest
  missing fact; do not infer registered location or application eligibility.
- This Skill may run after a primary investment Skill or by itself. It never
  counts as the one primary investment framework selected by
  `$analyze-local-bp`.

## Workflow

1. Use `list_bp_projects` and `get_bp_project` to select the intended local
   project and current file version. If the user asks to refresh deterministic
   facts first, use `analyze_bp_project` before policy matching.
2. Preserve the source-file SHA-256 and cite the evidence used to build the
   policy query. Keep facts and Codex inferences visibly separate.
3. Explicitly classify `clean_energy_applicable` as `true` or `false` from the
   cited product, technology and use-case evidence. An absent classification
   must fail closed as `needs_input`; `false` must return `not_applicable`
   without reading Feishu. Then build a minimal query plan using only:
   `industry`, `stage`, `need`, `technology`, `geography`, and `market`.
   Record the exact tag values. Never pass the company name, founder, customer,
   contract, financing, valuation, cash flow, BP quote, internal note,
   management status, file path or sharing permission to the policy helper.
4. Read [references/policy-match-contract.md](references/policy-match-contract.md),
   then call `run_cleantech_policy_match` with the current project ID, operator
   name, explicit applicability flag, exact six-dimension tag plan and optional
   `as_of` date. The MCP tool invokes the fixed CleanTech Finance one-shot
   gateway with the operator's own `lark-cli` user identity and the private Base
   locator configured outside Git. Do not run the CLI directly, start the legacy
   8765 HTTP Bridge, or invoke any Feishu write or policy-maintenance command.
5. Check the returned contract and provenance before reasoning. A valid live
   result must identify the capability, user-scoped read-only provider,
   `read_at`, field-projection hash, catalog hash and candidate-set hash. Never
   turn an authentication, schema or partial-read failure into "no match".
6. Review only policies present in the frozen deterministic candidate set.
   Classify each as `likely_relevant`, `possible`, or
   `needs_more_information`. Explain the matching project facts, missing
   conditions, timing caveats and official source that must be checked.
7. Do not say that the enterprise qualifies, will receive a subsidy, or has a
   policy success probability. Scores and tag overlaps are recall signals, not
   investment or eligibility ratings.
8. If the current Cofound installation does not expose a structured enhancement
   save tool, return the result in the Codex conversation and say clearly that
   it has not been written to the dashboard; do not pretend it was written to
   the dashboard. Never fabricate a successful write-back.
9. Read the
   [shared enhancement envelope](../enhance-cleantech-project/references/enhancement-result-contract.md)
   and bind the result to the project local version, source SHA-256 and available
   fact snapshot hash. Keep the gateway payload unchanged inside
   `authoritativeResult` and Codex reasoning inside `codexInterpretation`.

## Output contract

Return these sections:

1. **Scope and applicability** — project version, source SHA-256 prefix,
   Shanghai target and whether the Skill is applicable.
2. **Query plan** — the clean-energy applicability declaration, six allowed tag
   dimensions and profile snapshot hash.
3. **Policy candidates** — title, official source, content fingerprint, fit
   class, matching evidence, missing conditions and current-window caveat.
4. **Material gaps** — facts needed before any eligibility opinion.
5. **Next verification** — the smallest official or internal checks to perform.
6. **Provenance** — Feishu read time, record count, catalog hash, candidate-set
   hash, Skill name, CleanTech release and the fact/file version used.

When there are no candidates, say `no_high_match` and explain that the current
query did not clear the deterministic threshold; do not claim the policy master
contains no relevant policy.

## Non-negotiable safeguards

- Do not modify deterministic project facts, custom fields, AI status,
  management status or source files.
- Do not publish, share, sync or change permissions for either project data or
  policy results.
- Do not write, delete, batch-import, verify or reorganize the Feishu policy
  Base. Its maintenance process is independent of this Skill.
- Do not expose Base tokens, table identifiers, Feishu credentials or raw Base
  rows.
- Do not silently use an old local workbook when the live read fails.
- Human confirmation and official-source verification are mandatory before any
  real application or investment decision.
