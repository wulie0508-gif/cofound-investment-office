# Architecture

## Product definition

Cofound Investment Office is an independent, local-first investment workbench
and Codex Plugin. `Cofound Investment Harness` describes the technical
architecture: Codex understands intent, Skills provide reusable methods, MCP
tools execute bounded operations, the local core owns state, and optional
connectors communicate with external systems.

## Components

```text
Codex conversation
  -> Cofound Plugin
     -> open main Skill
     -> optional investment and CleanTech Skills
     -> local MCP server
        -> Stable Local Core
           -> SQLite + immutable local files
           -> Local Workbench UI
           -> Feishu Internal Connector (optional)
           -> Vercel External Share Connector (optional)
           -> CleanTech Finance Sidecar (optional)
```

### Stable Local Core

The local core is authoritative for projects, material versions, deterministic
facts, evidence, analysis history, custom fields, management state, recycle
state and the append-only operation ledger. External connectors do not become
a second project database.

### Codex Plugin

The plugin contains 12 Skills and a loopback MCP server. The main Skill keeps
normal conversation open: it interprets the user's current goal and selects a
specialist Skill only when useful. MCP tools expose narrow read and write
operations. Publication, external writes and code iteration require explicit
confirmation.

### Local Workbench

The browser interface is a control plane for non-technical users: import,
filter, inspect evidence, edit approved fields, select sharing scope and review
history. It does not replace Codex as the primary reasoning surface.

### Feishu Internal Connector

Feishu Drive stores enterprise-internal originals and supplemental materials;
Base stores a thin index or collaboration receipt. The connector runs through
the operator's `lark-cli`, previews a plan, appends only after confirmation and
reads back the target. It never silently overwrites or deletes remote files.

### Vercel External Share Connector

Vercel receives only a selected project snapshot, selected fields and selected
file versions. Each user or organization owns one deployment with many
isolated share records. The local project library is not uploaded wholesale.

### CleanTech Finance Sidecar

The optional sidecar remains authoritative for CleanTech rules, mapping and
catalog governance. Cofound sends a small allowlisted tag profile and receives
a structured result. Policy and opportunity access is user-scoped and
read-only; real catalogs remain in Feishu.

## Facts, judgments and provenance

- Deterministic facts copy disclosed values and evidence locations.
- Ambiguity is triggered by explicit rules such as conflicting values, missing
  unit or currency, or a broken cross-page number.
- Codex judgments may vary and are stored separately.
- A saved judgment binds the source-file Hash, fact snapshot, operator, time,
  model, Skill version and prompt version.
- When a bound fact or file changes, the old judgment remains in history but is
  marked stale.

## Permission matrix

| Operation                              | Default               | Confirmation             |
| -------------------------------------- | --------------------- | ------------------------ |
| Read local project and evidence        | Allowed               | No                       |
| Run local deterministic analysis       | Allowed               | No                       |
| Run optional read-only CleanTech query | Explicit user request | Skill scope confirmation |
| Change management state                | Blocked               | Yes                      |
| Upload to Feishu                       | Plan only             | Yes                      |
| Publish or change external sharing     | Blocked               | Yes                      |
| Modify official product code           | Diagnosis only        | Maintainer approval      |
