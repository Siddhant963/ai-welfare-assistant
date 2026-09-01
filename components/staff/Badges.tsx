import type { CaseStatus, Urgency } from "../../generated/prisma/client.ts";

const BADGE_BASE = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

const URGENCY_STYLES: Record<Urgency, string> = {
  CRITICAL: "bg-red-100 text-red-800",
  HIGH: "bg-amber-100 text-amber-900",
  MEDIUM: "bg-blue-50 text-blue-800",
  LOW: "bg-neutral-100 text-neutral-700",
};

const URGENCY_LABELS: Record<Urgency, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

/** Text label is the primary signal; color is a secondary enhancement only. */
export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return <span className={`${BADGE_BASE} ${URGENCY_STYLES[urgency]}`}>{URGENCY_LABELS[urgency]}</span>;
}

export function SafeguardingBadge() {
  return <span className={`${BADGE_BASE} bg-purple-100 text-purple-900`}>Safeguarding concern</span>;
}

const STATUS_STYLES: Record<CaseStatus, string> = {
  NEW: "bg-neutral-100 text-neutral-700",
  IN_PROGRESS: "bg-indigo-100 text-indigo-800",
  RESOLVED: "bg-green-100 text-green-800",
};

const STATUS_LABELS: Record<CaseStatus, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  return <span className={`${BADGE_BASE} ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}

/** Read-only display — Phase 9 has no claim mutation, see lib/db/claimCase.ts (unchanged). */
export function ClaimBadge({ claimedByName }: { claimedByName: string | null }) {
  if (!claimedByName) {
    return <span className={`${BADGE_BASE} border border-amber-300 bg-amber-50 text-amber-800`}>Unclaimed</span>;
  }
  return <span className={`${BADGE_BASE} bg-neutral-100 text-neutral-700`}>Claimed by {claimedByName}</span>;
}
