# Deployment

Practical guide to running this application outside local development. See
`docs/production-readiness.md` for the audit behind these steps, and
`docs/production-checklist.md` for a one-page sign-off checklist.

## Prerequisites

- Node.js (a version compatible with Next.js 16.3.3 and the `@types/node`
  range in `package.json`).
- A PostgreSQL database — this project is built and verified against
  [Neon](https://neon.tech), but any Postgres-compatible provider works
  since Prisma is not Neon-specific here.
- A [Groq](https://console.groq.com) API key.
- Real staff records already seeded in the `Staff` table (see "Staff
  Authentication" below — this app has no admin UI to create them).

## Environment Variables

Copy `.env.example` to `.env` and fill in real values:

```
DATABASE_URL=<your Postgres connection string>
GROQ_API_KEY=<your-key>
GROQ_MODEL=<optional — defaults to openai/gpt-oss-120b>
DIRECT_DATABASE_URL=<optional — not currently read by any code>
```

Do **not** set `STAFF_DEV_ID` in a real production environment — see
"Staff Authentication" below.

Never commit `.env`. `.gitignore` already excludes it.

## Database

Apply the existing migration to a fresh production database:

```
npm run prisma:deploy
```

This runs `prisma migrate deploy` — the non-interactive, production-safe
command (unlike `prisma migrate dev`, which can prompt and is
development-only). It applies pending migrations and does nothing if the
schema is already up to date; it never resets or drops data. There is
currently one migration (`20260831105307_init_welfare_database`) and no
outstanding schema changes.

Do **not** run `prisma migrate reset` against a database holding real
data — it drops and recreates the schema.

Seed data (`npm run db:seed`) is for local development/demo only. It
clears the app's own tables before reseeding — never run it against a
database with real student data.

## Prisma

The Prisma Client is generated from `prisma/schema.prisma` into
`generated/prisma/` — a build artifact, gitignored, not committed.

```
npm install
```

now regenerates it automatically via the `postinstall` script (`prisma
generate`). This was verified against a clean `generated/` directory: a
build without a prior `npm install` fails with a clear "module not found"
error until the client is regenerated, and succeeds immediately once it
is. `npm run build` itself does not regenerate the client — the
`postinstall` hook is what guarantees this on a fresh install.

`prisma generate` does not require `DATABASE_URL` to be set (verified) —
only `prisma migrate deploy` and the running app need a real connection
string.

## Build

```
npm install
npm run build
```

Requires `DATABASE_URL` to be set for the build's own TypeScript
compilation to resolve Prisma's generated types correctly, but does not
need a *reachable* database at build time (no queries run during `next
build` for this app's routes — all API routes are dynamic, not
statically prerendered against live data).

## Start

```
npm run start
```

Starts the production Next.js server. Verify with the health check below,
then the smoke test.

## Health Check

```
GET /api/health
```

Returns `{"status":"ok","database":"connected"}` on success, or
`{"status":"error","database":"disconnected"}` with HTTP 503 on failure —
no hostname, connection string, or Prisma error detail in either case.

## Staff Authentication

**This is the primary outstanding production requirement.**
`STAFF_DEV_ID` (`lib/staff/currentStaff.ts`) is a development convenience
only — it reads a fixed Staff id from a server env var, with no login, no
session, no request credential. It must be replaced before this
application is used with real staff and real students:

- Real production staff authentication (login + session, or an
  organization SSO integration) must resolve "the current staff member"
  in place of `getCurrentStaff()`'s env-var read.
- The claim endpoint (`POST /api/staff/cases/[id]/claim`) must continue
  resolving staff identity **server-side only** — the browser must never
  be able to supply a `claimedById`. This constraint does not change; only
  the identity-resolution mechanism inside `getCurrentStaff()` does.
- `STAFF_DEV_ID` must be unset in production. With it unset, the claim
  endpoint responds `401` rather than silently degrading.

This was explicitly out of scope through Phase 12 and is not implemented
in this phase either — no fake login screen has been added, per
instruction.

## Verification

Before considering a deployment healthy, run the full suite against the
running production build:

```
npm run db:verify
npm run safety:verify
npm run triage:verify
npm run knowledge:verify
npm run escalation:verify
npm run staff:verify
npm run claim:verify
npm run assessment:verify
npm run probe
npm run security:verify
npm run production:verify
```

All of these create their own throwaway fixtures and clean them up —
safe to run against a real database, including a real production one
(see `docs/production-checklist.md` for the "no destructive operations"
constraints these scripts already respect).

## Rollback Considerations

- **Application rollback**: this app has no server-side state outside the
  database — rolling back to a previous build/deploy is safe at any time
  and requires no data migration, provided the database schema hasn't
  changed between versions.
- **Migration rollback**: Prisma does not generate automatic down-migrations.
  If a future migration needs to be rolled back, it must be written as a
  new forward migration that reverses the change — never edit or delete an
  already-applied migration file.
- **Database backups**: this project does not configure or manage backups
  itself — that's the hosting provider's responsibility (Neon offers
  point-in-time restore on its paid tiers; confirm the specific plan in
  use before relying on it). No backup schedule is claimed or implied by
  anything in this codebase.
- **AI provider unavailable**: already handled by design, not something a
  deployment needs to plan around — if Groq is unreachable or returns
  invalid output, `evaluateSafety` treats it as `triage: null` and
  defaults to a conservative `ESCALATE`, flagged `ai_unavailable`. The
  application degrades safely rather than failing the request.
