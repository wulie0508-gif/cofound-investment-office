# Security policy

## Supported version

Security fixes target the latest tagged release on `main`. Older local copies
should be upgraded after backing up their private `data/` directory.

## Reporting a vulnerability

Use GitHub Private Vulnerability Reporting for this repository when available.
Do not place sensitive details in a public Issue. If private reporting is not
available, open a minimal Issue asking the maintainer to establish a private
channel; do not include a BP, access code, token, local path, log, screenshot,
Feishu locator, database URL or exploit details.

Please include privately:

- affected release and operating system;
- the smallest safe reproduction using synthetic data;
- expected and observed security boundary;
- whether any real data or credential may have been exposed.

The maintainer will acknowledge a complete report as soon as practical,
confirm scope, prepare a fix and coordinate disclosure. No fixed response time
or bug bounty is promised.

## Product security boundaries

- The default service listens on `127.0.0.1`; changing the host changes the
  threat model and requires independent authentication and network review.
- `data/`, `.env*`, `.vercel/`, logs, backups and user connector configuration
  are private runtime material and must never be committed.
- Feishu writes, Vercel publication, management-state changes and code
  iteration require explicit user confirmation.
- CleanTech policy and opportunity tools use a user-scoped, read-only gateway.
  Authentication or schema failure must fail closed.
- Browser inline preview removes the product download button but is not DRM.
  A browser that displays a document has received its bytes.
- Never use real investment materials in tests, Issues, pull requests or CI.
