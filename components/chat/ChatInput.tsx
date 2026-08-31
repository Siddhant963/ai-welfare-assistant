"use client";

import { useId, type KeyboardEvent } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
}

export function ChatInput({ value, onChange, onSend, isSending }: ChatInputProps) {
  const inputId = useId();
  const canSend = value.trim().length > 0 && !isSending;

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  }

  return (
    <div className="border-t border-neutral-200 bg-white px-4 py-3 sm:px-6">
      <label htmlFor={inputId} className="sr-only">
        Message
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSending}
          rows={1}
          placeholder="Type your message..."
          className="max-h-40 min-h-[42px] flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 disabled:bg-neutral-100 disabled:text-neutral-400"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send message"
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          Send
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-400">
        Press Enter to send, Shift+Enter for a new line.
      </p>
    </div>
  );
}
