# Adaptive investment analysis

Use this reference when the user asks Codex to analyze a project, challenge an
existing view, identify BP problems, or suggest resources. The goal is to
answer the user's brief rather than mechanically complete every framework.

## Follow the user's brief naturally

Understand the request from the conversation as Codex normally would. Do not
pre-classify it into an intent enum, require the user to choose a workflow, or
turn the request into a form. Preserve the user's current thesis or concern
when one is present, without strengthening it in the retelling. If the brief is
unclear, infer only what the conversation supports and state any material
assumption. Ask a question only when different answers would materially change
the work. Do not turn a simple fact lookup into a full investment review.

## Use only the capabilities that help

The workspace can retrieve facts, inspect evidence, find BP problems, test and
strengthen a thesis, perform an investment judgment, optimize a BP, and suggest
resources. These are capabilities, not intent classes or a required sequence.
Use whichever are useful to the user's current work.

Do not run every specialist Skill. A user-selected lens is authoritative for
that run. In an ordinary Codex conversation, no lens is required. For a
website-created task in `auto` mode, choose one supported persisted lens using
professional judgment; this is only the website write-back envelope.

## Conversation and dashboard are different layers

The Codex conversation is the primary analysis surface. It may follow the
user's question, test several hypotheses, accept corrections, and continue over
multiple turns. The dashboard is a management memory: write back only the
stable evidence-bound synthesis that should remain comparable across projects
and versions. Never let the v1.0 result shape truncate a useful conversation or
force irrelevant framework sections.

## Thought-enhancement moves

When the user provides a thesis or concern, these moves often help:

1. **User judgment restatement** — a neutral, compact version of the user's
   current view and the decision it is trying to support.
2. **What holds** — source-backed facts and sound reasoning that support it.
3. **Counter-case** — the strongest plausible disconfirming evidence,
   alternative explanation, or missing premise. Label inference and missing
   information explicitly.
4. **Enhanced judgment** — a conditional conclusion that states what is known,
   what would change the conclusion, and the lowest-cost next verification.

They need not appear as fixed headings or in this order. Do not manufacture
disagreement for balance. If the evidence strongly supports
the user's view, say so and focus the counter-case on remaining uncertainty.

## Resource recommendation rules

Reason internally about every suggested resource as one of:

- `verified_resource`: a specific policy, program, expert, customer lead,
  tender, dataset, article, or internal resource returned by an authorized tool
  or present in supplied materials. State why it is relevant and include the
  available source locator or evidence reference.
- `search_direction`: a bounded category, query, qualification criterion, or
  next place to search when no verified item is available.

Communicate that source status clearly, but do not force these names into fixed
conversation headings. Never turn a plausible search direction into a named resource. Without a
verifiable source, do not invent a person's name, policy title, grant, customer,
order, tender, program, or URL. Availability is not permission: do not contact
people, submit applications, write to Feishu, publish, share, or otherwise act
externally unless the user separately authorizes that exact action.

## Mapping to the persisted v1.0 result

The current server contract remains `schemaVersion: "1.0"`. Preserve its exact
keys and map an adaptive analysis as follows:

- `summary`: answer the user's brief first; include the enhanced judgment in a
  concise form.
- `positiveSignals`: evidence-backed parts of `what holds`.
- `keyRisks`: the counter-case, with `basis` set correctly.
- `frameworkSections`: use only the sections needed by the brief. Flexible
  section keys may reflect the user's specific question; do not add empty
  sections or introduce a new thesis schema to simulate completeness.
- `unresolvedQuestions`: missing premises that could change the judgment.
- `nextActions`: lowest-cost verification steps. When a structured task includes
  a resource suggestion, a verified resource may be
  written as `[verified_resource] ...`; an unverified direction must be written
  as `[search_direction] ...` and must not contain a fabricated named entity.
- `aiSuggestion` and `confidence`: summarize the decision state without
  modifying the human management status.

This mapping applies only when the website explicitly created a structured
analysis task. It is not an output schema for ordinary Codex conversation.
For a website-created task, the selected specialist Skill remains the persisted
run identity required by the existing task and provenance protocol. Treat that
Skill as the analytical lens used for the adaptive brief, not as a requirement
to output a generic scorecard.
