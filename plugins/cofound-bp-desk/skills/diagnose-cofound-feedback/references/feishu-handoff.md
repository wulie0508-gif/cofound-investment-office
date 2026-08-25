# Safe Feishu handoff

The Feishu row is a product-maintenance summary, not a debug dump and not a
channel for transferring project data.

## Allowed content

- collaboration key and local feedback identifier;
- report round, automatic title, observed behavior, and desired outcome;
- product category and user impact;
- display name and local submission time;
- Codex diagnosis summary, proposed product adjustment, bounded validation,
  risks, open questions, and local-trial status;
- maintainer triage state, maintainer response, linked maintenance-task ID,
  application version, capability-pack version, and last-updated time.

## Forbidden content

- filesystem paths, filenames, source locations, Git refs, hashes, commands,
  stack traces, logs, or local preview URLs;
- access tokens, cookies, environment values, account IDs, or authentication
  details;
- raw prompts, full conversations, generated source code, or patches;
- BP originals, project financial or customer data, contracts, evidence
  excerpts, or other project-private content;
- attachments or external URLs that the user did not explicitly approve.

## Status semantics

Keep business status separate from transport status.

- Business status: `new`, `needs_info`, `accepted`, `duplicate`, `deferred`, or
  `completed`.
- Transport status (stored): `pending`, `synced`, or `failed`. A conflict or
  verification mismatch is a failure reason, not a separate business state.

A failed sync does not erase or downgrade the local report. A successful sync
does not mean the maintainer accepted the recommendation.

## Conflict handling

The collaboration key identifies the same logical feedback record across
machines. Search before create, verify the full expected field projection after
write, and fail closed if two remote rows claim the same collaboration key.
Never pick one record by position or timestamp when the identity is ambiguous.
