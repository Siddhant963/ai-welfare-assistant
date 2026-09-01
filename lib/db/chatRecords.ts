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

export interface ReplySource {
  id: string;
  title: string;
  url: string | null;
}

/**
 * Persists the assistant's reply as a Message(role=ASSISTANT) — reusing the
 * existing model rather than adding a new one for "assistant responses"
 * (there's nothing about a reply that doesn't fit Message already). When
 * sources exist, a readable footer is appended to the STORED content only,
 * so the raw transcript is self-contained on its own; the live API
 * response returns `sources` separately as clean structured data for the
 * UI (see app/api/chat/route.ts) rather than making the client re-parse
 * this text.
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
 * Persists every triage attempt, success or not — this is the audit trail
 * (see docs/database.md on why TriageResult is 1:N).
 *
 * TriageResult's typed columns (category/urgency/safeguarding/disposition)
 * hold the FINAL, safety-engine-corrected decision — the thing downstream
 * code (case creation, staff dashboard) should actually query. The
 * original, unmodified AI recommendation is never discarded: it's kept
 * verbatim in `rawOutput.ai` specifically so a corrected decision can
 * always be audited against what the AI actually said (rawOutput.safetyEngine
 * records why/whether it was overridden). See lib/safety/rules.ts.
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
