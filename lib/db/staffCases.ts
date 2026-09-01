import { prisma } from "./client.ts";
import { CaseStatus, Urgency } from "../../generated/prisma/client.ts";
import type { Category, Disposition, MessageRole, Prisma } from "../../generated/prisma/client.ts";

/**
 * SERVER-ONLY. Read-only data access for the staff dashboard (Phase 9).
 * No mutations live here — claiming is lib/db/claimCase.ts (Phase 2,
 * unchanged) and case creation is lib/db/cases.ts (Phase 8, unchanged).
 * Never calls the AI.
 */

export const PAGE_SIZE = 20;

export type CaseFilter = "all" | "new" | "critical" | "high" | "safeguarding" | "unclaimed";

export interface CaseListItem {
  id: string;
  category: Category;
  urgency: Urgency;
  safeguarding: boolean;
  status: CaseStatus;
  createdAt: Date;
  claimedById: string | null;
  claimedByName: string | null;
  student: { name: string; email: string };
}

export interface ListCasesResult {
  cases: CaseListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

function buildWhere(filter: CaseFilter, search?: string): Prisma.CaseWhereInput {
  const where: Prisma.CaseWhereInput = {};

  switch (filter) {
    case "new":
      where.status = CaseStatus.NEW;
      break;
    case "critical":
      where.urgency = Urgency.CRITICAL;
      break;
    case "high":
      where.urgency = Urgency.HIGH;
      break;
    case "safeguarding":
      where.safeguarding = true;
      break;
    case "unclaimed":
      where.claimedById = null;
      break;
    case "all":
    default:
      break;
  }

  const trimmed = search?.trim();
  if (trimmed) {
    where.conversation = {
      student: {
        OR: [
          { name: { contains: trimmed, mode: "insensitive" } },
          { email: { contains: trimmed, mode: "insensitive" } },
        ],
      },
    };
  }

  return where;
}

/**
 * Queue ordering — deterministic application logic, never AI-decided:
 *   1. urgency DESC — Postgres orders enums by their declaration order in
 *      the schema (LOW, MEDIUM, HIGH, CRITICAL), so `desc` naturally yields
 *      CRITICAL first. This is standard, documented Postgres enum
 *      behavior, not a coincidence — see prisma/schema.prisma.
 *   2. safeguarding DESC — true (1) sorts before false (0).
 *   3. createdAt DESC — newest first within the same priority tier.
 *
 * One query for the page of rows, one COUNT for pagination, run in
 * parallel — not one query per case (see docs/staff-dashboard.md-style
 * note in the Phase 9 report on why this isn't an N+1 pattern).
 */
export async function listCases(input: {
  filter?: CaseFilter;
  search?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<ListCasesResult> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = input.pageSize ?? PAGE_SIZE;
  const where = buildWhere(input.filter ?? "all", input.search);

  const [rows, totalCount] = await Promise.all([
    prisma.case.findMany({
      where,
      orderBy: [{ urgency: "desc" }, { safeguarding: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        category: true,
        urgency: true,
        safeguarding: true,
        status: true,
        createdAt: true,
        claimedById: true,
        claimedBy: { select: { name: true } },
        conversation: { select: { student: { select: { name: true, email: true } } } },
      },
    }),
    prisma.case.count({ where }),
  ]);

  const cases: CaseListItem[] = rows.map((row) => ({
    id: row.id,
    category: row.category,
    urgency: row.urgency,
    safeguarding: row.safeguarding,
    status: row.status,
    createdAt: row.createdAt,
    claimedById: row.claimedById,
    claimedByName: row.claimedBy?.name ?? null,
    student: row.conversation.student,
  }));

  return {
    cases,
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

export interface CaseMetrics {
  open: number;
  urgent: number;
  safeguarding: number;
  unclaimed: number;
}

/** Four bounded COUNT queries against already-indexed columns, run in parallel — never derived from a paginated slice. */
export async function getCaseMetrics(): Promise<CaseMetrics> {
  const openWhere: Prisma.CaseWhereInput = { status: { not: CaseStatus.RESOLVED } };

  const [open, urgent, safeguarding, unclaimed] = await Promise.all([
    prisma.case.count({ where: openWhere }),
    prisma.case.count({ where: { ...openWhere, urgency: { in: [Urgency.HIGH, Urgency.CRITICAL] } } }),
    prisma.case.count({ where: { ...openWhere, safeguarding: true } }),
    prisma.case.count({ where: { ...openWhere, claimedById: null } }),
  ]);

  return { open, urgent, safeguarding, unclaimed };
}

export interface CaseDetailMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
}

export interface CaseDetailTriageResult {
  id: string;
  messageId: string;
  category: Category;
  urgency: Urgency;
  safeguarding: boolean;
  disposition: Disposition;
  reason: string | null;
  rawOutput: Prisma.JsonValue;
  createdAt: Date;
}

export interface CaseDetailResult {
  id: string;
  conversationId: string;
  summary: string;
  category: Category;
  urgency: Urgency;
  safeguarding: boolean;
  status: CaseStatus;
  createdAt: Date;
  updatedAt: Date;
  claimedAt: Date | null;
  claimedBy: { id: string; name: string } | null;
  student: { name: string; email: string };
  messages: CaseDetailMessage[];
  triageResults: CaseDetailTriageResult[];
}

/** One nested query (case + conversation + student + messages + their triage results) — not one query per message. Returns null if the Case doesn't exist. */
export async function getCaseDetail(caseId: string): Promise<CaseDetailResult | null> {
  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      claimedBy: { select: { id: true, name: true } },
      conversation: {
        include: {
          student: { select: { name: true, email: true } },
          messages: {
            orderBy: { createdAt: "asc" },
            include: { triageResults: { orderBy: { createdAt: "asc" } } },
          },
        },
      },
    },
  });

  if (!caseRow) return null;

  const { conversation, ...caseFields } = caseRow;
  const { student, messages } = conversation;

  return {
    ...caseFields,
    student,
    messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })),
    triageResults: messages.flatMap((m) => m.triageResults),
  };
}
