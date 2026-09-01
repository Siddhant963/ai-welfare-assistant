import { prisma } from "../db/client.ts";
import { Category } from "../../generated/prisma/client.ts";

/**
 * Deterministic keyword/category retrieval over the KnowledgeResource
 * table — not semantic/vector search. Scores are small integers built from
 * simple rules so a result can be explained and reproduced.
 *
 * Rows are scored in application code rather than in SQL; with a table
 * this small that's more debuggable, not a performance tradeoff. Callers
 * only ever get the top `limit` (default 3).
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
// Below this, a resource isn't relevant enough to hand to the model.
const MIN_RELEVANCE_SCORE = 2;

// Surfaced whenever safeguarding is flagged — a message like "feeling low
// for weeks" shares almost no words with an admin-toned service
// description, so keyword scoring alone won't reliably find these.
// Emergency Services (999) is handled separately by the immediate-danger
// reply in lib/ai/reply.ts, not general crisis escalation.
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

  // OTHER is a catch-all with no real topical signal, so it doesn't get a
  // category bonus — those resources must earn their spot via keywords.
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
