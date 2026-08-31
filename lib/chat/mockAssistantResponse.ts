/**
 * ⚠️ PHASE 4 TEMPORARY MOCK — NOT THE REAL ASSISTANT.
 *
 * This performs no triage, no safety checks, and no knowledge-base lookup —
 * it reads nothing about the student's message. It exists only so the chat
 * UI has something to render while it's built.
 *
 * Phase 5+ replaces every call site of this function with the real pipeline:
 * AI triage -> schema validation -> deterministic safety rules -> grounded
 * response / clarification / escalation. Do not extend this function with
 * "smarter" logic — that logic belongs server-side, behind the safety rules,
 * not here.
 */
const MOCK_RESPONSE_DELAY_MS = 700;

const MOCK_ASSISTANT_REPLY =
  "Thanks for your message — I've received it. Real assistant responses aren't connected yet in this build; this placeholder just confirms the chat interface is working.";

export function getMockAssistantResponse(): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(MOCK_ASSISTANT_REPLY), MOCK_RESPONSE_DELAY_MS);
  });
}
