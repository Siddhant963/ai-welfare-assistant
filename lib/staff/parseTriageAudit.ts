/**
 * Parser for TriageResult.rawOutput — a JSON column with two shapes in the
 * data:
 *
 *   - `{ ai: {...}, safetyEngine: {...} }` — the AI's recommendation kept
 *     separate from the safety engine's audit trail.
 *   - A flat object (`{ category, urgency, safeguarding, disposition }`)
 *     from seed data written before the safety engine existed — the raw
 *     object itself is the AI recommendation, with no separate audit.
 *
 * Never throws on an unexpected shape — this is display-only and shouldn't
 * break the case detail page.
 */

export interface AiRecommendationView {
  category?: string;
  urgency?: string;
  safeguarding?: boolean;
  disposition?: string;
  reason?: string;
  failed?: boolean;
  stage?: string;
  message?: string;
}

export interface SafetyEngineAuditView {
  overriddenAi: boolean;
  safetyFlags: string[];
  reasons: string[];
  emergencySupport: { emergencyServices: string; samaritans: string } | null;
}

export interface ParsedTriageAudit {
  ai: AiRecommendationView | null;
  safetyEngine: SafetyEngineAuditView | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSafetyEngine(value: unknown): SafetyEngineAuditView | null {
  if (!isRecord(value)) return null;
  return {
    overriddenAi: Boolean(value.overriddenAi),
    safetyFlags: Array.isArray(value.safetyFlags) ? (value.safetyFlags as string[]) : [],
    reasons: Array.isArray(value.reasons) ? (value.reasons as string[]) : [],
    emergencySupport: isRecord(value.emergencySupport)
      ? (value.emergencySupport as { emergencyServices: string; samaritans: string })
      : null,
  };
}

export function parseTriageAudit(rawOutput: unknown): ParsedTriageAudit {
  if (!isRecord(rawOutput)) return { ai: null, safetyEngine: null };

  if (isRecord(rawOutput.ai)) {
    return { ai: rawOutput.ai as AiRecommendationView, safetyEngine: parseSafetyEngine(rawOutput.safetyEngine) };
  }

  if ("category" in rawOutput || "disposition" in rawOutput) {
    return { ai: rawOutput as AiRecommendationView, safetyEngine: null };
  }

  return { ai: null, safetyEngine: null };
}
