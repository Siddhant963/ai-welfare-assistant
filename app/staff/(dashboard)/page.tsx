import { getCaseMetrics, listCases, type CaseFilter } from "../../../lib/db/staffCases.ts";
import { CaseFilters, CaseSearchForm } from "../../../components/staff/CaseFilters.tsx";
import { CaseQueue } from "../../../components/staff/CaseQueue.tsx";
import { MetricsSummary } from "../../../components/staff/MetricsSummary.tsx";
import { Pagination } from "../../../components/staff/Pagination.tsx";

const VALID_FILTERS: CaseFilter[] = ["all", "new", "critical", "high", "safeguarding", "unclaimed"];

function parseFilter(value: string | undefined): CaseFilter {
  return VALID_FILTERS.includes(value as CaseFilter) ? (value as CaseFilter) : "all";
}

function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export default async function StaffDashboardPage({ searchParams }: PageProps<"/staff">) {
  const params = await searchParams;
  const filter = parseFilter(typeof params.filter === "string" ? params.filter : undefined);
  const search = typeof params.q === "string" ? params.q : "";
  const page = parsePage(typeof params.page === "string" ? params.page : undefined);

  let metrics;
  let result;
  let loadFailed = false;
  try {
    [metrics, result] = await Promise.all([getCaseMetrics(), listCases({ filter, search, page })]);
  } catch (error) {
    // Staff-facing message stays generic — no connection strings, Prisma
    // errors, or stack traces ever reach the browser.
    console.error("Staff dashboard failed to load cases:", error instanceof Error ? error.message : error);
    loadFailed = true;
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Welfare Support — Case Queue</h1>
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Authentication and authorization are intentionally deferred to a later phase — this view is not yet
          access-controlled.
        </p>
      </header>

      {loadFailed || !metrics || !result ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Something went wrong loading cases. Please try again shortly.
        </p>
      ) : (
        <>
          <MetricsSummary metrics={metrics} />

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CaseFilters active={filter} search={search} />
            <CaseSearchForm filter={filter} search={search} />
          </div>

          <div className="mt-4">
            <CaseQueue cases={result.cases} isFiltered={filter !== "all" || search.length > 0} />
          </div>

          <Pagination page={result.page} totalPages={result.totalPages} filter={filter} search={search} />
        </>
      )}
    </main>
  );
}
