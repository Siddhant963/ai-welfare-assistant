# Database — Phase 2

PostgreSQL (Neon) via Prisma 7. Schema: [`prisma/schema.prisma`](../prisma/schema.prisma).

## Tables

**Student** — `id, name, email (unique), createdAt, updatedAt`. One student can start many conversations over time.

**Conversation** — `id, studentId, status (ACTIVE|CLOSED), createdAt, updatedAt`. Belongs to one student; has many messages; has at most one `Case`.

**Message** — `id, conversationId, role (STUDENT|ASSISTANT|SYSTEM), content, createdAt`. Belongs to one conversation. `SYSTEM` is reserved for future system-generated messages (e.g. automated notices) distinct from the assistant's own replies.

**TriageResult** — `id, messageId, category, urgency, safeguarding, disposition, reason, rawOutput (jsonb), createdAt`. One triage *attempt* against one message. See below for why this is 1:N rather than 1:1.

**Case** — `id, conversationId (unique), summary, category, urgency, safeguarding, status (NEW|IN_PROGRESS|RESOLVED), claimedById, claimedAt, createdAt, updatedAt`. The application's final, staff-facing decision — deliberately a separate table from `TriageResult`, not a flag on it.

**Staff** — `id, name, email (unique), createdAt, updatedAt`. Seeded for the MVP; no auth/roles yet (see Simplifications).

**KnowledgeResource** — `id, title, category, content, url, createdAt, updatedAt`. The fixed 13-item knowledge base.

## Relationships

```
Student 1───N Conversation 1───N Message 1───N TriageResult
                    │
                    └───0/1 Case N───1 Staff (claimedBy, optional)
```

- `Case.conversationId` is `@unique` — this is what enforces "at most one case per conversation" at the database level, not just in application logic.
- `Case.claimedById` is nullable and points at `Staff`; `onDelete: SetNull` so removing a staff record un-assigns their cases instead of blocking the deletion or cascading data loss.
- `KnowledgeResource` has no foreign keys — it's read by the future retrieval layer via `category`, not joined into the conversation graph.

## Why TriageResult is 1:N, not 1:1

A message can legitimately be triaged more than once:

1. **Clarification round-trips** — a vague first message gets `ASK_CLARIFYING`; the student's *next* message gets its own triage row. (Two different messages, two rows — straightforward.)
2. **Same-message re-evaluation** — a deterministic safety rule can override an AI-only read of the *same* message (e.g. a message classified `FINANCIAL` on the surface but containing wellbeing risk language). Both the original AI-only attempt and the rule-corrected final attempt are kept as separate rows against the same `messageId`.

Nothing is ever overwritten or deleted from `TriageResult` — it's the audit trail proving the AI's raw output was checked and, where necessary, overridden, which is the core safety requirement of this system. `messageId` is intentionally **not** unique.

The seed data (`prisma/seed.ts`) includes a worked example of case 2 — see `seedHiddenSafeguardingScenario`.

## Indexes

| Table | Index | Why |
|---|---|---|
| Student | `email` unique | Login/lookup, and the constraint itself |
| Conversation | `studentId`, `status` | "this student's conversations"; dashboard/list filtering |
| Message | `(conversationId, createdAt)` | Chronological message list for one conversation — the primary read pattern |
| TriageResult | `messageId`, `createdAt` | Full triage history for a message; recent-triage queries |
| Case | `status`, `urgency`, `safeguarding`, `claimedById`, `createdAt` | These are exactly the staff dashboard's filter/sort dimensions |
| KnowledgeResource | `category` | Retrieval filters by category before any content matching |

No composite or covering indexes beyond `Message(conversationId, createdAt)` — the MVP's read patterns don't yet justify them, and premature indexes cost write throughput without a measured need.

## Case claiming strategy

