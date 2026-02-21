"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";

interface RoadmapItem {
  id: string;
  phase: string;
  phase_label: string;
  color: string;
  title: string;
  description: string;
  status: string;
  sort_order: number;
}

interface Phase {
  phase: string;
  label: string;
  color: string;
  items: RoadmapItem[];
}

const COLOR_MAP: Record<string, { bg: string; text: string; dot: string }> = {
  rose: { bg: "bg-rose-50", text: "text-rose-600", dot: "bg-rose-400" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-400" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600", dot: "bg-indigo-400" },
  cyan: { bg: "bg-cyan-50", text: "text-cyan-600", dot: "bg-cyan-400" },
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  planned: {
    label: "planned",
    className: "bg-slate-100 text-slate-500",
  },
  in_progress: {
    label: "in progress",
    className: "bg-blue-50 text-blue-600",
  },
  done: {
    label: "done",
    className: "bg-green-50 text-green-700",
  },
};

export function RoadmapSection() {
  const { user } = useAuth();
  const isAdmin = user?.role === "superAdmin";
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", status: "planned" });
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({
    phase: "",
    phase_label: "",
    color: "indigo",
    title: "",
    description: "",
    status: "planned",
    sort_order: 0,
  });

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/roadmap");
      if (res.ok) setItems(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const phases: Phase[] = [];
  for (const item of items) {
    let phase = phases.find((p) => p.phase === item.phase);
    if (!phase) {
      phase = { phase: item.phase, label: item.phase_label, color: item.color, items: [] };
      phases.push(phase);
    }
    phase.items.push(item);
  }

  async function handleUpdate(id: string) {
    const res = await fetch("/api/roadmap", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...editForm }),
    });
    if (res.ok) {
      setEditingId(null);
      fetchItems();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除此项？")) return;
    const res = await fetch("/api/roadmap", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) fetchItems();
  }

  async function handleAdd() {
    if (!addForm.phase || !addForm.phase_label || !addForm.title || !addForm.description) return;
    const res = await fetch("/api/roadmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    if (res.ok) {
      setAdding(false);
      setAddForm({
        phase: "",
        phase_label: "",
        color: "indigo",
        title: "",
        description: "",
        status: "planned",
        sort_order: 0,
      });
      fetchItems();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-3" />
        <span className="text-sm">加载中...</span>
      </div>
    );
  }

  return (
    <>
      <h2>Roadmap</h2>
      <p>
        以下是 QueryMind 的产品规划路线图，按优先级从高到低排列。
      </p>

      <div className="not-prose space-y-8 mt-6">
        {phases.map((phase) => {
          const c = COLOR_MAP[phase.color] ?? COLOR_MAP.indigo;
          return (
            <div key={phase.phase}>
              <div className="flex items-center gap-3 mb-4">
                <h3 className="text-base font-bold text-slate-800 m-0">
                  {phase.phase}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}
                >
                  {phase.label}
                </span>
              </div>
              <div className="space-y-3">
                {phase.items.map((item) => {
                  const statusMeta = STATUS_LABELS[item.status] ?? STATUS_LABELS.planned;

                  if (editingId === item.id) {
                    return (
                      <div
                        key={item.id}
                        className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/30 space-y-3"
                      >
                        <input
                          value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          placeholder="标题"
                        />
                        <textarea
                          value={editForm.description}
                          onChange={(e) =>
                            setEditForm({ ...editForm, description: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          rows={2}
                          placeholder="描述"
                        />
                        <select
                          value={editForm.status}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        >
                          <option value="planned">Planned</option>
                          <option value="in_progress">In Progress</option>
                          <option value="done">Done</option>
                        </select>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdate(item.id)}
                            className="px-3 py-1.5 bg-indigo-500 text-white text-xs rounded-lg hover:bg-indigo-600"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg hover:bg-slate-50"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 bg-white group"
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${c.dot}`}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-700">
                            {item.title}
                          </p>
                          <span
                            className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${statusMeta.className}`}
                          >
                            {statusMeta.label}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0">
                          <button
                            onClick={() => {
                              setEditingId(item.id);
                              setEditForm({
                                title: item.title,
                                description: item.description,
                                status: item.status,
                              });
                            }}
                            className="px-2 py-1 text-xs text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="px-2 py-1 text-xs text-red-600 bg-red-50 rounded hover:bg-red-100"
                          >
                            删除
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div className="not-prose mt-8">
          {adding ? (
            <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/30 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={addForm.phase}
                  onChange={(e) => setAddForm({ ...addForm, phase: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  placeholder="阶段 (如 P0 · 核心基础)"
                />
                <input
                  value={addForm.phase_label}
                  onChange={(e) => setAddForm({ ...addForm, phase_label: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  placeholder="阶段标签 (如 最高优先级)"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={addForm.color}
                  onChange={(e) => setAddForm({ ...addForm, color: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="rose">Rose</option>
                  <option value="amber">Amber</option>
                  <option value="indigo">Indigo</option>
                  <option value="cyan">Cyan</option>
                </select>
                <select
                  value={addForm.status}
                  onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="planned">Planned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <input
                value={addForm.title}
                onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                placeholder="标题"
              />
              <textarea
                value={addForm.description}
                onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                rows={2}
                placeholder="描述"
              />
              <input
                type="number"
                value={addForm.sort_order}
                onChange={(e) =>
                  setAddForm({ ...addForm, sort_order: parseInt(e.target.value) || 0 })
                }
                className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                placeholder="排序"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  className="px-4 py-2 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600"
                >
                  添加
                </button>
                <button
                  onClick={() => setAdding(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="px-4 py-2 border-2 border-dashed border-slate-200 text-slate-500 text-sm rounded-xl hover:border-indigo-300 hover:text-indigo-600 transition-colors w-full"
            >
              + 添加新项目
            </button>
          )}
        </div>
      )}
    </>
  );
}
