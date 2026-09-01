# Assessment requirement matrix

Source: the original project brief given at the start of this engagement (Phase 1). Wording below is quoted or closely paraphrased from that brief, not reinterpreted. Where a requirement is not provable by the current implementation, this is stated explicitly rather than marked as passing.

Verification legend: **HTTP** = real request against a running build; **DB** = direct Neon query after the action; **Direct** = calling the real library function (no HTTP layer) — used only where the brief allows ("deterministic safety tests, direct function tests are acceptable") or where no HTTP surface exists for the behavior (e.g. queue ordering).

## 1. Core pipeline architecture

| Requirement | Implementation | Verification | Result |
|---|---|---|---|
| "Student message → AI triage → Schema validation → Deterministic application safety/business rules → Final decision" | `app/api/chat/route.ts` calls `runTriage` → Zod (`TriageOutputSchema`) → `evaluateSafety` in that order | Code inspection + every scenario test below exercises the full chain | PASS |
| "AI is a recommendation layer. Our backend/application is the authority." | `evaluateSafety` (`lib/safety/rules.ts`) never trusts AI fields directly; `FinalDecision` is what's persisted/returned | `scripts/verify-safety.ts` TEST 9/10 (AI inconsistency, immigration AI error) | PASS |
| Persist conversations, messages, triage results, generated replies in PostgreSQL | `Student`/`Conversation`/`Message`/`TriageResult` (Prisma) | `scripts/verify-db.ts`, `scripts/verify-assessment.ts` end-to-end scenario | PASS |

## 2. Critical safety rules

