import { Category, Disposition, Urgency } from "../../generated/prisma/client.ts";
import type { ValidatedTriage } from "../validation/triageMapping.ts";
import {
  detectCrisisSafeguarding,
  detectImmediateDanger,
  detectIndividualImmigrationCircumstance,
} from "./patterns.ts";
import { EMERGENCY_SUPPORT, type EmergencySupport, type SafetyFlag } from "./types.ts";

/**
 * SERVER-ONLY. The deterministic, application-owned safety and business
 * rule engine — the actual authority over urgency/safeguarding/disposition.
 * AI triage (lib/ai/triage.ts) is only ever a recommendation into this
 * function; nothing downstream should treat AI output as final without
 * having passed through here first.
 *
 * Pure and side-effect-free: no AI calls, no HTTP objects, no database
 * access. `triage` is `null` when the AI failed or its output failed
 * validation — this function still runs its own pattern checks against the
 * raw message in that case, so a safety signal can be caught even with no
 * usable AI recommendation at all (Rule 8 — when in doubt, escalate).
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

  // --- Baseline: the AI's own recommendation, or a conservative default
  // when there is nothing usable to build on. Rule 8: an unusable AI result
  // is itself a "when in doubt" situation, so the default already escalates
  // rather than guessing at a routine classification.
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

  // --- Rule 5 — AI inconsistency: safeguarding=true can never coexist with
  // HANDLE_NOW. Fix this before layering independent pattern checks on top.
  if (safeguarding && disposition === Disposition.HANDLE_NOW) {
    disposition = Disposition.ESCALATE;
    safetyFlags.push("ai_inconsistency_corrected");
    reasons.push(
      "AI marked safeguarding=true but disposition=handle_now, which is not a coherent combination — corrected to escalate."
    );
  }

  // --- Rule 2 / Rule 4 — crisis/safeguarding pattern check, run against the
  // raw message UNCONDITIONALLY (not gated on the AI's chosen category) so a
  // financial- or academic-labelled message can't hide a safeguarding issue.
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

  // --- Rule 3 — individual immigration/visa circumstances. Unlike the
  // crisis check, a positive match here IS the category by definition, so
  // it's corrected too, not just the disposition.
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

  // --- Rule 1 — immediate danger. Highest priority: forces the strongest
  // possible values, which by construction nothing above or below this can
  // weaken (urgency is already at its ceiling, safeguarding/escalate are
  // boolean/enum "on" states). Bypasses clarification entirely.
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

  // --- Final invariant, enforced structurally rather than trusted per-rule:
  // safeguarding=true must always mean escalate. (Every branch above that
  // sets safeguarding=true already sets disposition=ESCALATE too, but this
  // is the last line of defense against a future rule forgetting to.)
  if (safeguarding && disposition !== Disposition.ESCALATE) {
    disposition = Disposition.ESCALATE;
    if (!safetyFlags.includes("ai_inconsistency_corrected")) {
      safetyFlags.push("ai_inconsistency_corrected");
    }
    reasons.push("Invariant enforced: safeguarding=true must always result in escalation.");
  }

  // --- Rule 7 — vague requests / clarification. No special handling
  // needed beyond what's already true: if no safety rule fired above, the
  // AI's own ASK_CLARIFYING recommendation (part of the baseline) simply
  // stands untouched. Student text is never interpreted as an instruction
  // to change this (Rule 6) — every decision above comes only from regex
  // pattern matches against message content and the AI's *validated*
  // structured fields, never from free-text "instructions" in the message.

  const overriddenAi =
    !triage ||
    category !== triage.category ||
    urgency !== triage.urgency ||
    safeguarding !== triage.safeguarding ||
    disposition !== triage.disposition;

  return { category, urgency, safeguarding, disposition, reasons, safetyFlags, emergencySupport, overriddenAi };
}
