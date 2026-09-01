export type ChatRole = "student" | "assistant";

export interface ChatSource {
  id: string;
  title: string;
  url: string | null;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  sources?: ChatSource[];
}

export interface StudentInfo {
  name: string;
  email: string;
}

export interface StudentInfoErrors {
  name?: string;
  email?: string;
}
