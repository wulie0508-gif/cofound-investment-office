# Shanghai policy match contract

## Role split

```text
Cofound local project facts and evidence
  -> Codex builds a six-dimension, non-sensitive query plan
  -> CleanTech Finance one-shot helper
  -> lark-cli user-scoped read of Feishu "政策主库"
  -> deterministic field mapping, quarantine, hashing and candidate recall
  -> Codex semantic review of the frozen candidates
  -> human confirmation
```

The helper is a read adapter, not a policy eligibility engine. Feishu is the
current operational catalog; there is no promised weekly synchronization and no
second policy database inside Cofound.

## Request

The temporary request JSON may have a top-level `profile_tags` object or the six
dimensions directly:

```json
{
  "clean_energy_applicable": true,
  "profile_tags": {
    "industry": ["储能", "电力与电网"],
    "stage": ["早期商业化"],
    "need": ["研发支持", "示范应用"],
    "technology": ["工商业储能", "需求响应"],
    "geography": ["上海"],
    "market": ["工业园区", "虚拟电厂"]
  }
}
```

`clean_energy_applicable` is mandatory and means only that this optional Skill
is in scope. Set it to `true` from cited product, technology and use-case
evidence; set it to `false` for an unrelated project. If it is absent, the
gateway returns `needs_input` without reading Feishu. It is not an investment or
policy-eligibility conclusion.

Allowed dimensions are exactly:

- `industry`
- `stage`
- `need`
- `technology`
- `geography`
- `market`

Values must be short strings, at most 20 per dimension. The gateway rejects
unknown keys so that a whole project object cannot be sent by mistake.

Never include company or person names, customer or contract identities,
financing, valuation, revenue, cash flow, document quotes, file paths, internal
notes, management judgments, permissions or credentials.

Run from an installed or immutable CleanTech Finance release:

```powershell
python -m cleantech_finance.cli policy match-feishu <profile.json-or-> `
  --base-config "$env:COF_POLICY_BASE_CONFIG" `
  --attested-by "<current operator name>" `
  --as-of YYYY-MM-DD
```

`-` reads JSON from standard input. The Base config remains outside Git and must
target `政策主库` with `identity=user`. The command never returns the Base token.

## Response

The top-level contract version is `cleantech-shanghai-policy/v1`.

```json
{
  "contract_version": "cleantech-shanghai-policy/v1",
  "capability": "shanghai_policy_match",
  "status": "succeeded",
  "applicability": "applicable",
  "result_state": "candidates_found",
  "authority": "reference_suggestion_only",
  "request": {
    "clean_energy_applicable": true,
    "profile_tags": {},
    "profile_snapshot_sha256": "...",
    "as_of": "YYYY-MM-DD"
  },
  "source": {
    "provider": "feishu_base_read_only",
    "table_name": "政策主库",
    "identity": "user",
    "field_projection_version": "policy-main-v1",
    "field_projection_sha256": "..."
  },
  "provenance": {
    "read_at": "...",
    "record_count": 0,
    "field_count": 0,
    "catalog_sha256": "...",
    "candidate_set_sha256": "...",
    "candidate_content_fingerprints": []
  },
  "candidate_count": 0,
  "result": {},
  "boundaries": {
    "feishu_write_performed": false,
    "source_records_embedded": false,
    "eligibility_determination": false,
    "official_verification_required": true,
    "codex_semantic_review_required": true
  }
}
```

`result.suggestions` is the frozen deterministic candidate set. Do not cite a
policy that is absent from that array.

## Status handling

| Status | Meaning and required behavior |
| --- | --- |
| `succeeded` | Live read and deterministic recall completed. Continue with Codex semantic review. |
| `not_applicable` | Do not force this optional enhancement onto the project. |
| `needs_input` | Obtain only the named missing field before querying. |
| `no_high_match` | Represented by `status=succeeded` and `result_state=no_high_match`; it is not proof that no policy exists. |
| authentication error | Ask the operator to complete their own `lark-cli` user authorization; do not switch to a bot. |
| schema/read error | Stop and report the mismatch or incomplete read; do not use a stale workbook silently. |

## Evidence and provenance

The final Codex explanation must bind together:

- Cofound project ID and local file version;
- source-file SHA-256 prefix;
- the exact six-dimension query plan;
- the explicit clean-energy applicability declaration and its evidence basis;
- `profile_snapshot_sha256`;
- Feishu `read_at` and read receipt;
- catalog and candidate-set hashes;
- policy content fingerprint and official source;
- the local page/segment evidence used for each interpretation;
- Skill name and the Codex model when available.

Until Cofound exposes a dedicated enhancement-run write tool, these values are
conversation provenance only. Do not represent them as a persisted dashboard
record.
