import type { CaseDetailMessage } from "../../lib/db/staffCases.ts";
import { formatDateTime } from "../../lib/staff/labels.ts";

const ROLE_LABELS: Record<CaseDetailMessage["role"], string> = {
  STUDENT: "Student",
  ASSISTANT: "Assistant",
  SYSTEM: "System",
};

export function ConversationView({ messages }: { messages: CaseDetailMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-neutral-500">No messages in this conversation.</p>;
  }

  return (
    <ol className="space-y-3">
      {messages.map((message) => {
        const isStudent = message.role === "STUDENT";
        return (
          <li
            key={message.id}
            className={`rounded-xl border p-3 ${isStudent ? "border-indigo-200 bg-indigo-50/40" : "border-neutral-200 bg-white"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-neutral-500">{ROLE_LABELS[message.role]}</p>
              <time dateTime={message.createdAt.toISOString()} className="text-xs text-neutral-400">
                {formatDateTime(message.createdAt)}
              </time>
            </div>
            {/* Plain text content only — never dangerouslySetInnerHTML. Student
                and assistant text is untrusted display content. */}
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-900">{message.content}</p>
          </li>
        );
      })}
    </ol>
  );
}
