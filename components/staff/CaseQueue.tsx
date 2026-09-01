import type { CaseListItem } from "../../lib/db/staffCases.ts";
import { CaseRow } from "./CaseRow.tsx";

export function CaseQueue({ cases, isFiltered }: { cases: CaseListItem[]; isFiltered: boolean }) {
  if (cases.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
        {isFiltered ? "No cases match this filter." : "No cases require attention."}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {cases.map((item) => (
        <CaseRow key={item.id} item={item} />
      ))}
    </ul>
  );
}
