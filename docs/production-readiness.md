# Production readiness

Audit of what it takes to run this application outside the local development
environment. Scope: configuration, build/start behavior, and known gaps —
not a deployment walkthrough (see `docs/deployment.md`) and not the
assessment-compliance record (see `docs/assessment-matrix.md` /
`docs/assessment-evidence.md`).

## Current state

- `npm run build` (`next build`) succeeds against the current code, both
  from an already-generated Prisma client and from a clean `generated/`
  directory (tested directly — see "Prisma client generation" below).
- `npm run start` serves the production build correctly. Verified live:
  `GET /`, `GET /api/health`, `GET /staff`, `GET /staff/cases/[id]`
  (existing and non-existent id), `POST /api/chat`, `POST
  /api/staff/cases/[id]/claim` (non-existent id) all returned the expected
  status codes and bodies in production mode.
- Security headers (`X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, `Permissions-Policy`) are present on production
  responses.
- `/api/health` already returns the minimal shape the brief asks for —
  `{"status":"ok","database":"connected"}` — with no hostname, connection
  string, or Prisma error detail on failure.
- All 10 verification suites (`db`, `safety`, `triage`, `knowledge`,
  `escalation`, `staff`, `claim`, `assessment`, `probe`, `security`) pass
  against the current build with zero net database row change.

## Required production configuration

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Used at runtime (Prisma Client via `@prisma/adapter-pg`) **and** for migrations (`prisma7.config.ts`). The installed `@prisma/config` (7.10.0) has no `directUrl` field, so this one string does both jobs. |
| `GROQ_API_KEY` | Yes | Server-only. Triage and response generation both fail closed (safety engine defaults to `ESCALATE`) if this is missing or invalid — see "AI provider unavailable" in `docs/deployment.md`. |
| `GROQ_MODEL` | No | Defaults to `openai/gpt-oss-120b` if unset. Override only if Groq's hosted catalog changes. |
| `DIRECT_DATABASE_URL` | No | Not read by any code path currently. Reserved for a future hosting environment that needs Neon's non-pooled connection for migrations; safe to leave unset. |
| `STAFF_DEV_ID` | Dev-only | See "Development-only features" below. Must **not** be set in a real production environment once real staff authentication exists. |

A fixed finding during this audit: `docs/database.md` previously claimed
`prisma7.config.ts` falls back between `DATABASE_URL` and
`DIRECT_DATABASE_URL`. It doesn't — the config only ever reads
`DATABASE_URL`. The doc and `.env.example` comments have been corrected to
match the code.

## Development-only features

| Feature | Where | Production disposition |
|---|---|---|
| `STAFF_DEV_ID` | `lib/staff/currentStaff.ts` | Must be replaced by real staff authentication (see `docs/staff-claiming.md`, §"Production staff authentication" below). Never sent to the browser; the claim route resolves identity server-side only. |
| Verification scripts (`scripts/verify-*.ts`, `scripts/probe.ts`) | `scripts/` | Dev/CI tooling only — not deployed as application routes, not reachable over HTTP. Run via `tsx`, a devDependency. |
| Prisma query-event logging | `lib/db/client.ts` (`log: [{ emit: "event", level: "query" }]`) | Emits nothing unless a listener calls `prisma.$on("query", ...)` — inert by default in the running app. Only the verification scripts attach a listener, to prove query-count properties. No production behavior change. |
| Seed data (`prisma/seed.ts`) | — | Dev/demo fixtures only. Never run automatically against a production database; `npm run db:seed` clears the app's own tables first, so it must never be pointed at a database holding real student data. |
| Mock/stubbed AI behavior | `scripts/probe.ts`, `scripts/verify-*.ts` | Confined to the verification scripts, which call `evaluateSafety`/`ensureEscalationCase` directly with a stubbed AI input where the brief explicitly permits it. The running application always calls the real Groq API; there is no stub/mock switch reachable in `app/` or `lib/ai/`. |
| Dev-mode Prisma client caching | `lib/db/client.ts` (`globalThis.__prisma`) | Only active when `NODE_ENV !== "production"` (guards against a fresh client per hot-reload in `next dev`). No-op in a real production process. |

No development-only feature is reachable from a production build by
accident — each one above is either gated by `NODE_ENV`, confined to
`scripts/` (never imported by `app/`), or requires an explicit env var
that a production deployment simply wouldn't set.

## Known limitations

- **No real staff authentication.** `STAFF_DEV_ID` is a placeholder. This
  was explicitly out of scope through Phase 12 and remains an outstanding
  production requirement — see "Production staff authentication" below.
- **No student authentication.** Students are identified by
  name+email only (not verified, not a login). Documented since Phase 2;
  unchanged.
- **No rate limiting beyond request-size caps.** `MAX_MESSAGE_LENGTH` /
  `MAX_NAME_LENGTH` / `MAX_EMAIL_LENGTH` (`lib/validation/chatRequest.ts`)
  and the `Content-Length` check in `app/api/chat/route.ts` reject grossly
  abusive payloads, but there is no per-IP/per-user request-rate limiter.
  No infra for one exists in this architecture; adding one (e.g. Redis)
  solely to appear complete was explicitly out of scope in Phase 12 and
  remains so here.
- **No multi-tenancy.** Single organization only — see
  `docs/assessment-evidence.md` §Scale for the full write-up.
- **`deepmerge-ts` advisory (dev-only, non-reachable).** Flagged in Phase
  12; unchanged here since nothing about deployment prep touches
  dependency versions.
- **CSP not added.** See `docs/deployment.md` for why.

## Deployment checklist

See `docs/production-checklist.md` for the full, itemized checklist. In
summary: real credentials configured, `STAFF_DEV_ID` replaced by real
staff auth, migrations deployed with `prisma migrate deploy` (not `dev`),
`npm run build` + `npm run start` verified, and the full regression suite
(including the new `npm run production:verify`) passing.

## Platform recommendation

Neither the original assessment brief nor `docs/assessment-matrix.md`
mandates a deployment platform — Phase 11 explicitly listed "Vercel
deployment" as out of scope, and this phase does not create any cloud
resource or deploy anything. This is a recommendation only.

The architecture is three plain pieces: a Next.js app (`npm run
build`/`npm run start`, no custom server), a Postgres database already on
Neon, and an outbound-only call to the Groq API. Nothing here needs
container orchestration, background workers, or a queue.

Given that, the simplest suitable option is **any platform that runs
`npm install && npm run build && npm run start` for a standard Next.js
app** — a managed Next.js host being the least-setup choice, since it
needs no Dockerfile and no process manager, just the four environment
variables in `.env.example`. A plain VM/container host (with a process
manager such as `pm2` or a systemd unit around `npm run start`) works
equally well if that's what's already available, and is a reasonable
choice if the deployer wants to avoid vendor lock-in to any particular
Next.js-hosting provider — this codebase makes no platform-specific
assumptions either way (no edge-runtime-only APIs, no platform SDK
imports).

Neon is already the database in use through development, integrates with
either style of host over a normal Postgres connection string, and there
is no found reason to change it for production. Groq needs no
platform-side configuration beyond the API key already in
`.env.example`.

If the assessment or the deploying organization specifies a platform,
that instruction overrides this recommendation — nothing here has been
built to depend on one platform over another.
