import { ChatApp } from "../components/chat/ChatApp";

export default function Home() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-neutral-50">
      <ChatApp />
    </div>
  );
}
