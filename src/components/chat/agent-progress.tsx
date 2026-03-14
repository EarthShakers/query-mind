"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import gsap from "gsap";
import styles from "./agent-progress.module.css";

/** 后端推送的进度事件 */
interface ProgressEvent {
  type: "agent_progress";
  node: string;
  ts: string;
  strategy?: string;
  subTasks?: { id: string; tool: string; description: string }[];
  toolSummary?: { id: string; kind: string; count: number; error?: string }[];
}

interface LogItem {
  ts: string;
  msg: string;
  chunks?: Array<{
    title?: string;
    content: string;
    similarity: number;
    summary?: string;
    metadata?: { title?: string };
  }>;
}

interface AgentProgressProps {
  userQuery?: string;
  isActive?: boolean;
  /** 后端实时推送的进度事件 */
  progressEvents?: ProgressEvent[];
  /** 完成后的 tool 结果（用于展示知识库 chunks） */
  executionTools?: Array<{ toolName: string; result?: unknown }>;
}

const NODE_TO_STEP: Record<string, number> = {
  planning: 0,
  execute: 1,
  synthesize: 2,
  validate: 3,
};

const STEPS = [
  { id: "planning", label: "分析问题" },
  { id: "execute", label: "检索查询" },
  { id: "synthesize", label: "深度分析" },
  { id: "validate", label: "验证输出" },
];

