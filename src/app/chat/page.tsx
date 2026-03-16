"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useChat } from "ai/react";
import { NavAuth } from "@/components/nav-auth";
import { useAuth } from "@/lib/auth/auth-context";
import { useReport } from "@/hooks/use-report";
import { useSectionEdit } from "@/hooks/use-section-edit";
import { useVersionHistory } from "@/hooks/use-version-history";
import { useChatHistory } from "@/hooks/use-chat-history";
import { ReportCanvas } from "@/components/report-canvas";
import { VersionHistoryPanel } from "@/components/version-history-panel";
import type { ReportSection } from "@/lib/report-types";
import { QUICK_QUESTIONS, DEMO_SPACE_ID } from "@/components/chat/constants";
import { groupTurns } from "@/components/chat/types";
import { AssistantTurn } from "@/components/chat/assistant-turn";
import { SpacePicker } from "@/components/chat/space-picker";
import { ChatUploadModal } from "@/components/chat/chat-upload-modal";
import { ExportDropdown } from "@/components/chat/export-dropdown";
import { VoiceRecordingOverlay } from "@/components/chat/voice-recording-overlay";
import { VoiceHoldButton } from "@/components/chat/voice-hold-button";
import { Toast } from "@/components/ui/toast";
import { useVoiceInput } from "@/hooks/use-voice-input";

