export type ChatRole = "student" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface StudentInfo {
  name: string;
  email: string;
}

export interface StudentInfoErrors {
  name?: string;
  email?: string;
}
