interface ChatHeaderProps {
  studentName: string;
}

export function ChatHeader({ studentName }: ChatHeaderProps) {
  return (
    <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6">
      <div
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white"
      >
        AI
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-neutral-900">
          AI Welfare Assistant
        </p>
        <p className="truncate text-xs text-neutral-500">
          Chatting as {studentName} · general guidance, not a substitute for
          professional advice
        </p>
      </div>
    </header>
  );
}
