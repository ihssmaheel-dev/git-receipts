# Git Receipts

A Next.js app that turns **any public GitHub profile** into a thermal-style activity receipt. Enter a username, `@handle`, or `https://github.com/handle`, choose a year, and print.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). The home page shows a clearly labeled fictional sample. Enter a real profile to fetch its own activity; there is no sign-in requirement.

Optional environment configuration goes in `.env.local` (see [.env.example](.env.example)):

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
GH_PAT=
```

`GH_PAT` stays on the server. Public calendars work without it. A valid token enables GitHub GraphQL contribution breakdowns for commits, pull requests, reviews, issues, and repositories. Never use `NEXT_PUBLIC_GH_PAT` or commit a token.

## What it does

- Accepts GitHub usernames and profile URLs, with inline validation before fetching from fixed GitHub hosts. Valid profile/year submissions use client navigation, preserving page scroll and showing loading feedback.
- Uses a custom keyboard-accessible year picker, from 2008 through the current year. The current year ends today, in UTC, matching GitHub's calendar dates.
- Uses a cool gray workbench, Geist typography, and a modeled off-white thermal printer with a graphite recessed deck, LED panel, working FEED control, roller, and cutter.
- The contribution calendar has custom activity tooltips, arrow-key navigation, visible focus, and a selected-day summary.
- Animates `idle → warming → handshake → printing → cutting → done`. The paper moves upward through the top slot in measured steps; the QR section feeds last, then the cutter releases the sheet. A fixed camera keeps the machine visible as longer paper leaves the frame. Sound is optional and off by default.
- Completed prints automatically open a centered, dismissible full-size receipt viewer, including when reduced motion skips the feed sequence. Close and PDF actions stay visible while the receipt body scrolls. The viewer manages focus and locks background scrolling without adding a gutter or shifting page width.
- Includes white/charcoal paper, PNG and SVG downloads, share links, and a vector PDF on one 80mm-wide page with automatic height, selectable text, and a clickable QR target. PDFs use white paper for physical printing. **Print on paper** opens the browser's dialog for a connected printer; select an appropriate paper size there.
- Copy a plain text receipt or its permalink from the printer controls. Clipboard failures show the receipt URL for manual copying. The README section supplies a linked light/dark `<picture>` snippet and prefilled X and Bluesky share links using the existing SVG endpoint.
- QR codes link to the selected receipt when deployed. During localhost development they open the actual GitHub profile, so a phone can scan them without access to the development machine. The sample's local QR opens GitHub.
- Renders the accessible receipt and direct SVG/PDF links without JavaScript. The custom picker, printer controls, and receipt viewer are interactive client components. Reduced-motion users skip the feed sequence. Tap the printer serial five times for a small surprise.
- Uses the same typed receipt lines for the website, SVG, PDF, and Open Graph card. SVG and PDF share measured layout geometry and handle long names and values.
- Receipts follow a compact thermal layout with a centered merchant header, account and period details, aligned activity rows, a bold total after the rows, dashed separators, source disclosure, and a scannable QR footer. Courier type, warm paper, and a finely cut edge give the preview and downloads a printed feel.
- Best month uses the largest calendar-month contribution total within the covered period. Longest break counts consecutive observed zero days, including the period boundaries. These rows, an earned achievement seal, and the receipt number/barcode require complete daily data; missing dates are never assumed to be zero. The receipt number is `{year}-{total}-{activeDays}` and appears above the account as well as below the barcode.
- One small GitHub achievement seal overlays the existing paper before or after the QR, like a paid stamp. It reserves no space and never changes paper height or text positions. Its name remains straight and its qualifying threshold curves around the bottom. The chosen side, position, and slight tilt vary deterministically by receipt, away from corners; placement protects QR and barcode areas. Priority is: 365-day streak, 300 active days, 100-day streak, 250 active days, 50-day streak, 10,000 contributions, 5,000 contributions, 2,000 contributions, 30-day streak, 200 active days, 150 active days, 1,000 commits, 1,000 contributions, 200 reviews, 100 reviews, 200 pull requests, 100 pull requests, 500 commits, 100 issues, 50 issues, 25 issues, 100 active days, 14-day streak, then a 7-day streak. Unknown breakdown counts cannot earn a corresponding milestone.
- The printer feeds an unstamped sheet. In **View receipt**, the seal punches into place when it scrolls into view; reduced motion shows a settled seal. The custom **Show GitHub achievement stamp** switch controls the viewer, SVG/PNG/PDF downloads, copied text, shared links, and README embed. Turning it off removes only the seal. The setting survives refresh and profile/year navigation through the `stamp` URL parameter. Browser **Print on paper** uses the original unstamped sheet.

## Data and failures

With `GH_PAT`, the server uses GitHub GraphQL. Otherwise it reads exact per-day counts from GitHub's public contribution calendar and optionally reads public profile details through REST. The public calendar does **not** supply contribution-type or repository breakdowns; those rows are omitted rather than estimated. This calendar HTML is an upstream implementation detail rather than a guaranteed API, so its parser may need updating if GitHub changes its markup.

GitHub fetches are cached for one hour. A bounded process-local cache deduplicates concurrent lookups and keeps successful snapshots for the same profile/year. Failed lookups retry after one minute. During an upstream failure, a last-known snapshot is shown when that process has one; fresh serverless instances cannot recover another instance's memory. [data/fallback.json](data/fallback.json) supplies only the disclosed demo, never substitute numbers for a requested person or year. Unknown profiles show an unavailable receipt without fabricated totals.

Streaks are measured inside the selected calendar-year window. Private and internal repository names are replaced with `PRIVATE REPO #n`, and their URLs are discarded. Counts reflect what GitHub exposes to the configured server token; GitHub's contribution rules still apply.

