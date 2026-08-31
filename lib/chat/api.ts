import { ChatResponseSchema, type ChatResponse } from "../validation/chatResponse.ts";
import type { StudentInfo } from "./types";

interface SendChatMessageInput {
  student: StudentInfo;
  conversationId: string | null;
  message: string;
}

function isApiError(body: unknown): body is { error: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  );
}

/**
 * Talks to POST /api/chat. Never surfaces raw server/provider internals —
 * every thrown Error carries only user-safe text.
 */
export async function sendChatMessage(input: SendChatMessageInput): Promise<ChatResponse> {
  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student: input.student,
        conversationId: input.conversationId ?? undefined,
        message: input.message,
      }),
    });
  } catch {
    throw new Error("Could not reach the server. Please check your connection and try again.");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("The server returned an unexpected response. Please try again.");
  }

  if (!response.ok) {
    throw new Error(isApiError(body) ? body.error : "Something went wrong. Please try again.");
  }

  const parsed = ChatResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("The server returned an unexpected response. Please try again.");
  }

  return parsed.data;
}
