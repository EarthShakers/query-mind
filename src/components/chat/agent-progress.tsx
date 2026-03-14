"use client";

import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import styles from "./agent-progress.module.css";

/**
 * Agent 进度展示 — 完全参照 test.html 设计
 * 深色面板 + 变形核心 + 推理图节点 + 终端日志，indigo 配色
 */
export interface AgentStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done";
  detail?: string;
}

/** 从 tool 结果生成 Execution Stream 展示项 */
export interface ExecutionLogItem {
  time?: string;
  msg: string;
  /** search_knowledge 的 results，用于展示 chunks */
  chunks?: Array<{ title?: string; content: string; similarity: number; summary?: string; metadata?: { title?: string } }>;
}

interface AgentProgressProps {
  steps?: AgentStep[];
  /** 用户查询目标，参考 test.html 左侧「当前目标」 */
  userQuery?: string;
  isActive?: boolean;
  /** 真实 tool 结果，用于 Execution Stream 展示（与 streamText 的 toolInvocations 一致） */
  executionTools?: Array<{ toolName: string; result?: unknown }>;
}

const STEPS = [
  { id: "plan", label: "解析原始需求" },
  { id: "execute", label: "执行工具调用" },
  { id: "synthesize", label: "综合分析生成" },
  { id: "validate", label: "验证输出结果" },
];

const LOG_MSGS = [
  "开始分析问题...",
  "理解问题意图，制定计划。",
  "正在检索和查询...",
  "整合分析结果...",
  "验证回答完整性。",
  "生成最终回答。",
];

function buildExecutionLogs(
  tools: Array<{ toolName: string; result?: unknown }>
): ExecutionLogItem[] {
  const logs: ExecutionLogItem[] = [
    { msg: "开始分析问题..." },
    { msg: "理解问题意图，制定计划。" },
  ];
  if (tools.length === 0) {
    logs.push({ msg: "该问题无需查询，直接回答。" });
  }
  for (const t of tools) {
    if (t.toolName === "search_knowledge" && t.result) {
      const r = t.result as { query?: string; results?: unknown[] };
      const chunkList = (r.results ?? []) as NonNullable<ExecutionLogItem["chunks"]>;
      logs.push({
        msg: `搜索相关文档 — 找到 ${chunkList.length} 条结果`,
        chunks: chunkList.length > 0 ? chunkList : undefined,
      });
    } else if (t.toolName === "execute_query" && t.result) {
      const r = t.result as { sql?: string; data?: unknown[]; error?: string };
      const count = r.error ? 0 : (r.data?.length ?? 0);
      logs.push({
        msg: r.error ? `数据查询失败：${r.error}` : `查询数据表，返回 ${count} 条记录`,
      });
    }
  }
  logs.push({ msg: "整合分析结果，生成回答。" });
  return logs;
}