Two staff members must never both successfully claim the same case. The schema supports this with a nullable `claimedById`, but the *guarantee* comes from how it's written to, not the column itself: [`lib/db/claimCase.ts`](../lib/db/claimCase.ts) issues a single conditional `UPDATE`:

```sql
UPDATE "Case"
SET "claimedById" = $staffId, "claimedAt" = NOW(), "status" = 'IN_PROGRESS'
WHERE "id" = $caseId AND "claimedById" IS NULL
```

(via `prisma.case.updateMany({ where: { id, claimedById: null }, data: {...} })`). This is one round-trip to Postgres — there is no read-then-write gap for a second request to land in. `result.count === 1` means the caller won the claim; `result.count === 0` means someone else already had it (or the case doesn't exist). `scripts/verify-db.ts` exercises this directly by firing two concurrent claims at the same case and asserting exactly one succeeds.

No staff API is built in this phase — `claimCase` is a helper, not an endpoint, per the Phase 2 scope.

## Deliberate MVP simplifications

- **No multi-tenancy yet.** There is no `organizationId` anywhere. See below for the migration path.
- **No staff auth.** `Staff` is a plain seeded table; anyone with a `staffId` could claim a case if an API existed. Real auth is out of scope until a later phase's production-hardening pass.
- **`KnowledgeResource.category` reuses the triage `Category` enum** rather than a bespoke taxonomy. The 6 triage categories don't map perfectly onto the 13 supplied resources (IT support, careers advice, and disability support don't obviously belong anywhere), so several resources share `OTHER`. This keeps retrieval simple (`WHERE category = :triageCategory`) at the cost of precision within `OTHER` — acceptable given retrieval is explicitly meant to stay simple (no RAG/embeddings) in this assessment. The exact mapping used is in `prisma/seed.ts`.
- **`Samaritans` and `Emergency Services` have `url: null`.** They're phone numbers (116 123, 999), not URLs, and the schema has no separate contact field — adding one for two rows wasn't worth the extra column. Their content field carries the number.
- **No soft deletes / retention policy.** Rows are hard-deleted if deleted at all; nothing in this MVP deletes conversations or messages in the first place. A real retention policy is a production concern (see the scalability/privacy write-up planned for the README).
- **No `directUrl`-vs-`url` split enforced.** `prisma7.config.ts` accepts an optional `DIRECT_DATABASE_URL` for migrations (Neon's non-pooled connection) and falls back to `DATABASE_URL` if only one is supplied — a convenience, not a requirement.

## Future multi-tenant direction (not built now)

To support ~50 organisations at ~10,000 conversations/day without a redesign:

- Add `Organization { id, name, ... }` and an `organizationId` foreign key on `Student`, `Staff`, and `KnowledgeResource` (the three tables that are genuinely tenant-scoped data). `Conversation`, `Message`, `TriageResult`, and `Case` inherit their tenant through `Student`/`Conversation`, so they don't need their own column — one fewer place to get the scoping wrong.
- Every existing index that includes `status`/`category`/etc. would become a composite index led by `organizationId` (e.g. `(organizationId, status)` on `Case`), since almost every query in a multi-tenant system is "for this org, give me...".
- `KnowledgeResource` would need either an `organizationId` (if each org curates its own KB) or a shared/global flag — undecided without knowing whether the KB is per-institution or shared; today's fixed single KB doesn't need to answer this.
- None of this is implemented now because the assessment is explicitly single-tenant, and adding an unused `organizationId` everywhere would be exactly the kind of premature abstraction the brief asks us to avoid.

## Known review items before Phase 3

- Cascade behaviour on delete is only explicitly set for `Case.claimedBy → Staff` (`SetNull`). Every other relation uses Prisma's default, which has not been individually reviewed — fine for now since nothing in this phase deletes conversations/messages/students, but worth a deliberate pass before any delete-capable API is built.
- The `Category` → `KnowledgeResource` mapping above is a judgment call (see Simplifications) and is worth a second opinion before retrieval logic is built on top of it in Phase 7.
