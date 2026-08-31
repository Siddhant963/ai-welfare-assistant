/**
 * Deterministic development seed data for the AI Welfare Assistant.
 *
 * DEV-ONLY: this script clears the app's own tables before reseeding, so
 * every run produces the same fixture set. Never point it at a database
 * that holds real student data.
 *
 * Run with: npm run db:seed
 */
import { prisma } from "../lib/db/client.ts";
import {
  Category,
  Urgency,
  Disposition,
  MessageRole,
  CaseStatus,
} from "../generated/prisma/client.ts";

async function clear() {
  // Delete order respects foreign keys (children before parents).
  await prisma.case.deleteMany();
  await prisma.triageResult.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.student.deleteMany();
  await prisma.knowledgeResource.deleteMany();
  await prisma.staff.deleteMany();
}

async function seedStaff() {
  const [priya, tom] = await Promise.all([
    prisma.staff.create({
      data: { name: "Priya Shah", email: "priya.shah@example-university.ac.uk" },
    }),
    prisma.staff.create({
      data: { name: "Tom Whitfield", email: "tom.whitfield@example-university.ac.uk" },
    }),
  ]);
  return { priya, tom };
}

/**
 * The 13 supplied knowledge-base topics, mapped onto the shared Category
 * enum. A few (IT help, careers, disability support) don't map cleanly onto
 * a 6-value enum — the mapping choice for each is a deliberate MVP call,
 * documented in docs/database.md, not something inferred here.
 */
async function seedKnowledgeResources() {
  await prisma.knowledgeResource.createMany({
    data: [
      {
        title: "Student Visa and CAS",
        category: Category.VISA_IMMIGRATION,
        content:
          "Official UK Government guidance on student visas and the Confirmation of Acceptance for Studies (CAS), including eligibility and how sponsorship works. Individual circumstances (expiry, withdrawal, refusal, sponsor changes) must go to a qualified adviser, not this guidance alone.",
        url: "https://www.gov.uk/student-visa",
      },
      {
        title: "University Hardship Fund",
        category: Category.FINANCIAL,
        content:
          "Emergency financial support for students facing unexpected hardship, such as delayed funding or unforeseen costs. Explains who can apply and how to start a claim.",
        url: "/resources/hardship-fund",
      },
      {
        title: "Tenancy Deposits",
        category: Category.HOUSING,
        content:
          "General guidance on tenancy deposit protection and what to do if a landlord disputes a deposit return. Complex or contested disputes should be referred to specialist advice.",
        url: "/resources/deposit-guide",
      },
      {
        title: "Academic Resources",
        category: Category.ACADEMIC,
        content:
          "Where to find library resources, past exam papers, and reading lists for taught modules.",
        url: "/resources/library",
      },
      {
        title: "Extenuating Circumstances",
        category: Category.ACADEMIC,
        content:
          "How to submit an extenuating circumstances claim when illness or personal difficulties affect coursework or exams.",
        url: "/resources/extenuating-circumstances",
      },
      {
        title: "IT and Account Support",
        category: Category.OTHER,
        content:
          "Help with university portal logins, account access issues, and general IT support requests.",
        url: "/resources/it-help",
      },
      {
        title: "Disability and Additional Learning Support",
        category: Category.ACADEMIC,
        content:
          "Support and reasonable adjustments available for students with disabilities or additional learning needs.",
        url: "/resources/disability-support",
      },
      {
        title: "Fees, Tuition and Payment Plans",
        category: Category.FINANCIAL,
        content:
          "Information on tuition fees, instalment plans, and options if a student is struggling to make a payment on time.",
        url: "/resources/fees",
      },
      {
        title: "Careers and Part-Time Work",
        category: Category.OTHER,
        content:
          "Careers advice and support finding part-time work alongside study.",
        url: "/resources/careers",
      },
      {
        title: "Wellbeing and Counselling",
        category: Category.HEALTH_WELLBEING,
        content:
          "University wellbeing and counselling services, including how to book an appointment and what support is available.",
        url: "/resources/wellbeing",
      },
      {
        title: "Reporting Harassment, Bullying or Sexual Misconduct",
        category: Category.HEALTH_WELLBEING,
        content:
          "How to report harassment, bullying, or sexual misconduct confidentially, and what support is available to students who report.",
        url: "/resources/report-and-support",
      },
      {
        title: "Samaritans",
        category: Category.HEALTH_WELLBEING,
        content:
          "Free, confidential, 24/7 emotional support for anyone in distress. Call 116 123.",
        url: null,
      },
      {
        title: "Emergency Services",
        category: Category.HEALTH_WELLBEING,
        content:
          "Call 999 immediately if there is any immediate danger to life or safety.",
        url: null,
      },
    ],
  });
}

