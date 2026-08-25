# CleanTech project opportunity match contract

## Role split

```text
Cofound evidence-bound project profile
  -> CleanTech Finance one-shot gateway
  -> user-scoped, read-only lark-cli query of 飞书项目需求库
  -> deterministic field projection and explainable candidate recall
  -> conservative deadline and status grouping
  -> Codex interpretation and human verification
```

European TED and Brazilian PNCP collection are catalog-maintenance workflows.
The project matcher reads the current Feishu catalog and never calls those APIs
or writes records.

## Request

```json
{
  "clean_energy_applicable": true,
  "profile_tags": {
    "industry": ["储能", "电力与电网"],
    "need": ["示范项目", "采购"],
    "technology": ["工商业储能", "需求响应"],
    "geography": ["欧洲", "巴西"],
    "market": ["工业园区", "虚拟电厂"]
  }
}
```

Allowed dimensions are exactly `industry`, `need`, `technology`, `geography`,
and `market`. The gateway removes `stage` and rejects other keys. Pass short
generic tags only; never pass company or person names, customers, contracts,
financing, valuation, cash flow, source quotes, file paths, internal notes,
management state, permissions, or credentials.

Run from the installed or immutable CleanTech Finance release:

```powershell
python -m cleantech_finance.cli project match-feishu <profile.json-or-> `
  --base-config "$env:COF_PROJECT_BASE_CONFIG" `
  --as-of YYYY-MM-DD
```

The Base config remains outside Git and must use `identity=user`. `-` reads JSON
from standard input. Do not expose the Base token in the response.

## Response

The authoritative top-level contract is
`cleantech-project-opportunity/v1`. A successful result includes:

- `request.profile_snapshot_sha256` and the `as_of` date;
- `source.provider=feishu_base_read_only`, table name, identity, field
  projection version and hash;
- `provenance.read_at`, record and field counts, catalog SHA-256,
  candidate-set SHA-256, and candidate fingerprints;
- `candidates_by_state`, `state_counts`, and the unmodified deterministic
  `result`;
- boundaries confirming no Feishu write, no source API call, no eligibility
  determination, and no deterministic ranking.

Do not cite a candidate absent from the returned set.

## Status handling

| Status or state | Required behavior |
| --- | --- |
| `not_applicable` | Stop without reading Feishu. |
| `needs_input` | Obtain only the named profile field. |
| `succeeded` + candidates | Explain relevance and gaps without adding or reranking records. |
| `succeeded` + `no_match` | Say no candidate cleared the deterministic recall rules; do not say the catalog contains no opportunity. |
| authentication failure | Return `unavailable_auth_required`; do not switch to a bot or browser login. |
| schema/read/runtime failure | Return `unavailable_runtime` or `failed` with the exact reason; do not use a stale workbook. |

The temporal groups mean:

- `active_candidate`: stored status is active and a parseable deadline is after
  `as_of`;
- `needs_live_verification`: status or deadline is missing, ambiguous, same-day,
  or otherwise needs an official check;
- `closed_or_stale`: closed, cancelled, awarded, expired, or a stored active
  record whose deadline is no longer future.

An `awarded_order` claim requires formal award or contract evidence. A matched
lead, procurement demand, or tender is never itself an order.
