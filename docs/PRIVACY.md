# Privacy and data boundaries

## Default local data

BP files, supplemental materials, extracted text, OCR output, SQLite data,
analysis history, project state and logs remain under the user's local runtime
directory. They are ignored by Git and excluded from release packages.

## Data that may leave the device

Only an explicit connector action sends data outside the device:

- **Feishu internal storage:** selected original files and a thin index after a
  displayed plan is confirmed.
- **Vercel external sharing:** selected project fields and selected file
  versions after publication is confirmed.
- **CleanTech policy/opportunity matching:** short generic tags such as
  industry, technology, need, geography and market. It must not send company or
  person names, customer or contract identities, financing, cash flow, BP
  quotes, local file paths, internal notes or credentials.
- **Product feedback:** a privacy-filtered problem summary, never source code,
  BP content, credentials or local paths.

Disabling a connector leaves the local workflow operational.

## Credentials

Environment files, `lark-cli` authentication state, Feishu resource locators,
Vercel project bindings, database URLs and storage tokens stay outside Git.
Example configuration contains placeholders only.

## External file preview

The share application omits a download button and uses inline browser preview.
This reduces accidental downloading but cannot prevent extraction, screenshots
or recording. The product does not claim DRM protection.

## Retention and deletion

Local project deletion uses a recoverable recycle state by default. It does not
delete previously uploaded Feishu originals or already published snapshots.
Remote deletion and retention policies are controlled by the owner of each
external service.

## Testing and support

Only synthetic examples may enter this repository, CI, public Issues or pull
requests. Before sharing support material, remove document bodies, names,
emails, URLs, IDs, tokens, hashes, paths and logs that could identify a real
project or system.
