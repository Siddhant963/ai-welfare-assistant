import { Prisma } from "../../generated/prisma/client.ts";
import { getGroqClient, GROQ_MODEL } from "./groqClient.ts";
import { buildEscalationSystemPrompt, buildHandleNowSystemPrompt, buildResponseUserMessage } from "./respondPrompt.ts";
import { GroundedResponseSchema } from "../validation/response.ts";
import type { RetrievedResource } from "../knowledge/retrieve.ts";
import type { ConversationTurn } from "../db/chatRecords.ts";

const RESPONSE_TIMEOUT_MS = 15_000;
const RAW_TEXT_PREVIEW_LENGTH = 1000;

export type ResponseMode = "handle_now" | "escalate";

export type RespondOutcome =
  | { status: "success"; answer: string; sourceIds: string[]; rawOutput: Prisma.InputJsonValue }
  | { status: "provider_error"; message: string; rawOutput: Prisma.InputJsonValue }
  | { status: "invalid_output"; message: string; rawOutput: Prisma.InputJsonValue };

/**
 * Pure — no network, no DB. Validates a raw model response against the
 * schema, then checks every cited sourceId against `allowedResourceIds`
 * (what was actually retrieved and handed to the model). Any unknown id
 * rejects the whole response rather than silently dropping it.
 *
 * Separated out from generateGroundedResponse() so this can be tested with
 * a fabricated response, without needing the live AI to hallucinate on cue.
 */
export function validateGroundedResponse(rawText: string, allowedResourceIds: string[]): RespondOutcome {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    return {
      status: "invalid_output",
      message: "Response generation returned output that was not valid JSON.",
      rawOutput: {
        stage: "parse",
        error: "not_valid_json",
        rawTextPreview: rawText.slice(0, RAW_TEXT_PREVIEW_LENGTH),
      },
    };
  }

  const parsed = GroundedResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      status: "invalid_output",
      message: "Response generation output did not match the expected schema.",
      rawOutput: { stage: "validation", error: "schema_validation_failed", raw: parsedJson as Prisma.InputJsonValue },
    };
  }

  const unknownIds = parsed.data.sourceIds.filter((id) => !allowedResourceIds.includes(id));
  if (unknownIds.length > 0) {
    return {
      status: "invalid_output",
      message: "Response generation cited a source that was not actually retrieved.",
      rawOutput: { stage: "source_validation", error: "unknown_source_id", unknownIds, raw: parsedJson as Prisma.InputJsonValue },
    };
  }

  return { status: "success", answer: parsed.data.answer, sourceIds: parsed.data.sourceIds, rawOutput: parsed.data };
}

export async function generateGroundedResponse(input: {
  message: string;
  mode: ResponseMode;
  resources: RetrievedResource[];
  history?: ConversationTurn[];
}): Promise<RespondOutcome> {
  const { message, mode, resources, history = [] } = input;
  const systemPrompt =
    mode === "handle_now" ? buildHandleNowSystemPrompt(resources) : buildEscalationSystemPrompt(resources);

  let rawText: string;
  try {
    const client = getGroqClient();
    const completion = await client.chat.completions.create(
      {
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildResponseUserMessage(message, history) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_completion_tokens: 800,
        reasoning_effort: "low",
        reasoning_format: "parsed",
      },
      { timeout: RESPONSE_TIMEOUT_MS }
    );
    rawText = completion.choices[0]?.message?.content ?? "";
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown AI provider error";
    console.error("Response generation AI call failed:", errorMessage);
    return {
      status: "provider_error",
      message: errorMessage,
      rawOutput: { stage: "provider_error", error: "AI provider call failed" },
    };
  }

  return validateGroundedResponse(
    rawText,
    resources.map((r) => r.id)
  );
}
