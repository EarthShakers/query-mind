"use client";

import { useState, useTransition } from "react";

export function GameAiBuilder({
  gameId,
  onGenerated,
}: {
  gameId: string;
  onGenerated: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    const input = prompt.trim();
    if (!input || isPending) return;
    startTransition(async () => {
      setMessage(null);
      try {
        const res = await fetch(`/api/spark/games/${gameId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: input }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setMessage(data?.error || "生成失败，请重试");
          return;
        }
        setMessage("已生成并写入 index.html，正在刷新预览");
        onGenerated();
      } catch {
        setMessage("生成失败，请稍后再试");
      }
    });
  }

  return (
    <div className="rounded-3xl border border-cyan-400/25 bg-slate-900/75 p-4">
      <div className="text-sm font-semibold text-cyan-200">AI 生成/修改游戏</div>
      <p className="mt-1 text-xs text-slate-400">
        输入一句需求即可直接改写当前游戏代码（单文件 index.html）。
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        placeholder="例：生成一个像 Flappy Bird 的游戏，空格/点击起飞，带计分和碰撞检测"
        className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-400">{message || "支持反复迭代修改。"} </span>
        <button
          type="button"
          onClick={submit}
          disabled={!prompt.trim() || isPending}
          className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {isPending ? "生成中..." : "AI 生成"}
        </button>
      </div>
    </div>
  );
}
