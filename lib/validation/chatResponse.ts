import { z } from "zod";
import { SAFETY_FLAGS } from "../safety/types.ts";

/**
 * Shared client/server contract for POST /api/chat's success response.
 * `decision` is always the FINAL, safety-engine-corrected result — never
 * the AI's raw, unvalidated recommendation (that stays server-side, in
 * TriageResult.rawOutput.ai, for audit only). `safetyFlags` includes
 * "ai_unavailable" when the AI itself failed, so the client can show
 * appropriately humble language without a separate status branch.
 */
export const ChatResponseSchema = z.object({
  conversationId: z.string(),
  message: z.object({
    id: z.string(),
    role: z.literal("STUDENT"),
    content: z.string(),
    createdAt: z.string(),
  }),
  decision: z.object({
    category: z.enum([
      "academic",
      "financial",
      "visa_immigration",
      "housing",
      "health_wellbeing",
      "other",
    ]),
    urgency: z.enum(["low", "medium", "high", "critical"]),
    safeguarding: z.boolean(),
    disposition: z.enum(["handle_now", "ask_clarifying", "escalate"]),
    safetyFlags: z.array(z.enum(SAFETY_FLAGS)),
    emergencySupport: z
      .object({
        emergencyServices: z.string(),
        samaritans: z.string(),
      })
      .nullable(),
  }),
});

export type ChatResponse = z.infer<typeof ChatResponseSchema>;
