import Link from "next/link";
import type { CaseFilter } from "../../lib/db/staffCases.ts";

const FILTERS: { value: CaseFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "safeguarding", label: "Safeguarding" },
  { value: "unclaimed", label: "Unclaimed" },
];

function filterHref(value: CaseFilter, search: string): string {
  const params = new URLSearchParams();
  if (value !== "all") params.set("filter", value);
  if (search) params.set("q", search);
  const qs = params.toString();
  return qs ? `/staff?${qs}` : "/staff";
}

/**
 * Plain navigation links, not a client-side filter — the URL is the
 * source of truth and the server re-queries on each click. No "use
 * client" needed anywhere in the staff dashboard.
 */
export function CaseFilters({ active, search }: { active: CaseFilter; search: string }) {
  return (
    <nav aria-label="Case filters" className="flex flex-wrap gap-2">
      {FILTERS.map((f) => {
        const isActive = f.value === active;
        return (
          <Link
            key={f.value}
            href={filterHref(f.value, search)}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              isActive ? "bg-indigo-600 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {f.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** A plain GET form — filtering/search are both URL-driven, so this needs no client JS either. */
export function CaseSearchForm({ filter, search }: { filter: CaseFilter; search: string }) {
  return (
    <form action="/staff" method="get" role="search" className="flex gap-2">
      {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
      <label htmlFor="staff-search" className="sr-only">
        Search by student name or email
      </label>
      <input
        id="staff-search"
        type="search"
        name="q"
        defaultValue={search}
        placeholder="Search by student name or email"
        className="w-full max-w-xs rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-indigo-500"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        Search
      </button>
    </form>
  );
}
