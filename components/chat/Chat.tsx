"use client";

import type { ChatMessage } from "../../lib/chat/types";
import { ChatHeader } from "./ChatHeader";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";

interface ChatProps {
  studentName: string;
  messages: ChatMessage[];
  input: string;
  isSending: boolean;
  error: string | null;
  onInputChange: (value: string) => void;
  onSend: () => void;
}

export function Chat({
  studentName,
  messages,
  input,
  isSending,
  error,
  onInputChange,
  onSend,
}: ChatProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatHeader studentName={studentName} />

      {messages.length === 0 && (
        <p className="px-4 pt-4 text-sm text-neutral-500 sm:px-6">
          Tell me what&apos;s going on and I&apos;ll help you find the right
          information or support.
        </p>
      )}

      <MessageList messages={messages} isSending={isSending} />

      {error && (
        <p role="alert" className="px-4 pb-2 text-sm text-red-600 sm:px-6">
          {error}
        </p>
      )}

      <ChatInput
        value={input}
        onChange={onInputChange}
        onSend={onSend}
        isSending={isSending}
      />
    </div>
  );
}
