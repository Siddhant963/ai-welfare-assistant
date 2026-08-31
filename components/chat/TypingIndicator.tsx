export function TypingIndicator() {
  return (
    <div className="flex justify-start" aria-hidden="true">
      <div className="flex items-center gap-1 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
      </div>
    </div>
  );
}
