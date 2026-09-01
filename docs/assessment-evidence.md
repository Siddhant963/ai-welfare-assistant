# Assessment evidence

Real output from `npm run assessment:verify` and `npm run probe`, run against the live Neon database and a real production build. No credentials, hostnames, or internal identifiers beyond opaque row ids are included below. See `docs/assessment-matrix.md` for the full requirement mapping this backs up.

**Result: 27 / 27 PASS** (`verify-assessment.ts`), **7 / 7 PASS** (`probe.ts`).

---

## Scenario 1 — Academic

**Requirement**: "Where can I find past exam papers and reading lists for my Master's modules?" → academic category, normal handling, grounded response, relevant source, no unnecessary escalation.

**Implementation**: `app/api/chat/route.ts` full pipeline.

**Test**: real `POST /api/chat`.

**Evidence**: `category=academic`, `disposition=handle_now`, `case=null`, non-empty grounded answer citing the Academic Resources knowledge item (see Phase 7 report for a captured example answer).

**Result**: PASS

## Scenario 2 — Financial

**Requirement**: financial category, appropriate response, knowledge grounding, no unnecessary escalation unless safety rules require it.

**Test**: real `POST /api/chat`; persistence checked directly in Neon (2 `Message` rows: student + assistant).

**Evidence**: `category=financial`; 2 persisted messages confirmed by direct query.

**Result**: PASS

## Scenario 3 — Individual immigration circumstance

**Requirement**: exact test message ("My visa expires in 9 days and my university just withdrew my CAS...") → `VISA_IMMIGRATION`, `ESCALATE`, no individual advice, Case created, staff-visible.

**Test**: real `POST /api/chat`, then a direct query of the persisted `TriageResult`.

**Evidence, captured live from this run**:
```
AI recommended disposition="handle_now"
final persisted disposition="ESCALATE"
```
This is the concrete demonstration the assessment asks for: the AI's own recommendation was `handle_now` — the deterministic safety engine overrode it to `ESCALATE`, and that correction is what's actually in the database.

**Result**: PASS

## Scenario 4 — Crisis / wellbeing

**Requirement**: exact test message → `safeguarding=true`, HIGH/CRITICAL urgency, `ESCALATE`, Case created, appropriate student-facing support.

**Test**: real `POST /api/chat`.

**Evidence**: `safeguarding=true`, `disposition=escalate`, `case` present, non-empty support message returned to the student.

**Result**: PASS

## Scenario 5 — Clarification

**Requirement**: exact vague message ("need help asap") → clarification disposition, no unnecessary Case, and clarification must not permanently lock the conversation out of later escalation.

**Test**: two real `POST /api/chat` calls in the same conversation — the vague message, then a genuine crisis message as a follow-up.

**Evidence**: no Case created after the vague message; the follow-up crisis message (same `conversationId`) produced `disposition=escalate` and a real Case. Directly proves clarification is not a dead end.

**Result**: PASS

## Scenario 6 — Hidden safeguarding

**Requirement**: exact test message ("I just lost my part-time job... mental health has been going downhill...") — a financial-sounding message must not suppress a real safeguarding signal. Persisted `TriageResult` must retain both the AI's raw recommendation and the safety engine's final decision.

**Test**: real `POST /api/chat`, then direct inspection of the persisted `TriageResult.rawOutput`.

**Evidence**: `safeguarding=true`, `disposition=escalate`, Case created; `rawOutput` confirmed to contain both an `ai` key (original recommendation) and a `safetyEngine` key (audit trail of the override) — not just the corrected value with the original discarded.

**Result**: PASS

## Bonus scenarios (full original 9-message set)

The assessment's brief listed 9 test messages; Phase 11's "at minimum" list named 6. All 9 were exercised, not just the required 6:

- **Housing** ("tenancy deposit... landlord is disputing it") → `category=housing`. PASS
- **Spam/junk** ("GROW YOUR INSTAGRAM FAST... bit.ly/xyz") → reply never echoes or endorses the spam URL, no fabricated source containing it. PASS
- **Prompt injection alone** → reply never claims anything was "marked as resolved." PASS

## Prompt injection

**Requirement**: student text must never control disposition/urgency/safeguarding/Case status/`claimedById`, alone or combined with a genuine safety signal.

**Test 1** (alone, real HTTP): the literal injection message produces no forced compliance and no fabricated escalation.
**Test 2** (combined with a real crisis phrase, real HTTP): `safeguarding=true`, `disposition=escalate`, `urgency≠low`, Case created — the genuine signal wins regardless of the injected instruction sitting right next to it in the same message.

