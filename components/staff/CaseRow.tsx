import Link from "next/link";
import type { CaseListItem } from "../../lib/db/staffCases.ts";
import { CATEGORY_LABELS, formatDateTime } from "../../lib/staff/labels.ts";
import { ClaimBadge, SafeguardingBadge, StatusBadge, UrgencyBadge } from "./Badges.tsx";

export function CaseRow({ item }: { item: CaseListItem }) {
  return (
    <li>
      <Link
        href={`/staff/cases/${item.id}`}
        className="block rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div className="flex flex-wrap items-center gap-2">
          <UrgencyBadge urgency={item.urgency} />
          {item.safeguarding && <SafeguardingBadge />}
          <StatusBadge status={item.status} />
          <ClaimBadge claimedByName={item.claimedByName} />
          <time dateTime={item.createdAt.toISOString()} className="ml-auto text-xs text-neutral-500">
            {formatDateTime(item.createdAt)}
          </time>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-medium text-neutral-900">{item.student.name}</p>
          <p className="text-xs text-neutral-500">{item.student.email}</p>
        </div>
        <p className="mt-1 text-xs text-neutral-500">{CATEGORY_LABELS[item.category]}</p>
      </Link>
    </li>
  );
}
