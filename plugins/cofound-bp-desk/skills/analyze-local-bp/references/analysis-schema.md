# Cofound BP Desk analysis schema

## Facts

Each fact has `value`, `raw`, `page`, `quote`, and `confidence`. A null value means the material did not disclose a usable fact. Core keys are:

- `company`, `product`, `industry`, `businessModel`
- `fundingRound`, `fundingAmount`, `preMoneyValuation`, `fundingUse`
- `orderAmount`, `hasLoi`, `revenueAmount`, `payingCustomerCount`
- `customers`, `customerConcentration`, `grossMargin`
- `cashBalance`, `monthlyBurn`, `runwayMonths`, `team`

Do not treat `hasLoi: false` as proof that no LOI exists; it only means none was found.

## Codex investment judgment write-back

The server contract remains `schemaVersion: "1.0"`. The adaptive analysis
profile does not add result keys: it changes how the existing fields are used
so that the user's brief and existing judgment lead the output. Read
[adaptive-analysis.md](adaptive-analysis.md#mapping-to-the-persisted-v10-result)
for the compatible mapping. A specialist Skill is the run's analytical lens,
not a requirement to fill a generic scorecard.

Only these four Skill names are accepted by `prepare_investment_analysis`:

- `review-early-stage-investment`
- `assess-market-first`
- `assess-founder-first`
- `assess-long-term-value`

The prepared run freezes the project ID, local version, source file ID and
SHA-256, deterministic fact snapshot hash, Skill version, prompt version,
requester and creation time. For a website-created task,
`prepare_investment_analysis.task_id` additionally binds the run to the exact
source task and its request context; ordinary Codex analysis omits this optional
field. Call `complete_investment_analysis` with that
`run_id`, the actual `model_name`, and exactly this result shape:

```json
{
  "schemaVersion": "1.0",
  "summary": "Decision-relevant synthesis",
  "positiveSignals": [
    {
      "title": "Signal title",
      "detail": "Why it matters",
      "basis": "evidence",
      "evidence": [
        { "fieldKey": "orderAmount", "page": 6, "quote": "short source quote" }
      ]
    }
  ],
  "keyRisks": [
    {
      "title": "Risk title",
      "detail": "Decision impact",
      "basis": "inference",
      "evidence": []
    }
  ],
  "frameworkSections": [
    {
      "key": "commercial-proof",
      "title": "Commercial proof",
      "assessment": "mixed",
      "detail": "Balanced assessment",
      "evidence": [
        { "fieldKey": "revenueAmount", "page": 7, "quote": "short source quote" }
      ],
      "counterarguments": ["Strongest plausible alternative explanation"],
      "unresolvedQuestions": ["What must be verified next?"]
    }
  ],
  "unresolvedQuestions": ["Decision-critical missing fact"],
  "nextActions": ["Lowest-cost verification action"],
  "aiSuggestion": "信息不足",
  "confidence": "low"
}
```

`basis` is one of `evidence`, `inference`, or `missing_information`.
Evidence-based claims require at least one real evidence reference. Section
`assessment` is one of `supportive`, `mixed`, `concern`, or `unknown`.
Confidence is `low`, `medium`, or `high`. Do not add provenance fields inside
`result`: the server binds the run metadata and immutable fact snapshot to the
saved result.

If a BP version changes or deterministic facts are refreshed, an unfinished
run can become `stale`. A stale run is historical evidence, not a writable
draft. Prepare a new run and rerun the judgment; never copy an old conclusion
onto the new snapshot without reassessing it.

For a website-created structured task, resource recommendations stored in
`nextActions` use only two source-status labels:
`[verified_resource]` for a specific item supported by an authorized tool or
supplied source, and `[search_direction]` for a bounded research direction.
Without a verifiable source, do not write a specific person's name, policy,
order, tender, program, customer lead, or URL.
This is not a required structure for ordinary Codex conversation and does not
add thesis or resource keys to the server schema.

## Analysis lanes

- `commercialChecks`: deterministic consistency checks with `pass`, `attention`, or `unknown`.
- `risks`: explicit source risks, derived risks, or missing-information risks. Preserve the `basis` label.
- `missingInformation`: absent core inputs.
- `recommendations`: BP editing suggestions stored outside the source-backed analysis payload.

## Statuses

Import and analysis events record `新导入`, `已解析`, and `已完成初筛`. The current AI suggestion is one of `信息不足`, `建议继续接触`, `建议约谈`, `建议尽调`, `持续观察`, or `暂缓`. `managementStatus` is the human-operational state. When `statusLocked` is true, a new analysis may change `aiStatus` but must not change `managementStatus`.

## Privacy and sharing fields

`shareMode` is `local_only`, `fields_only`, or `selected_files`. The effective default is `local_only`. `syncState`, `localVersion`, and `remoteVersion` describe the selective shared snapshot; `shareUrl` is the local preview and `remoteShareUrl` is the deployed Vercel Lite link. `annotationEnabled` controls project comments. `downloadEnabled` is always false in Lite mode.