/* ─── Main page ─── */
export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [agentModeTurnIds, setAgentModeTurnIds] = useState<Set<string>>(new Set());
  const pendingAgentMode = useRef(false);
  const { user } = useAuth();
  const lastInput = useRef("");

  // ── Chat history ──
  const chatHistory = useChatHistory();
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());

  // ── Report / Canvas state ──
  const [reportId, setReportId] = useState<string | null>(null);
  const report = useReport(reportId);
  const creatingReport = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ── Section edit + version history hooks ──
  const getSections = useCallback(() => report.sections, [report.sections]);
  const sectionEdit = useSectionEdit(
    reportId,
    getSections,
    report.upsertSection
  );
  const versionHistory = useVersionHistory(reportId, report.replaceAllSections);
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(true);

  // Build available spaces list (always include demo space for preset docs)
  const availableSpaces = useMemo(() => {
    const demo = { spaceId: DEMO_SPACE_ID, spaceName: "预置文档" };
    if (user) {
      const userSpaces = user.spaces.map((s) => ({
        spaceId: s.spaceId,
        spaceName: s.spaceName,
      }));
      // Avoid duplicate if user already belongs to demo space
      const hasDemoSpace = userSpaces.some((s) => s.spaceId === DEMO_SPACE_ID);
      return hasDemoSpace ? userSpaces : [demo, ...userSpaces];
    }
    return [demo];
  }, [user]);

  // Default: all spaces selected
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<Set<string>>(
    () => new Set(availableSpaces.map((s) => s.spaceId))
  );

  // Keep selection in sync when spaces change (e.g. after login)
  useEffect(() => {
    setSelectedSpaceIds(new Set(availableSpaces.map((s) => s.spaceId)));
  }, [availableSpaces]);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    setInput,
    append,
    setMessages,
    data: streamData,
  } = useChat({
    body: {
      spaceIds: [...selectedSpaceIds],
      reportId,
      agentMode,
    },
    onError: () => {
      setInput(lastInput.current);
    },
  });
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceCancelling, setVoiceCancelling] = useState(false);
  const [partialText, setPartialText] = useState("");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const voiceInput = useVoiceInput({
    onResult: (text) => {
      setPartialText("");
      setInput((prev) => prev + text);
    },
    onPartial: (text) => {
      setPartialText(text);
    },
    onError: (msg) => setToastMsg(msg),
    onLevelChange: setAudioLevel,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const lastStreamDataRef = useRef<any>(null);
  /** streamData 在当前 turn 开始时的累积长度，用于计算增量 */
  const turnStreamStartRef = useRef(0);
  const wasLoadingRef = useRef(false);
  const turns = useMemo(() => groupTurns(messages), [messages]);
  const currentSession = useMemo(
    () => chatHistory.sessions.find((s) => s.id === sessionId),
    [chatHistory.sessions, sessionId]
  );

  // 持久化 streamData，流结束后仍可展示 agent 进度
  useEffect(() => {
    // isLoading 从 false→true（新请求开始）：快照当前累积长度
    if (isLoading && !wasLoadingRef.current) {
      const flat = streamData
        ? (Array.isArray(streamData) ? streamData.flat(2) : [streamData])
        : [];
      turnStreamStartRef.current = flat.length;
      lastStreamDataRef.current = null;
    }
    wasLoadingRef.current = isLoading;
    if (streamData != null) lastStreamDataRef.current = streamData;
  }, [streamData, isLoading]);

  /** 当前 turn 的 streamData（仅增量，不含前序 turn 的事件） */
  const currentTurnStreamData = useMemo(() => {
    const raw = streamData ?? lastStreamDataRef.current;
    if (!raw) return raw;
    const flat = Array.isArray(raw) ? raw.flat(2) : [raw];
    return flat.slice(turnStreamStartRef.current);
  }, [streamData]);

  // ── 记录哪些 turn 在 Agent 模式开启时发送 ──
  useEffect(() => {
    if (!pendingAgentMode.current) return;
    const lastUserMsg = messages.filter((m) => m.role === "user").pop();
    if (lastUserMsg) {
      setAgentModeTurnIds((prev) => {
        if (prev.has(lastUserMsg.id)) return prev;
        const next = new Set(prev);
        next.add(lastUserMsg.id);
        pendingAgentMode.current = false;
        return next;
      });
    }
  }, [messages]);

  // ── Sync write_report_section tool results into Canvas ──
  useEffect(() => {
    const sectionResults: ReportSection[] = [];
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const tool of ((m as any).toolInvocations ?? []) as any[]) {
        if (
          tool.toolName === "write_report_section" &&
          tool.state === "result" &&
          !tool.result?.error
        ) {
          sectionResults.push(tool.result as ReportSection);
        }
      }
    }
    for (const s of sectionResults) {
      report.upsertSection(s);
    }

    // Auto-create report on first write_report_section result
    if (sectionResults.length > 0 && !reportId && !creatingReport.current) {
      creatingReport.current = true;
      const firstUserMsg = messages.find((m) => m.role === "user");

      (async () => {
        try {
          // Generate a proper noun-phrase title via LLM
          let autoTitle = "未命名报告";
          if (firstUserMsg?.content) {
            try {
              const titleRes = await fetch("/api/reports/generate-title", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: firstUserMsg.content }),
              });
              if (titleRes.ok) {
                const { title: generated } = await titleRes.json();
                if (generated) autoTitle = generated;
              }
            } catch {}
          }
          report.setTitle(autoTitle);

          const res = await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: autoTitle,
              spaceId: [...selectedSpaceIds][0],
            }),
          });
          const data = await res.json();
          if (data.id) setReportId(data.id);
        } catch {}
        creatingReport.current = false;
      })();
    }
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasCanvas = report.sections.length > 0;

  // ── Auto-save chat to history（含 agent 模式 meta）──
  useEffect(() => {
    if (messages.length > 0 && !isLoading) {
      const lastTurnId = turns[turns.length - 1]?.id;
      const dataToSave = streamData ?? lastStreamDataRef.current;
      let streamDataForLast: Record<string, any[]> | undefined;
      if (lastTurnId && dataToSave != null) {
        const flat = Array.isArray(dataToSave)
          ? dataToSave.flat(2)
          : [dataToSave];
        // 只保存当前 turn 的增量事件，避免跨 turn 数据污染
        const turnEvents = flat.slice(turnStreamStartRef.current);
        if (turnEvents.length > 0) {
          streamDataForLast = { [lastTurnId]: turnEvents };
        }
      }
      chatHistory.saveSession(sessionId, messages, {
        agentTurnIds: Array.from(agentModeTurnIds),
        streamDataByTurn: streamDataForLast,
      });
      chatHistory.setActiveSessionId(sessionId);
    }
  }, [messages, isLoading, turns, agentModeTurnIds, streamData]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNewChat = useCallback(() => {
    setMessages([]);
    setReportId(null);
    setAgentMode(false);
    setAgentModeTurnIds(new Set());
    report.setTitle("未命名报告");
    report.replaceAllSections([]);
    setCanvasOpen(true);
    setVersionPanelOpen(false);
    creatingReport.current = false;
    userScrolledUp.current = false;
    const newId = crypto.randomUUID();
    setSessionId(newId);
    chatHistory.setActiveSessionId(null);
  }, [setMessages, report, chatHistory]);

  const loadSession = useCallback(
    (id: string) => {
      const session = chatHistory.sessions.find((s) => s.id === id);
      if (!session) return;
      // Reset report state
      setReportId(null);
      report.setTitle("未命名报告");
      report.replaceAllSections([]);
      setCanvasOpen(true);
      setVersionPanelOpen(false);
      creatingReport.current = false;
      userScrolledUp.current = false;
      // Load session
      setSessionId(session.id);
      setMessages(session.messages);
      setAgentModeTurnIds(new Set(session.agentTurnIds ?? []));
      lastStreamDataRef.current = null; // 切换会话时清空
      turnStreamStartRef.current = 0;
      wasLoadingRef.current = false;
      chatHistory.setActiveSessionId(session.id);
      setSidebarOpen(false);
    },
    [chatHistory, setMessages, report]
  );

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const scrollToBottom = useCallback(() => {
    if (userScrolledUp.current) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  // Detect user scroll: if not at bottom, pause auto-scroll; if back at bottom, resume
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    userScrolledUp.current = !atBottom;
  }, []);

  useEffect(scrollToBottom, [messages, isLoading, scrollToBottom]);

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-white/95 backdrop-blur flex flex-col transform transition-transform duration-200 md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent"
          >
            QueryMind
          </Link>
          <button
            className="md:hidden p-1 text-slate-400 hover:text-slate-600"
            onClick={() => setSidebarOpen(false)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        {/* New chat button */}
        <div className="px-3 pt-3 pb-1">
          <button
            onClick={() => {
              startNewChat();
              setSidebarOpen(false);
            }}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            新对话
          </button>
        </div>
        <div className="px-4 pt-3 pb-1">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            历史记录
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {chatHistory.sessions.length === 0 && (
            <p className="text-xs text-slate-300 text-center py-6">
              暂无对话记录
            </p>
          )}
          {chatHistory.sessions.map((session) => {
            const isActive = session.id === chatHistory.activeSessionId;
            return (
              <div
                key={session.id}
                className={`group flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <button
                  onClick={() => loadSession(session.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-sm truncate">{session.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(session.createdAt).toLocaleDateString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "numeric",
                      minute: "numeric",
                    })}
                  </p>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    chatHistory.deleteSession(session.id);
                    if (isActive) startNewChat();
                  }}
                  className="shrink-0 p-1 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                  title="删除"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
        <div className="p-3 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-center">
            <NavAuth />
          </div>
          <Link
            href="/knowledge"
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
            </svg>
            知识库管理
          </Link>
          <Link
            href="/eval"
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
            评估看板
          </Link>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="shrink-0 px-4 md:px-6 py-3 md:py-4 border-b border-slate-200 bg-white/60 backdrop-blur flex items-center gap-3 relative z-20">
          <button
            className="md:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-700"
            onClick={() => setSidebarOpen(true)}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12h18" />
              <path d="M3 6h18" />
              <path d="M3 18h18" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700">
              {hasCanvas ? report.title : "AI 智能问答"}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 hidden sm:block">
              {hasCanvas
                ? canvasOpen
                  ? "在左侧对话中继续修改报告"
                  : "报告已收起 · 继续对话或展开报告"
                : "搜索知识库 · 分析数据报表 · 自动生成图表"}
            </p>
          </div>
          {hasCanvas && (
            <>
              {/* Panel toggle button */}
              <button
                onClick={() => setCanvasOpen((v) => !v)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                title={canvasOpen ? "收起报告面板" : "展开报告面板"}
              >
                {canvasOpen ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M15 3v18" />
                    <path d="m10 15 3-3-3-3" />
                  </svg>
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M15 3v18" />
                    <path d="m14 9-3 3 3 3" />
                  </svg>
                )}
                {canvasOpen ? "收起" : "报告"}
              </button>
              {/* Save / Version / Export — only when panel is open */}
              {canvasOpen && (
                <>
                  <button
                    onClick={() => report.save()}
                    disabled={report.saving || !reportId}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                      report.saveResult === "success"
                        ? "bg-green-500 hover:bg-green-600"
                        : report.saveResult === "error"
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-indigo-500 hover:bg-indigo-600"
                    }`}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    {report.saving
                      ? "保存中..."
                      : report.saveResult === "success"
                      ? "已保存"
                      : report.saveResult === "error"
                      ? "保存失败"
                      : "保存报告"}
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => {
                        setVersionPanelOpen(!versionPanelOpen);
                        if (!versionPanelOpen) versionHistory.fetchVersions();
                      }}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      title="版本历史"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      版本
                    </button>
                    {versionPanelOpen && (
                      <VersionHistoryPanel
                        versions={versionHistory.versions}
                        loading={versionHistory.loading}
                        restoring={versionHistory.restoring}
                        onRestore={(versionId) => {
                          versionHistory.restoreVersion(versionId);
                        }}
                        onClose={() => setVersionPanelOpen(false)}
                      />
                    )}
                  </div>
                  <ExportDropdown
                    canvasRef={canvasRef}
                    title={report.title}
                    sections={report.sections}
                  />
                </>
              )}
              {/* New chat button */}
              <button
                onClick={startNewChat}
                disabled={isLoading}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
                title="开始新对话"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                新对话
              </button>
            </>
          )}
          <SpacePicker
            spaces={availableSpaces}
            selected={selectedSpaceIds}
            onChange={setSelectedSpaceIds}
          />
        </header>

        <div
          className={`flex-1 flex min-h-0 ${
            hasCanvas && canvasOpen ? "flex-row" : "flex-col"
          }`}
        >
          {/* ── Chat area ── */}
          <div
            className={`flex flex-col min-h-0 ${
              hasCanvas && canvasOpen
                ? "w-[40%] border-r border-slate-200"
                : "flex-1"
            }`}
          >
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4"
            >
              {messages.length === 0 && !isLoading && (
                <div className="flex items-center justify-center h-full text-slate-300">
                  <div className="text-center max-w-md">
                    <p className="text-4xl mb-3">🔍</p>
                    <p className="text-sm">
                      在下方输入问题，或点击快捷提问开始
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 mt-5">
                      {QUICK_QUESTIONS.map(({ icon, text }) => (
                        <button
                          key={text}
                          onClick={() => {
                            userScrolledUp.current = false;
                            append({ role: "user", content: text });
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 shadow-sm transition-colors"
                        >
                          <span>{icon}</span>
                          <span>{text}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setUploadOpen(true)}
                      className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 text-xs font-medium text-white bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-xl hover:from-indigo-600 hover:to-cyan-600 shadow-sm hover:shadow-md transition-all"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" x2="12" y1="3" y2="15" />
                      </svg>
                      上传文件到知识库
                    </button>
                  </div>
                </div>
              )}

              {turns.map((turn, turnIdx) => {
                const isLastTurn = turnIdx === turns.length - 1;
                return (
                  <div key={turn.id} className="space-y-4">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] md:max-w-[70%] px-4 py-3 rounded-2xl rounded-tr-sm bg-indigo-500 text-white text-sm shadow-sm">
                        {turn.userContent}
                      </div>
                    </div>
                    <AssistantTurn
                      assistantMessages={turn.assistantMessages}
                      userContent={turn.userContent}
                      spaceId={[...selectedSpaceIds][0]}
                      isStreaming={isLastTurn && isLoading}
                      isAgentMode={agentModeTurnIds.has(turn.id)}
                      streamData={
                        isLastTurn
                          ? currentTurnStreamData
                          : currentSession?.streamDataByTurn?.[turn.id]
                      }
                      onScrollNeeded={scrollToBottom}
                    />
                  </div>
                );
              })}

              {error && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-500 text-sm">
                    {error.message || "请求失败，请重试"}
                  </div>
                </div>
              )}
            </div>

            <div
              className="input-bar shrink-0 px-4 md:px-6 py-3 md:py-4 border-t border-slate-200 bg-white/60 backdrop-blur"
              onContextMenu={(e) => {
                if ((e.target as HTMLElement).closest("button, [data-voice-hold]"))
                  e.preventDefault();
              }}
            >
              <form
                onSubmit={(e) => {
                  lastInput.current = input;
                  userScrolledUp.current = false;
                  pendingAgentMode.current = agentMode;
                  handleSubmit(e);
                }}
                className="flex gap-2 md:gap-3 max-w-3xl mx-auto items-center"
              >
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(true)}
                    disabled={isLoading}
                    className="shrink-0 p-2.5 rounded-xl border text-slate-400 bg-white border-slate-200 hover:text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
                    title="清除对话"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-indigo-500 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 hover:border-indigo-200 transition-colors"
                  title="上传文件到知识库"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" x2="12" y1="3" y2="15" />
                  </svg>
                  <span className="hidden sm:inline">上传文件到知识库</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAgentMode((v) => !v)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-xl border transition-colors ${
                    agentMode
                      ? "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100"
                      : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                  }`}
                  title={agentMode ? "关闭 Agent 模式" : "开启 Agent 模式"}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2a7 7 0 0 0-7 7c0 3 2 5.5 4 7.5.6.6 1 1.5 1 2.5h4c0-1 .4-1.9 1-2.5 2-2 4-4.5 4-7.5a7 7 0 0 0-7-7z" />
                    <path d="M10 22h4" />
                  </svg>
                  <span className="hidden sm:inline">Agent 模式</span>
                </button>

                {/* 输入区域：文本模式 or 语音模式 */}
                {voiceMode ? (
                  /* ── 语音模式：长按录音、松手发送、上移取消（与 App 一致） ── */
                  <VoiceHoldButton
                    isRecording={voiceInput.isRecording}
                    isTranscribing={voiceInput.isTranscribing}
                    onStart={voiceInput.startRecording}
                    onStop={voiceInput.stopRecording}
                    onCancel={voiceInput.cancelRecording}
                    onCancellingChange={setVoiceCancelling}
                    className="flex-1 min-w-0"
                  >
                    {({ isRecording, isTranscribing }) => (
                      <div
                        className={`rounded-xl border px-3 md:px-4 py-3 text-sm font-medium text-center transition-colors ${
                          isTranscribing
                            ? "bg-amber-50 border-amber-200 text-amber-600"
                            : isRecording
                              ? "bg-red-50 border-red-300 text-red-600"
                              : "bg-white border-slate-200 text-slate-400"
                        }`}
                      >
                        {isTranscribing ? (
                          <span className="inline-flex items-center gap-2">
                            <svg className="h-4 w-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83" />
                            </svg>
                            转写中...
                          </span>
                        ) : isRecording ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="relative flex h-3 w-3 shrink-0">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                            </span>
                            松手发送
                          </span>
                        ) : (
                          "长按 说话"
                        )}
                      </div>
                    )}
                  </VoiceHoldButton>
                ) : (
                  /* ── 文本模式：普通输入框 ── */
                  <input
                    value={input}
                    onChange={handleInputChange}
                    placeholder="输入你想问的问题..."
                    className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl px-3 md:px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm placeholder:text-slate-300"
                  />
                )}

                {/* 语音/键盘切换按钮 */}
                <button
                  type="button"
                  onClick={() => {
                    if (voiceInput.isRecording) voiceInput.cancelRecording();
                    setVoiceMode((v) => !v);
                    voiceInput.reset();
                  }}
                  disabled={voiceInput.isTranscribing}
                  className="shrink-0 p-2.5 rounded-xl border bg-white border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors disabled:opacity-40"
                  title={voiceMode ? "键盘输入" : "语音输入"}
                >
                  {voiceMode ? (
                    /* 键盘图标 */
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" />
                    </svg>
                  ) : (
                    /* 麦克风图标 */
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="2" width="6" height="11" rx="3" />
                      <path d="M5 10a7 7 0 0 0 14 0" />
                      <line x1="12" x2="12" y1="17" y2="22" />
                    </svg>
                  )}
                </button>

                {/* 发送按钮：仅文本模式且有内容时显示 */}
                {!voiceMode && input.trim() && (
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="shrink-0 px-4 md:px-5 py-3 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    发送
                  </button>
                )}
              </form>

              {/* 语音录制浮层：录音/转写时全屏展示识别文字，避免撑乱输入栏 */}
              {voiceMode && (voiceInput.isRecording || voiceInput.isTranscribing) && (
                <VoiceRecordingOverlay
                  isRecording={voiceInput.isRecording}
                  isTranscribing={voiceInput.isTranscribing}
                  isCancelling={voiceCancelling}
                  transcript={input}
                  partialText={partialText}
                  audioLevel={audioLevel}
                  onStop={voiceInput.stopRecording}
                  onCancel={voiceInput.cancelRecording}
                  holdToSend
                />
              )}

              <Toast
                message={toastMsg}
                onDismiss={() => setToastMsg(null)}
              />
            </div>
          </div>

          {/* ── Canvas area (right panel) ── */}
          {hasCanvas && canvasOpen && (
            <div className="w-[60%] flex flex-col min-h-0">
              <ReportCanvas
                ref={canvasRef}
                sections={report.sections}
                title={report.title}
                isStreaming={isLoading}
                onEditSection={sectionEdit.editSection}
                editingSectionId={sectionEdit.editingSectionId}
                editProgress={sectionEdit.editProgress}
                onTitleChange={report.setTitle}
                onClose={() => setCanvasOpen(false)}
              />
            </div>
          )}
        </div>
      </main>

      {uploadOpen && (
        <ChatUploadModal
          spaces={availableSpaces.filter((s) => s.spaceId !== DEMO_SPACE_ID)}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {}}
        />
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowClearConfirm(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-red-500"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              清除对话记录
            </h3>
            <p className="text-xs text-slate-500 mb-5">
              清除后无法恢复，确定要清除所有对话消息吗？
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-4 py-2.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  setShowClearConfirm(false);
                  setMessages([]);
                  userScrolledUp.current = false;
                }}
                className="flex-1 px-4 py-2.5 text-xs font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors"
              >
                确认清除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
