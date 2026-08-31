import { NextResponse } from "next/server";
import { ChatRequestSchema } from "../../../lib/validation/chatRequest.ts";
import { fromValidatedTriage } from "../../../lib/validation/triageMapping.ts";
import { runTriage } from "../../../lib/ai/triage.ts";
import {
  createStudentMessage,
  findOrCreateStudent,
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

    const studentMessage = await createStudentMessage(conversation.id, message);

    const triageOutcome = await runTriage(message);
    await persistTriageResult(studentMessage.id, triageOutcome);

    const triage =
      triageOutcome.status === "success"
        ? {
            status: "ok" as const,
            ...fromValidatedTriage(triageOutcome.data),
          }
        : {
            status: "unavailable" as const,
            notice:
              "I couldn't process that message automatically just now. It's been saved, and a team member may need to follow up with you directly.",
          };

    return NextResponse.json({
      conversationId: conversation.id,
      message: {
        id: studentMessage.id,
        role: "STUDENT" as const,
        content: studentMessage.content,
        createdAt: studentMessage.createdAt.toISOString(),
      },
      triage,
    });
  } catch (error) {
    console.error("POST /api/chat failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
