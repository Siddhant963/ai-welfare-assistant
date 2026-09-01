/**
 * Production smoke test.
 *
 * A quick, real-HTTP sanity check of a running production build — lighter
 * than `assessment:verify` (which exhaustively re-proves every brief
 * requirement) and `security:verify` (which is security-focused). This one
 * answers a narrower question: "is this deployed build actually serving
 * the golden paths correctly?"
 *
 * Uses only the existing development environment (no separate production
 * credentials). Creates its own throwaway fixtures (prefixed "prodcheck-"),
 * cleans them up at the end, and never touches pre-existing/permanent data.
 *
 * Run with: npm run production:verify
 */
import { spawn, type ChildProcess } from "node:child_process";
import { prisma } from "../lib/db/client.ts";

// ---------------------------------------------------------------------------
// Report harness
// ---------------------------------------------------------------------------

interface ReportEntry {
  name: string;
  pass: boolean;
  detail?: string;
}
const report: ReportEntry[] = [];

function pass(name: string) {
  report.push({ name, pass: true });
  console.log(`[PASS] ${name}`);
}
function fail(name: string, detail: string) {
  report.push({ name, pass: false, detail });
  console.log(`[FAIL] ${name} — ${detail}`);
}
async function section(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    pass(name);
  } catch (error) {
    fail(name, error instanceof Error ? error.message : String(error));
  }
}
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// ---------------------------------------------------------------------------
// Server management — start (or reuse) a real production server
// ---------------------------------------------------------------------------

const PORT = 3497;
const BASE_URL = `http://localhost:${PORT}`;
let serverProcess: ChildProcess | null = null;
let serverWasAlreadyRunning = false;

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer(): Promise<void> {
  if (await isServerUp()) {
    serverWasAlreadyRunning = true;
    console.log(`(reusing an already-running server on port ${PORT})`);
    return;
  }

  console.log(`Starting a production server on port ${PORT} (requires a prior \`npm run build\`)...`);
  serverProcess = spawn("npx", ["next", "start", "-p", String(PORT)], {
    shell: true,
    stdio: ["ignore", "ignore", "ignore"],
  });
  serverProcess.on("error", () => undefined);

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isServerUp()) {
      console.log("Server is up.\n");
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Server did not become ready on port ${PORT} within 60s. Run \`npm run build\` first, then retry \`npm run production:verify\`.`
  );
}

function stopServer(): void {
  if (!serverProcess || serverWasAlreadyRunning || serverProcess.pid === undefined) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/F", "/T", "/PID", String(serverProcess.pid)], { stdio: "ignore" });
  } else {
    serverProcess.kill();
  }
}

// ---------------------------------------------------------------------------
// Fixture tracking / cleanup
// ---------------------------------------------------------------------------

const runSuffix = Date.now().toString(36);
const studentIds = new Set<string>();
const conversationIds = new Set<string>();
const caseIds = new Set<string>();

function email(label: string): string {
  return `prodcheck-${label}-${runSuffix}@example.test`;
}

async function trackConversation(conversationId: string | undefined) {
  if (!conversationId) return;
  conversationIds.add(conversationId);
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (conv) studentIds.add(conv.studentId);
  const c = await prisma.case.findUnique({ where: { conversationId } });
  if (c) caseIds.add(c.id);
}

async function cleanupFixtures() {
  const convIds = Array.from(conversationIds);
  const msgs = await prisma.message.findMany({ where: { conversationId: { in: convIds } }, select: { id: true } });
  const msgIds = msgs.map((m) => m.id);
  await prisma.case.deleteMany({ where: { id: { in: Array.from(caseIds) } } });
  await prisma.case.deleteMany({ where: { conversationId: { in: convIds } } });
  if (msgIds.length) await prisma.triageResult.deleteMany({ where: { messageId: { in: msgIds } } });
  await prisma.message.deleteMany({ where: { conversationId: { in: convIds } } });
  await prisma.conversation.deleteMany({ where: { id: { in: convIds } } });
  await prisma.student.deleteMany({ where: { id: { in: Array.from(studentIds) } } });
}

interface CountSnapshot {
  Student: number;
  Conversation: number;
  Message: number;
  TriageResult: number;
  Case: number;
  Staff: number;
  KnowledgeResource: number;
}

