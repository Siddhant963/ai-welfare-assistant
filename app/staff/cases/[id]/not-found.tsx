import Link from "next/link";

export default function CaseNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
        This case could not be found. It may have been removed, or the link may be incorrect.
      </p>
      <div className="mt-4 text-center">
        <Link
          href="/staff"
          className="rounded text-sm font-medium text-indigo-700 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          ← Back to case queue
        </Link>
      </div>
    </main>
  );
}
