/**
 * ⚠️ PHASE 5 TEMPORARY DEV PREVIEW — NOT THE REAL ASSISTANT REPLY.
 *
 * Formats the validated triage result as readable text so the chat UI has
 * something to show while knowledge retrieval and grounded response
 * generation (Phase 7) don't exist yet. This performs no lookups and gives
 * no advice — it only reports what the triage step decided.
 *
 * Delete this once Phase 7 generates real, knowledge-grounded responses.
 */
import type { TriageOutput } from "../validation/triage.ts";

const CATEGORY_LABELS: Record<TriageOutput["category"], string> = {
  academic: "academic",
  financial: "financial",
  visa_immigration: "visa/immigration",
  housing: "housing",
  health_wellbeing: "health & wellbeing",
  other: "other",
};

export function formatDevTriagePreview(triage: TriageOutput): string {
  return (
    `[Dev preview — Phase 5] Your message has been triaged: category ${CATEGORY_LABELS[triage.category]}, ` +
    `urgency ${triage.urgency}, disposition ${triage.disposition.replace("_", " ")}. ` +
    `A grounded, knowledge-based reply will be added in a later phase.`
  );
}
