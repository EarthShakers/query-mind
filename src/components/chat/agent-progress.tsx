"use client";

/**
 * Agent 进度展示（Phase 2）
 * 当 LangGraph Agent 路径返回步骤数据时展示 checklist 样式进度
 * 当前 stream-adapter 未推送步骤，此组件为占位，待流式步骤支持后启用
 */
export interface AgentStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done";
  detail?: string;
}

interface AgentProgressProps {
  steps?: AgentStep[];
  isActive?: boolean;
}

const AGENT_STEP_IDS = ["plan", "execute", "synthesize", "validate"] as const;
const AGENT_STEP_LABELS: Record<(typeof AGENT_STEP_IDS)[number], string> = {
  plan: "分析问题",
  execute: "执行工具",
  synthesize: "综合分析",
  validate: "验证回答",
};

export function AgentProgress({ steps = [], isActive = false }: AgentProgressProps) {
  const defaultSteps: AgentStep[] =
    steps.length > 0
      ? steps
      : AGENT_STEP_IDS.map((id) => ({
          id,
          label: AGENT_STEP_LABELS[id],
          status: (isActive ? "pending" : "done") as AgentStep["status"],
        }));

  const displaySteps = steps.length ? steps : defaultSteps;

  return (
    <div className="mt-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-sm">
      <div className="flex items-center gap-2 text-slate-500 mb-2">
        {isActive ? (
          <>
            <span className="inline-block w-3 h-3 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
            <span>智能分析中...</span>
          </>
        ) : (
          <span>Agent 步骤</span>
        )}
      </div>
      <ul className="space-y-1">
        {displaySteps.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-slate-600">
            {s.status === "done" ? (
              <span className="text-green-500">✅</span>
            ) : s.status === "running" ? (
              <span className="inline-block w-3 h-3 border border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
            ) : (
              <span className="text-slate-300">○</span>
            )}
            <span>{s.label}</span>
            {s.detail && (
              <span className="text-slate-400 truncate max-w-[200px]">
                → {s.detail}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
