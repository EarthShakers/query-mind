"use client";

import { useState, useCallback, useEffect, useRef } from "react";

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: any[];
}

const STORAGE_KEY = "chat-history";
const MAX_SESSIONS = 20;

function loadSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: ChatSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch { /* quota exceeded — silently ignore */ }
}

export function useChatHistory() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const initialized = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    setSessions(loadSessions());
    initialized.current = true;
  }, []);

  /** Save or update current session */
  const saveSession = useCallback((sessionId: string, messages: any[]) => {
    if (!initialized.current || messages.length === 0) return;
    const firstUserMsg = messages.find((m: any) => m.role === "user");
    const title = firstUserMsg?.content?.slice(0, 30) || "新对话";

    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === sessionId);
      const session: ChatSession = {
        id: sessionId,
        title,
        createdAt: idx >= 0 ? prev[idx].createdAt : Date.now(),
        messages,
      };
      const next = idx >= 0
        ? prev.map((s) => (s.id === sessionId ? session : s))
        : [session, ...prev];
      const trimmed = next.slice(0, MAX_SESSIONS);
      saveSessions(trimmed);
      return trimmed;
    });
  }, []);

  /** Delete a session */
  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== sessionId);
      saveSessions(next);
      return next;
    });
  }, []);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    saveSession,
    deleteSession,
  };
}
