/**
 * Phase 9 staff dashboard verification.
 *
 * Tests the server-side data functions directly (lib/db/staffCases.ts) —
 * there is no browser automation in this environment, so visual rendering
 * is not tested here; the underlying queries, ordering, filtering,
 * pagination, and metrics are. Creates its own throwaway fixtures
 * (prefixed "verify-staff"), cleans them up at the end, and never touches
 * the 3 pre-existing seeded Case rows or the 2 seeded Staff rows.
 *
 * Run with: npm run staff:verify
 */
import { prisma } from "../lib/db/client.ts";
import {
  getCaseDetail,
  getCaseMetrics,
  listCases,
} from "../lib/db/staffCases.ts";
import { claimCase } from "../lib/db/claimCase.ts";
import { Category, CaseStatus, MessageRole, Urgency } from "../generated/prisma/client.ts";

type CheckResult = { name: string; pass: boolean; detail?: string };
const results: CheckResult[] = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, pass: true });
  } catch (error) {
    results.push({ name, pass: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const suffix = Date.now().toString(36);
const studentIds: string[] = [];
const conversationIds: string[] = [];
const caseIds: string[] = [];
const messageIds: string[] = [];

async function makeCase(opts: {
  label: string;
  urgency: Urgency;
  safeguarding: boolean;
  status?: CaseStatus;
  createdAt?: Date;
  studentName?: string;
}) {
  const student = await prisma.student.create({
    data: {
      name: opts.studentName ?? `Verify Staff ${opts.label}`,
      email: `verify-staff-${opts.label}-${suffix}@example.test`,
    },
  });
  studentIds.push(student.id);

  const conversation = await prisma.conversation.create({ data: { studentId: student.id } });
  conversationIds.push(conversation.id);

  const message = await prisma.message.create({
    data: { conversationId: conversation.id, role: MessageRole.STUDENT, content: `Test message for ${opts.label}` },
  });
  messageIds.push(message.id);

  const triage = await prisma.triageResult.create({
    data: {
      messageId: message.id,
      category: Category.OTHER,
      urgency: opts.urgency,
      safeguarding: opts.safeguarding,
      disposition: "ESCALATE",
      reason: `fixture for ${opts.label}`,
      rawOutput: { fixture: opts.label },
    },
  });

  const caseRow = await prisma.case.create({
    data: {
      conversationId: conversation.id,
      summary: `Fixture case for ${opts.label}`,
      category: Category.OTHER,
      urgency: opts.urgency,
      safeguarding: opts.safeguarding,
      status: opts.status ?? CaseStatus.NEW,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
  caseIds.push(caseRow.id);

  return { student, conversation, message, triage, case: caseRow };
}

async function main() {
  const now = Date.now();

  // Fixtures for ordering tests (2, 3, 4) — created together so one queue
  // fetch can prove urgency, safeguarding, and recency precedence at once.
  const critical = await makeCase({ label: "critical", urgency: Urgency.CRITICAL, safeguarding: false });
  const highSafeguarding = await makeCase({ label: "high-sg", urgency: Urgency.HIGH, safeguarding: true });
  const highNewer = await makeCase({
    label: "high-newer",
    urgency: Urgency.HIGH,
    safeguarding: false,
    createdAt: new Date(now - 1_000),
  });
  const highOlder = await makeCase({
    label: "high-older",
    urgency: Urgency.HIGH,
    safeguarding: false,
    createdAt: new Date(now - 60_000),
  });
  const medium = await makeCase({ label: "medium", urgency: Urgency.MEDIUM, safeguarding: false });
  const low = await makeCase({ label: "low", urgency: Urgency.LOW, safeguarding: false });

  // Fixture for status filtering (11) — same urgency tier as others but IN_PROGRESS.
  const inProgress = await makeCase({
    label: "in-progress",
    urgency: Urgency.MEDIUM,
    safeguarding: false,
    status: CaseStatus.IN_PROGRESS,
  });

  // Fixture for search (14).
  const searchable = await makeCase({
    label: "search",
    urgency: Urgency.LOW,
    safeguarding: false,
    studentName: `Zzyxqvor Distinctive ${suffix}`,
  });

  await check("TEST 1 — dashboard can retrieve existing Cases", async () => {
    const result = await listCases({ pageSize: 100 });
    assert(result.cases.length > 0, "expected at least one Case to be retrievable");
    assert(result.totalCount >= 3, "expected at least the 3 permanently seeded cases to be counted");
  });

  await check("TEST 2, 3, 4 — ordering: urgency desc, safeguarding desc, createdAt desc", async () => {
    const result = await listCases({ pageSize: 100 });
    const indexOf = (id: string) => result.cases.findIndex((c) => c.id === id);

    const iCritical = indexOf(critical.case.id);
    const iHighSg = indexOf(highSafeguarding.case.id);
    const iHighNewer = indexOf(highNewer.case.id);
    const iHighOlder = indexOf(highOlder.case.id);
    const iMedium = indexOf(medium.case.id);
    const iLow = indexOf(low.case.id);

    assert([iCritical, iHighSg, iHighNewer, iHighOlder, iMedium, iLow].every((i) => i >= 0), "all fixture cases must appear in a 100-row page");

    assert(iCritical < iHighSg, "TEST 2: CRITICAL must sort before HIGH");
    assert(iHighSg < iHighNewer, "TEST 3: safeguarding=true must sort before safeguarding=false within the same urgency");
    assert(iHighNewer < iHighOlder, "TEST 4: newer createdAt must sort before older within the same urgency+safeguarding tier");
    assert(iHighOlder < iMedium, "HIGH must sort before MEDIUM");
    assert(iMedium < iLow, "MEDIUM must sort before LOW");
  });

  await check("TEST 5 — student information is correctly related", async () => {
    const detail = await getCaseDetail(critical.case.id);
    assert(detail !== null, "expected the case to be found");
    assert(detail!.student.email === critical.student.email, "student email must match the actual related Student row");
    assert(detail!.student.name === critical.student.name, "student name must match the actual related Student row");
  });

  await check("TEST 6 — conversation is correctly related", async () => {
    const detail = await getCaseDetail(critical.case.id);
    assert(detail !== null, "expected the case to be found");
    assert(detail!.conversationId === critical.conversation.id, "conversationId must match the Case's actual conversation");
    assert(detail!.messages.some((m) => m.id === critical.message.id), "the fixture message must appear in the conversation");
  });

  await check("TEST 7 — TriageResult records are available for the case's conversation", async () => {
    const detail = await getCaseDetail(critical.case.id);
    assert(detail !== null, "expected the case to be found");
    assert(
      detail!.triageResults.some((t) => t.id === critical.triage.id),
      "the fixture TriageResult must appear in the case detail"
    );
  });

  await check("TEST 8 — case detail lookup works", async () => {
    const detail = await getCaseDetail(critical.case.id);
    assert(detail !== null && detail.id === critical.case.id, "expected getCaseDetail to return the matching case");
  });

  await check("TEST 9 — non-existent Case returns a proper not-found result (null)", async () => {
    const detail = await getCaseDetail("definitely-not-a-real-case-id-xyz");
    assert(detail === null, "expected null for a non-existent case id, not a thrown error or a fabricated result");
  });

  await check("TEST 10 — pagination works", async () => {
    const page1 = await listCases({ pageSize: 2, page: 1 });
    const page2 = await listCases({ pageSize: 2, page: 2 });
    assert(page1.cases.length <= 2 && page2.cases.length <= 2, "each page must respect the requested page size");
    const page1Ids = new Set(page1.cases.map((c) => c.id));
    const overlap = page2.cases.filter((c) => page1Ids.has(c.id));
    assert(overlap.length === 0, "page 1 and page 2 must not return overlapping cases");
    assert(page1.totalPages === Math.max(1, Math.ceil(page1.totalCount / 2)), "totalPages must be computed from the real totalCount");
  });

  await check("TEST 11 — filtering by status works", async () => {
    const result = await listCases({ filter: "new", pageSize: 100 });
    assert(result.cases.every((c) => c.status === CaseStatus.NEW), "every result under the 'new' filter must have status NEW");
    assert(!result.cases.some((c) => c.id === inProgress.case.id), "an IN_PROGRESS fixture must not appear under the 'new' filter");
  });

  await check("TEST 12 — filtering by safeguarding works", async () => {
    const result = await listCases({ filter: "safeguarding", pageSize: 100 });
    assert(result.cases.length > 0, "expected at least one safeguarding case");
    assert(result.cases.every((c) => c.safeguarding === true), "every result under the 'safeguarding' filter must have safeguarding=true");
    assert(result.cases.some((c) => c.id === highSafeguarding.case.id), "the safeguarding fixture must appear");
  });

  await check("TEST 13 — filtering by urgency works", async () => {
    const result = await listCases({ filter: "critical", pageSize: 100 });
    assert(result.cases.every((c) => c.urgency === Urgency.CRITICAL), "every result under the 'critical' filter must have urgency CRITICAL");
    assert(result.cases.some((c) => c.id === critical.case.id), "the critical fixture must appear");
  });

  await check("TEST 14 — search by student name works", async () => {
    const result = await listCases({ search: "Zzyxqvor Distinctive", pageSize: 100 });
    assert(result.cases.some((c) => c.id === searchable.case.id), "expected the search to find the case by distinctive student name");
  });

  await check("TEST 14b — search by student email works", async () => {
    const result = await listCases({ search: searchable.student.email, pageSize: 100 });
    assert(result.cases.some((c) => c.id === searchable.case.id), "expected the search to find the case by exact student email");
  });

  await check("TEST 15 — dashboard metrics use real database count queries", async () => {
    const metrics = await getCaseMetrics();
    const [openCheck, urgentCheck, safeguardingCheck, unclaimedCheck] = await Promise.all([
      prisma.case.count({ where: { status: { not: CaseStatus.RESOLVED } } }),
      prisma.case.count({ where: { status: { not: CaseStatus.RESOLVED }, urgency: { in: [Urgency.HIGH, Urgency.CRITICAL] } } }),
      prisma.case.count({ where: { status: { not: CaseStatus.RESOLVED }, safeguarding: true } }),
      prisma.case.count({ where: { status: { not: CaseStatus.RESOLVED }, claimedById: null } }),
    ]);
    assert(metrics.open === openCheck, `open metric (${metrics.open}) must match an independent COUNT (${openCheck})`);
    assert(metrics.urgent === urgentCheck, `urgent metric (${metrics.urgent}) must match an independent COUNT (${urgentCheck})`);
    assert(
      metrics.safeguarding === safeguardingCheck,
      `safeguarding metric (${metrics.safeguarding}) must match an independent COUNT (${safeguardingCheck})`
    );
    assert(metrics.unclaimed === unclaimedCheck, `unclaimed metric (${metrics.unclaimed}) must match an independent COUNT (${unclaimedCheck})`);
  });

  await check("TEST 16 — the main queue query does not exhibit an N+1 pattern", async () => {
    let queryCount = 0;
    const listener = () => {
      queryCount++;
    };
    prisma.$on("query", listener);
    try {
      const result = await listCases({ pageSize: 100 });
      assert(result.cases.length >= 8, "expected enough rows in this run to make an N+1 pattern detectable");
      assert(
        queryCount <= 5,
        `expected a small, bounded number of SQL queries for the whole queue fetch, observed ${queryCount} (would scale with row count under N+1)`
      );
    } finally {
      // No $off() in this Prisma version's event emitter; the listener is
      // harmless (just increments a local counter) and this script exits
      // right after, so it is not worth working around.
      void listener;
    }
  });

  await check("TEST 17 — existing atomic claim helper still works against a Phase 9 fixture case", async () => {
    const staff = await prisma.staff.findMany({ take: 2 });
    assert(staff.length >= 2, "expected at least 2 seeded Staff records");

    const target = await makeCase({ label: "claim", urgency: Urgency.HIGH, safeguarding: false });
    const [a, b] = await Promise.all([claimCase(target.case.id, staff[0].id), claimCase(target.case.id, staff[1].id)]);
    const claimedCount = [a, b].filter((r) => r.claimed).length;
    assert(claimedCount === 1, `expected exactly 1 successful claim, got ${claimedCount}`);
  });

  // --- cleanup ---
  await prisma.case.deleteMany({ where: { id: { in: caseIds } } });
  await prisma.triageResult.deleteMany({ where: { messageId: { in: messageIds } } });
  await prisma.message.deleteMany({ where: { id: { in: messageIds } } });
  await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"} - ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Verification script crashed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
