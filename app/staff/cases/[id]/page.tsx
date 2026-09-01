import Link from "next/link";
import { notFound } from "next/navigation";
import { getCaseDetail } from "../../../../lib/db/staffCases.ts";
import { CATEGORY_LABELS, formatDateTime } from "../../../../lib/staff/labels.ts";
import { ClaimBadge, SafeguardingBadge, StatusBadge, UrgencyBadge } from "../../../../components/staff/Badges.tsx";
import { ClaimCaseButton } from "../../../../components/staff/ClaimCaseButton.tsx";
import { SafetySummary } from "../../../../components/staff/SafetySummary.tsx";
import { ConversationView } from "../../../../components/staff/ConversationView.tsx";

export default async function CaseDetailPage({ params }: PageProps<"/staff/cases/[id]">) {
  const { id } = await params;

  let detail;
  try {
    detail = await getCaseDetail(id);
  } catch (error) {
    console.error("Staff case detail failed to load:", error instanceof Error ? error.message : error);
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Something went wrong loading this case. Please try again shortly.
        </p>
      </main>
    );
  }

  if (!detail) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link
        href="/staff"
        className="rounded text-sm font-medium text-indigo-700 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        ← Back to case queue
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-neutral-900">Case Detail</h1>

      <section aria-labelledby="student-heading" className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 id="student-heading" className="text-sm font-semibold text-neutral-900">
          Student
        </h2>
        <p className="mt-1 text-sm text-neutral-700">{detail.student.name}</p>
        <p className="text-sm text-neutral-500">{detail.student.email}</p>
      </section>

      <section aria-labelledby="case-heading" className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 id="case-heading" className="text-sm font-semibold text-neutral-900">
          Case
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <UrgencyBadge urgency={detail.urgency} />
          {detail.safeguarding && <SafeguardingBadge />}
          <StatusBadge status={detail.status} />
          <ClaimBadge claimedByName={detail.claimedBy?.name ?? null} />
        </div>
        {!detail.claimedBy && (
          <div className="mt-3">
            <ClaimCaseButton caseId={detail.id} />
          </div>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Category</dt>
            <dd className="text-neutral-900">{CATEGORY_LABELS[detail.category]}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Created</dt>
            <dd className="text-neutral-900">{formatDateTime(detail.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Updated</dt>
            <dd className="text-neutral-900">{formatDateTime(detail.updatedAt)}</dd>
          </div>
        </dl>
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Summary</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{detail.summary}</p>
        </div>
      </section>

      <section aria-labelledby="safety-heading" className="mt-4">
        <h2 id="safety-heading" className="text-sm font-semibold text-neutral-900">
          Safety / Triage
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Every triage attempt for this conversation, oldest first. &quot;AI recommendation&quot; is the
          model&apos;s original, unvalidated output; &quot;Final decision&quot; is what the deterministic safety
          engine actually applied. When they differ, that&apos;s the safety engine correcting the AI.
        </p>
        <div className="mt-2 space-y-3">
          {detail.triageResults.length === 0 ? (
            <p className="text-sm text-neutral-500">No triage records for this conversation.</p>
          ) : (
            detail.triageResults.map((triage) => <SafetySummary key={triage.id} triage={triage} />)
          )}
        </div>
      </section>

      <section aria-labelledby="conversation-heading" className="mt-4">
        <h2 id="conversation-heading" className="text-sm font-semibold text-neutral-900">
          Conversation
        </h2>
        <div className="mt-2">
          <ConversationView messages={detail.messages} />
        </div>
      </section>
    </main>
  );
}
