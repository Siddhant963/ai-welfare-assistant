import { prisma } from "./client.ts";
import { CaseStatus, Prisma, Urgency } from "../../generated/prisma/client.ts";
import type { Case } from "../../generated/prisma/client.ts";
import type { FinalDecision } from "../safety/rules.ts";

/**
 * SERVER-ONLY. Turns an ESCALATE FinalDecision into the operational staff
 * workflow record. Never calls the AI — everything here comes from the
 * already-validated, already-safety-checked decision the caller supplies.
 *
 * TriageResult (see lib/db/chatRecords.ts) stays the audit answer to
 * "what did the AI/safety engine decide, and why" — every attempt, kept
 * forever. Case answers a different question, "what currently needs a
 * human," and there is at most one per conversation (enforced by the
 * existing @unique constraint on Case.conversationId — not redesigned
 * here). This module keeps that separation: it only ever reads
 * category/urgency/safeguarding off FinalDecision, never duplicates
 * TriageResult's rawOutput/reasons audit trail into Case.
 */

const URGENCY_ORDER: Urgency[] = [Urgency.LOW, Urgency.MEDIUM, Urgency.HIGH, Urgency.CRITICAL];

function isStrongerUrgency(candidate: Urgency, current: Urgency): boolean {
  return URGENCY_ORDER.indexOf(candidate) > URGENCY_ORDER.indexOf(current);
}

const SUMMARY_SNIPPET_LENGTH = 200;

function buildCaseSummary(decision: FinalDecision, message: string): string {
  const why =
    decision.reasons.length > 0
      ? decision.reasons.join(" ")
      : `Escalated based on triage: category ${decision.category}, urgency ${decision.urgency}` +
        `${decision.safeguarding ? ", safeguarding concern" : ""}.`;
  const snippet = message.length > SUMMARY_SNIPPET_LENGTH ? `${message.slice(0, SUMMARY_SNIPPET_LENGTH)}…` : message;
  return `${why}\n\nOriginal message: "${snippet}"`;
}

/**
 * Applies the "never downgrade" rule: once a case reflects a stronger
 * safety state, a later, weaker decision can never soften it.
 *   - safeguarding: true can never become false.
 *   - urgency: only ever moves up the LOW→MEDIUM→HIGH→CRITICAL scale.
 *   - category and status are deliberately left untouched here — category
 *     is "why this was first escalated" (changing it later could confuse
 *     a staff member already reviewing it under the original topic), and
 *     status transitions (claim/resolve) belong to staff, never to this
 *     automatic path. See docs note in the Phase 8 report on `summary`
 *     being write-once for the same reason.
 */
function strongestSafetyState(current: Case, decision: FinalDecision) {
  return {
    safeguarding: current.safeguarding || decision.safeguarding,
    urgency: isStrongerUrgency(decision.urgency, current.urgency) ? decision.urgency : current.urgency,
  };
}

export interface EnsureEscalationCaseInput {
  conversationId: string;
  decision: FinalDecision;
  message: string;
}

/**
 * Idempotent: safe to call more than once for the same conversation,
 * including under concurrent/retried requests. The unique constraint on
 * Case.conversationId is the real safety net — a race between two
 * concurrent first-escalations is resolved by letting the database reject
 * the loser's INSERT (P2002) and falling through to read-and-merge the
 * winner's row, rather than trusting a find-then-create check alone.
 */
export async function ensureEscalationCase(input: EnsureEscalationCaseInput): Promise<Case> {
  const { conversationId, decision, message } = input;

  const existing = await prisma.case.findUnique({ where: { conversationId } });

  if (!existing) {
    try {
      return await prisma.case.create({
        data: {
          conversationId,
          summary: buildCaseSummary(decision, message),
          category: decision.category,
          urgency: decision.urgency,
          safeguarding: decision.safeguarding,
          status: CaseStatus.NEW,
          // claimedById intentionally omitted — defaults to null. No
          // automatic staff assignment happens here or anywhere in Phase 8.
        },
      });
    } catch (error) {
      const isUniqueConstraintRace =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isUniqueConstraintRace) throw error;
      // Fall through: another concurrent request won the race and created
      // the case first. Re-read and merge against that row below.
    }
  }

  const current = existing ?? (await prisma.case.findUniqueOrThrow({ where: { conversationId } }));
  const merged = strongestSafetyState(current, decision);

  const needsUpdate = merged.safeguarding !== current.safeguarding || merged.urgency !== current.urgency;
  if (!needsUpdate) {
    return current;
  }

  return prisma.case.update({
    where: { id: current.id },
    data: merged,
  });
}
