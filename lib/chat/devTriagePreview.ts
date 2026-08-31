/**
 * ⚠️ TEMPORARY DEV PREVIEW — NOT THE REAL ASSISTANT REPLY.
 *
 * Formats the final (safety-engine-corrected) decision as readable text so
 * the chat UI has something to show while knowledge retrieval and grounded
 * response generation (Phase 7) don't exist yet. This performs no lookups
 * and gives no advice — it only reports what the decision was, and surfaces
 * emergency contact numbers verbatim when the server provided them (never
 * invented client-side).
 *
 * Delete this once Phase 7 generates real, knowledge-grounded responses.
 */
import type { ChatResponse } from "../validation/chatResponse.ts";

type Decision = ChatResponse["decision"];

const CATEGORY_LABELS: Record<Decision["category"], string> = {
  academic: "academic",
  financial: "financial",
  visa_immigration: "visa/immigration",
  housing: "housing",
  health_wellbeing: "health & wellbeing",
  other: "other",
};

export function formatDevTriagePreview(decision: Decision): string {
  if (decision.emergencySupport) {
    return (
      `I'm concerned about what you've shared. If you're in immediate danger, please call ${decision.emergencySupport.emergencyServices} now. ` +
      `You can also reach Samaritans any time on ${decision.emergencySupport.samaritans}. ` +
      `I've flagged this so a member of staff follows up with you directly — this conversation stays open until they do.`
    );
  }

  if (decision.safetyFlags.includes("ai_unavailable")) {
    return "I couldn't process that message automatically just now. It's been saved, and a team member may need to follow up with you directly.";
  }

  const flagNote = decision.safeguarding
    ? " This has been flagged for a team member to follow up with you personally."
    : "";

  return (
    `[Dev preview] Your message has been triaged: category ${CATEGORY_LABELS[decision.category]}, ` +
    `urgency ${decision.urgency}, disposition ${decision.disposition.replace("_", " ")}.${flagNote} ` +
    `A grounded, knowledge-based reply will be added in a later phase.`
  );
}