async function snapshotCounts(): Promise<CountSnapshot> {
  const [Student, Conversation, Message, TriageResult, Case, Staff, KnowledgeResource] = await Promise.all([
    prisma.student.count(),
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.triageResult.count(),
    prisma.case.count(),
    prisma.staff.count(),
    prisma.knowledgeResource.count(),
  ]);
  return { Student, Conversation, Message, TriageResult, Case, Staff, KnowledgeResource };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

interface ChatApiBody {
  conversationId?: string;
  decision?: { category: string; urgency: string; safeguarding: boolean; disposition: string };
  reply?: { answer: string; sources: { id: string; title: string; url: string | null }[] };
  case?: { id: string; status: string } | null;
  error?: string;
}

async function postChat(input: {
  name?: string;
  email?: string;
  message?: string;
  conversationId?: string;
  raw?: string;
}): Promise<{ status: number; body: ChatApiBody; rawText: string }> {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body:
      input.raw ??
      JSON.stringify({
        student: { name: input.name, email: input.email },
        conversationId: input.conversationId,
        message: input.message,
      }),
  });
  const rawText = await res.text();
  let body: ChatApiBody = {};
  try {
    body = JSON.parse(rawText) as ChatApiBody;
  } catch {
    // left as {}
  }
  return { status: res.status, body, rawText };
}

const MSG = {
  academic: "Where can I find past exam papers and reading lists for my modules?",
  visa: "My visa expires in 9 days and my university just withdrew my CAS. I don't know what happens to me now, please help urgently.",
  crisis:
    "I've been feeling really low for weeks, I haven't left my room or eaten properly in days and I don't really see the point of anything anymore.",
  followUp: "Sorry — my laptop won't log into the university portal and I have an assignment due tomorrow.",
};

