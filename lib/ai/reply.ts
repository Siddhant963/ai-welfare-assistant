import { Disposition } from "../../generated/prisma/client.ts";
import type { FinalDecision } from "../safety/rules.ts";
import { retrieveKnowledge, type RetrievedResource } from "../knowledge/retrieve.ts";
import { generateGroundedResponse } from "./respond.ts";

/**
 * Turns a safety-engine decision into a student-facing reply. Never
 * re-decides urgency/safeguarding/disposition — only picks how to respond:
 *
 *   1. Immediate danger -> deterministic, no retrieval, no AI call.
 *   2. Ask clarifying    -> deterministic, no retrieval, no AI call.
 *   3. Escalate (other)  -> retrieve, then generate an acknowledgment.
 *   4. Handle now         -> retrieve, then generate a grounded answer.
 *
 * Paths 3/4 skip the AI call when retrieval finds nothing relevant —
 * there's nothing to ground an answer on. If retrieval succeeds but the AI
 * call fails, the retrieved resources are still shown, just without an
 * AI-written summary.
 */

export interface Source {
  id: string;
  title: string;
  url: string | null;
}

export interface ReplyResult {
  answer: string;
  sources: Source[];
}

// Exported so tests can assert on the exact string.
export const CLARIFYING_QUESTION =
  "I can help. Is this about academic support, money/finance, housing, immigration, or your wellbeing?";

export const NO_KNOWLEDGE_FALLBACK =
  "I don't have enough verified information to answer that accurately yet. I can help you identify the right support route or connect you with a staff member.";

export const ESCALATION_FALLBACK =
  "Thank you for sharing this. This needs a closer look than I can give automatically, so I've flagged it for a member of staff to follow up with you directly.";

function toSources(resources: RetrievedResource[], ids?: string[]): Source[] {
  const selected = ids ? resources.filter((r) => ids.includes(r.id)) : resources;
  return selected.map((r) => ({ id: r.id, title: r.title, url: r.url }));
}

export async function buildReply(input: { message: string; decision: FinalDecision }): Promise<ReplyResult> {
  const { message, decision } = input;

  // Path 1 — immediate danger. Application-owned emergency metadata only;
  // the AI is never asked to invent or restate emergency numbers.
  if (decision.emergencySupport) {
    return {
      answer:
        `I'm really concerned about what you've shared. If you're in immediate danger, please call ${decision.emergencySupport.emergencyServices} now. ` +
        `You can also reach Samaritans any time on ${decision.emergencySupport.samaritans}. ` +
        `I've flagged this so a member of staff follows up with you directly — this conversation stays open until they do.`,
      sources: [],
    };
  }

  // Path 2 — clarification. No safety signal fired, and the AI itself
  // wasn't confident enough to route the message; asking one short
  // question is safer and cheaper than guessing.
  if (decision.disposition === Disposition.ASK_CLARIFYING) {
    return { answer: CLARIFYING_QUESTION, sources: [] };
  }

  const isEscalation = decision.disposition === Disposition.ESCALATE;

  let resources: RetrievedResource[];
  try {
    resources = await retrieveKnowledge({
      message,
      category: decision.category,
      safeguarding: decision.safeguarding,
    });
  } catch (error) {
    console.error("Knowledge retrieval failed:", error instanceof Error ? error.message : error);
    return { answer: isEscalation ? ESCALATION_FALLBACK : NO_KNOWLEDGE_FALLBACK, sources: [] };
  }

  if (resources.length === 0) {
    return { answer: isEscalation ? ESCALATION_FALLBACK : NO_KNOWLEDGE_FALLBACK, sources: [] };
  }

  const outcome = await generateGroundedResponse({
    message,
    mode: isEscalation ? "escalate" : "handle_now",
    resources,
  });

  if (outcome.status !== "success") {
    // Retrieval genuinely found something verified; the AI step just
    // couldn't turn it into prose. Show the real resources rather than
    // discarding them along with the failed AI call.
    return {
      answer: isEscalation
        ? `${ESCALATION_FALLBACK} In the meantime, this may help:`
        : "I found some resources that may help, though I couldn't put together a full summary just now:",
      sources: toSources(resources),
    };
  }

  return { answer: outcome.answer, sources: toSources(resources, outcome.sourceIds) };
}
