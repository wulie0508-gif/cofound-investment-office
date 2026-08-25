# Contributing

Contributions are welcome. Cofound is a local-first investment system, so data
boundaries are part of correctness rather than optional documentation.

## Workflow

1. Fork the repository and create a focused branch.
2. Use only synthetic projects, people, customers and financial figures.
3. Keep the Stable Local Core, Skills and optional connectors separated.
4. Add or update tests for every behavior change.
5. Run the validation commands below.
6. Open a pull request that explains the user outcome, data boundary and test
   evidence.

```powershell
corepack pnpm@10.34.5 install --frozen-lockfile
corepack pnpm@10.34.5 check
corepack pnpm@10.34.5 test
corepack pnpm@10.34.5 skills:verify
corepack pnpm@10.34.5 build
```

## Non-negotiable contribution rules

- Do not commit real BP files, derived text, screenshots, company names,
  customer identities, emails, access codes, local paths or operation logs.
- Do not commit Feishu Base/Drive locators, record IDs, credentials, `lark-cli`
  authentication state, Vercel bindings or environment secrets.
- Facts and judgments remain separate. Deterministic values need evidence;
  Codex judgments need provenance and stale detection.
- A Skill must state its trigger, input boundary, output contract, failure
  behavior and external-write behavior.
- MCP tools must use the smallest necessary input and must declare whether they
  read external systems, write state or require confirmation.
- CleanTech matching logic and catalogs remain in CleanTech Finance. Cofound may
  change its adapter and contracts, but must not create a competing policy or
  opportunity engine.
- Product diagnosis may propose a patch; only the maintainer-approved iteration
  path may change the official core.

## Pull request checklist

- [ ] No real or sensitive data is present.
- [ ] New external access is documented and fails closed.
- [ ] Tests cover success, non-applicable and failure paths.
- [ ] The plugin manifest and every changed Skill validate.
- [ ] User-facing documentation is updated.