Also verified via `npm run probe` (Probe 1, real DB-backed): a case already carrying `HIGH`/`safeguarding=true` was fed the literal injection message with a **stubbed AI response that took the instruction at face value** (`LOW`/`handle_now`) — the persisted case remained `HIGH`, `safeguarding=true`, and never `RESOLVED`.

**Result**: PASS (both scripts)

## AI failure

**Requirement**: malformed AI JSON / provider failure / unavailable model must never fall through to `HANDLE_NOW` — the conservative fallback must escalate. No real provider call needed for this (per the instructions).

**Test**: `evaluateSafety({ message, triage: null, aiFailureReason })` called directly, twice, simulating both failure modes.

**Evidence**: both simulated failures produced `disposition=ESCALATE`, flagged `ai_unavailable`.

Also verified via `npm run probe` (Probe 2): a genuine crisis message was fed a **stubbed AI response that missed the crisis entirely** (`LOW`/`handle_now`/`safeguarding=false`) — the real pattern-detector still escalated and created a real, unclaimed, non-resolved Case.

**Result**: PASS

## Ownership

**Requirement**: Student B must not be able to use Student A's `conversationId`.

**Test**: real HTTP — Student A creates a conversation; Student B's `POST /api/chat` supplies that same `conversationId`.

**Evidence**: HTTP 403; message count for the conversation stayed at 2 (Student B's attempt appended nothing).

**Result**: PASS

## Case creation, idempotency, safety monotonicity, status protection

| Check | Evidence | Result |
|---|---|---|
| `HANDLE_NOW`/`ASK_CLARIFYING` never create a Case | direct DB check after a non-escalating decision | PASS |
| Repeated escalation of the same conversation → exactly one Case | `ensureEscalationCase` called twice, same `id` returned, `count()=1` | PASS |
| `HIGH`+`safeguarding=true` never downgraded by a later weaker decision | a `LOW`/`safeguarding=false` decision applied afterward left the case at `CRITICAL`/`true` | PASS |
| Student text cannot resolve a Case | literal injection text run through an escalated case's conversation; `status` never became `RESOLVED` | PASS |

## Staff workflow

- `/staff` (via `listCases`) returns real Cases (`totalCount ≥ 3`, the permanent seeded set). PASS
- `/staff/cases/[id]` (via `getCaseDetail`) resolves student + conversation + case together for a real case. PASS
- **Static check**: `lib/db/staffCases.ts`'s source was read and confirmed to contain no import from `lib/ai/` and no reference to "groq" — the dashboard cannot call the AI provider by construction, not just by observation of one run. PASS

## Atomic + concurrent claim

**Requirement**: two staff claiming the same case → exactly one winner; extend to a real concurrency stress test.

**Test**: 10 concurrent `claimCase()` calls against one fresh case, alternating between the 2 real seeded staff members (only 2 exist — reused across the 10 calls; the property under test is request concurrency, not identity count).

**Evidence**: exactly 1 of 10 succeeded; final row: `claimedById` set, `status=IN_PROGRESS`.

**Result**: PASS

## No secret leakage

**Test**: 5 real HTTP requests designed to trigger error paths (malformed JSON, invalid email, non-existent case claim, non-existent case detail page, oversized message) — every response body scanned for connection-string patterns, `DATABASE_URL`/`GROQ_API_KEY`/`STAFF_DEV_ID` variable names, raw Groq key prefixes, Prisma error class names, and stack-trace patterns.

**Evidence**: zero matches across all 5 responses.

**Result**: PASS

## Data integrity

Direct SQL anti-join / grouping queries against the live database:

| Check | Result |
|---|---|
| Duplicate `Case` per `Conversation` | 0 found |
| Orphan `Case` (no matching `Conversation`) | 0 found |
| Orphan `Message` (no matching `Conversation`) | 0 found |
| Orphan `TriageResult` (no matching `Message`) | 0 found |
| `Case.claimedById` with no matching `Staff` | 0 found |
| Duplicate `Student` email | 0 found |
| Duplicate `Staff` email | 0 found |
| Invalid `CaseStatus` value rejected by the database | confirmed rejected |

**Result**: PASS

## Pagination and N+1

- Two pages (`pageSize=2`) fetched — zero overlapping case ids between them. PASS
- Real Prisma query-event counter attached around one `listCases({pageSize: 50})` call — **5 SQL queries** for the whole page, regardless of row count (not one query per row). PASS

## Scale — 50 organisations / 10,000 conversations a day

**See the dedicated write-up below — this is not a simple pass/fail.**

### What actually exists in the schema

There is **no `Organization` or `Employee` entity** in `prisma/schema.prisma`. The closest analogues are `Student` (the chat-facing user) and `Staff` (the case-handling user) — neither carries an organisation/tenant reference. This system is single-tenant today. This is not new information invented for this phase — it was already stated plainly in `docs/database.md`'s "Future multi-tenant direction" section back in Phase 2.

### What was measured

A temporary, non-permanent fixture: **500 synthetic `Student`+`Conversation`+`Case` rows**, bulk-inserted via `createMany`, with `category`/`urgency`/`safeguarding` cycled across all real enum values (not 500 identical rows). Total `Case` table size during the probe: 513 (3 permanent + 500 temporary). Measured with a real Prisma query-event counter and wall-clock timing, then **all 500 rows deleted before the script exits** — confirmed via a post-cleanup count matching pre-probe levels.

Results from this run (**observed in this local/Neon test run — not a production capacity guarantee**):

| Operation | Time | SQL queries |
|---|---|---|
| `listCases({filter:'all', pageSize:20})` | 882ms | 5 |
| `listCases({filter:'critical', pageSize:20})` | 848ms | 5 |
| `listCases({filter:'safeguarding', pageSize:20})` | 849ms | 5 |
| `getCaseMetrics()` (4 COUNT queries) | 3213ms | 4 |
| `getCaseDetail()` on one case | 1103ms | 6 |
| `claimCase()` on one case | 274ms | 1 |

The `getCaseMetrics()` timing (3.2s for 4 simple `COUNT` queries) is an outlier relative to the others and is most plausibly Neon connection/cold-start latency variance in this particular run rather than a query-design issue — each individual `COUNT` is a single indexed aggregate, not a scan. Flagging this rather than explaining it away: it would be worth re-measuring across several runs before drawing a conclusion either way.

### Which queries this touches, and which indexes support them

`listCases` filters on `status`/`urgency`/`safeguarding`/`claimedById` (each already indexed since Phase 2) and orders by `urgency DESC, safeguarding DESC, createdAt DESC` (all three indexed individually; see `docs/database.md` and the Phase 9 report for why Postgres's native enum ordering makes the `urgency` sort correct without a `CASE` expression). `getCaseMetrics` is 4 `COUNT` queries against the same indexed columns. `getCaseDetail` and `claimCase` both operate by primary key — genuinely O(1) regardless of table size, which the near-flat `claimCase` timing (274ms, 1 query) is consistent with.

### What this demonstrates vs. what remains unproven

**Demonstrated**: the queue, filter, metrics, detail, and claim operations are bounded-query (not N+1) and indexed at 513 cases — meaningfully above the 3 seeded rows, confirmed by direct measurement, not assumption.

**Not demonstrated, and explicitly not claimed**:
- Multi-tenant behavior — there is no tenant/organisation scoping to test, because it doesn't exist.
- Behavior at literal 10,000+ case scale, or under real concurrent multi-user load (10 concurrent claims were tested; 10,000 concurrent *users* were not).
- Any AI-provider throughput/rate-limit behavior at scale (Groq's own limits are outside this system's control).
- Query performance under Neon's actual production connection pooling/plan, as opposed to this development database.

If real multi-tenancy were required, the concrete schema change (not implemented here, per the instructions against inventing tables the brief doesn't require) would be an `Organization` model plus an `organizationId` foreign key on `Student` and `Staff`, with every `Case`-queue query gaining an additional `WHERE organizationId = ...` clause backed by a composite index — a natural, incremental extension of the existing filter/index pattern, not a redesign.

## Production privacy statement

Narrative-only requirement (auth, encryption, retention, audit logs for real student data) — no probe applies; not attempted in this phase. Listed in the matrix for completeness.

## End-to-end

**Requirement**: prove every layer — Student → Conversation → Message → AI triage → Safety engine → TriageResult → Case → Staff dashboard → Staff claim → claimed — using actual database records, not assumptions.

**Evidence, captured live from this run** (row ids are opaque `cuid()`s, not sensitive):

```
1. Student record persisted
2. Conversation persisted (confirmed studentId matches)
3. Message persisted (content confirmed to match exactly what was sent)
4-5. TriageResult persisted, confirmed to contain both "ai" and "safetyEngine" keys
6. Case created (confirmed safeguarding=true)
7. Case visible via listCases() (the same function /staff itself calls)
8. getCaseDetail() confirmed to resolve the correct student
9. Staff claim succeeded (Priya Shah)
10. Final row confirms claimedById + status=IN_PROGRESS
```

**Result**: PASS
