/**
 * Deterministic pattern detectors over the raw student message.
 *
 * These are intentionally curated, high-precision phrase patterns rather
 * than single keywords — a bare "help", "stress", "worried", or "bad"
 * must never trip a safety rule on its own (see scripts/verify-safety.ts's
 * "no false positives" checks). Each pattern targets a specific real-world
 * phrasing and is commented with what it's meant to catch, so the rule set
 * stays auditable and testable one pattern at a time.
 *
 * This module never calls the AI and never reads HTTP request objects —
 * pure string in, boolean out.
 */

interface NamedPattern {
  pattern: RegExp;
  note: string;
}

// Rule 1 — immediate danger to life or safety, right now. Requires an
// explicit first-person statement of imminent action, active possession of
// means, or an in-progress physical danger — not just distress or sadness.
const IMMEDIATE_DANGER_PATTERNS: NamedPattern[] = [
  {
    pattern: /\bi(?:'m| am)\s+(?:about to|going to|planning to)\s+(?:kill myself|end my life|end it all|jump(?: off| in front of a train| off a bridge)?|hang myself)\b/i,
    note: "explicit imminent self-harm intent, present/immediate tense",
  },
  {
    pattern: /\bi\s+(?:have|'ve got|am holding)\s+(?:the\s+)?(?:pills|a knife|a rope|a gun|a weapon)\s+(?:in my hand|right here|right now|with me now)\b/i,
    note: "possession of means combined with an explicit immediacy marker",
  },
  {
    pattern: /\bi\s+(?:just\s+)?(?:took|have taken|swallowed)\s+(?:all\s+)?(?:my\s+)?pills\b/i,
    note: "already-occurred overdose — immediate medical emergency, not future risk",
  },
  {
    pattern: /\bi\s+am\s+not\s+safe\s+right\s+now\b/i,
    note: "explicit, present-tense statement of being unsafe",
  },
  {
    pattern: /\bi\s+don'?t\s+think\s+i\s+(?:can|will)\s+(?:make it|survive)\s+(?:through\s+)?tonight\b/i,
    note: "explicit statement of imminent risk to survival",
  },
  {
    pattern: /\bsomeone\s+is\s+(?:hurting|attacking|assaulting)\s+me\s+(?:right\s+now|now)\b/i,
    note: "in-progress physical danger from another person",
  },
  {
    pattern: /\bplease\s+help\s+me,?\s+i'?m\s+about\s+to\b/i,
    note: "direct plea combined with an imminent-action marker",
  },
];

// Rule 2 / 4 — crisis or safeguarding concern: serious distress, possible
// self-harm, or severe deterioration. Broader than immediate danger, but
// still specific phrasing, not generic negative-mood words.
const CRISIS_SAFEGUARDING_PATTERNS: NamedPattern[] = [
  {
    pattern: /\bdon'?t\s+(?:really\s+)?see\s+the\s+point\s+(?:of\s+(?:anything|living|going on))?\b/i,
    note: "loss of sense of purpose — the assessment's canonical crisis phrase",
  },
  {
    pattern: /\bno\s+point\s+in\s+(?:anything|living|carrying on)\b/i,
    note: "loss of sense of purpose, alternate phrasing",
  },
  {
    pattern: /\b(?:want|wish)\s+(?:to\s+)?(?:die|not be here|not exist)\b/i,
    note: "passive or active death ideation",
  },
  { pattern: /\bsuicidal\b/i, note: "explicit self-identification" },
  {
    pattern: /\b(?:thinking about|thoughts of|thought about)\s+(?:suicide|self-harm|hurting myself|ending my life)\b/i,
    note: "explicit ideation, not necessarily imminent",
  },
  { pattern: /\bself[-\s]?harm(?:ing)?\b/i, note: "explicit self-harm reference" },
  { pattern: /\bhurt(?:ing)?\s+myself\b/i, note: "explicit self-harm reference" },
  {
    pattern: /\bcan'?t\s+(?:go on|cope)\s*(?:like this)?\s*(?:anymore|any more)?\b/i,
    note: "explicit statement of being unable to continue coping",
  },
  {
    pattern: /\bhaven'?t\s+(?:left\s+my\s+room|eaten\s+properly)\b[^.]*\b(?:days|weeks)\b/i,
    note: "functional shutdown (not leaving room / not eating) sustained over days/weeks",
  },
  {
    pattern: /\bmental\s+health\s+(?:has\s+been\s+)?(?:going\s+downhill|getting\s+worse|deteriorat\w*)\b/i,
    note: "explicit reported decline in mental health — catches the hidden-safeguarding test case even under a financial-sounding message",
  },
  {
    pattern: /\bfeel(?:ing)?\s+(?:really\s+)?low\s+for\s+(?:weeks|days|a while|so long)\b/i,
    note: "sustained low mood over a meaningful duration, not a single bad day",
  },
];

// Rule 3 — individual immigration/visa circumstances. Requires a personal
// possessive ("my visa/CAS/sponsorship") plus a problem verb, so a general
// informational question ("how do student visas work?") does not match.
const INDIVIDUAL_IMMIGRATION_PATTERNS: NamedPattern[] = [
  {
    pattern: /\bmy\s+(?:cas|visa|sponsorship|biometric residence permit|brp)\b[^.]*\b(?:withdrawn|withdrew|expir\w*|refus\w*|cancel\w*|revok\w*)\b/i,
    note: "personal visa/CAS/sponsorship combined with a problem verb",
  },
  {
    pattern: /\b(?:withdrew|withdrawn|cancell?ed|refused)\s+(?:my\s+)?(?:cas|visa|sponsorship)\b/i,
    note: "problem verb leading, covers 'withdrew my CAS' word order",
  },
  {
    pattern: /\bmy\s+visa\s+expires?\s+in\s+\d+\s+(?:day|days|week|weeks)\b/i,
    note: "concrete personal expiry countdown",
  },
  {
    pattern: /\bmy\s+sponsor(?:ship)?\s+(?:has\s+)?(?:changed|withdrawn|ended|been withdrawn)\b/i,
    note: "personal sponsorship change",
  },
];

function matchesAny(message: string, patterns: NamedPattern[]): boolean {
  return patterns.some(({ pattern }) => pattern.test(message));
}

export function detectImmediateDanger(message: string): boolean {
  return matchesAny(message, IMMEDIATE_DANGER_PATTERNS);
}

export function detectCrisisSafeguarding(message: string): boolean {
  return matchesAny(message, CRISIS_SAFEGUARDING_PATTERNS);
}

export function detectIndividualImmigrationCircumstance(message: string): boolean {
  return matchesAny(message, INDIVIDUAL_IMMIGRATION_PATTERNS);
}

// Exported for the verification script, so each pattern can be exercised
// and explained individually rather than only as an opaque boolean.
export const _patterns = {
  IMMEDIATE_DANGER_PATTERNS,
  CRISIS_SAFEGUARDING_PATTERNS,
  INDIVIDUAL_IMMIGRATION_PATTERNS,
};
