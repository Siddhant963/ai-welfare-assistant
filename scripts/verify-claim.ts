/**
 * Claim-workflow verification.
 *
 * Exercises lib/db/claimCase.ts directly against the real Neon database,
 * using the 2 real seeded Staff records — no fake staff created. Creates
 * its own throwaway Student/Conversation/Case fixtures, cleans them up at
 * the end. Exits non-zero if any check fails.
 *
 * Run with: npm run claim:verify
 */
import { prisma } from "../lib/db/client.ts";
import { claimCase } from "../lib/db/claimCase.ts";
import { Category, CaseStatus, Urgency } from "../generated/prisma/client.ts";

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

async function makeCase(label: string) {
  const student = await prisma.student.create({
    data: { name: `Verify Claim ${label}`, email: `verify-claim-${label}-${suffix}@example.test` },
  });
  studentIds.push(student.id);

  const conversation = await prisma.conversation.create({ data: { studentId: student.id } });
  conversationIds.push(conversation.id);

  const caseRow = await prisma.case.create({
    data: {
      conversationId: conversation.id,
      summary: `Fixture case for ${label}`,
      category: Category.HOUSING,
      urgency: Urgency.HIGH,
      safeguarding: false,
      status: CaseStatus.NEW,
    },
  });
  caseIds.push(caseRow.id);

  return { student, conversation, case: caseRow };
}

async function main() {
  const staffRows = await prisma.staff.findMany({ orderBy: { createdAt: "asc" }, take: 2 });
  if (staffRows.length < 2) {
    throw new Error("Expected at least 2 seeded Staff records — none were created by this script.");
  }
  const [staffA, staffB] = staffRows;

  const fixture1 = await makeCase("basic");

  await check("TEST 1 — claim an existing unclaimed case", async () => {
    const result = await claimCase(fixture1.case.id, staffA.id);
    assert(result.claimed === true, "expected the first claim to succeed");

    const row = await prisma.case.findUniqueOrThrow({ where: { id: fixture1.case.id } });
    assert(row.claimedById === staffA.id, "claimedById must equal Staff A's id");
    assert(row.status === CaseStatus.IN_PROGRESS, "status must move to IN_PROGRESS on claim");
    assert(row.claimedAt !== null, "claimedAt must be set");
  });

  await check("TEST 2 — same staff claiming again does not duplicate or error", async () => {
    const result = await claimCase(fixture1.case.id, staffA.id);
    assert(result.claimed === false && result.reason === "already_claimed", "a repeat claim by the same staff must report already_claimed, not succeed as a fresh claim");

    const row = await prisma.case.findUniqueOrThrow({ where: { id: fixture1.case.id } });
    assert(row.claimedById === staffA.id, "the case must still belong to Staff A");
  });

  await check("TEST 3 — a different staff member cannot overwrite an existing claim", async () => {
    const result = await claimCase(fixture1.case.id, staffB.id);
    assert(result.claimed === false && result.reason === "already_claimed", "Staff B's claim attempt must fail");

    const row = await prisma.case.findUniqueOrThrow({ where: { id: fixture1.case.id } });
    assert(row.claimedById === staffA.id, "claimedById must remain Staff A — never overwritten by Staff B");
  });

  const fixture2 = await makeCase("concurrent");

  let winnerId: string | undefined;
  await check("TEST 4 — concurrent claims: exactly one succeeds", async () => {
    const [resultA, resultB] = await Promise.all([
      claimCase(fixture2.case.id, staffA.id),
      claimCase(fixture2.case.id, staffB.id),
    ]);
    const claims = [
      { staffId: staffA.id, result: resultA },
      { staffId: staffB.id, result: resultB },
    ];
    const winners = claims.filter((c) => c.result.claimed);
    assert(winners.length === 1, `expected exactly 1 winner, got ${winners.length}`);
    winnerId = winners[0].staffId;
  });

  await check("TEST 5 — final database state matches exactly the winner, never both/neither", async () => {
    assert(winnerId !== undefined, "TEST 4 must have run first and recorded a winner");
    const row = await prisma.case.findUniqueOrThrow({ where: { id: fixture2.case.id } });
    assert(row.claimedById === winnerId, `claimedById (${row.claimedById}) must equal the recorded winner (${winnerId})`);
  });

  await check("TEST 6 — claiming a non-existent case returns not_found", async () => {
    const result = await claimCase("definitely-not-a-real-case-id-xyz", staffA.id);
    assert(result.claimed === false && result.reason === "not_found", "expected not_found for a non-existent case id");
  });

  const fixture3 = await makeCase("safety-fields");

  await check("TEST 7 — safety fields (urgency/safeguarding/category) are unchanged by claiming", async () => {
    const before = await prisma.case.findUniqueOrThrow({ where: { id: fixture3.case.id } });
    await claimCase(fixture3.case.id, staffA.id);
    const after = await prisma.case.findUniqueOrThrow({ where: { id: fixture3.case.id } });

    assert(after.urgency === before.urgency, "urgency must not change on claim");
    assert(after.safeguarding === before.safeguarding, "safeguarding must not change on claim");
    assert(after.category === before.category, "category must not change on claim");
  });

  await check("TEST 8 — student and conversation relationships are unchanged by claiming", async () => {
    const row = await prisma.case.findUniqueOrThrow({
      where: { id: fixture3.case.id },
      include: { conversation: { include: { student: true } } },
    });
    assert(row.conversationId === fixture3.conversation.id, "conversationId must be unchanged");
    assert(row.conversation.studentId === fixture3.student.id, "the conversation's student must be unchanged");
    assert(row.conversation.student.email === fixture3.student.email, "the student record itself must be unchanged");
  });

  await check("TEST 9 — the claimedBy relation resolves to the correct Staff row", async () => {
    const row = await prisma.case.findUniqueOrThrow({
      where: { id: fixture3.case.id },
      include: { claimedBy: true },
    });
    assert(row.claimedBy !== null, "expected claimedBy to resolve");
    assert(row.claimedBy!.id === staffA.id, "claimedBy.id must match the claiming staff member");
    assert(row.claimedBy!.name === staffA.name, "claimedBy.name must match the real Staff record");
  });

  // --- cleanup ---
  await prisma.case.deleteMany({ where: { id: { in: caseIds } } });
  await prisma.message.deleteMany({ where: { id: { in: messageIds } } });
  await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"} - ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  console.log(
    "\nNote: TEST 10 (existing claim behavior) is covered by running `npm run db:verify` separately."
  );
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
