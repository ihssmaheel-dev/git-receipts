# Security policy

## Supported versions

Security fixes target the latest `main` branch and the current hosted application. Older commits and independently hosted copies should update to the latest version.

## Report a vulnerability

Email **[ihssmaheel@gmail.com](mailto:ihssmaheel@gmail.com)** with the subject **Git Receipts security report**. If GitHub's private vulnerability reporting is enabled, you may also use **Security → Report a vulnerability** in the repository.

Please include the affected route or file, steps to reproduce, expected impact, and a minimal example. Redact credentials, real IP addresses, and unrelated personal data. Do not publish exploit details or secrets in a public issue or pull request before a fix is available.

Reports will be reviewed as maintainer availability permits. There is no paid bug bounty or guaranteed response deadline. Coordinate disclosure with the maintainer after a fix is ready.

## Secrets and deployments

- Keep `GH_PAT`, `TURSO_AUTH_TOKEN`, and `RATE_LIMIT_SALT` in server-side environment settings. Never use a `NEXT_PUBLIC_` prefix for secrets.
- Keep `.env.local`, database files, private keys, and deployment metadata out of Git. `.env.example` contains empty values or illustrative settings only.
- If a credential is exposed, revoke or rotate it first. Deleting a file or adding it to `.gitignore` does not remove existing Git history.
- Use synthetic fixtures in tests and screenshots. Do not submit live credentials with a report.

GitHub lookups are constrained to known hosts. The app validates receipt requests, omits unavailable metrics, removes private repository names and links, and applies request limits. Database failures can fall back to per-instance limits; deployers should configure shared storage for limits across serverless instances.

Before a public release, run `npm audit`, the test suite, and a redacted secret scan of the full Git history. The narrowly scoped `.gitleaksignore` entry documents one historical invalid-UUID test fixture; it does not exclude test files from scanning.
