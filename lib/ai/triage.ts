import { Prisma } from "../../generated/prisma/client.ts";
import { getGroqClient, GROQ_MODEL } from "./groqClient.ts";
import { TRIAGE_SYSTEM_PROMPT, buildTriageUserMessage } from "./triagePrompt.ts";
import { TriageOutputSchema } from "../validation/triage.ts";
import { toValidatedTriage, type ValidatedTriage } from "../validation/triageMapping.ts";
import type { ConversationTurn } from "../db/chatRecords.ts";

const TRIAGE_TIMEOUT_MS = 15_000;
// Cap how much raw model text we ever persist on a failure path — this is
// diagnostic data, not something that needs to be unbounded.
const RAW_TEXT_PREVIEW_LENGTH = 1000;

/**
 * The AI's response is untrusted until it clears both JSON parsing and Zod
 * schema validation. Nothing that fails either step is ever treated as a
 * real classification — see `status: "invalid_output"` / "provider_error".
 */
export type TriageOutcome =
  | { status: "success"; data: ValidatedTriage; rawOutput: Prisma.InputJsonValue }
  | { status: "provider_error"; message: string; rawOutput: Prisma.InputJsonValue }
  | { status: "invalid_output"; message: string; rawOutput: Prisma.InputJsonValue };

export async function runTriage(studentMessage: string, history: ConversationTurn[] = []): Promise<TriageOutcome> {
  let rawText: string;

  try {
    const client = getGroqClient();
    const completion = await client.chat.completions.create(
      {
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: TRIAGE_SYSTEM_PROMPT },
          { role: "user", content: buildTriageUserMessage(studentMessage, history) },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_completion_tokens: 600,
        // gpt-oss models spend tokens on internal reasoning before the final
        // JSON; "low" keeps that brief (classification doesn't need deep
        // reasoning) and "parsed" keeps it out of `content` entirely so we
        // only ever try to JSON-parse the actual answer.
        reasoning_effort: "low",
        reasoning_format: "parsed",
      },
      { timeout: TRIAGE_TIMEOUT_MS }
    );

    rawText = completion.choices[0]?.message?.content ?? "";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI provider error";
    console.error("Triage AI provider call failed:", message);
    return {
      status: "provider_error",
      message,
      rawOutput: { stage: "provider_error", error: "AI provider call failed" },
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    console.error("Triage AI returned output that was not valid JSON.");
    return {
      status: "invalid_output",
      message: "AI returned output that was not valid JSON.",
      rawOutput: {
        stage: "parse",
        error: "not_valid_json",
        rawTextPreview: rawText.slice(0, RAW_TEXT_PREVIEW_LENGTH),
      },
    };
  }

  const parsed = TriageOutputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    console.error("Triage AI output failed schema validation:", parsed.error.issues);
    return {
      status: "invalid_output",
      message: "AI returned output that did not match the expected triage schema.",
      rawOutput: {
        stage: "validation",
        error: "schema_validation_failed",
        // parsedJson came from JSON.parse, so it is JSON-safe at runtime
        // even though its static type is `unknown`.
        raw: parsedJson as Prisma.InputJsonValue,
      },
    };
  }

  return {
    status: "success",
    data: toValidatedTriage(parsed.data),
    rawOutput: parsed.data,
  };
}
