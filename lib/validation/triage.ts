import { z } from "zod";

/**
 * Contract for what the AI provider is allowed to return. This is the ONLY
 * thing standing between raw model output and the database — the model's
 * response is untrusted until it parses AND validates against this schema.
 *
 * Client-safe on purpose: this file has no Prisma import, so it can be
 * bundled into the browser (the chat UI parses the API response against
 * this same schema — see lib/validation/chatResponse.ts). The mapping onto
 * Prisma's UPPER_SNAKE enums lives server-only in ./triageMapping.ts.
 */
export const TriageOutputSchema = z.object({
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
  reason: z.string().trim().min(1).max(500),
});

export type TriageOutput = z.infer<typeof TriageOutputSchema>;
