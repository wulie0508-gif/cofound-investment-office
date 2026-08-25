---
name: enhance-cleantech-project
description: "Route an explicit Cofound clean-energy project enhancement request to exactly one authoritative CleanTech Finance capability: offline financial evidence audit, policy reference matching, or project and tender opportunity matching. Use only when the user asks for a CleanTech enhancement; return not_applicable or needs_input instead of running every capability."
---

# Enhance CleanTech project

Use this optional router after Cofound has identified the intended project. It
does not replace the primary investment Skill, and it never changes project
facts or management decisions.

## Invocation boundary

- Run only when the user explicitly asks for a CleanTech enhancement. Do not auto-run because an industry label contains energy, climate or infrastructure.
- Establish `clean_energy_applicable` from cited product, technology and use-case
  evidence. Return `not_applicable` when it is false and `needs_input` when the
  evidence is insufficient.
- Bind routing to the current project ID, local version and source SHA-256. If a
  frozen Cofound fact snapshot is already available in the conversation, use
  that snapshot and retain its hash; otherwise do not invent one.
- Call `get_cleantech_enhancement_status` before selecting a capability. Treat
  `unavailable_auth_required` and `unavailable_runtime` as honest terminal
  states for this attempt; never turn them into “no match”.

## Route exactly one capability by default

| User intent | Child Skill |
| --- | --- |
| Profitability, unit economics, cash, runway or financial evidence quality | `$review-cleantech-financial-evidence` |
| Shanghai policy support, subsidies, support tools or application gaps | `$match-shanghai-cleantech-policies` |
| European or Brazilian procurement, projects, tenders or order leads | `$match-cleantech-project-opportunities` |

Policy matching and opportunity matching are independent optional Skills. If
the user explicitly asks for both, run them sequentially with separate request
snapshots and provenance; otherwise run only the one requested capability. Do
not silently run all three. Database maintenance, TED collection and PNCP
collection are separate administrator workflows and are never executed by this
project router.

## Authority and output

- Cofound remains authoritative for BP files, project facts, evidence and
  management state.
- CleanTech Finance remains authoritative for financial rules, catalog field
  mapping, quality gates and candidate recall. Do not copy or recreate those
  algorithms inside Cofound.
- Feishu remains the operational policy and project catalog. This Skill never
  writes, reorganizes or refreshes it.
- Codex explains frozen rule output and identifies material gaps; a human makes
  the decision.
- Do not publish, share, sync or modify project status. Do not combine any
  CleanTech result into an investment score.
- Read the
  [enhancement result contract](references/enhancement-result-contract.md) and
  return one bound envelope per executed capability. This envelope is not valid
  input to `complete_investment_analysis` and remains conversation-only until a
  dedicated save tool confirms otherwise.
