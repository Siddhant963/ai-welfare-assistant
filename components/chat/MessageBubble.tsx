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
