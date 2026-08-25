# CleanTech enhancement result contract

Use this conversation envelope for every optional CleanTech enhancement. It
binds an authoritative sidecar result to the Cofound project without pretending
that the result is a deterministic Cofound fact or a saved investment judgment.

```json
{
  "contractVersion": "cofound-cleantech-enhancement/v1",
  "skillName": "match-shanghai-cleantech-policies",
  "status": "succeeded",
  "applicability": "applicable",
  "projectBinding": {
    "projectId": "p_...",
    "localVersion": 3,
    "sourceFileSha256": "...",
    "factSnapshotHash": "... or null"
  },
  "requestSnapshotHash": "...",
  "authoritativeResult": {},
  "codexInterpretation": {
    "summary": "Why the frozen candidates may matter",
    "materialGaps": [],
    "nextVerification": []
  },
  "provenance": {
    "requestedBy": "local display name",
    "runAt": "ISO-8601 timestamp",
    "cleanTechRelease": "release version or null",
    "toolContractVersion": "sidecar contract version",
    "catalogReadAt": "read receipt time or null",
    "catalogSha256": "catalog digest or null",
    "candidateSetSha256": "candidate-set digest or null"
  },
  "persistence": {
    "state": "conversation_only",
    "savedRunId": null
  }
}
```

## Statuses

- `succeeded`: the authoritative capability returned a complete, validated
  payload.
- `not_applicable`: cited evidence shows the project is outside clean energy or
  the requested geography/capability.
- `needs_input`: only the named minimum project facts are missing.
- `unavailable_auth_required`: the operator's user-scoped Feishu authorization
  is unavailable.
- `unavailable_runtime`: the immutable CleanTech release or structured matcher
  is unavailable.
- `failed`: the capability started but returned an explicit validation, schema,
  or execution error.

Keep the authoritative sidecar payload unchanged inside
`authoritativeResult`; place Codex's semantic explanation only in
`codexInterpretation`. Do not convert similarity, tag overlap, or a deterministic
financial flag into an investment score.

## Fact binding and staleness

Prefer the frozen `factSnapshotHash` from a prepared or completed Cofound
investment run in the same conversation. If no such run exists, bind the
enhancement to the current local version and source SHA-256 and set
`factSnapshotHash` to null; do not invent a hash.

Before reusing a prior enhancement, compare its project binding with the current
project. A different local version, source SHA-256, or available fact snapshot
hash makes the prior enhancement `stale`. Rerun it against the current facts and
retain the earlier result only as history.

## Persistence boundary

`complete_investment_analysis` accepts only the four Cofound investment
judgment Skills. Never send this envelope to that tool. Until a dedicated
enhancement-save tool confirms a write, use `conversation_only` and do not claim
that the dashboard contains the result.
