import { z } from "zod";

/**
 * Contract for the response-generation model's output. Client-safe (no
 * Prisma import). The model may only produce `answer` text and cite
 * `sourceIds` — it never decides urgency/safeguarding/disposition/case
 * status, all of which are already fixed by the safety engine before this
 * is ever called.
 */
export const GroundedResponseSchema = z.object({
  answer: z.string().trim().min(1).max(2000),
  sourceIds: z.array(z.string()).max(5),
});

export type GroundedResponseOutput = z.infer<typeof GroundedResponseSchema>;
