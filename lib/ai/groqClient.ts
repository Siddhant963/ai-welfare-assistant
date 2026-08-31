import "dotenv/config";
import Groq from "groq-sdk";

/**
 * Default model can be overridden via GROQ_MODEL without a code change —
 * hosted model availability on Groq shifts over time.
 */
export const GROQ_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

let client: Groq | null = null;

/**
 * Lazily constructed so a missing GROQ_API_KEY only fails when triage is
 * actually attempted, not at module-import time (which would crash every
 * route that transitively imports this file, including ones that don't
 * need AI at all).
 */
export function getGroqClient(): Groq {
  if (client) return client;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set.");
  }

  client = new Groq({ apiKey });
  return client;
}
