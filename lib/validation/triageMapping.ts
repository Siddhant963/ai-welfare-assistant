import { Category, CaseStatus, Disposition, Urgency } from "../../generated/prisma/client.ts";
import type { TriageOutput } from "./triage.ts";

/**
 * SERVER-ONLY. Depends on the Prisma generated client, so this must never be
 * imported from client-bundled code (see lib/validation/triage.ts, which is
 * the client-safe half of this contract).
 */
export interface ValidatedTriage {
  category: Category;
  urgency: Urgency;
  safeguarding: boolean;
  disposition: Disposition;
  reason: string;
}

const CATEGORY_MAP: Record<TriageOutput["category"], Category> = {
  academic: Category.ACADEMIC,
  financial: Category.FINANCIAL,
  visa_immigration: Category.VISA_IMMIGRATION,
  housing: Category.HOUSING,
  health_wellbeing: Category.HEALTH_WELLBEING,
  other: Category.OTHER,
};

const URGENCY_MAP: Record<TriageOutput["urgency"], Urgency> = {
  low: Urgency.LOW,
  medium: Urgency.MEDIUM,
  high: Urgency.HIGH,
  critical: Urgency.CRITICAL,
};

const DISPOSITION_MAP: Record<TriageOutput["disposition"], Disposition> = {
  handle_now: Disposition.HANDLE_NOW,
  ask_clarifying: Disposition.ASK_CLARIFYING,
  escalate: Disposition.ESCALATE,
};

export function toValidatedTriage(output: TriageOutput): ValidatedTriage {
  return {
    category: CATEGORY_MAP[output.category],
    urgency: URGENCY_MAP[output.urgency],
    safeguarding: output.safeguarding,
    disposition: DISPOSITION_MAP[output.disposition],
    reason: output.reason,
  };
}

function invert<K extends string, V extends string>(map: Record<K, V>): Record<V, K> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k])) as Record<V, K>;
}

const CATEGORY_TO_WIRE = invert(CATEGORY_MAP);
const URGENCY_TO_WIRE = invert(URGENCY_MAP);
const DISPOSITION_TO_WIRE = invert(DISPOSITION_MAP);

/** Inverse of toValidatedTriage — Prisma's UPPER_SNAKE enums back to the wire tokens. */
export function fromValidatedTriage(data: ValidatedTriage): TriageOutput {
  return {
    category: CATEGORY_TO_WIRE[data.category],
    urgency: URGENCY_TO_WIRE[data.urgency],
    safeguarding: data.safeguarding,
    disposition: DISPOSITION_TO_WIRE[data.disposition],
    reason: data.reason,
  };
}

// Individual field mappers — used for the safety engine's FinalDecision,
// whose shape (reasons[]/safetyFlags/emergencySupport) doesn't match
// ValidatedTriage closely enough to reuse fromValidatedTriage wholesale.
export const categoryToWire = (category: Category) => CATEGORY_TO_WIRE[category];
export const urgencyToWire = (urgency: Urgency) => URGENCY_TO_WIRE[urgency];
export const dispositionToWire = (disposition: Disposition) => DISPOSITION_TO_WIRE[disposition];

const CASE_STATUS_MAP: Record<"new" | "in_progress" | "resolved", CaseStatus> = {
  new: CaseStatus.NEW,
  in_progress: CaseStatus.IN_PROGRESS,
  resolved: CaseStatus.RESOLVED,
};
const CASE_STATUS_TO_WIRE = invert(CASE_STATUS_MAP);
export const caseStatusToWire = (status: CaseStatus) => CASE_STATUS_TO_WIRE[status];
