# Production deployment checklist

One-page sign-off checklist. See `docs/deployment.md` for the how, and
`docs/production-readiness.md` for the audit behind each item.

- [ ] Production database selected (a real Postgres instance, separate
      from the development database this project has been using)
- [ ] Database backup/recovery strategy understood — confirm what the
      chosen hosting provider actually offers (e.g. Neon's point-in-time
      restore tier); this project does not configure backups itself
- [ ] `DATABASE_URL` configured (production credentials, not the
      development connection string)
- [ ] `GROQ_API_KEY` configured
- [ ] `GROQ_MODEL` configured (optional — only if overriding the default
      `openai/gpt-oss-120b`)
- [ ] No real secrets committed (`.env` stays gitignored; `.env.example`
      contains only placeholders)
- [ ] `STAFF_DEV_ID` removed/replaced for production — must be **unset**
      until real staff authentication exists
- [ ] Production staff authentication configured (outstanding
      requirement — see `docs/deployment.md` §Staff Authentication;
      **not implemented in this phase**)
- [ ] Prisma migrations verified (`npm run prisma:deploy` — confirmed
      idempotent against the current schema, applies cleanly to a fresh
      database)
- [ ] Build passes (`npm run build`)
- [ ] Production start passes (`npm run start`)
- [ ] Health endpoint passes (`GET /api/health` → `{"status":"ok","database":"connected"}`)
- [ ] API smoke tests pass (`npm run production:verify`)
- [ ] Security headers verified (`X-Content-Type-Options`,
      `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`)
- [ ] Error responses verified (no stack traces, connection strings, or
      Prisma internals in any API response)
- [ ] Logging reviewed (no secrets, no full student message bodies in
      error logs — see `docs/production-readiness.md` §Logging)
- [ ] Rate limiting decision documented (deliberately not implemented —
      no clean-fit infra; request-size caps are the current mitigation)
- [ ] Monitoring strategy documented (see below)
- [ ] Rollback strategy documented (see `docs/deployment.md` §Rollback
      Considerations)
- [ ] Final assessment tests pass (`npm run assessment:verify`, `npm run
      probe`, `npm run security:verify`)

## Monitoring (recommendations only — nothing installed)

Platform-neutral; wire up whatever the chosen host already provides
rather than adding a new service for this alone:

- **Application errors** — the app already funnels every unexpected
  failure through `console.error` with a short, secret-free message
  (`app/api/chat/route.ts`, `app/api/staff/cases/[id]/claim/route.ts`,
  `lib/ai/*.ts`); point a log aggregator at stdout/stderr.
- **API latency** — `/api/chat` (AI round-trip) and
  `/api/staff/cases/[id]/claim` (DB round-trip) are the two endpoints
  worth alerting on; a sustained latency increase on `/api/chat` most
  likely means Groq, not this app.
- **Database health** — poll `GET /api/health`; alert on `503` /
  `database: "disconnected"`.
- **Database connections** — watch the hosting provider's own connection
  metrics (e.g. Neon's dashboard) for pool exhaustion, since this app
  doesn't expose that itself.
- **Groq provider errors** — every triage/response failure is logged
  server-side (`lib/ai/triage.ts`, `lib/ai/respond.ts`) and already
  degrades safely (conservative `ESCALATE`); alerting on a spike in these
  logs would catch a Groq outage early.
- **Case creation failures** — an escalation that fails to persist would
  currently surface as a 500 on `/api/chat`; covered by the general
  application-error monitoring above.
- **Failed staff claims** — a spike in `409` responses from the claim
  endpoint would indicate real claim contention (not necessarily a bug);
  worth a dashboard panel, not necessarily an alert.
