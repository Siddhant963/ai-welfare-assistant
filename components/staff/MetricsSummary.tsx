import type { CaseMetrics } from "../../lib/db/staffCases.ts";

export function MetricsSummary({ metrics }: { metrics: CaseMetrics }) {
  const items = [
    { label: "Open cases", value: metrics.open },
    { label: "Urgent (High/Critical)", value: metrics.urgent },
    { label: "Safeguarding", value: metrics.safeguarding },
    { label: "Unclaimed", value: metrics.unclaimed },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-neutral-200 bg-white p-3">
          <dt className="text-xs font-medium text-neutral-500">{item.label}</dt>
          <dd className="mt-1 text-2xl font-semibold text-neutral-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