/** Scenario A — routine academic enquiry, handled now, no case. */
async function seedAcademicScenario() {
  const student = await prisma.student.create({
    data: { name: "Aisha Khan", email: "aisha.khan@student.example-university.ac.uk" },
  });
  const conversation = await prisma.conversation.create({
    data: { studentId: student.id },
  });
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: MessageRole.STUDENT,
      content:
        "Where can I find past exam papers and reading lists for my Master's modules?",
    },
  });
  await prisma.triageResult.create({
    data: {
      messageId: message.id,
      category: Category.ACADEMIC,
      urgency: Urgency.LOW,
      safeguarding: false,
      disposition: Disposition.HANDLE_NOW,
      reason: "Routine academic resource request, no risk signals.",
      rawOutput: {
        category: "academic",
        urgency: "low",
        safeguarding: false,
        disposition: "handle_now",
        confidence: 0.94,
      },
    },
  });
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: MessageRole.ASSISTANT,
      content:
        "You can find past exam papers and reading lists through the library resource hub: /resources/library.",
    },
  });
}

/** Scenario B — financial enquiry, handled now with grounded guidance. */
async function seedFinancialScenario() {
  const student = await prisma.student.create({
    data: { name: "Marcus Lee", email: "marcus.lee@student.example-university.ac.uk" },
  });
  const conversation = await prisma.conversation.create({
    data: { studentId: student.id },
  });
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: MessageRole.STUDENT,
      content:
        "My scholarship instalment still hasn't arrived and my rent is due this Friday. I'm getting worried.",
    },
  });
  await prisma.triageResult.create({
    data: {
      messageId: message.id,
      category: Category.FINANCIAL,
      urgency: Urgency.HIGH,
      safeguarding: false,
      disposition: Disposition.HANDLE_NOW,
      reason: "Time-pressured financial gap with a near-term deadline; no risk signals present.",
      rawOutput: {
        category: "financial",
        urgency: "high",
        safeguarding: false,
        disposition: "handle_now",
        confidence: 0.81,
      },
    },
  });
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: MessageRole.ASSISTANT,
      content:
        "If your scholarship payment is delayed, the University Hardship Fund can provide emergency short-term support — see /resources/hardship-fund for how to apply.",
    },
  });
}

/** Scenario C — visa/immigration escalation, no individual advice given. */
async function seedVisaScenario(staffId: undefined | string = undefined) {
  const student = await prisma.student.create({
    data: { name: "Ana Petrova", email: "ana.petrova@student.example-university.ac.uk" },
  });
  const conversation = await prisma.conversation.create({
    data: { studentId: student.id },
  });
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: MessageRole.STUDENT,
      content:
        "My visa expires in 9 days and my university just withdrew my CAS. I don't know what happens to me now, please help urgently.",
    },
  });
  await prisma.triageResult.create({
    data: {
      messageId: message.id,
      category: Category.VISA_IMMIGRATION,
      urgency: Urgency.CRITICAL,
      safeguarding: false,
      disposition: Disposition.ESCALATE,
      reason:
        "Depends on the student's individual immigration circumstances (CAS withdrawal, expiry timeline) — must not receive individualised advice; routed to a qualified adviser.",
      rawOutput: {
        category: "visa_immigration",
        urgency: "critical",
        safeguarding: false,
        disposition: "escalate",
        confidence: 0.9,
      },
    },
  });
  await prisma.case.create({
    data: {
      conversationId: conversation.id,
      summary:
        "Student's CAS was withdrawn and their visa expires in 9 days. Needs urgent review by a qualified immigration adviser — do not provide individualised visa advice directly.",
      category: Category.VISA_IMMIGRATION,
      urgency: Urgency.CRITICAL,
      safeguarding: false,
      status: CaseStatus.NEW,
      claimedById: staffId ?? null,
    },
  });
}

/** Scenario D — wellbeing/crisis escalation, already claimed by staff. */
async function seedCrisisScenario(staffId: string) {
  const student = await prisma.student.create({
    data: { name: "Daniel Osei", email: "daniel.osei@student.example-university.ac.uk" },
  });
  const conversation = await prisma.conversation.create({
    data: { studentId: student.id },
  });
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: MessageRole.STUDENT,
      content:
        "I've been feeling really low for weeks, I haven't left my room or eaten properly in days and I don't really see the point of anything anymore.",
    },
  });
  await prisma.triageResult.create({
    data: {
      messageId: message.id,
      category: Category.HEALTH_WELLBEING,
      urgency: Urgency.CRITICAL,
      safeguarding: true,
      disposition: Disposition.ESCALATE,
      reason:
        "Language indicates possible crisis/risk (prolonged low mood, not eating, loss of sense of purpose). Deterministic safeguarding rule forces escalation regardless of AI confidence.",
      rawOutput: {
        category: "health_wellbeing",
        urgency: "critical",
        safeguarding: true,
        disposition: "escalate",
        confidence: 0.88,
      },
    },
  });
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: MessageRole.ASSISTANT,
      content:
        "I'm really sorry you're feeling this way. If you're in immediate danger, please call 999. You can also reach Samaritans any time on 116 123. I've asked a member of staff to follow up with you personally — this conversation stays open until they do.",
    },
  });
  await prisma.case.create({
    data: {
      conversationId: conversation.id,
      summary:
        "Student reports feeling low for weeks, not eating or leaving their room, and a loss of sense of purpose. Safeguarding concern — needs urgent human follow-up. Not to be closed automatically.",
      category: Category.HEALTH_WELLBEING,
      urgency: Urgency.CRITICAL,
      safeguarding: true,
      status: CaseStatus.IN_PROGRESS,
      claimedById: staffId,
      claimedAt: new Date(),
    },
  });
}

