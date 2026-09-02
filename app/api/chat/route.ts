import { NextResponse } from "next/server";
import { Disposition } from "../../../generated/prisma/client.ts";
import { ChatRequestSchema } from "../../../lib/validation/chatRequest.ts";
import {
  caseStatusToWire,
  categoryToWire,
  dispositionToWire,
  urgencyToWire,
} from "../../../lib/validation/triageMapping.ts";
import { runTriage } from "../../../lib/ai/triage.ts";
import { evaluateSafety } from "../../../lib/safety/rules.ts";
import { buildReply } from "../../../lib/ai/reply.ts";
import { ensureEscalationCase } from "../../../lib/db/cases.ts";
import {
  createAssistantMessage,
  createStudentMessage,
  findOrCreateStudent,
  getRecentMessages,
  persistTriageResult,
  resolveConversation,
} from "../../../lib/db/chatRecords.ts";

// Generous relative to MAX_MESSAGE_LENGTH (4000 chars) plus name/email/JSON
// overhead — rejects grossly oversized payloads before we even parse them.
const MAX_REQUEST_BYTES = 20_000;

export async function POST(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Request payload is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsedRequest = ChatRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsedRequest.error.flatten() },
      { status: 400 }
    );
  }

  const { student: studentInput, conversationId, message } = parsedRequest.data;

  try {
    const student = await findOrCreateStudent(studentInput.name, studentInput.email);

    const resolved = await resolveConversation(student.id, conversationId);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const { conversation } = resolved;

    // Fetched before the new message is saved, so it's naturally just the
    // prior turns — lets triage and response generation resolve references
    // like "it" back to what was just discussed, without an open-ended
    // memory system (bounded in count and length, see getRecentMessages).
    const history = await getRecentMessages(conversation.id);

    const studentMessage = await createStudentMessage(conversation.id, message);

    // AI triage is a recommendation only. The safety engine — not the AI —
    // owns the final urgency/safeguarding/disposition decision, and it runs
    // its own independent pattern checks against the raw message regardless
    // of whether AI triage succeeded (evaluateSafety accepts triage: null).
    const triageOutcome = await runTriage(message, history);
    const decision = evaluateSafety({
      message,
      triage: triageOutcome.status === "success" ? triageOutcome.data : null,
      aiFailureReason: triageOutcome.status !== "success" ? triageOutcome.message : undefined,
    });
    await persistTriageResult(studentMessage.id, triageOutcome, decision);

    // Case creation happens before response generation, so the student is
    // never told "this needs human support" before that's actually true.
    // Idempotent and safe on retries (lib/db/cases.ts); never runs for
    // HANDLE_NOW/ASK_CLARIFYING, and never assigns staff.
    const escalationCase =
      decision.disposition === Disposition.ESCALATE
        ? await ensureEscalationCase({ conversationId: conversation.id, decision, message })
        : null;

    // Knowledge retrieval + grounded response generation — a separate step
    // from triage/safety, receiving only the already-final decision. See
    // lib/ai/reply.ts for the four-way dispatch (immediate danger /
    // clarify / escalate / handle now) and why each path does or doesn't
    // call the AI at all.
    const reply = await buildReply({ message, decision, history });
    const assistantMessage = await createAssistantMessage(conversation.id, reply.answer, reply.sources);

    return NextResponse.json({
      conversationId: conversation.id,
      message: {
        id: studentMessage.id,
        role: "STUDENT" as const,
        content: studentMessage.content,
        createdAt: studentMessage.createdAt.toISOString(),
      },
      decision: {
        category: categoryToWire(decision.category),
        urgency: urgencyToWire(decision.urgency),
        safeguarding: decision.safeguarding,
        disposition: dispositionToWire(decision.disposition),
        safetyFlags: decision.safetyFlags,
        emergencySupport: decision.emergencySupport,
      },
      reply: {
        id: assistantMessage.id,
        answer: reply.answer,
        sources: reply.sources,
        createdAt: assistantMessage.createdAt.toISOString(),
      },
      case: escalationCase
        ? {
            id: escalationCase.id,
            status: caseStatusToWire(escalationCase.status),
            urgency: urgencyToWire(escalationCase.urgency),
            safeguarding: escalationCase.safeguarding,
          }
        : null,
    });
  } catch (error) {
    console.error("POST /api/chat failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
