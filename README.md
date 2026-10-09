# Git Receipts

**Your GitHub year, on paper.**

Turn any public GitHub profile into a thermal-style activity receipt. Enter a username or profile link, choose a year, and watch the printer feed your receipt.

<img width="1453" height="971" alt="image" src="https://github.com/user-attachments/assets/4c4625b5-1fd9-4d87-aa1d-fce62a745dfb" />

[Try Git Receipts](https://git-receipts.vercel.app) · [Star on GitHub](https://github.com/ihssmaheel-dev/git-receipts)

## Features

- A modeled thermal printer with paper-feed and cutting animations.
- Contributions, active days, streaks, best month, and longest break from available GitHub data.
- One optional achievement stamp, a scannable QR code, and a receipt barcode.
- PNG, SVG, plain text, and an 80 mm PDF you can save or print.
- Light and dark README embeds, receipt permalinks, and sharing links.
- Keyboard-accessible controls and reduced-motion support.

No sign-in is required. The home-page sample is fictional and clearly labeled. Unknown data stays off the receipt; it is never estimated.

## Run locally

Requires **Node.js 22 or newer**.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Public contribution calendars work without a token.

For optional configuration, copy `.env.example` to `.env.local`. Keep environment files out of Git.

## Data and privacy

Without `GH_PAT`, the app reads GitHub's public contribution calendar. With a server-only token, it can request GraphQL breakdowns for commits, pull requests, reviews, and issues. Results depend on what GitHub exposes to that token. Private repository names and links are removed.

Statistics use the selected year's covered period. Missing days are never treated as zero, and milestones require complete daily data. Lookups are cached; GitHub quota exhaustion shows **OUT OF PAPER**.

When a database is configured, the completed-print counter stores the submitted profile, year, print key, and a salted IP hash for seven days. Raw IP addresses are not stored. Receipts themselves are not stored in that database.

## Put a receipt in your README

Replace `your-handle` and the year:

```markdown
[![My Git receipt](https://git-receipts.vercel.app/api/receipt.svg?user=your-handle&year=2026)](https://git-receipts.vercel.app/?user=your-handle&year=2026)
```

The app also generates a light/dark `<picture>` snippet. Add `&stamp=false` to hide the stamp or `&animate=0` for a static SVG. GitHub's image cache can delay refreshes.

## Development

Built with Next.js, React, TypeScript, Geist, Radix UI, and libSQL/Turso. Receipt text and export geometry are shared across formats.

```sh
npm test
npm run typecheck
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the project structure and pull-request guidance. For Vercel and environment setup, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Community

Ideas, bug reports, and contributions are welcome. If you enjoy printing your history, [give the project a star](https://github.com/ihssmaheel-dev/git-receipts).

- [Contributing](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Report a security issue](SECURITY.md)

## License

[MIT](LICENSE.md) © 2026 Mohamed Ismail S. Third-party notices remain in their source files and the [licenses directory](licenses).
