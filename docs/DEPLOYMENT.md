# Deploying Git Receipts

## Vercel

1. Import `ihssmaheel-dev/git-receipts` into Vercel as a Next.js project.
2. Use Node.js 22 or newer, the default install command, and `npm run build`.
3. Set `NEXT_PUBLIC_SITE_URL` to your HTTPS production origin, without a trailing path.
4. Add the optional server-side settings below, then deploy.

Vercel's Git integration deploys connected production-branch pushes automatically when deployments are enabled. Use a Git commit email associated with your GitHub account. After changing environment settings, redeploy for them to take effect.

## Environment settings

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Production origin for QR targets, metadata, and share links |
| `GH_PAT` | Optional server-only GitHub token for GraphQL contribution breakdowns |
| `TURSO_DATABASE_URL` | Optional remote libSQL database for the counter and shared request limits |
| `TURSO_AUTH_TOKEN` | Server-only database credential |
| `RATE_LIMIT_SALT` | Random server-side value used to hash visitor IPs; configure in production |
| `SQLITE_URL` | Local development database URL; defaults to `file:./data/app.db` |

Keep credentials in Vercel's environment settings or an ignored `.env.local`. Never prefix a secret with `NEXT_PUBLIC_` or paste real values into issues and documentation.

Public calendars work without `GH_PAT`; missing contribution-type breakdowns are omitted. Without Turso, Vercel uses per-instance memory for the counter and limits, so they are not durable or shared across instances. No scheduled contribution bot is needed.

## Rate-limit overrides

These are requests per minute. Unset, zero, or invalid values use the default.

```env
RATE_LIMIT_PAGE=60
RATE_LIMIT_SVG=30
RATE_LIMIT_OG=30
RATE_LIMIT_PDF=10
RATE_LIMIT_PRINTS=10
RATE_LIMIT_GITHUB_OUTBOUND=120
```

The page gate is per instance. SVG, OG, PDF, and print endpoints use shared database reservations when configured, with per-instance fallback. The outbound guard protects the shared GitHub token's quota. GET and POST print requests have separate visitor buckets.

## Verify a deployment

- Load a real public profile and the disclosed sample.
- Complete a print and open the receipt viewer.
- Download PNG, SVG, and PDF; scan the QR from a phone.
- Check profile/year share links and the OG image.
- Test keyboard navigation and reduced-motion behavior.

The public counter counts completed available receipts, including the sample. When database storage is configured, print events retain the profile, year, run key, and salted IP hash for seven days; rate-limit rows are retained for one hour. Raw IP addresses and receipt snapshots are not stored in that database.

GitHub calendar markup is not a stable public API and can change. Security headers are configured in `next.config.ts`; the content-security policy currently reports violations rather than enforcing them.
