import Link from "next/link";
import type { CaseFilter } from "../../lib/db/staffCases.ts";

interface PaginationProps {
  page: number;
  totalPages: number;
  filter: CaseFilter;
  search: string;
}

function pageHref(page: number, filter: CaseFilter, search: string): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/staff?${qs}` : "/staff";
}

export function Pagination({ page, totalPages, filter, search }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Case queue pagination" className="mt-4 flex items-center justify-between gap-4">
      {page <= 1 ? (
        <span className="text-sm text-neutral-400">Previous</span>
      ) : (
        <Link
          href={pageHref(page - 1, filter, search)}
          className="rounded text-sm font-medium text-indigo-700 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Previous
        </Link>
      )}
      <p className="text-sm text-neutral-500">
        Page {page} of {totalPages}
      </p>
      {page >= totalPages ? (
        <span className="text-sm text-neutral-400">Next</span>
      ) : (
        <Link
          href={pageHref(page + 1, filter, search)}
          className="rounded text-sm font-medium text-indigo-700 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Next
        </Link>
      )}
    </nav>
  );
}
