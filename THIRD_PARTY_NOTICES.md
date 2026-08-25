# Third-party notices

This repository is distributed under the MIT License. Dependencies retain
their own licenses and copyright notices; consult `package.json`,
`pnpm-lock.yaml`, installed package metadata and the upstream projects before
redistributing a bundled binary.

## Architectural references

- [OpenAI plugin architecture](https://developers.openai.com/plugins/concepts/plugins)
  describes the public Skill, MCP server and optional UI composition used by
  Codex plugins. OpenAI code is not vendored by this notice.
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) is an MIT
  licensed developer-preview project. Cofound borrows the architectural idea
  of replaceable plugin capabilities; DeepSeek Harness is not a dependency.
- [Hermes Agent](https://github.com/NousResearch/hermes-agent) is an MIT
  licensed project by Nous Research. Cofound draws inspiration from its
  extensible local-agent workflow; Hermes Agent is not a dependency.

## Optional CleanTech sidecar

Cofound can call a separately installed CleanTech Finance release. That
project remains an independent authority for its matching rules, data model,
catalog validation and Feishu read adapters. No CleanTech policy catalog,
project-opportunity catalog, private locator, credential or source record is
included in this repository. A distributor who bundles CleanTech Finance must
also preserve its LICENSE, NOTICE and third-party notices.

## UI and JavaScript dependencies

The application uses open-source packages listed in `package.json`, including
React, Vite, Express, Radix UI, TanStack Query, PDF.js, PDFium, Tesseract.js,
SQLite-related tooling and their transitive dependencies. Their upstream
license files govern those components.

Several UI primitives were generated or adapted from
[shadcn/ui](https://github.com/shadcn-ui/ui) patterns and use Radix UI
primitives. shadcn/ui is distributed under the MIT License; Radix packages
retain their respective upstream licenses and notices.
