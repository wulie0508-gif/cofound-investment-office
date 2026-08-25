---
name: iterate-cofound-product
description: "Execute a Cofound Investment Office product-code iteration that was submitted through the local web workbench, return a bounded and tested result for human review, and finalize only after the website records approval. Use for queued website maintenance tasks, not for BP analysis, BP originals, Feishu writes, Vercel publication, or unsupervised main-branch changes."
---

# Iterate Cofound product

Use the `cofoundBpDesk` MCP tools to process one product iteration created in
the local web workbench. This Skill is a bridge from a reviewed web task to the
user's local Codex; it is not a general request to modify the product whenever
an idea appears in chat.

## Select and claim one task

1. Call `cofound_health`, then `list_product_iterations`.
2. Select the exact iteration ID named by the user. If none was named, claim
   only when exactly one eligible queued task clearly matches the request;
   otherwise ask the user to choose. Never claim a batch speculatively.
3. Read the task scope, acceptance criteria, requested depth, repository/base
   binding, and exclusions before editing. Do not invent missing requirements.
4. Call `claim_product_iteration` once with the current local display name and
   the actual model identifier exposed by Codex. If either is unavailable, use
   a transparent non-personal value such as `Codex` or `unknown`; do not
   impersonate a teammate or guess a model name.
5. Keep the returned `claim_token` only as private MCP task state for this
   iteration. Pass it to later progress, lease-renewal, attention, and completion
   calls. Completion consumes the claim, so do not reuse it for finalization.
   Never copy it into a progress message, website `result`, preview URL, or
   user-facing response. If the token is missing, expired, or rejected, stop
   instead of retrying a mutation without a valid claim.
6. A successful claim is only a coordination lock. It does not authorize an
   external side effect or expand the task scope.

This Skill is an operating boundary, not a hard security sandbox. The same
Codex environment may expose Feishu, Vercel, BP, network, or shell tools for
other user-authorized work. Tool availability is not permission: do not call
those capabilities during a product-iteration task unless the user ends this
workflow and separately authorizes a different task.

## Preserve the repository

Before editing, record the repository root, current branch, base commit, and
`git status --short`.

- Never reset, clean, stash, discard, overwrite, or silently absorb existing
  user changes.
- For every `quick`, `standard`, and `deep` task, work only in an isolated Git
  worktree on the fixed branch `codex/iteration-<safe-id>`. Form `<safe-id>`
  from the complete task ID: lowercase it, replace every run outside ASCII
  letters, digits, and hyphens with one hyphen, and trim edge hyphens. Do not
  truncate or drop the unique suffix. Validate the full branch with
  `git check-ref-format --branch` before use.
- Create the isolated checkout with `git worktree add` from the task's recorded
  base commit. If no base is recorded, bind the current primary checkout `HEAD`
  internally before creating the worktree. Do not report that technical value
  in progress, website results, or chat. Never include uncommitted main checkout
  changes implicitly.
- If the fixed branch already exists, reuse it only after verifying that it is
  for the same task and expected base. Never delete, reset, or recreate an
  existing branch to make the task appear clean.
- If relevant uncommitted work cannot be reproduced safely in an isolated
  worktree, stop rather than guessing. Mark the task as needing attention with
  a plain-language explanation that does not expose file contents.
- Keep the worktree, branch, and produced diff available until website review.
  Before website approval, do not merge into the primary branch.

## Match effort to the requested depth

Use the lowest sufficient amount of work. A larger depth is permission to
check more thoroughly, not an instruction to manufacture content or spend
tokens without a product reason.

- `quick`: one narrow correction, focused inspection, and the smallest relevant
  check.
- `standard`: the default bounded multi-file change with targeted tests, type
  checks, and a diff review.
- `deep`: cross-layer or high-risk work that justifies broader regression,
  security, migration, or browser verification.

Do not silently promote the task to a broader product redesign. If the stated
acceptance criteria require work outside the submitted boundary, return the
gap for review.

## Execute and report progress

1. Call `update_product_iteration_progress` with the private `claim_token`,
   `working`, and one concise explanation of the current bounded step.
2. Inspect only the code and non-sensitive fixtures needed for the task. Do not
   open, transform, upload, or rewrite BP originals or local runtime data.
3. Implement the smallest coherent change. Preserve repository conventions and
   unrelated edits.
4. Call `update_product_iteration_progress` with the private `claim_token` and
   `checking` before verification.
5. Run checks proportional to the depth and risk. Review the final diff for
   accidental files, secrets, generated noise, and scope drift. For work that
   approaches the returned lease expiry, call `renew_product_iteration_claim`
   with the private `claim_token`; do not create a visible progress message only
   to keep the lease alive.