| Rule (brief's wording) | Implementation | Verification | Result |
|---|---|---|---|
| RULE 1 — Crisis: case not auto-closed, must reach a real person | `evaluateSafety` crisis pattern → `safeguarding=true`, `ESCALATE`; `ensureEscalationCase` never writes `status` | `verify-safety.ts` TEST 4, `verify-escalation.ts` TEST 9, `verify-assessment.ts` crisis scenario | PASS |
| RULE 2 — Immediate danger: surface 999 + Samaritans 116 123, escalate immediately, no clarification first | `detectImmediateDanger` → `CRITICAL`/`ESCALATE`/`emergencySupport`; `lib/ai/reply.ts` short-circuits before any retrieval/AI call | `verify-safety.ts` TEST 5, `verify-knowledge.ts` TEST 5 | PASS |
| RULE 3 — Immigration: no individual advice; escalate individual circumstances; may point to GOV.UK | `detectIndividualImmigrationCircumstance` forces `VISA_IMMIGRATION`/`ESCALATE`; escalation prompt forbids individual conclusions; Student Visa KB resource carries the real GOV.UK URL | `verify-safety.ts` TEST 3/10, `verify-knowledge.ts` TEST 3, `verify-assessment.ts` immigration scenario | PASS |
| RULE 4 — Vague requests: ask a short clarifying question, then re-triage | `ASK_CLARIFYING` stands when no safety signal fires; deterministic clarifying template, no AI/retrieval call | `verify-safety.ts` TEST 6, `verify-knowledge.ts` TEST 6, `verify-assessment.ts` clarification scenario (incl. follow-up escalation) | PASS |
| RULE 5 — When in doubt, escalate | AI failure / invalid output defaults to `ESCALATE` in `evaluateSafety`, not a guessed classification | `verify-safety.ts` "AI failure" checks, `verify-assessment.ts` AI-failure section | PASS |
| RULE 6 — Knowledge base only; no invented facts/URLs/policies; escalate if KB can't answer | `lib/knowledge/retrieve.ts` + grounded-response prompts forbid outside knowledge; empty retrieval → deterministic fallback, **no AI call** | `verify-knowledge.ts` TEST 2/7/8/10 | PASS |
| RULE 7 — Prompt injection: student text cannot change urgency/safeguarding/disposition/status/priority | Student text only ever reaches the `user` role, delimited; `FinalDecision` has no field student text can set directly; `Case.status` is never written by the chat pipeline | `verify-safety.ts` TEST 7a/7b, `verify-escalation.ts` TEST 9, `scripts/probe.ts` Probe 1, `verify-assessment.ts` injection section | PASS |

## 3. Knowledge base (13 resources)

| Requirement | Implementation | Verification | Result |
|---|---|---|---|
| All 13 listed resources present, exact URLs/numbers preserved | `prisma/seed.ts` — verified against the live DB, not re-typed from memory | `verify-knowledge.ts` (real DB), spot-checked in Phase 7 report | PASS |
| "Synthesize... rather than paste source text" | Response-generation prompts instruct paraphrase-and-cite, not verbatim reproduction | Manual inspection of real generated answers (Phase 7 report examples) | PASS (not exhaustively automatable — see Known Limitations) |

## 4. Three behaviors (HANDLE NOW / CLARIFY / ESCALATE)

| Flow | Implementation | Verification | Result |
|---|---|---|---|
| HANDLE_NOW: triage → validation → safety → retrieval → grounded answer → save → return | `lib/ai/reply.ts` `buildReply` handle_now branch | `verify-knowledge.ts` TEST 1/2, `verify-assessment.ts` academic/financial scenarios | PASS |
| CLARIFY: ask → student answers → re-triage → handle or escalate | `ASK_CLARIFYING` deterministic template; a follow-up message in the same conversation re-runs the full pipeline independently | `verify-assessment.ts` clarification scenario (two-turn) | PASS |
| ESCALATE: safety/business rules → create case → summary → notify student → staff dashboard | `ensureEscalationCase` (Phase 8) + `buildReply` escalation branch + `/staff` (Phase 9) | `verify-escalation.ts`, `verify-staff-dashboard.ts`, `verify-assessment.ts` end-to-end | PASS |

## 5. Database model

| Requirement | Implementation | Verification | Result |
|---|---|---|---|
| students, conversations, messages, triage_results, cases, staff, knowledge_resources | `prisma/schema.prisma` — `Student`, `Conversation`, `Message`, `TriageResult`, `Case`, `Staff`, `KnowledgeResource` | `scripts/verify-db.ts` | PASS |
| Student 1:N Conversation 1:N Message 1:1(→1:N, see below) TriageResult | Schema relations | `verify-db.ts` | PASS |
| Conversation 0:1 Case N:1 Staff | `Case.conversationId @unique`, `Case.claimedBy → Staff` optional | `verify-db.ts`, `verify-escalation.ts` | PASS |
| **Deliberate deviation, documented in Phase 2**: TriageResult is 1:N per Message, not 1:1 — needed for re-triage/clarification history and for keeping every triage *attempt* (AI-only vs safety-engine-corrected) auditable | `docs/database.md` | `verify-db.ts` "Message → multiple TriageResults" | Documented deviation, not a gap |

## 6. Case claiming / concurrency

| Requirement (brief's wording) | Implementation | Verification | Result |
|---|---|---|---|
| "Two staff members must NEVER successfully claim the same case... database-safe atomic operation" | `lib/db/claimCase.ts` — single conditional `UPDATE ... WHERE claimedById IS NULL` (Phase 2, unmodified since) | `verify-db.ts`, `verify-claim.ts` TEST 4/5, `verify-assessment.ts` 10-way concurrent probe | PASS |

## 7. Staff dashboard

| Requirement | Implementation | Verification | Result |
|---|---|---|---|
| View escalated cases, priority, safeguarding status, full conversation | `/staff`, `/staff/cases/[id]` (Phase 9) | `verify-staff-dashboard.ts` | PASS |
| Claim a case safely under concurrency | `ClaimCaseButton` → `POST /api/staff/cases/[id]/claim` → `claimCase` (Phase 10) | `verify-claim.ts`, HTTP smoke test (Phase 10 report) | PASS |
| "Safeguarding and high-priority cases must be visually obvious" | Text-labeled badges (not color-only) — `UrgencyBadge`, `SafeguardingBadge` | Code inspection (Phase 9); no automated visual test (no browser tool — see Known Limitations) | PASS (manual/code-level), visual rendering unverified by automation |

## 8. Mandatory probes

| Requirement (brief's exact wording) | Implementation | Verification | Result |
|---|---|---|---|
| `npm run probe` must exist, execute exactly 2 checks, exit non-zero on failure | `scripts/probe.ts` — **created in this phase**; it did not exist under this exact name before | `npm run probe` | PASS (see §Files created) |
| Probe 1 — injection: not resolved, not low priority, instruction not followed | Real DB-backed: stubs a "compliant" AI read, runs it through the real `evaluateSafety` + `ensureEscalationCase`, asserts the persisted `Case` is never downgraded/resolved | `scripts/probe.ts` | PASS |
| Probe 2 — crisis: escalated to human, not auto-closed | Stubs an under-reading AI, confirms the real pattern-detector still escalates and a real `Case` is created and never auto-resolved | `scripts/probe.ts` | PASS |
| "may use a real model or recorded/stubbed response... must exercise our validation and house-rule logic" | Stubbed AI input, **real** `evaluateSafety`/`ensureEscalationCase`/database write — explicitly permitted by the brief | — | PASS |

## 9. Scalability statement

> "If this served 50 organisations and 10,000 conversations a day, what in your design would you change?"

This is answered narratively (README, not yet written — deferred to a later phase) plus the concrete probe below. See `docs/assessment-evidence.md` §Scale for the full honest breakdown: **Organisation and Employee are not entities in the current schema** — there is no multi-tenancy. The probe demonstrates that the *existing* queries (case queue, filtering, pagination, metrics, claim) stay bounded-query and indexed at a synthetic scale well above the seeded 3 cases, using temporary fixtures that are fully deleted afterward. It does not, and cannot, demonstrate multi-tenant behavior that doesn't exist yet.

## 10. Production privacy statement

> What would change for real student personal and welfare data (auth, encryption, retention, audit logs, etc.)

Narrative-only requirement (README, deferred). Not a testable assertion — no probe applies. Listed here for completeness so it isn't silently dropped from the requirement inventory.

## 11. Explicitly out of scope for this phase (per Phase 11's own instructions)

- Full README scalability/privacy write-up (a later phase's deliverable; the *architecture* answers are demonstrated here, the *document* is not written in Phase 11).
- Vercel deployment.
- Production authentication (staff or student).
