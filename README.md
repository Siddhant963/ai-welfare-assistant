# AI Welfare Assistant

## Overview

A student welfare triage assistant. Students describe a problem in a chat
interface; an AI model classifies it, but a deterministic, code-only
safety engine — not the AI — makes the final call on urgency,
safeguarding, and escalation. Responses are grounded only in a fixed
knowledge base; escalated conversations become case records a staff
dashboard can triage, filter, and atomically claim.

See `docs/final-assessment-report.md` for the full requirement-by-
requirement verification record.

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

This project was built against a specific assessment brief. The full,
honest verification record — including what's IMPLEMENTED + VERIFIED,
PARTIALLY VERIFIED, a DOCUMENTED LIMITATION, or a PRODUCTION REQUIREMENT
— lives in `docs/final-assessment-report.md`. It does not claim
capabilities beyond what was actually built and tested; in particular,
the system remains single-tenant (no multi-organization support), and no
production-scale (10,000 conversations/day) capacity has been
demonstrated — only bounded-query behavior at a synthetic ~500-case
scale.