When GitHub's quota runs dry (GraphQL `RATE_LIMITED`, HTTP 429, or an empty `x-ratelimit-remaining` budget), the printer shows **OUT OF PAPER** instead of generic unavailable copy: the status reads "Out of paper", FEED stays disabled, and the slip itself carries the empty-tray message. A shared per-minute outbound guard trips the same state before one abuser can burn the token quota for everyone. Stale snapshots are still shown for ordinary upstream failures, but quota exhaustion is always explicit, never silent.

## Abuse protection and the public counter

No login; anonymous visitors are bucketed by salted IP hash (`SHA-256(salt + ip)`, first `X-Forwarded-For` entry, `direct` when absent). Raw IPs are never stored. Requests per minute per visitor (override with `RATE_LIMIT_*` env vars):

```text
GET /                 60   slow-down notice, no GitHub fetch attempted
GET /api/receipt.svg  30   429 JSON + Retry-After
GET /api/og           30   429 JSON + Retry-After
GET /api/receipt.pdf  10   429 JSON + Retry-After (CPU-heavy render)
POST /api/prints      10   429 JSON + Retry-After
```

Buckets live in Turso (shared across serverless instances) with a per-instance memory mirror for instant denies; unreachable databases fail open so receipts never break. Own-limit hits return standard 429s — only GitHub's quota shows OUT OF PAPER.

Every finished FEED animation pings `POST /api/prints` once with a client-generated v4 `runKey`. Replays are free but add nothing (`INSERT OR IGNORE`); invalid shapes get 400; oversized bodies get 413. The public total under the printer counts completed prints of available receipts (sample included) and refreshes every minute. The store keeps salted IP hashes beside each counted print for 7 days and rate-limit buckets for 1 hour, then deletes them; nothing else personal is retained.

## Export endpoints

