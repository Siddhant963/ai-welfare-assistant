"use client";

import { useCallback, useReducer } from "react";
import { sendChatMessage } from "./api.ts";
import { formatDevTriagePreview } from "./devTriagePreview.ts";
import type { ChatMessage, StudentInfo } from "./types";

interface ChatState {
  student: StudentInfo | null;
  conversationId: string | null;
  messages: ChatMessage[];
  input: string;
  isSending: boolean;
  error: string | null;
}

type ChatAction =
  | { type: "START_CONVERSATION"; student: StudentInfo }
  | { type: "SET_INPUT"; value: string }
  | { type: "SEND_MESSAGE_START"; message: ChatMessage }
  | { type: "SEND_MESSAGE_SUCCESS"; message: ChatMessage; conversationId: string }
  | { type: "SEND_MESSAGE_ERROR"; error: string };

const initialState: ChatState = {
  student: null,
  conversationId: null,
  messages: [],
  input: "",
  isSending: false,
  error: null,
};

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "START_CONVERSATION":
      return { ...state, student: action.student };
    case "SET_INPUT":
      return { ...state, input: action.value, error: null };
    case "SEND_MESSAGE_START":
      return {
        ...state,
        messages: [...state.messages, action.message],
        input: "",
        isSending: true,
        error: null,
      };
    case "SEND_MESSAGE_SUCCESS":
      return {
        ...state,
        messages: [...state.messages, action.message],
        conversationId: action.conversationId,
        isSending: false,
      };
    case "SEND_MESSAGE_ERROR":
      return { ...state, isSending: false, error: action.error };
    default:
      return state;
  }
}

function createMessageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useChat() {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { student, conversationId } = state;

  const startConversation = useCallback((newStudent: StudentInfo) => {
    dispatch({ type: "START_CONVERSATION", student: newStudent });
  }, []);

  const setInput = useCallback((value: string) => {
    dispatch({ type: "SET_INPUT", value });
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || !student) return;

      dispatch({
        type: "SEND_MESSAGE_START",
        message: {
          id: createMessageId(),
          role: "student",
          content: trimmed,
          createdAt: new Date().toISOString(),
        },
      });

      try {
        const result = await sendChatMessage({ student, conversationId, message: trimmed });

        const replyContent =
          result.triage.status === "ok"
            ? formatDevTriagePreview(result.triage)
            : result.triage.notice;

        dispatch({
          type: "SEND_MESSAGE_SUCCESS",
          conversationId: result.conversationId,
          message: {
            id: createMessageId(),
            role: "assistant",
            content: replyContent,
            createdAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        dispatch({
          type: "SEND_MESSAGE_ERROR",
          error: error instanceof Error ? error.message : "Something went wrong sending your message. Please try again.",
        });
      }
    },
    [student, conversationId]
  );

  return {
    student: state.student,
    conversationStarted: state.student !== null,
    messages: state.messages,
    input: state.input,
    isSending: state.isSending,
    error: state.error,
    startConversation,
    setInput,
    sendMessage,
  };
}
