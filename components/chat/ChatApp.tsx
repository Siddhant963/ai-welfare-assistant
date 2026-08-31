"use client";

import { useChat } from "../../lib/chat/useChat";
import { Chat } from "./Chat";
import { StartScreen } from "./StartScreen";

export function ChatApp() {
  const {
    student,
    conversationStarted,
    messages,
    input,
    isSending,
    error,
    startConversation,
    setInput,
    sendMessage,
  } = useChat();

  if (!conversationStarted || !student) {
    return <StartScreen onStart={startConversation} />;
  }

  return (
    <Chat
      studentName={student.name}
      messages={messages}
      input={input}
      isSending={isSending}
      error={error}
      onInputChange={setInput}
      onSend={() => sendMessage(input)}
    />
  );
}
