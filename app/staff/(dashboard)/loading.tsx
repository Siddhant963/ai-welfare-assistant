export default function StaffDashboardLoading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading case queue">
      <div className="h-6 w-72 animate-pulse rounded bg-neutral-200" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-neutral-200" />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-neutral-200" />
        ))}
      </div>
    </main>
  );
}
