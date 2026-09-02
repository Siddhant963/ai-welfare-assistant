import { prisma } from "./client.ts";
import { MessageRole } from "../../generated/prisma/client.ts";
import type { Conversation, Message, Prisma, Student, TriageResult } from "../../generated/prisma/client.ts";
import type { TriageOutcome } from "../ai/triage.ts";
import type { FinalDecision } from "../safety/rules.ts";

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

export interface ConversationTurn {
  role: MessageRole;
  content: string;
}

const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CHARS = 300;

/**
 * Last few turns of a conversation, oldest first, so the AI can resolve
 * references like "it" or "that" back to what was just discussed. Bounded
 * in count and per-message length — this is recent context, not a
 * transcript archive.
 */
export async function getRecentMessages(
  conversationId: string,
  limit: number = MAX_HISTORY_MESSAGES
): Promise<ConversationTurn[]> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { role: true, content: true },
  });

  return messages.reverse().map((m) => ({
    role: m.role,
    content: m.content.length > MAX_HISTORY_CHARS ? `${m.content.slice(0, MAX_HISTORY_CHARS)}…` : m.content,
  }));
}

export interface ReplySource {
  id: string;
  title: string;
  url: string | null;
}

/**
 * Persists the assistant's reply as a Message(role=ASSISTANT). When sources
 * exist, a readable footer is appended to the stored content so the raw
 * transcript is self-contained; the API response returns `sources`
 * separately as structured data for the UI.
 */
export async function createAssistantMessage(
  conversationId: string,
  answer: string,
  sources: ReplySource[]
): Promise<Message> {
  const footer = sources.length
    ? "\n\nSources:\n" + sources.map((s) => (s.url ? `- ${s.title} (${s.url})` : `- ${s.title}`)).join("\n")
    : "";

  return prisma.message.create({
    data: { conversationId, role: MessageRole.ASSISTANT, content: answer + footer },
  });
}

/**
 * Persists every triage attempt, success or not — see docs/database.md for
 * why TriageResult is 1:N.
 *
 * The typed columns hold the final, safety-engine-corrected decision. The
 * original AI recommendation is kept verbatim in `rawOutput.ai`;
 * `rawOutput.safetyEngine` records whether/why it was overridden.
 */
export async function persistTriageResult(
  messageId: string,
  outcome: TriageOutcome,
  decision: FinalDecision
): Promise<TriageResult> {
  const aiRawOutput: Prisma.InputJsonValue =
    outcome.status === "success"
      ? outcome.rawOutput
      : { failed: true, stage: outcome.status, message: outcome.message, details: outcome.rawOutput };

  return prisma.triageResult.create({
    data: {
      messageId,
      category: decision.category,
      urgency: decision.urgency,
      safeguarding: decision.safeguarding,
      disposition: decision.disposition,
      reason: decision.reasons.join(" ") || null,
      rawOutput: {
        ai: aiRawOutput,
        safetyEngine: {
          overriddenAi: decision.overriddenAi,
          safetyFlags: decision.safetyFlags,
          reasons: decision.reasons,
          // Plain interface, not a Prisma-generated JSON type — structurally
          // JSON-safe (two strings or null), just needs an explicit cast.
          emergencySupport: decision.emergencySupport as Prisma.InputJsonValue | null,
        },
      },
    },
  });
}
