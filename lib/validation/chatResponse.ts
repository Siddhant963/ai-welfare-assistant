import { z } from "zod";
import { TriageOutputSchema } from "./triage.ts";

/**
 * Shared client/server contract for POST /api/chat's success response.
 * `triage.status === "ok"` reuses TriageOutputSchema's fields directly so
 * the two never drift. `"unavailable"` is the safe, non-fabricated fallback
 * shown when AI triage failed — it never carries classification fields.
 */
export const ChatResponseSchema = z.object({
  conversationId: z.string(),
  message: z.object({
    id: z.string(),
    role: z.literal("STUDENT"),
    content: z.string(),
    createdAt: z.string(),
  }),
  triage: z.discriminatedUnion("status", [
    TriageOutputSchema.extend({ status: z.literal("ok") }),
    z.object({
      status: z.literal("unavailable"),
      notice: z.string(),
    }),
  ]),
});

export type ChatResponse = z.infer<typeof ChatResponseSchema>;
