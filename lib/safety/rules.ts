import { Category, Disposition, Urgency } from "../../generated/prisma/client.ts";
import type { ValidatedTriage } from "../validation/triageMapping.ts";
import {
  detectCrisisSafeguarding,
  detectImmediateDanger,
  detectIndividualImmigrationCircumstance,
} from "./patterns.ts";
import { EMERGENCY_SUPPORT, type EmergencySupport, type SafetyFlag } from "./types.ts";

/**
 * Deterministic safety/business rules. This is the final authority on
 * urgency, safeguarding and disposition — AI triage is only a
 * recommendation into this function.
 *
 * Pure: no AI calls, no HTTP, no database access. `triage` is `null` when
 * the AI failed or its output failed validation; the pattern checks below
 * still run against the raw message in that case.
 */
export interface SafetyEngineInput {
  message: string;
  triage: ValidatedTriage | null;
  /** Set when triage is null because the AI call/output failed — for the audit trail only. */
  aiFailureReason?: string;
}

export interface FinalDecision {
  category: Category;
  urgency: Urgency;
  safeguarding: boolean;
  disposition: Disposition;
  /** Ordered, human-readable audit trail of why the decision landed here. Not student-facing. */
  reasons: string[];
  safetyFlags: SafetyFlag[];
  emergencySupport: EmergencySupport | null;
  /** True if this differs from what the AI recommended (or the AI had nothing usable to recommend). */
  overriddenAi: boolean;
}

function upgradeUrgency(current: Urgency, floor: Urgency): Urgency {
  const order: Urgency[] = [Urgency.LOW, Urgency.MEDIUM, Urgency.HIGH, Urgency.CRITICAL];
  return order.indexOf(current) >= order.indexOf(floor) ? current : floor;
}

export function evaluateSafety(input: SafetyEngineInput): FinalDecision {
  const { message, triage, aiFailureReason } = input;
  const reasons: string[] = [];
  const safetyFlags: SafetyFlag[] = [];
  let emergencySupport: EmergencySupport | null = null;

  // No usable AI result defaults to escalate rather than a guessed classification.
  let category = triage?.category ?? Category.OTHER;
  let urgency = triage?.urgency ?? Urgency.MEDIUM;
  let safeguarding = triage?.safeguarding ?? false;
  let disposition = triage?.disposition ?? Disposition.ESCALATE;

  if (!triage) {
    safetyFlags.push("ai_unavailable");
    reasons.push(
      `AI triage was unavailable${aiFailureReason ? ` (${aiFailureReason})` : ""}; defaulting to a conservative escalation pending human review.`
    );
  }

  // Rule 5 — safeguarding=true can never coexist with HANDLE_NOW.
  if (safeguarding && disposition === Disposition.HANDLE_NOW) {
    disposition = Disposition.ESCALATE;
    safetyFlags.push("ai_inconsistency_corrected");
    reasons.push(
      "AI marked safeguarding=true but disposition=handle_now, which is not a coherent combination — corrected to escalate."
    );
  }

  // Rule 2/4 — checked regardless of category, so a financial- or
  // academic-labelled message can't hide a safeguarding issue.
  if (detectCrisisSafeguarding(message)) {
    const alreadyFlagged = safeguarding;
    safeguarding = true;
    urgency = upgradeUrgency(urgency, Urgency.HIGH);
    disposition = Disposition.ESCALATE;
    safetyFlags.push("crisis_safeguarding");
    reasons.push(
      alreadyFlagged
        ? "Message content matches a safeguarding/crisis pattern, consistent with the AI's own assessment."
        : "Message content independently matched a safeguarding/crisis pattern that the AI classification did not reflect — category is left as-is since the underlying topic may still be relevant, but safeguarding and escalation are forced regardless."
    );
  }

  // Rule 3 — a match here implies the category, so it's corrected too, not just the disposition.
  if (detectIndividualImmigrationCircumstance(message)) {
    const categoryChanged = category !== Category.VISA_IMMIGRATION;
    category = Category.VISA_IMMIGRATION;
    const dispositionChanged = disposition !== Disposition.ESCALATE;
    disposition = Disposition.ESCALATE;
    safetyFlags.push("individual_immigration");
    reasons.push(
      "Message describes individual visa/immigration circumstances (e.g. expiry, CAS withdrawal, sponsorship change) that require a qualified adviser — the assistant must never give individualised immigration advice." +
        (categoryChanged || dispositionChanged ? " AI recommendation was corrected." : "")
    );
  }

  // Rule 1 — highest priority. Bypasses clarification entirely.
  if (detectImmediateDanger(message)) {
    safeguarding = true;
    urgency = Urgency.CRITICAL;
    disposition = Disposition.ESCALATE;
    safetyFlags.push("immediate_danger");
    reasons.push(
      "Message contains a clear indication of immediate danger to life or safety — escalated immediately, without waiting for clarification."
    );
    emergencySupport = EMERGENCY_SUPPORT;
  }

  // Belt and braces: safeguarding=true must always mean escalate, even if a
  // future rule above forgets to set it.
  if (safeguarding && disposition !== Disposition.ESCALATE) {
    disposition = Disposition.ESCALATE;
    if (!safetyFlags.includes("ai_inconsistency_corrected")) {
      safetyFlags.push("ai_inconsistency_corrected");
    }
    reasons.push("Invariant enforced: safeguarding=true must always result in escalation.");
  }

  // Rule 7 — if nothing above fired, the AI's own ASK_CLARIFYING stands as-is.

  const overriddenAi =
    !triage ||
    category !== triage.category ||
    urgency !== triage.urgency ||
    safeguarding !== triage.safeguarding ||
    disposition !== triage.disposition;

  return { category, urgency, safeguarding, disposition, reasons, safetyFlags, emergencySupport, overriddenAi };
}