export function AgentProgress({ steps = [], userQuery = "", isActive = false, executionTools }: AgentProgressProps) {
  const [logIndex, setLogIndex] = useState(2);
  const [currentStep, setCurrentStep] = useState(0);
  const nodesRef = useRef<HTMLDivElement[]>([]);
  const linesRef = useRef<HTMLDivElement[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const logTimesRef = useRef<string[]>([]);

  function nowStr() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  }

  // 初始化前两条日志的时间戳
  if (logTimesRef.current.length === 0) {
    const t = nowStr();
    logTimesRef.current.push(t, t);
  }

  const realLogs = executionTools?.length
    ? buildExecutionLogs(executionTools)
    : null;

  useEffect(() => {
    if (!isActive) return;
    const t1 = setInterval(() => {
      setCurrentStep((i) => Math.min(i + 1, 3));
    }, 2400);
    const t2 = setInterval(() => {
      setLogIndex((i) => {
        const next = Math.min(i + 1, LOG_MSGS.length);
        if (logTimesRef.current.length < next) {
          logTimesRef.current.push(nowStr());
        }
        return next;
      });
    }, 1600);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [isActive]);

  // GSAP: 节点入场 + 步骤切换动画
  useEffect(() => {
    if (!containerRef.current) return;
    const nodes = nodesRef.current.filter(Boolean);
    const lines = linesRef.current.filter(Boolean);

    const ctx = gsap.context(() => {
      // 入场：节点从左依次飞入
      gsap.fromTo(
        nodes,
        { opacity: 0, scale: 0.8, x: -20 },
        {
          opacity: 1,
          scale: 1,
          x: 0,
          duration: 0.5,
          stagger: 0.1,
          ease: "back.out(1.2)",
        }
      );
      // 连接线：从左向右展开
      gsap.fromTo(
        lines,
        { scaleX: 0, opacity: 0 },
        {
          scaleX: 1,
          opacity: 1,
          duration: 0.4,
          stagger: 0.1,
          delay: 0.2,
          ease: "power2.out",
          transformOrigin: "left center",
        }
      );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  // 当前步骤高亮脉冲
  useEffect(() => {
    const node = nodesRef.current[currentStep];
    if (!node || !isActive) return;
    const tl = gsap.timeline();
    tl.to(node, {
      scale: 1.05,
      boxShadow: "0 0 30px rgba(99,102,241,0.4)",
      duration: 0.3,
      ease: "power2.out",
    }).to(node, {
      scale: 1,
      boxShadow: "0 0 20px rgba(99,102,241,0.3)",
      duration: 0.5,
      ease: "elastic.out(1, 0.5)",
    });
    return () => { tl.kill(); };
  }, [currentStep, isActive]);

  // ✓ 出现时 scale 动画
  useEffect(() => {
    if (currentStep > 0 && isActive) {
      const node = nodesRef.current[currentStep - 1];
      if (!node) return;
      const check = node.querySelector(".checkmark-badge");
      if (check) {
        gsap.fromTo(check, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.8)" });
      }
    }
  }, [currentStep, isActive]);

  const visibleLogs =
    realLogs ?? (isActive ? LOG_MSGS.slice(0, logIndex) : LOG_MSGS);

  return (
    <div
      className="mt-4 rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
      style={{
        background: "rgba(15, 23, 42, 0.95)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1)",
        backgroundImage: `
          radial-gradient(circle at 50% 0%, rgba(99,102,241,0.08) 0%, transparent 50%),
          linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
        `,
        backgroundSize: "100% 100%, 24px 24px, 24px 24px",
      }}
    >
      {/* Panel Header */}
      <div
        className="flex justify-between items-center px-5 py-4 border-b border-white/10"
        style={{ background: "rgba(255,255,255,0.05)" }}
      >
        <span className="text-sm font-medium tracking-[0.25em] uppercase text-indigo-400">
          Reasoning Graph
        </span>
        <span
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium border ${
            isActive
              ? "bg-indigo-500/10 text-indigo-400 border-indigo-400/50"
              : "bg-emerald-500/10 text-emerald-400 border-emerald-400/50"
          }`}
        >
          {isActive ? (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-400" />
              </span>
              正在进行深度推理
            </>
          ) : (
            <>
              <span>✓</span>
              分析完成
            </>
          )}
        </span>
      </div>

      <div className="flex flex-col md:flex-row min-h-[420px]">
        {/* Agent 核心 — 变形 avatar */}
        <div className="flex flex-col items-center justify-center px-8 py-8 border-b md:border-b-0 md:border-r border-white/10 shrink-0">
          <div className="w-24 h-24 mx-auto mb-4 relative">
            <div
              className={`w-full h-full rounded-[30%_70%_70%_30%_/_30%_30%_70%_70%] ${styles.avatarMorph}`}
              style={{
                background: "conic-gradient(from 0deg, #6366f1, #22d3ee, #6366f1)",
                filter: "blur(1px) drop-shadow(0 0 20px rgba(99,102,241,0.6))",
              }}
            />
          </div>
          <span className="text-sm text-slate-400 font-medium">QueryMind Agent</span>
          {userQuery && (
            <div className="mt-6 w-full text-left px-1">
              <p className="text-[11px] text-indigo-400/90 mb-1.5 tracking-wide">当前目标：</p>
              <p className="text-sm text-slate-300 leading-relaxed line-clamp-3">{userQuery}</p>
            </div>
          )}
        </div>

        {/* 推理图节点 */}
        <div ref={containerRef} className="flex-1 flex items-center justify-center p-8 relative">
          <div className="flex items-center gap-3 w-full max-w-lg">
            {STEPS.map((step, i) => {
              const isActiveNode = isActive ? i === currentStep : false;
              const isDone = !isActive || i < currentStep;
              const hasBadge = isActiveNode || isDone;
              return (
                <div key={step.id} className="flex items-center flex-1 min-w-0">
                  <div
                    ref={(el) => { if (el) nodesRef.current[i] = el; }}
                    className={`
                      relative flex-1 flex items-center justify-center px-4 py-3.5 rounded-xl
                      border text-sm font-medium
                      ${hasBadge ? "pr-8" : ""}
                      ${isActiveNode ? "border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.3)]" : ""}
                      ${isDone && !isActiveNode ? "border-emerald-500/50 bg-emerald-500/5" : ""}
                      ${!isDone && !isActiveNode ? "border-white/10 bg-white/5" : ""}
                    `}
                  >
                    {isActiveNode && (
                      <span className="absolute top-2 right-2 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-50" />
                        <span className="relative inline-flex rounded-full h-4 w-4 border-2 border-slate-400 border-t-indigo-400 animate-spin" />
                      </span>
                    )}
                    {isDone && !isActiveNode && (
                      <span className="absolute top-2 right-2 text-emerald-400 text-xs checkmark-badge">✓</span>
                    )}
                    <span className={isActiveNode ? "text-indigo-300" : isDone ? "text-slate-300" : "text-slate-500"}>
                      {step.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      ref={(el) => { if (el) linesRef.current[i] = el; }}
                      className={`shrink-0 w-8 h-px mx-1.5 bg-gradient-to-r transition-colors duration-500 ${
                        isDone ? "from-indigo-400/80 to-transparent" : "from-white/10 to-transparent"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 终端日志 */}
        <div
          className="flex-1 min-w-0 px-6 py-6 border-t md:border-t-0 md:border-l border-white/10 overflow-hidden flex flex-col"
          style={{ minHeight: 260 }}
        >
          <div className="text-xs text-indigo-400/80 mb-3 font-mono tracking-wider shrink-0">
            Execution Stream
          </div>
          <div className={`space-y-3 font-mono text-sm ${styles.logScroll}`} style={{ height: 240, overflowY: "auto" }}>
            {visibleLogs.map((item, i) => {
              const msg = typeof item === "string" ? item : (item as ExecutionLogItem).msg;
              const chunks = typeof item === "object" && "chunks" in item ? (item as ExecutionLogItem).chunks : undefined;
              return (
                <div
                  key={i}
                  className={`flex flex-col gap-1 border-l-2 border-indigo-400/50 pl-3 py-1 text-slate-400 ${styles.logSlideIn}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-indigo-400/90 shrink-0 font-semibold text-xs">
                      [{logTimesRef.current[i] || nowStr()}]
                    </span>
                    <span className="text-slate-300 text-sm">{msg}</span>
                  </div>
                  {chunks && chunks.length > 0 && (
                    <div className="mt-1 ml-0 space-y-1">
                      {chunks.slice(0, 5).map((doc, j) => (
                        <div
                          key={j}
                          className="p-2 rounded border border-white/10 bg-white/5 text-[11px]"
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-medium text-indigo-300/90 truncate">
                              📄 {doc.title ?? doc.metadata?.title ?? "未知文件"}
                            </span>
                            <span className="text-slate-400 shrink-0">
                              {Math.round(doc.similarity * 100)}%
                            </span>
                          </div>
                          <p className="text-slate-400 leading-relaxed line-clamp-2">
                            {doc.content}
                          </p>
                        </div>
                      ))}
                      {chunks.length > 5 && (
                        <span className="text-slate-500 text-[10px]">… 共 {chunks.length} 个片段</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
