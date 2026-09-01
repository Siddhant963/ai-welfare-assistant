import { prisma } from "../db/client.ts";
import { Category } from "../../generated/prisma/client.ts";

/**
 * SERVER-ONLY. Deterministic keyword/category retrieval over the fixed,
 * small (13-row) KnowledgeResource table — explicitly NOT semantic/vector
 * search. Every score is a small integer built from simple, inspectable
 * rules, so a result can always be explained ("this scored 6: +2 category
 * match, +4 for two title-word matches") and reproduced from the same
 * inputs every time.
 *
 * We fetch all 13 rows and score them in application code rather than
 * pushing ranking into SQL — with a table this small that's the more
 * debuggable choice, not a performance concession. Callers only ever
 * receive the top `limit` (default 3), never the full set.
 */

export interface RetrievedResource {
  id: string;
  title: string;
  content: string;
  url: string | null;
  category: Category;
  score: number;
}

export interface RetrieveKnowledgeInput {
  message: string;
  category: Category;
  /** Set when the safety engine flagged safeguarding — see SAFEGUARDING_PRIORITY_TITLES. */
  safeguarding?: boolean;
  limit?: number;
}

const DEFAULT_LIMIT = 3;
const CATEGORY_MATCH_SCORE = 2;
const TITLE_MATCH_SCORE = 2;
const CONTENT_MATCH_SCORE = 1;
const SAFEGUARDING_PRIORITY_SCORE = 4;
// Below this, a resource isn't "sufficiently relevant" — better to say so
// honestly (see lib/ai/reply.ts's NO_KNOWLEDGE_FALLBACK) than to hand the
// model a weak, coincidental keyword hit and hope it stays grounded.
const MIN_RELEVANCE_SCORE = 2;

// These two are surfaced deterministically whenever the safety engine has
// flagged safeguarding (crisis, not necessarily immediate danger) — a
// business rule, not a keyword accident. A "feeling low for weeks" message
// shares almost no literal words with an admin-toned service description,
// so keyword scoring alone can't reliably surface the right resource here;
// this makes sure it does. Emergency Services (999) is deliberately NOT
// included — that's reserved for the fully separate immediate-danger
// deterministic reply in lib/ai/reply.ts, not general crisis escalation.
const SAFEGUARDING_PRIORITY_TITLES = ["Wellbeing and Counselling", "Samaritans"];

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "were",
  "be", "been", "i", "im", "my", "me", "you", "your", "it", "its", "this", "that", "these",
  "those", "with", "as", "at", "by", "from", "about", "into", "up", "out", "if", "so", "not",
  "do", "does", "did", "don", "dont", "can", "could", "will", "would", "should", "just",
  "really", "please", "help", "need", "want", "get", "got", "have", "has", "had", "am",
  "what", "when", "where", "how", "who", "which", "there", "here", "now", "still",
]);

function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return Array.from(new Set(words));
}

function scoreResource(
  resource: { title: string; content: string; category: Category },
  messageTokens: string[],
  targetCategory: Category,
  safeguarding: boolean
): number {
  let score = 0;

  // OTHER is a catch-all with no real topical signal — awarding it a
  // category-match bonus would mean an OTHER resource always clears the
  // relevance bar for any OTHER-classified message, even one with zero
  // genuine overlap (e.g. an off-topic question the AI couldn't place
  // anywhere else). OTHER resources must earn their spot via keywords only.
  if (resource.category === targetCategory && resource.category !== Category.OTHER) {
    score += CATEGORY_MATCH_SCORE;
  }

  if (safeguarding && SAFEGUARDING_PRIORITY_TITLES.includes(resource.title)) {
    score += SAFEGUARDING_PRIORITY_SCORE;
  }

  const titleLower = resource.title.toLowerCase();
  const contentLower = resource.content.toLowerCase();
  for (const token of messageTokens) {
    if (titleLower.includes(token)) {
      score += TITLE_MATCH_SCORE;
    } else if (contentLower.includes(token)) {
      score += CONTENT_MATCH_SCORE;
    }
  }

  return score;
}

export async function retrieveKnowledge(input: RetrieveKnowledgeInput): Promise<RetrievedResource[]> {
  const { message, category, safeguarding = false, limit = DEFAULT_LIMIT } = input;
  const messageTokens = tokenize(message);

  const all = await prisma.knowledgeResource.findMany({
    select: { id: true, title: true, content: true, url: true, category: true },
  });

  return all
    .map((resource) => ({
      ...resource,
      score: scoreResource(resource, messageTokens, category, safeguarding),
    }))
    .filter((resource) => resource.score >= MIN_RELEVANCE_SCORE)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}
