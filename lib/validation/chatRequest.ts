import { z } from "zod";

/**
 * Sensible caps, not a full rate-limiting system (that's out of scope for
 * this phase). These exist to reject obviously-abusive payloads before they
 * ever reach the database or the AI provider.
 */
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_NAME_LENGTH = 200;
export const MAX_EMAIL_LENGTH = 254; // RFC 5321 max mailbox length

export const ChatRequestSchema = z.object({
  student: z.object({
    name: z.string().trim().min(1, "Name is required.").max(MAX_NAME_LENGTH),
    email: z.string().trim().min(1, "Email is required.").max(MAX_EMAIL_LENGTH).email("Invalid email address."),
  }),
  conversationId: z.string().trim().min(1).optional(),
  message: z
    .string()
    .trim()
    .min(1, "Message cannot be empty.")
    .max(MAX_MESSAGE_LENGTH, `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
