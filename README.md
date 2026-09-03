# AI Welfare Assistant

## Overview

A student welfare triage assistant. A student describes a problem in a
chat interface; an AI model classifies it, but a deterministic, code-only
safety engine — not the AI — makes the final call on urgency,
safeguarding, and escalation. Responses are grounded only in a fixed
knowledge base. Escalated conversations become case records a staff
dashboard can triage, filter, and claim.

Built against a specific assessment brief — the full requirement-by-
requirement verification record is in `docs/final-assessment-report.md`,
and the reasoning behind some of the bigger calls is in `DECISIONS.md`.

## Features

- Student chat interface with AI triage (category, urgency, safeguarding,
  disposition) validated against a strict schema before it can affect
  anything downstream.
- A deterministic safety engine that independently pattern-matches the raw
  message for immediate danger, crisis/safeguarding, and individual
  immigration circumstances — regardless of what the AI concluded — and is
  the sole authority on the final decision.
- Knowledge-grounded responses from a fixed 13-resource knowledge base; no
  invented facts, URLs, or policies.
- Automatic escalation to a staff case queue when required, with atomic,
  race-safe case claiming.
- A staff dashboard: paginated/filterable/searchable case queue, full case
  detail (conversation, AI recommendation vs. final safety decision), and
  one-click claiming.

## Architecture

```
Student UI → POST /api/chat → request validation → student/conversation
resolution → message persistence → AI triage → schema validation →
safety engine → knowledge retrieval → grounded response → triage
persistence → escalation case creation (if applicable)

Staff dashboard (/staff, /staff/cases/[id]) → atomic case claim
(POST /api/staff/cases/[id]/claim)
```

Full layer-by-layer verification: `docs/final-assessment-report.md` §3.

## Tech Stack

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- [Prisma](https://www.prisma.io) 7 + [Neon](https://neon.tech) (PostgreSQL)
- [Groq](https://groq.com) (`openai/gpt-oss-120b`) for AI triage and
  response generation
- [Zod](https://zod.dev) as the schema boundary between AI output and the
  rest of the system
- Tailwind CSS

## Setup

```
npm install
```

This also generates the Prisma client (`postinstall` hook) into
`generated/prisma/` — gitignored, regenerated automatically, never
committed.

## Environment Variables

Copy `.env.example` to `.env` and fill in real values:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string — used at runtime and for migrations |
| `GROQ_API_KEY` | Yes | Server-only, never sent to the browser |
| `GROQ_MODEL` | No | Defaults to `openai/gpt-oss-120b` |
| `DIRECT_DATABASE_URL` | No | Not currently read by any code; reserved |
| `STAFF_DEV_ID` | Dev-only | See "Staff Authentication Limitation" below — must be unset in production |

Never commit `.env`.

## Database Setup

```
npm run prisma:deploy   # applies migrations (safe, idempotent)
npm run db:seed         # optional — local/demo fixture data only, clears the app's own tables first
```

`prisma:deploy` runs `prisma migrate deploy` — the non-interactive,
production-safe command. `db:seed` is destructive to whatever's already in
the app's tables; never point it at a database holding real student data.

## Development

```
npm run dev
```

## Production Build

```
npm run build
npm run start
```

See `docs/deployment.md` for the full deployment guide and
`docs/production-checklist.md` for a pre-deployment sign-off checklist.

## Verification

```
npm run db:verify
npm run safety:verify
npm run triage:verify
npm run knowledge:verify
npm run escalation:verify
npm run staff:verify
npm run claim:verify
npm run probe
npm run assessment:verify
npm run security:verify
npm run production:verify
```

Every script creates its own throwaway fixtures and cleans them up
afterward — safe to run against a real database. `assessment:verify`,
`security:verify`, and `production:verify` start (or reuse) a real
production server and make real Groq calls, so they're slower and subject
to Groq's own rate limits under heavy repeated use.

`npm run probe` is the mandatory two-check gate (prompt injection must
not resolve/deprioritize a case; a crisis message must escalate). It uses
a **stubbed AI response**, not a live Groq call — it feeds a hand-written
classification straight into the real, unmodified safety engine and
writes a real row to the database, so it's checking the actual
validation and rule logic, just without depending on network access or
model availability. Everything downstream of triage that scripts like
`triage:verify` and `assessment:verify` exercise does call the real Groq
API.

## How the Assistant Decides: Handle, Clarify, or Escalate

Every student message goes through two steps. First, the AI model reads
it and suggests a category, an urgency, and whether it looks safe to
answer directly, needs a clarifying question, or should go to a staff
member. Second, a set of fixed, code-only rules independently checks the
raw message text on its own, regardless of what the AI said — and this
is the part that actually decides the outcome. If those rules spot
crisis language, an indication of immediate danger, or an individual
immigration situation, they force an escalation no matter what the AI
recommended.

I kept this decision out of the model's hands on purpose. The AI's read
is only ever a starting point; the rules make the final call, and if the
AI is unavailable or returns something unusable, the system defaults to
escalating rather than guessing. See `lib/safety/rules.ts` for the
actual rules, and `DECISIONS.md` for why I built it this way instead of
trusting the model directly.

## Scale: 50 Organisations, 10,000 Conversations a Day

This is a design question the assessment asks, not something I built.
The schema is single-tenant — there's no `Organization` or `Employee`
entity, so there's nothing to scope multiple institutions by. What I did
test: a temporary 500-row synthetic case fixture showed the staff
dashboard's queue, filter, metrics, detail, and claim queries stay
bounded (not N+1) and index-backed at that size. That's not the same as
handling 10,000 conversations a day in production, which I haven't
demonstrated and won't claim.

If I had to support multiple organisations, the natural extension is an
`Organization` model plus an `organizationId` foreign key on `Student`
and `Staff`, with every case-queue query gaining a matching `WHERE`
clause backed by a composite index. That's an incremental change on top
of the existing filter/index pattern, not a redesign. Full write-up:
`docs/assessment-evidence.md` §Scale.

## Production Privacy and Safety

Handling real student welfare data would need several things I didn't
build here: real staff authentication (session-based login, most likely
against the university's existing identity provider) in place of the
`STAFF_DEV_ID` env var; a defined retention policy — the schema has no
soft-deletes or expiry, so conversations persist indefinitely today;
audit logging for staff access to case records, which doesn't currently
exist beyond who claimed a case; and a clear policy on the fact that
every student message is sent to Groq (a third-party AI provider) for
triage and response generation — a real deployment would need a data
processing agreement with that provider and to disclose this to
students. Encryption in transit is already the default for both the
database and Groq connections; encryption at rest is the database
host's responsibility, not something this application manages.

## Staff Authentication Limitation

**There is no real staff authentication.** `STAFF_DEV_ID` (a server-only
env var) is a development convenience that lets the case-claiming
endpoint resolve "the current staff member" without a login system. It is
never exposed to the browser, and the claim endpoint never accepts a
staff identity supplied by the client — only this env var. Before real
staff and real students use this system, `STAFF_DEV_ID` must be replaced
with real authentication (login/session, or an SSO integration); see
`docs/staff-claiming.md` and `docs/deployment.md` for the exact
boundary.

## Assessment Notes

`docs/final-assessment-report.md` has the full requirement-by-requirement
record (IMPLEMENTED + VERIFIED, PARTIALLY VERIFIED, DOCUMENTED
LIMITATION, or PRODUCTION REQUIREMENT for every item), and
`DECISIONS.md` covers what I left out and why, one decision I could have
made differently, and what I'd expect to break first in production.