/** Scenario E — vague message, clarifying question, then re-triage on the new reply. */
async function seedClarificationScenario() {
  const student = await prisma.student.create({
    data: { name: "Grace Thompson", email: "grace.thompson@student.example-university.ac.uk" },
  });
  const conversation = await prisma.conversation.create({
    data: { studentId: student.id },
  });

  const firstMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: MessageRole.STUDENT,
      content: "need help asap",
    },
  });
  await prisma.triageResult.create({
    data: {
      messageId: firstMessage.id,
      category: Category.OTHER,
      urgency: Urgency.MEDIUM,
      safeguarding: false,
      disposition: Disposition.ASK_CLARIFYING,
      reason: "Too vague to categorise or route safely; no danger signal present, so clarify rather than escalate.",
      rawOutput: {
        category: "other",
        urgency: "medium",
        safeguarding: false,
        disposition: "ask_clarifying",
        confidence: 0.4,
      },
    },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: MessageRole.ASSISTANT,
      content:
        "Could you tell me a bit more about what you need help with — for example, is it about your course, finances, housing, or something else?",
    },
  });

  const secondMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: MessageRole.STUDENT,
      content:
        "Sorry — my laptop won't log into the university portal and I have an assignment due tomorrow.",
    },
  });
  await prisma.triageResult.create({
    data: {
      messageId: secondMessage.id,
      category: Category.OTHER,
      urgency: Urgency.MEDIUM,
      safeguarding: false,
      disposition: Disposition.HANDLE_NOW,
      reason: "Re-triage after clarification: account/portal access issue, no risk indicators.",
      rawOutput: {
        category: "other",
        urgency: "medium",
        safeguarding: false,
        disposition: "handle_now",
        confidence: 0.86,
      },
    },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: MessageRole.ASSISTANT,
      content:
        "For portal login or account access issues, IT support can help — see /resources/it-help.",
    },
  });
}

/**
 * Scenario F — multiple triage attempts on the SAME message, and the test
 * scenario where a financial-looking message hides a wellbeing risk: a
 * category label alone must never suppress a safeguarding escalation.
 */
async function seedHiddenSafeguardingScenario() {
  const student = await prisma.student.create({
    data: { name: "Liam Carter", email: "liam.carter@student.example-university.ac.uk" },
  });
  const conversation = await prisma.conversation.create({
    data: { studentId: student.id },
  });
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: MessageRole.STUDENT,
      content:
        "I just lost my part-time job, I'm really stressed about money, and honestly my mental health has been going downhill because of it.",
    },
  });

  // Attempt 1: AI's initial pass, taken at face value.
  const firstAttempt = await prisma.triageResult.create({
    data: {
      messageId: message.id,
      category: Category.FINANCIAL,
      urgency: Urgency.MEDIUM,
      safeguarding: false,
      disposition: Disposition.HANDLE_NOW,
      reason: "Initial AI pass classified this as a financial-hardship enquiry only.",
      rawOutput: {
        category: "financial",
        urgency: "medium",
        safeguarding: false,
        disposition: "handle_now",
        confidence: 0.62,
      },
    },
  });

  // Attempt 2: deterministic safeguarding rule re-evaluates the same message
  // and overrides the AI's category-only read. Both attempts are kept.
  await prisma.triageResult.create({
    data: {
      messageId: message.id,
      category: Category.HEALTH_WELLBEING,
      urgency: Urgency.HIGH,
      safeguarding: true,
      disposition: Disposition.ESCALATE,
      reason:
        "Deterministic safeguarding rule flagged wellbeing language ('mental health... going downhill') that the financial-only classification missed; overriding attempt " +
        firstAttempt.id +
        " and escalating.",
      rawOutput: {
        category: "health_wellbeing",
        urgency: "high",
        safeguarding: true,
        disposition: "escalate",
        note: "rule-engine override of initial financial-only classification",
        overriddenAttemptId: firstAttempt.id,
      },
    },
  });

  await prisma.case.create({
    data: {
      conversationId: conversation.id,
      summary:
        "Student lost their part-time job; message framed as financial stress but also describes declining mental health. Escalated on safeguarding grounds despite the financial-only surface classification. Needs a human check-in.",
      category: Category.HEALTH_WELLBEING,
      urgency: Urgency.HIGH,
      safeguarding: true,
      status: CaseStatus.NEW,
    },
  });
}

async function main() {
  await clear();
  const { priya, tom } = await seedStaff();
  await seedKnowledgeResources();
  await seedAcademicScenario();
  await seedFinancialScenario();
  await seedVisaScenario();
  await seedCrisisScenario(priya.id);
  await seedClarificationScenario();
  await seedHiddenSafeguardingScenario();
  void tom; // second staff member exists as an unclaimed-case candidate for dashboard testing

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