function bodyContainsSecretOrInternals(rawText: string): string | null {
  const patterns: [RegExp, string][] = [
    [/gsk_[a-zA-Z0-9]/, "a Groq API key"],
    [/postgres(ql)?:\/\/[^\s"]+/i, "a database connection string"],
    [/at\s+\S+\s+\(.*:\d+:\d+\)/, "a stack trace frame"],
    [/prisma\.[a-zA-Z]+\.(findMany|findUnique|create|update|delete)/i, "a raw Prisma call"],
    [/PrismaClientKnownRequestError|PrismaClientValidationError/, "a raw Prisma error class name"],
  ];
  for (const [pattern, label] of patterns) {
    if (pattern.test(rawText)) return label;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("==================================================");
  console.log("PRODUCTION SMOKE TEST");
  console.log("==================================================\n");

  const initialCounts = await snapshotCounts();
  console.log("Initial database counts:", initialCounts, "\n");

  await ensureServer();

  await section("Homepage", async () => {
    const res = await fetch(`${BASE_URL}/`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes("AI Welfare Assistant"), "expected the homepage to render the app heading");
  });

  await section("Health endpoint", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const body = (await res.json()) as { status?: string; database?: string };
    assert(body.status === "ok" && body.database === "connected", `expected {status:ok,database:connected}, got ${JSON.stringify(body)}`);
  });

  await section("Student chat request", async () => {
    const r = await postChat({ name: "Prod Check Academic", email: email("academic"), message: MSG.academic });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    await trackConversation(r.body.conversationId);
    assert(r.body.decision?.category === "academic", `expected academic, got ${r.body.decision?.category}`);
    assert(!!r.body.reply?.answer, "expected a non-empty reply");
  });

  await section("Chat continuation", async () => {
    const r1 = await postChat({ name: "Prod Check Continuation", email: email("continuation"), message: "need help asap" });
    assert(r1.status === 200, `expected 200, got ${r1.status}`);
    await trackConversation(r1.body.conversationId);

    const r2 = await postChat({
      name: "Prod Check Continuation",
      email: email("continuation"),
      conversationId: r1.body.conversationId,
      message: MSG.followUp,
    });
    assert(r2.status === 200, `expected 200 on the follow-up, got ${r2.status}`);
    assert(r2.body.conversationId === r1.body.conversationId, "follow-up must stay in the same conversation");
  });

  await section("Knowledge-grounded response", async () => {
    const r = await postChat({ name: "Prod Check Knowledge", email: email("knowledge"), message: MSG.academic });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    await trackConversation(r.body.conversationId);
    assert((r.body.reply?.sources.length ?? 0) > 0, "expected at least one real knowledge source cited");
  });

  await section("Immigration escalation", async () => {
    const r = await postChat({ name: "Prod Check Visa", email: email("visa"), message: MSG.visa });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    await trackConversation(r.body.conversationId);
    assert(r.body.decision?.disposition === "escalate", `expected escalate, got ${r.body.decision?.disposition}`);
    assert(!!r.body.case, "expected a Case to be created");
  });

  await section("Crisis escalation", async () => {
    const r = await postChat({ name: "Prod Check Crisis", email: email("crisis"), message: MSG.crisis });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    await trackConversation(r.body.conversationId);
    assert(r.body.decision?.safeguarding === true, "expected safeguarding=true");
    assert(r.body.decision?.disposition === "escalate", "expected escalate");
  });

  let smokeCaseId: string | undefined;
  await section("Case creation", async () => {
    const r = await postChat({ name: "Prod Check Case", email: email("case"), message: MSG.visa });
    assert(r.status === 200, `expected 200, got ${r.status}`);
    await trackConversation(r.body.conversationId);
    assert(!!r.body.case?.id, "expected a persisted Case id");
    smokeCaseId = r.body.case!.id;
    const row = await prisma.case.findUnique({ where: { id: smokeCaseId } });
    assert(!!row, "expected the Case row to actually exist in the database");
  });

  await section("Staff dashboard", async () => {
    const res = await fetch(`${BASE_URL}/staff`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes("Case Queue"), "expected the staff dashboard to render");
  });

  await section("Staff case detail", async () => {
    assert(!!smokeCaseId, "no case id available from the case-creation check");
    const res = await fetch(`${BASE_URL}/staff/cases/${smokeCaseId}`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes("Case Detail"), "expected the case detail page to render");
  });

  await section("Staff claim", async () => {
    assert(!!smokeCaseId, "no case id available from the case-creation check");
    const res = await fetch(`${BASE_URL}/api/staff/cases/${smokeCaseId}/claim`, { method: "POST" });
    assert(
      res.status === 200 || res.status === 401,
      `expected 200 (claimed) or 401 (no dev staff identity configured), got ${res.status}`
    );
    if (res.status === 200) {
      const row = await prisma.case.findUnique({ where: { id: smokeCaseId } });
      assert(row?.claimedById !== null, "expected claimedById to be set after a successful claim");
    }
  });

  await section("Invalid request handling", async () => {
    const malformed = await postChat({ raw: "{not valid json" });
    assert(malformed.status === 400, `malformed JSON: expected 400, got ${malformed.status}`);

    const invalidEmail = await postChat({ name: "X", email: "not-an-email", message: "hi" });
    assert(invalidEmail.status === 400, `invalid email: expected 400, got ${invalidEmail.status}`);

    const notFoundClaim = await fetch(`${BASE_URL}/api/staff/cases/does-not-exist/claim`, { method: "POST" });
    assert(
      notFoundClaim.status === 404 || notFoundClaim.status === 401,
      `claim on non-existent case: expected 404 or 401, got ${notFoundClaim.status}`
    );
  });

  await section("Security headers", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert(res.headers.get("x-content-type-options") === "nosniff", "missing X-Content-Type-Options: nosniff");
    assert(!!res.headers.get("referrer-policy"), "missing Referrer-Policy");
    assert(res.headers.get("x-frame-options") === "DENY", "missing X-Frame-Options: DENY");
    assert(!!res.headers.get("permissions-policy"), "missing Permissions-Policy");
  });

  await section("No secret leakage", async () => {
    const probes: Promise<Response>[] = [
      fetch(`${BASE_URL}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not valid json" }),
      fetch(`${BASE_URL}/api/staff/cases/does-not-exist/claim`, { method: "POST" }),
      fetch(`${BASE_URL}/staff/cases/does-not-exist`),
    ];
    const responses = await Promise.all(probes);
    for (const res of responses) {
      const text = await res.text();
      const leak = bodyContainsSecretOrInternals(text);
      assert(!leak, `response for ${res.url} appears to leak ${leak}`);
    }
  });

  await cleanupFixtures();
  stopServer();

  const finalCounts = await snapshotCounts();
  console.log("\nFinal database counts:", finalCounts);
  const diff: Record<string, number> = {};
  for (const key of Object.keys(initialCounts) as (keyof CountSnapshot)[]) {
    diff[key] = finalCounts[key] - initialCounts[key];
  }
  console.log("Difference from initial (should be ~0):", diff);

  const nonZeroDiff = Object.values(diff).some((n) => n !== 0);
  if (nonZeroDiff) {
    fail("Database integrity preserved (fixture cleanup left no residue)", `non-zero diff: ${JSON.stringify(diff)}`);
  } else {
    pass("Database integrity preserved (fixture cleanup left no residue)");
  }

  const failed = report.filter((r) => !r.pass);
  console.log("\n==================================================");
  console.log("TOTAL");
  console.log("==================================================\n");
  console.log(`${report.length - failed.length} / ${report.length} PASS`);
  if (failed.length > 0) {
    console.log("\nFailed checks:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Production smoke test crashed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    stopServer();
    await prisma.$disconnect();
  });
