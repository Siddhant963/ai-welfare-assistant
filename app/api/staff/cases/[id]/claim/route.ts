import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/db/client.ts";
import { claimCase } from "../../../../../../lib/db/claimCase.ts";
import { getCurrentStaff } from "../../../../../../lib/staff/currentStaff.ts";
import { caseStatusToWire, urgencyToWire } from "../../../../../../lib/validation/triageMapping.ts";
import type { Case } from "../../../../../../generated/prisma/client.ts";

// Prisma cuid()s are ~25 chars; this is a sanity bound, not a format
// assertion — cuids aren't UUIDs, so no UUID regex is used here.
const MAX_CASE_ID_LENGTH = 50;

function serializeCase(caseRow: Case, claimedByName: string | null) {
  return {
    id: caseRow.id,
    status: caseStatusToWire(caseRow.status),
    urgency: urgencyToWire(caseRow.urgency),
    safeguarding: caseRow.safeguarding,
    claimedById: caseRow.claimedById,
    claimedByName,
  };
}

async function loadCaseWithClaimant(caseId: string) {
  return prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: { claimedBy: { select: { name: true } } },
  });
}

/**
 * POST /api/staff/cases/[id]/claim
 *
 * The browser identifies only WHICH case to claim — it never supplies who
 * is claiming it (see lib/staff/currentStaff.ts), and the only field this
 * endpoint can ever change is Case.claimedById (plus claimedAt/status,
 * both already owned by the unmodified Phase 2 lib/db/claimCase.ts).
 * urgency/safeguarding/category/conversationId are never touched here.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/staff/cases/[id]/claim">) {
  const { id: caseId } = await params;

  if (!caseId || caseId.length === 0 || caseId.length > MAX_CASE_ID_LENGTH) {
    return NextResponse.json({ error: "Invalid case id." }, { status: 400 });
  }

  const staff = await getCurrentStaff();
  if (!staff) {
    return NextResponse.json(
      { error: "No staff identity is available. STAFF_DEV_ID is not configured for this development environment." },
      { status: 401 }
    );
  }

  try {
    const result = await claimCase(caseId, staff.id);

    if (result.claimed) {
      const caseRow = await loadCaseWithClaimant(caseId);
      return NextResponse.json({
        status: "claimed",
        case: serializeCase(caseRow, caseRow.claimedBy?.name ?? null),
      });
    }

    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Case not found." }, { status: 404 });
    }

    // already_claimed — read the current row to tell same-staff (idempotent,
    // not a real conflict) apart from a genuine different-staff conflict.
    const caseRow = await loadCaseWithClaimant(caseId);
    const sameStaff = caseRow.claimedById === staff.id;

    return NextResponse.json(
      {
        status: "already_claimed",
        sameStaff,
        case: serializeCase(caseRow, caseRow.claimedBy?.name ?? null),
      },
      { status: sameStaff ? 200 : 409 }
    );
  } catch (error) {
    console.error("POST /api/staff/cases/[id]/claim failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
