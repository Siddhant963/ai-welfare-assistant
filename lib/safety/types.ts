/**
 * Client-safe (no Prisma import) — shared between the server-only safety
 * engine (lib/safety/rules.ts) and the client-facing response contract
 * (lib/validation/chatResponse.ts) so the two never drift.
 */
export const SAFETY_FLAGS = [
  "immediate_danger",
  "crisis_safeguarding",
  "individual_immigration",
  "ai_inconsistency_corrected",
  "ai_unavailable",
] as const;

export type SafetyFlag = (typeof SAFETY_FLAGS)[number];

export interface EmergencySupport {
  emergencyServices: string;
  samaritans: string;
}

/**
 * The only two numbers this system is allowed to surface for a crisis —
 * defined once so nothing downstream (prompt, UI, dev preview) can invent
 * or alter them.
 */
export const EMERGENCY_SUPPORT: EmergencySupport = {
  emergencyServices: "999",
  samaritans: "116 123",
};
