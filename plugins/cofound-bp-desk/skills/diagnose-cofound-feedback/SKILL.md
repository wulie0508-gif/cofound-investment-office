---
name: diagnose-cofound-feedback
description: "Diagnose a Cofound Investment Office product issue submitted by a teammate, return a privacy-safe structured finding to the local feedback inbox, and synchronize that bounded report to the maintainer through the configured Feishu Base. Use for product usability, behavior, data-flow, or reliability feedback; not for BP analysis, investment judgment, external sharing, formal releases, or unsupervised code changes."
---

# Diagnose Cofound product feedback

Use the `cofoundBpDesk` MCP tools to turn one teammate's product problem into a
clear, reproducible, non-technical maintenance report. The teammate's Codex
does the first-line diagnosis; the maintainer decides whether and when the
official product changes.

## Keep the two workflows separate

- This Skill handles a **feedback report**. It can diagnose and safely relay a
  proposed solution, but it does not create an official release.
- `$iterate-cofound-product` handles a **maintainer-approved implementation
  task** in an isolated Git worktree. Do not use that Skill on the teammate's
  machine unless the maintainer has explicitly accepted the report and the
  current installation is the maintainer workspace.
- Do not treat investment conclusions, BP facts, source documents, project
  annotations, external share links, or CleanTech matching results as product
  feedback.

## Start or select one report

1. Call `cofound_health`, then `list_product_feedback`.
2. When the user names an existing feedback ID, select only that item. When no
   ID is named, continue only if exactly one open item clearly matches the
   user's request; otherwise ask which report to diagnose.
3. When the user is reporting a new issue in natural language and has clearly
   asked to submit it, first check the open list for an obvious duplicate. If
   none exists, call `submit_product_feedback` with:
   - the observed problem in `description`;
   - the desired product behavior in `expected_outcome`, when known;
   - the closest supported `category` and `impact` without exaggeration.
4. A submitted report is permission to store and relay the bounded report. It
   is not permission to inspect unrelated private data, modify an official
   installation, publish externally, or contact another person.

## Claim and reproduce safely

1. Call `claim_product_feedback` once with the current local display name and
   the actual Codex model identifier when available. Use transparent generic
   values such as `Codex` or `unknown` rather than guessing or impersonating a
   person.
2. Keep the returned `claim_token` and lease expiry private. Pass the token only
   to later MCP calls for this feedback item. Never copy it into progress,
   diagnosis content, Feishu, preview URLs, or chat.
3. Call `update_product_feedback_progress` with a short user-facing message.
4. Reproduce the smallest relevant behavior in the local product. Inspect only
   the product code, configuration, and synthetic fixtures needed to understand
   the report. Do not open BP originals or private runtime records merely to
   investigate a product complaint.
5. Separate what was observed from what is inferred. If the report cannot be
   reproduced, say so and list the minimal missing condition instead of
   inventing a cause.

## Protect internal information

Everything written through the feedback MCP tools can appear in the team's
maintenance ledger. Follow the safe handoff rules in
[references/feishu-handoff.md](references/feishu-handoff.md).

Never put any of the following in a progress message or final diagnosis:

- local paths, filenames, source locations, Git branches, commits, hashes,
  shell commands, stack traces, logs, or localhost URLs;
- tokens, cookies, account identifiers, environment variables, raw prompts, or
  private Codex conversations;
- BP originals, project financial figures, customer names, contract details,
  evidence quotations, or other confidential project content;
- an attachment or external link that the user did not explicitly approve.

Describe the affected product area and observed behavior in plain language,
for example "the project detail page loses its top navigation" rather than a
source file or selector.

## Diagnose before proposing a change

Build the result in this order:

1. **Summary** — what the product currently does, when it happens, and the
   likely user impact.
2. **Proposed actions** — the smallest product-level correction, with no claim
   that it has been accepted or released.
3. **Checks** — reproducible, non-sensitive observations and any bounded test
   performed.
4. **Risks** — compatibility, data, permission, or workflow risks the
   maintainer should consider.
5. **Open questions** — only decisions genuinely required from the maintainer.

Call `update_product_feedback_progress` with `checking` before the final check.
For a long diagnosis, call `renew_product_feedback_claim` without generating a
visible keep-alive message.

If diagnosis cannot continue safely, call
`mark_product_feedback_needs_attention` with a plain-language reason. Do not
work around a rejected or expired claim token.

## Local trial fixes are optional

Diagnosis does not require editing code. A teammate's Codex may attempt a
bounded change in that teammate's own local copy only when the user explicitly
asks for a trial fix and the copy is safe to edit.

- Never merge, push, deploy, publish, change Feishu structure, or overwrite an
  official release in this workflow.
- Preserve existing user changes and do not reset, clean, discard, or hide
  them.
- Report only whether the trial was not attempted, helped, failed, or needs
  review. Do not send a patch, source code, technical locator, or command to
  Feishu.
- A successful local trial is still only evidence for the maintainer. It does
  not make the team release current.

## Complete and relay the report

Call `complete_product_feedback_diagnosis` with the private claim token, actual
model name, `trial_fix_status`, and exactly this visible diagnosis shape:

```json
{
  "summary": "What was observed and the likely product-level cause",
  "proposedActions": ["A bounded adjustment for the maintainer to review"],
  "checks": [
    {
      "label": "Bounded reproduction",
      "status": "passed",
      "summary": "The behavior was reproduced using non-sensitive sample data"
    }
  ],
  "risks": ["A remaining workflow or compatibility concern"],
  "openQuestions": ["A decision that still needs the maintainer"]
}
```

Use empty arrays when a section has nothing truthful to report. Completion
queues a new safe snapshot for synchronization; it does not silently rewrite a
previous diagnosis and does not approve implementation.

Completion automatically makes one best-effort synchronization attempt for the
same feedback item. Call `sync_product_feedback` only when that attempt remains
pending or failed, or when the user explicitly asks to retry. If the Feishu
feedback table has not been configured, report that the diagnosis is saved
locally and awaiting connection. Do not create a Base, table, field, or record
as a workaround. If synchronization returns a conflict or verification
failure, keep the local report and say that the maintainer connection needs
attention; never guess a remote destination.

Finish with only the report status, whether the safe summary reached the
maintenance ledger, and any decision the user still needs to make.