6. Only after the required checks pass, stage the explicit task files and
   create one normal commit on `codex/iteration-<safe-id>`. Record the full
   commit ID from `git rev-parse HEAD`. Do not commit unrelated or unverified
   changes. If required checks fail, leave the task unfinalized and report the
   failure instead of manufacturing a successful commit. If the task cannot
   continue safely, call `mark_product_iteration_needs_attention` with the
   private `claim_token` and a plain-language explanation.
7. Keep progress messages user-facing. Do not post raw logs, hidden prompts,
   credentials, claim tokens, branch or commit identifiers, file paths, raw
   commands, full source files, or large diffs to the web task.

Before recorded website approval, the following actions are outside the task:

- merging or force-updating the primary branch;
- deploying or publishing to Vercel;
- creating, editing, uploading, deleting, or synchronizing Feishu content;
- sharing a project or BP externally;
- modifying or processing BP originals and private runtime data.

## Return the result for review

Call `complete_product_iteration` after work and checks finish. Send exactly the
strict website result contract below. Empty arrays are valid when a section has
nothing truthful to report; do not add fields merely to fill space.

Immediately before completion, read the current task worktree `HEAD` and pass
its full value privately as `candidate_ref`, together with the private
`claim_token`. These are integrity inputs for the service and are not part of
the visible `result` object.

```json
{
  "summary": "What changed, or why the task needs attention",
  "changes": ["Made the task status easier to understand"],
  "checks": [
    {
      "label": "Targeted check",
      "status": "passed | warning | failed",
      "summary": "Observed result"
    }
  ],
  "risks": ["Remaining review concern"],
  "previewUrl": "/optional-local-preview"
}
```

Omit `previewUrl` unless a real route inside the running local Cofound website
exists. It must start with exactly one `/`, such as `/iterations`, and must not
be an HTTP(S) URL, a `//host` scheme-relative URL, a file URL, a filesystem
location, or a technical artifact. A failed check or blocked repository
conflict must remain visible as `failed` or `warning`; never turn it into a
passing result to move the state forward.

Every field in `result` is directly visible to a non-technical user. Never put
a branch name, commit ID, SHA, worktree location, file path, raw command, or
technical locator in `summary`, `changes`, `checks`, or `risks`. Describe the
product behavior changed, the plain-language check outcome, and the remaining
user-facing risk instead. Keep branch, commit, and worktree provenance only in
the local Git state and private MCP integrity fields used by Codex. The same
rule applies to progress messages and the final chat response: say that a check
passed or needs attention, not which command or technical locator produced it.

Completion returns the task to the website and waits for the user's `accept`
or rejection there. Do not call completion an approval, release, merge, or
deployment.

## Finalize only a website-approved result

1. On a later request to finalize, call `list_product_iterations` again.
2. Continue only when the same iteration and submitted result are still
   present and the website reports it as `approved`. A chat message alone
   is not a substitute. The recorded website approval is the only authority to
   merge this reviewed task branch; it does not authorize deployment, Feishu,
   or any other external action.
3. Re-derive the fixed `codex/iteration-<safe-id>` branch from the iteration ID;
   do not read a branch or commit from the user-visible result. Verify that the
   branch exists, its isolated worktree has no uncommitted changes, the primary
   checkout is on the intended primary branch, and `git status --porcelain` is
   empty there. If either checkout is dirty, the branch is missing, or any
   binding is ambiguous, stop and do not finalize. Read the full current task
   branch commit as the private `candidate_ref`.
4. Call `preflight_approved_product_iteration` with that exact `candidate_ref`.
   Continue only when the service confirms it is the candidate frozen when the
   website approved this iteration. If preflight fails, do not merge or
   finalize.
5. Check fast-forward feasibility without changing files by running
   `git merge-base --is-ancestor HEAD <candidate-ref>` from the primary
   checkout. If it fails, the histories diverged; stop and do not merge or
   finalize.
6. Execute the approved local application with the exact immutable candidate:
   `git merge --ff-only <candidate-ref>`. Do not merge the movable task branch
   name. Never force, rebase, squash, reset, or resolve conflicts automatically.
7. Rerun the required checks and build from the primary checkout. If any
   required check fails, stop and do not call finalize; leave the repository
   visible for manual recovery rather than resetting history.
8. Read the full current commit with `git rev-parse HEAD`, confirm it still
   equals the preflighted `candidate_ref`, then call
   `finalize_approved_product_iteration` with that value as `applied_ref`.
   `candidate_ref`, `applied_ref`, and `claim_token` are internal tool inputs
   only: never copy them into progress, `result`, a preview URL, or the
   user-facing response. The service checks the approved candidate binding and
   current applied ref; it does not perform the Git merge or checks for Codex.
9. Report the actual finalized state. Never claim that code was applied,
   merged, released, or deployed unless the returned record proves that exact
   action.
