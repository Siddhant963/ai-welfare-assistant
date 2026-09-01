/**
 * Database verification.
 *
 * Creates its own throwaway fixtures (prefixed "verify-"), exercises the
 * schema's real capabilities against the live database, then deletes what
 * it created. Safe to rerun. Exits non-zero if any check fails.
 *
 * Run with: npm run db:verify
 */
import { prisma } from "../lib/db/client.ts";
import {
  Category,
  Urgency,
  Disposition,
  MessageRole,
  CaseStatus,
} from "../generated/prisma/client.ts";
import { claimCase } from "../lib/db/claimCase.ts";

type CheckResult = { name: string; pass: boolean; detail?: string };
const results: CheckResult[] = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, pass: true });
  } catch (error) {
    results.push({
      name,
      pass: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const suffix = Date.now().toString(36);
  const studentEmail = `verify-student-${suffix}@example.test`;
  const staffEmailA = `verify-staff-a-${suffix}@example.test`;
  const staffEmailB = `verify-staff-b-${suffix}@example.test`;

  let studentId = "";
  let conversationId = "";
  let messageId = "";
  let caseId = "";
  let staffAId = "";
  let staffBId = "";

  await check("Student -> multiple Conversations (1:N)", async () => {
    const student = await prisma.student.create({
      data: { name: "Verify Student", email: studentEmail },
    });
    studentId = student.id;

    const convoA = await prisma.conversation.create({ data: { studentId } });
    const convoB = await prisma.conversation.create({ data: { studentId } });
    conversationId = convoA.id;

    const found = await prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { conversations: true },
    });
    assert(found.conversations.length === 2, `expected 2 conversations, got ${found.conversations.length}`);

    // Keep convoA for later checks, remove the extra one.
    await prisma.conversation.delete({ where: { id: convoB.id } });
  });

  await check("Conversation -> multiple Messages (1:N)", async () => {
    const m1 = await prisma.message.create({
      data: { conversationId, role: MessageRole.STUDENT, content: "First message" },
    });
    const m2 = await prisma.message.create({
      data: { conversationId, role: MessageRole.ASSISTANT, content: "Second message" },
    });
    messageId = m1.id;

    const found = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: { messages: true },
    });
    assert(found.messages.length === 2, `expected 2 messages, got ${found.messages.length}`);
    void m2;
  });

  await check("Message -> multiple TriageResults (1:N, audit history preserved)", async () => {
    await prisma.triageResult.create({
      data: {
        messageId,
        category: Category.OTHER,
        urgency: Urgency.LOW,
        safeguarding: false,
        disposition: Disposition.ASK_CLARIFYING,
        rawOutput: { attempt: 1 },
      },
    });
    await prisma.triageResult.create({
      data: {
        messageId,
        category: Category.ACADEMIC,
        urgency: Urgency.LOW,
        safeguarding: false,
        disposition: Disposition.HANDLE_NOW,
        rawOutput: { attempt: 2 },
      },
    });

    const found = await prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: { triageResults: true },
    });
    assert(found.triageResults.length === 2, `expected 2 triage results, got ${found.triageResults.length}`);
  });

  await check("Conversation -> at most one Case (0:1)", async () => {
    const created = await prisma.case.create({
      data: {
        conversationId,
        summary: "Verification case",
        category: Category.OTHER,
        urgency: Urgency.LOW,
        safeguarding: false,
        status: CaseStatus.NEW,
      },
    });
    caseId = created.id;

    let secondCaseRejected = false;
    try {
      await prisma.case.create({
        data: {
          conversationId,
          summary: "Duplicate case for same conversation",
          category: Category.OTHER,
          urgency: Urgency.LOW,
          safeguarding: false,
          status: CaseStatus.NEW,
        },
      });
    } catch {
      secondCaseRejected = true;
    }
    assert(secondCaseRejected, "a second Case for the same conversation was NOT rejected — @unique on conversationId is missing or not enforced");
  });

  await check("Case.claimedBy optionally references Staff", async () => {
    const staffA = await prisma.staff.create({ data: { name: "Verify Staff A", email: staffEmailA } });
    const staffB = await prisma.staff.create({ data: { name: "Verify Staff B", email: staffEmailB } });
    staffAId = staffA.id;
    staffBId = staffB.id;

    const unclaimed = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    assert(unclaimed.claimedById === null, "expected a freshly created case to be unclaimed");
  });

  await check("Unique email constraint is enforced (Student and Staff)", async () => {
    let studentDupRejected = false;
    try {
      await prisma.student.create({ data: { name: "Dup", email: studentEmail } });
    } catch {
      studentDupRejected = true;
    }
    assert(studentDupRejected, "duplicate student email was NOT rejected");

    let staffDupRejected = false;
    try {
      await prisma.staff.create({ data: { name: "Dup", email: staffEmailA } });
    } catch {
      staffDupRejected = true;
    }
    assert(staffDupRejected, "duplicate staff email was NOT rejected");
  });

  await check("Foreign-key relationships are enforced", async () => {
    let fkRejected = false;
    try {
      await prisma.message.create({
        data: { conversationId: "does-not-exist", role: MessageRole.STUDENT, content: "orphan" },
      });
    } catch {
      fkRejected = true;
    }
    assert(fkRejected, "creating a Message with a non-existent conversationId was NOT rejected");
  });

  await check("Enums reject invalid values at the database level", async () => {
    let enumRejected = false;
    try {
      // Bypass Prisma's TypeScript types to prove the constraint lives in
      // Postgres itself and not only in the TS layer.
      await prisma.$executeRawUnsafe(
        `UPDATE "Case" SET "status" = 'NOT_A_REAL_STATUS' WHERE "id" = $1`,
        caseId
      );
    } catch {
      enumRejected = true;
    }
    assert(enumRejected, "an invalid enum value was NOT rejected by the database");
  });

  await check("Knowledge resources are queryable by category", async () => {
    const total = await prisma.knowledgeResource.count();
    const wellbeing = await prisma.knowledgeResource.findMany({
      where: { category: Category.HEALTH_WELLBEING },
    });
    assert(total >= 13, `expected at least 13 seeded knowledge resources, found ${total}`);
    assert(wellbeing.length >= 1, "expected at least one HEALTH_WELLBEING knowledge resource");
  });

  await check("Atomic case claim: exactly one of two concurrent claims succeeds", async () => {
    const [resultA, resultB] = await Promise.all([
      claimCase(caseId, staffAId),
      claimCase(caseId, staffBId),
    ]);
    const claimedCount = [resultA, resultB].filter((r) => r.claimed).length;
    assert(claimedCount === 1, `expected exactly 1 successful claim, got ${claimedCount}`);

    const finalCase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    assert(finalCase.status === CaseStatus.IN_PROGRESS, "expected case status to be IN_PROGRESS after claim");
    assert(finalCase.claimedById === staffAId || finalCase.claimedById === staffBId, "expected claimedById to be set to one of the two staff members");

    const secondAttempt = await claimCase(caseId, staffAId);
    assert(secondAttempt.claimed === false, "a case that is already claimed was claimable again");
  });

  // --- cleanup ---
  await prisma.case.deleteMany({ where: { id: caseId } });
  await prisma.triageResult.deleteMany({ where: { messageId } });
  await prisma.message.deleteMany({ where: { conversationId } });
  await prisma.conversation.deleteMany({ where: { studentId } });
  await prisma.student.deleteMany({ where: { id: studentId } });
  await prisma.staff.deleteMany({ where: { id: { in: [staffAId, staffBId].filter(Boolean) } } });

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