```text
/api/receipt.svg?user=torvalds&year=2025
/api/receipt.svg?user=torvalds&year=2025&theme=dark
/api/receipt.svg?user=torvalds&year=2025&animate=0
/api/receipt.svg?user=torvalds&year=2025&stamp=false
/api/receipt.pdf?user=torvalds&year=2025
/api/receipt.pdf?user=torvalds&year=2025&stamp=false
/api/og?user=torvalds&year=2025
```

Omit `user` for the sample receipt. SVGs are self-contained, have no JavaScript or external fonts, and play their CSS feed animation once, followed by a stamp punch when an achievement is earned. `animate=0` returns a settled image. `stamp=true` (default) includes the earned seal; `stamp=false` hides it. The aliases `stamp=1` and `stamp=0` also work. SVG, PDF, and OG endpoints validate this option. Share links include profile-specific Open Graph metadata.

README embed (replace the origin with your deployed domain):

```markdown
[![Git receipt](https://yourdomain.dev/api/receipt.svg?user=your-handle&year=2026)](https://yourdomain.dev/?user=your-handle&year=2026)
```

GitHub's image proxy can delay updates even after the server refreshes. The website also supplies an embed snippet for the selected receipt.

## Verify

```sh
npm test
npm run typecheck
npm run build
```

Tests cover input validation, calendar parsing, streak/date boundaries, unavailable metrics, snapshot caching, print transitions, measured paper feed, stale-job cancellation, XML escaping, export parameters, long receipt columns, QR decoding, vector PDF size/text/link integrity, quota classification, out-of-paper rendering, abuse windows and responses, print validation and exactly-once counting, and client/server module boundaries.

## Deploy on Vercel

Import this folder as a Next.js project, or push it to your repository and import that repository. Keep the standard `npm run build` command. Set `NEXT_PUBLIC_SITE_URL` to your production origin for QR codes, metadata, and README snippets. Optionally set the server-only `GH_PAT` (public-read GraphQL is enough; it never leaves the server). For the public counter and shared abuse buckets, set server-only `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`; without them the app runs fully on memory. Set `RATE_LIMIT_SALT` to a random string so IP hashes cannot be correlated across services. No contribution bot or scheduled commit action is needed. Security headers (HSTS, frame denial, referrer and permissions policies, nosniff) ship in `next.config.ts`; the content-security policy starts report-only until its violation feed is reviewed.

## Structure

```text
app/                       Server page, layout, metadata, image routes
components/Printer/        Interactive printer, layered SVG housing, and paper feed
components/Receipt/        Shared accessible HTML receipt
components/ProfileForm/    Inline validation and loading feedback
components/YearPicker/     Custom keyboard-accessible year selection
components/ActivityCalendar/ Contribution tooltips and keyboard navigation
hooks/usePrinter.ts        Timing, motion preference, and sound orchestration
lib/github.ts              Cached GitHub lookups and failure handling
lib/githubInput.ts         Profile validation, public calendar parser, quota classifiers
lib/githubCache.ts         Bounded shared snapshot cache
lib/receiptData.ts         Pure snapshot builders (testable without server-only)
lib/rateLimit.ts           Salted IP buckets, shared Turso windows, outbound guard
lib/prints.ts              Exactly-once print counting and cached public total
lib/db/client.ts           Local SQLite file or Turso Cloud (counter + buckets only)
lib/stats.ts               Calendar statistics
lib/receiptLines.ts         One source of receipt text and numbers
lib/receiptLayout.ts        Shared measured SVG/PDF geometry
lib/receiptSvg.ts           Escaped self-contained SVG renderer
lib/receiptPdf.ts           Vector 80mm receipt PDF
lib/og.tsx                 Static share image with a real QR code
lib/printMachine.ts         Reducer and transition guards
lib/paperFeed.ts            Measured feed interpolation and safe geometry bounds
lib/sound.ts                Web Audio synthesis
lib/qr.ts                   Server-generated QR module paths
data/fallback.json         Fictional demo snapshot
tests/                     Focused behavior and data integrity tests
```
