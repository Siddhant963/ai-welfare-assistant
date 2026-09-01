import type { ChatMessage } from "../../lib/chat/types";

interface MessageBubbleProps {
  message: ChatMessage;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isStudent = message.role === "student";

  return (
    <div className={`flex ${isStudent ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words sm:max-w-[75%] ${
          isStudent
            ? "bg-indigo-600 text-white"
            : "border border-neutral-200 bg-neutral-50 text-neutral-900"
        }`}
      >
        <p className="sr-only">{isStudent ? "You said:" : "Assistant said:"}</p>
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 border-t border-neutral-200 pt-2">
            <p className="text-[11px] font-medium text-neutral-500">Sources</p>
            <ul className="mt-1 space-y-0.5">
              {message.sources.map((source) =>
                source.url ? (
                  <li key={source.id}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] text-indigo-700 underline underline-offset-2 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      {source.title}
                    </a>
                  </li>
                ) : (
                  <li key={source.id} className="text-[13px] text-neutral-600">
                    {source.title}
                  </li>
                )
              )}
            </ul>
          </div>
        )}
        <time
          dateTime={message.createdAt}
          className={`mt-1 block text-[11px] ${
            isStudent ? "text-indigo-100" : "text-neutral-500"
          }`}
        >
          {formatTime(message.createdAt)}
        </time>
      </div>
    </div>
  );
}
