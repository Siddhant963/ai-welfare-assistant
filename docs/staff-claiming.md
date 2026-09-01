# Staff case claiming — Phase 10

## 1. Claim architecture

```
Staff → [Claim Case] (components/staff/ClaimCaseButton.tsx, client)
      → POST /api/staff/cases/[id]/claim
      → getCurrentStaff()               (server-side identity — see §3)
      → claimCase(caseId, staffId)      (lib/db/claimCase.ts, UNCHANGED since Phase 2)
      → single atomic conditional UPDATE
      → response → router.refresh()     (re-renders the Server Component from real DB state)
```

The click handler never decides anything — it only triggers the request and re-renders from whatever the server reports.

## 2. API endpoint

`POST /api/staff/cases/[id]/claim` (`app/api/staff/cases/[id]/claim/route.ts`). The `id` route param is checked for shape only (non-empty, ≤50 chars — Prisma's `cuid()` ids are ~25 chars; this is a sanity bound, not a UUID format check, since these are not UUIDs). Everything else — does the case exist, is it already claimed, who is claiming it — is decided server-side.

Response shapes:

| Situation | HTTP | Body |
|---|---|---|
| Fresh claim succeeds | 200 | `{ status: "claimed", case: {...} }` |
| Same staff re-claims their own case | 200 | `{ status: "already_claimed", sameStaff: true, case: {...} }` |
| Different staff hits an already-claimed case | 409 | `{ status: "already_claimed", sameStaff: false, case: {...} }` |
| No staff identity available | 401 | `{ error: "..." }` |
| Case doesn't exist | 404 | `{ error: "Case not found." }` |
| Unexpected server error | 500 | `{ error: "Something went wrong. Please try again." }` (never a Prisma message or stack trace — logged server-side only) |

`case` in every success/conflict body is `{ id, status, urgency, safeguarding, claimedById, claimedByName }` — never raw database internals beyond the id, never staff email or other personal data beyond a display name.

## 3. Staff identity mechanism

`lib/staff/currentStaff.ts`'s `getCurrentStaff()` reads a server-only env var, `STAFF_DEV_ID`, and looks up the matching row in the real seeded `Staff` table. If unset, or set to an id that doesn't exist, it returns `null` and the claim endpoint responds `401`.

**This is explicitly not authentication.** There is no login, no session, no request credential of any kind — it is a fixed server-side configuration value standing in for "whoever is using this dev environment," so the claim workflow has *someone* real to attribute claims to while a real authenticated-session identity layer doesn't exist yet.

## 4. Why a client-provided `staffId` is never trusted

The browser identifies only **which case** to claim (via the URL path). It never supplies who is claiming it. If the endpoint accepted `{ claimedById: "..." }` from the request body, any client could claim any case as any staff member — there is no way to distinguish a legitimate claim from an attacker (or a bug) impersonating someone else. `getCurrentStaff()` is the only source of staff identity the endpoint ever consults, and it reads from server-side configuration, never from anything the request carries.

## 5. Atomic claim behavior

`lib/db/claimCase.ts` is **unmodified from Phase 2** (inspected, not rewritten — the only genuine defect-check performed was confirming its existing behavior still matches what this phase needs, and it does). It performs a single conditional `UPDATE ... WHERE id = $1 AND "claimedById" IS NULL`, translated by Prisma from `case.updateMany({ where: { id, claimedById: null }, data: {...} })`. There is no separate read-then-write — the database's own row-level locking during the `UPDATE` is what guarantees only one concurrent caller can ever affect the row. This is the deliberate reason the helper uses `updateMany` (which reports an affected-row count) instead of `update` (which would either succeed or throw, with no clean way to distinguish "already claimed" from "doesn't exist" without a race-prone prior read).

The helper already sets `status: IN_PROGRESS` and `claimedAt: now()` as part of the same atomic update — this was already correct Phase 2 behavior, not something added in Phase 10 (see §9).

## 6. Race-condition handling

Verified directly against the real Neon database, not just asserted: `scripts/verify-claim.ts` TEST 4/5 fire two real concurrent `claimCase()` calls at the same fresh case using the two real seeded staff members, confirm exactly one reports `claimed: true`, then re-read the row from the database and confirm `claimedById` equals exactly that winner — never both, never neither, never overwritten afterward.

## 7. Repeated claim behavior

If the *same* staff member calls claim again on a case they already own, `claimCase()` reports `already_claimed` (it doesn't distinguish "you" from "someone else" — that distinction doesn't belong in the atomic primitive). The **API route** makes that distinction itself, by comparing the case's current `claimedById` to the requesting staff's id after the atomic call reports `already_claimed`: same staff → `sameStaff: true`, HTTP 200 (idempotent — nothing changed, nothing needed to). No duplicate write ever happens; the atomic `UPDATE`'s `WHERE claimedById IS NULL` clause means a second call against an already-claimed row simply updates zero rows.

## 8. Conflict behavior

A *different* staff member's claim attempt on an already-claimed case: `claimCase()` reports `already_claimed`, the route computes `sameStaff: false`, and responds **409 Conflict** — the correct HTTP semantics for "the resource's current state prevents this action." The row is never touched by the loser's request. The UI shows "This case was already claimed by another staff member," then refreshes so the page reflects who actually owns it — it never says "claim successful" to the loser.

## 9. Case status behavior

**No new behavior was added.** The existing Phase 2 helper already transitions `NEW → IN_PROGRESS` as part of the atomic claim update, which is semantically correct (a claimed case is, by definition, being worked on) and was already schema-supported. Phase 10 did not touch this — it was inspected and confirmed correct, not modified. Claiming never touches `urgency`, `safeguarding`, `category`, or `conversationId` — the atomic update's `data` clause only ever contains `claimedById`, `claimedAt`, and `status`, and both this phase's tests (TEST 7/8) and Phase 9's design already keep the safety state and case-vs-conversation-vs-student relationships fully separate from the claim mechanism.

## 10. Authentication limitation

**Staff authentication is deferred; the claim endpoint currently uses a development identity mechanism (`STAFF_DEV_ID`) and must be replaced with real authenticated session identity before any production use.** There is no login page, no password, no session cookie, and no per-request credential check anywhere in this system. Anyone who can reach `/staff` can claim any case as whichever staff member `STAFF_DEV_ID` happens to point to in that deployment's environment — this is acceptable only because `/staff` itself is already documented (Phase 9) as unauthenticated and not production-ready.

## 11. Production requirements before deployment

Before this claim workflow is exposed to real staff:

- Replace `getCurrentStaff()`'s env-var lookup with a real session-derived identity (e.g., an authenticated cookie/JWT resolved to a `Staff` row), without changing its `Promise<Staff | null>` contract — every caller already handles `null` correctly.
- Add actual login/logout and session management to `/staff` (Phase 9 already documented this gap; Phase 10 does not change it).
- Consider whether claim actions should be audit-logged (who claimed what, when) beyond the existing `claimedAt` timestamp.
- Reconsider rate limiting / abuse protection on the claim endpoint once it's reachable by real, distinguishable users rather than a single dev identity.
