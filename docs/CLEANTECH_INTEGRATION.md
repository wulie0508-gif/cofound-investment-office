# Optional CleanTech Finance integration

## Purpose

CleanTech Finance is an optional professional sidecar for clean-energy,
storage, power, hydrogen, energy-efficiency and related infrastructure
projects. It enhances a Cofound project; it is not a second investment rating
system and does not replace Cofound's project facts or management state.

## Capabilities

| Capability                | Source                                          | Execution boundary                                   |
| ------------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| Financial evidence audit  | Frozen local CleanTech release                  | Offline and deterministic; no Feishu or model call   |
| Shanghai policy match     | CleanTech rules + Feishu policy master          | User-scoped read-only gateway                        |
| Project opportunity match | CleanTech rules + Feishu project-demand catalog | User-scoped read-only gateway; no source API refresh |

European and Brazilian collection APIs are administrator-side catalog
maintenance sources. They are never called by a single-project Cofound query.

## Runtime contract

Cofound binds only to an immutable CleanTech release through environment
configuration. It does not point to a mutable development worktree.

```dotenv
COF_CLEANTECH_RELEASE_ROOT=C:\Tools\CleanTech-Finance-BP-v0.5.0
COF_CLEANTECH_PYTHON=C:\Tools\CleanTech-Finance-BP-v0.5.0\.venv\Scripts\python.exe
COF_POLICY_BASE_CONFIG=C:\Private\cleantech-policy-base.json
COF_PROJECT_BASE_CONFIG=C:\Private\cleantech-project-base.json
COF_CLEANTECH_FEISHU_READY=1
```

The two Base configuration files and all `lark-cli` credentials are private and
must remain outside this repository. `READY=1` is set only after user-scoped
authentication and read-only schema acceptance have succeeded.

## Data minimization

Policy queries allow `industry`, `stage`, `need`, `technology`, `geography` and
`market`. Opportunity queries omit `stage`. Each dimension accepts at most 20
short generic tags. Unknown fields are rejected.

Never send the BP, project object, company or person names, customers,
contracts, financing, valuation, cash flow, quotes, local paths, internal notes,
management state, permissions or credentials.

## Result semantics

- `not_applicable`: no Feishu read was performed.
- `needs_input`: collect only the named missing dimension.
- `succeeded`: interpret only candidates returned by the deterministic gateway.
- authentication or configuration failure: stop and report unavailable; never
  convert it to an empty result.
- `no_high_match` or `no_match`: no candidate cleared current recall rules; it
  is not proof that the catalog contains no relevant record.

The first public release keeps policy and opportunity results in the Codex
conversation. A future dedicated enhancement-history table may persist them;
they must not be written into the generic investment-analysis record.

## Open-source boundary

This repository includes Skills, MCP tools, runtime adapter, public contracts
and synthetic tests. It excludes CleanTech's authoritative algorithms, real
catalogs, Base locators, credentials, read receipts, candidate results and
private evaluation data.
