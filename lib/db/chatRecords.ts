import { prisma } from "./client.ts";
import { Category, Disposition, MessageRole, Urgency } from "../../generated/prisma/client.ts";
import type { Conversation, Message, Student, TriageResult } from "../../generated/prisma/client.ts";
import type { TriageOutcome } from "../ai/triage.ts";

/**
 * Identifies the conversation, not an authentication system — a student is
 * looked up (or created) by email alone. See docs/database.md.
 */
export async function findOrCreateStudent(name: string, email: string): Promise<Student> {
  return prisma.student.upsert({
    where: { email },
    update: { name },
    create: { name, email },
  });
}

export type ResolveConversationResult =
  | { ok: true; conversation: Conversation }
  | { ok: false; status: 404; error: "Conversation not found." }
  | { ok: false; status: 403; error: "This conversation does not belong to the supplied student." };

/**
 * A conversationId from the browser is never trusted at face value — if one
 * is supplied, ownership against the resolved student is verified before
 * anything is written to it. No conversationId means start a new one.
 */
export async function resolveConversation(
  studentId: string,
  conversationId: string | undefined
): Promise<ResolveConversationResult> {
  if (!conversationId) {
    const conversation = await prisma.conversation.create({ data: { studentId } });
    return { ok: true, conversation };
  }

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });

  if (!conversation) {
    return { ok: false, status: 404, error: "Conversation not found." };
  }
  if (conversation.studentId !== studentId) {
    return { ok: false, status: 403, error: "This conversation does not belong to the supplied student." };
  }
  return { ok: true, conversation };
}

export async function createStudentMessage(conversationId: string, content: string): Promise<Message> {
  return prisma.message.create({
    data: { conversationId, role: MessageRole.STUDENT, content },
  });
}

/**
 * Persists every triage attempt, success or not — this is the audit trail
 * (see docs/database.md on why TriageResult is 1:N). A failed AI call or
 * invalid AI output is NEVER persisted as if it were a real classification:
 * it's recorded as an explicit, clearly-labelled escalation fallback so a
 * human reviews it, distinguishable in `reason` and `rawOutput.fallback`.
 */
export async function persistTriageResult(
  messageId: string,
  outcome: TriageOutcome
): Promise<TriageResult> {
  if (outcome.status === "success") {
    return prisma.triageResult.create({
      data: {
        messageId,
        category: outcome.data.category,
        urgency: outcome.data.urgency,
        safeguarding: outcome.data.safeguarding,
        disposition: outcome.data.disposition,
        reason: outcome.data.reason,
        rawOutput: outcome.rawOutput,
      },
    });
  }

  return prisma.triageResult.create({
    data: {
      messageId,
      category: Category.OTHER,
      urgency: Urgency.MEDIUM,
      safeguarding: false,
      disposition: Disposition.ESCALATE,
      reason: `AI triage fallback (${outcome.status}): ${outcome.message}. Not a real classification — escalated for human review.`,
      rawOutput: { fallback: true, details: outcome.rawOutput },
    },
  });
}
