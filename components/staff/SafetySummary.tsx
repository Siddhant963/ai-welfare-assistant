import type { CaseDetailTriageResult } from "../../lib/db/staffCases.ts";
import { parseTriageAudit, type AiRecommendationView } from "../../lib/staff/parseTriageAudit.ts";
import { CATEGORY_LABELS, formatDateTime } from "../../lib/staff/labels.ts";
import { SafeguardingBadge, UrgencyBadge } from "./Badges.tsx";
import type { Urgency } from "../../generated/prisma/client.ts";

const WIRE_TO_URGENCY: Record<string, Urgency> = { low: "LOW", medium: "MEDIUM", high: "HIGH", critical: "CRITICAL" };

function formatAiLine(ai: AiRecommendationView | null): string {
  if (!ai) return "No AI recommendation recorded for this attempt.";
  if (ai.failed) {
    return `AI unavailable (${ai.stage ?? "unknown reason"}${ai.message ? `: ${ai.message}` : ""}).`;
  }
  const parts = [ai.category, ai.urgency, `safeguarding=${ai.safeguarding ?? false}`, ai.disposition].filter(
    (p): p is string => typeof p === "string"
  );
  return parts.length > 0 ? parts.join(" / ") : "AI output did not match the expected shape.";
}

/** One TriageResult: the AI's original (unvalidated) recommendation shown distinctly from the safety engine's final decision. */
export function SafetySummary({ triage }: { triage: CaseDetailTriageResult }) {
  const { ai, safetyEngine } = parseTriageAudit(triage.rawOutput);
  const aiUrgency = ai?.urgency ? WIRE_TO_URGENCY[ai.urgency] : undefined;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <time dateTime={triage.createdAt.toISOString()} className="text-xs font-medium text-neutral-500">
          {formatDateTime(triage.createdAt)}
        </time>
        {safetyEngine?.overriddenAi && (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
            Safety engine corrected the AI
          </span>
        )}
      </div>

      <div className="mt-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Final decision (application-owned)</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-neutral-900">{CATEGORY_LABELS[triage.category]}</span>
          <UrgencyBadge urgency={triage.urgency} />
          {triage.safeguarding && <SafeguardingBadge />}
          <span className="text-sm capitalize text-neutral-600">{triage.disposition.replace("_", " ").toLowerCase()}</span>
        </div>
      </div>

      <div className="mt-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">AI recommendation (unvalidated)</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {aiUrgency && <UrgencyBadge urgency={aiUrgency} />}
          <span className="text-sm text-neutral-600">{formatAiLine(ai)}</span>
        </div>
      </div>

      {safetyEngine && safetyEngine.safetyFlags.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Safety flags</p>
          <p className="mt-1 text-sm text-neutral-600">{safetyEngine.safetyFlags.join(", ")}</p>
        </div>
      )}

      {triage.reason && (
        <div className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Reason</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{triage.reason}</p>
        </div>
      )}
    </div>
  );
}
