# Contributing to Git Receipts

Thanks for helping make Git Receipts better. Small fixes, accessible interactions, clearer documentation, and new ways to display GitHub activity are welcome.

## Start here

For a bug, [open an issue](https://github.com/ihssmaheel-dev/git-receipts/issues) with the steps to reproduce, expected result, browser, and a screenshot if useful. Check existing issues first. Discuss larger features before spending time on an implementation.

Report vulnerabilities privately using [SECURITY.md](SECURITY.md). Follow the [code of conduct](CODE_OF_CONDUCT.md) in issues, pull requests, and other project discussions.

## Local setup

1. Fork the repository and create a branch for your change.
2. Install Node.js 22 or newer.
3. Run `npm ci`, then `npm run dev`.
4. Open `http://localhost:3000`.

You can work on the sample printer and public calendars without credentials. If needed, copy `.env.example` to `.env.local`; never commit that file, real tokens, database files, or user data.

Read [AGENTS.md](AGENTS.md) before working with coding agents. This project's installed Next.js documentation is in `node_modules/next/dist/docs/`; check it for the APIs you change.

## Project map

| Location | Purpose |
| --- | --- |
| `app/` | Pages, metadata, styles, and export routes |
| `components/` | Printer, receipt viewer, form, and activity calendar |
| `hooks/usePrinter.ts` | Animation, motion preferences, and optional sound |
| `lib/github*` and `lib/stats.ts` | GitHub lookups, normalization, and exact statistics |
| `lib/receipt*`, `lib/og.tsx`, and `lib/qr.ts` | Receipt text, shared layout, exports, and codes |
| `lib/prints.ts`, `lib/rateLimit.ts`, and `lib/db/` | Completed-print count and abuse limits |
| `tests/` | Behavior, data integrity, and export checks |

## Keep these promises

- Derive statistics from observed data. Never invent totals, fill missing days with zero, or substitute demo activity for a real profile.
- Keep tokens on the server and private repository names out of receipts.
- Preserve keyboard access, visible focus, and reduced-motion behavior.
- Check that changes to paper or seals keep QR codes and barcodes readable.
- Use the existing receipt lines and layout rather than duplicating calculations in each export.

## Before opening a pull request

```sh
npm test
npm run typecheck
npm run build
```

Add or update meaningful tests for changed behavior. For visual changes, inspect desktop and mobile layouts, the receipt viewer, and affected exports. Include before/after screenshots when they help reviewers.

Keep the pull request focused. Explain the problem, resulting behavior, and checks you ran. Do not include secrets or personal data in screenshots, logs, or fixtures.

Contributions are accepted under the project's [MIT license](LICENSE.md). Preserve third-party notices and only contribute work you have permission to share.