function fmtTime(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

/** 从进度事件构建日志 */
function buildLogsFromEvents(events: ProgressEvent[]): LogItem[] {
  const logs: LogItem[] = [];
  for (const ev of events) {
    const ts = fmtTime(ev.ts);
    if (ev.node === "planning") {
      if (ev.strategy) {
        logs.push({ ts, msg: `分析策略：${ev.strategy}` });
      }
      if (ev.subTasks?.length) {
        for (const t of ev.subTasks) {
          logs.push({ ts, msg: `计划：${t.description}` });
        }
      } else if (ev.subTasks) {
        logs.push({ ts, msg: "该问题无需查询工具，直接分析回答。" });
      }
    } else if (ev.node === "execute" && ev.toolSummary) {
      for (const t of ev.toolSummary) {
        if (t.kind === "search") {
          logs.push({ ts, msg: `搜索相关文档，找到 ${t.count} 条结果` });
        } else if (t.kind === "query") {
          logs.push({
            ts,
            msg: t.error
              ? `数据查询失败：${t.error}`
              : `查询数据表，返回 ${t.count} 条记录`,
          });
        }
      }
    } else if (ev.node === "synthesize") {
      logs.push({ ts, msg: "正在整合分析结果，生成回答..." });
    } else if (ev.node === "validate") {
      logs.push({ ts, msg: "验证回答完整性，输出最终答案。" });
    }
  }
  return logs;
}

/** 完成后从 tool 结果构建日志（含 chunks） */
function buildLogsFromTools(
  tools: Array<{ toolName: string; result?: unknown }>
): LogItem[] {
  const logs: LogItem[] = [];
  const ts = fmtTime();
  for (const t of tools) {
    if (t.toolName === "search_knowledge" && t.result) {
      const r = t.result as { query?: string; results?: unknown[] };
      const chunkList = (r.results ?? []) as NonNullable<LogItem["chunks"]>;
      logs.push({
        ts,
        msg: `搜索相关文档 — 找到 ${chunkList.length} 条结果`,
        chunks: chunkList.length > 0 ? chunkList : undefined,
      });
    } else if (t.toolName === "execute_query" && t.result) {
      const r = t.result as { data?: unknown[]; error?: string };
      const count = r.error ? 0 : r.data?.length ?? 0;
      logs.push({
        ts,
        msg: r.error
          ? `数据查询失败：${r.error}`
          : `查询数据表，返回 ${count} 条记录`,
      });
    }
  }
  return logs;
}

export function AgentProgress({
  userQuery = "",
  isActive = false,
  progressEvents = [],
  executionTools,
}: AgentProgressProps) {
  const nodesRef = useRef<HTMLDivElement[]>([]);
  const linesRef = useRef<HTMLDivElement[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── 从事件推导当前步骤 ──
  const completedNodes = useMemo(() => {
    const set = new Set<string>();
    for (const ev of progressEvents) set.add(ev.node);
    return set;
  }, [progressEvents]);

  const currentStep = useMemo(() => {
    // 找到最后一个完成的节点，当前步骤是它的下一个
    let maxDone = -1;
    for (const node of completedNodes) {
      const idx = NODE_TO_STEP[node];
      if (idx !== undefined && idx > maxDone) maxDone = idx;
    }
    if (!isActive) return maxDone >= 0 ? maxDone : 3; // 完成时全部 done
    return Math.min(maxDone + 1, 3); // 正在进行下一步
  }, [completedNodes, isActive]);

  // ── 从事件构建日志（保留所有，不合并）──
  const logs = useMemo<LogItem[]>(() => {
    const ts = fmtTime();
    if (progressEvents.length > 0) {
      const eventLogs = buildLogsFromEvents(progressEvents);
      if (!isActive && executionTools?.length) {
        const toolLogs = buildLogsFromTools(executionTools);
        return [...eventLogs, ...toolLogs];
      }
      return eventLogs;
    }
    if (!isActive && executionTools?.length) {
      const toolLogs = buildLogsFromTools(executionTools);
      return [
        { ts, msg: "已解析用户问题，拆解子任务。" },
        ...toolLogs,
        { ts, msg: "合并工具结果，生成回答。" },
        { ts, msg: "校验完整性，输出最终答案。" },
      ];
    }
    return [{ ts, msg: "正在启动深度分析..." }];
  }, [progressEvents, isActive, executionTools]);

  // ── GSAP: 节点入场动画 ──
  useEffect(() => {
    if (!containerRef.current) return;
    const nodes = nodesRef.current.filter(Boolean);
    const lines = linesRef.current.filter(Boolean);
    const ctx = gsap.context(() => {
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

  // ── GSAP: 步骤切换脉冲 ──
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
    return () => {
      tl.kill();
    };
  }, [currentStep, isActive]);

  // ── GSAP: ✓ 出现动画 ──
  const prevStepRef = useRef(currentStep);
  useEffect(() => {
    if (currentStep > prevStepRef.current) {
      const node = nodesRef.current[prevStepRef.current];
      if (node) {
        const check = node.querySelector(".checkmark-badge");
        if (check) {
          gsap.fromTo(
            check,
            { scale: 0, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.8)" }
          );
        }
      }
    }
    prevStepRef.current = currentStep;
  }, [currentStep]);

  // ── 自动滚动日志 ──
  const logContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logContainerRef.current?.scrollTo({
      top: logContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [logs.length]);

  return (
    <div
      className="mt-4 rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
      style={{
        background: "rgba(15, 23, 42, 0.95)",
        backdropFilter: "blur(16px)",
        boxShadow:
          "0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1)",
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
              正在深度推理
            </>
          ) : (
            <>
              <span>✓</span>
              分析完成
            </>
          )}
        </span>
      </div>

      <div className="flex flex-col md:flex-row min-h-[420px] max-h-[60vh] overflow-hidden">
        {/* Agent 核心 — 变形 avatar */}
        <div className="flex flex-col items-center justify-center w-52 min-w-52 max-w-52 px-8 py-8 border-b md:border-b-0 md:border-r border-white/10 shrink-0">
          <div className="w-24 h-24 mx-auto mb-4 relative">
            <div
              className={`w-full h-full rounded-[30%_70%_70%_30%_/_30%_30%_70%_70%] ${styles.avatarMorph}`}
              style={{
                background:
                  "conic-gradient(from 0deg, #6366f1, #22d3ee, #6366f1)",
                filter: "blur(1px) drop-shadow(0 0 20px rgba(99,102,241,0.6))",
              }}
            />
          </div>
          <span className="text-sm text-slate-400 font-medium">
            QueryMind Agent
          </span>
          {userQuery && (
            <div className="mt-6 w-full text-left px-1">
              <p className="text-[11px] text-indigo-400/90 mb-1.5 tracking-wide">
                当前目标：
              </p>
              <p className="text-sm text-slate-300 leading-relaxed line-clamp-3">
                {userQuery}
              </p>
            </div>
          )}
        </div>

        {/* 推理图节点 */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center p-8 relative"
        >
          <div className="flex items-center gap-3 w-full max-w-lg">
            {STEPS.map((step, i) => {
              const isRunning = isActive && i === currentStep;
              const isDone =
                completedNodes.has(step.id) || (!isActive && i <= currentStep);
              const hasBadge = isRunning || isDone;
              return (
                <div key={step.id} className="flex items-center flex-1 min-w-0">
                  <div
                    ref={(el) => {
                      if (el) nodesRef.current[i] = el;
                    }}
                    className={`
                      relative flex-1 flex items-center justify-center px-4 py-3.5 rounded-xl
                      border text-sm font-medium
                      ${hasBadge ? "pr-8" : ""}
                      ${
                        isRunning
                          ? "border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.3)]"
                          : ""
                      }
                      ${
                        isDone && !isRunning
                          ? "border-emerald-500/50 bg-emerald-500/5"
                          : ""
                      }
                      ${
                        !isDone && !isRunning
                          ? "border-white/10 bg-white/5"
                          : ""
                      }
                    `}
                  >
                    {isRunning && (
                      <span className="absolute top-2 right-2 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-50" />
                        <span className="relative inline-flex rounded-full h-4 w-4 border-2 border-slate-400 border-t-indigo-400 animate-spin" />
                      </span>
                    )}
                    {isDone && !isRunning && (
                      <span className="absolute top-2 right-2 text-emerald-400 text-xs checkmark-badge">
                        ✓
                      </span>
                    )}
                    <span
                      className={
                        isRunning
                          ? "text-indigo-300"
                          : isDone
                          ? "text-slate-300"
                          : "text-slate-500"
                      }
                    >
                      {step.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      ref={(el) => {
                        if (el) linesRef.current[i] = el;
                      }}
                      className={`shrink-0 w-8 h-px mx-1.5 bg-gradient-to-r transition-colors duration-500 ${
                        isDone
                          ? "from-indigo-400/80 to-transparent"
                          : "from-white/10 to-transparent"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 终端日志：限制最大高度，超出滚动 */}
        <div
          className="flex-1 min-w-0 min-h-0 px-6 py-6 border-t md:border-t-0 md:border-l border-white/10 flex flex-col overflow-hidden"
          style={{ minHeight: 200, maxHeight: "50vh" }}
        >
          <div className="text-xs text-indigo-400/80 mb-3 font-mono tracking-wider shrink-0">
            Execution Stream
          </div>
          <div
            ref={logContainerRef}
            className={`space-y-3 font-mono text-sm flex-1 min-h-0 overflow-y-auto ${styles.logScroll}`}
          >
            {logs.map((item, i) => (
              <div
                key={i}
                className={`flex flex-col gap-1 border-l-2 border-indigo-400/50 pl-3 py-1 text-slate-400 ${styles.logSlideIn}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-indigo-400/90 shrink-0 font-semibold text-xs">
                    [{item.ts}]
                  </span>
                  <span className="text-slate-300 text-sm">{item.msg}</span>
                </div>
                {item.chunks && item.chunks.length > 0 && (
                  <div className="mt-1 ml-0 space-y-1">
                    {item.chunks.slice(0, 5).map((doc, j) => (
                      <div
                        key={j}
                        className="p-2 rounded border border-white/10 bg-white/5 text-[11px]"
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-medium text-indigo-300/90 truncate">
                            {doc.title ?? doc.metadata?.title ?? "未知文件"}
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
                    {item.chunks.length > 5 && (
                      <span className="text-slate-500 text-[10px]">
                        … 共 {item.chunks.length} 个片段
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {isActive && logs.length > 0 && (
              <div className="flex items-center gap-2 pl-3 py-1 text-slate-500">
                <span className="inline-block w-3 h-3 border-2 border-slate-500 border-t-indigo-400 rounded-full animate-spin" />
                <span className="text-xs">等待下一步...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
