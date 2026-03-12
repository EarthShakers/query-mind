"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { NavAuth } from "@/components/nav-auth";

interface Member {
  id: string;
  userId: string;
  role: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

const ROLE_OPTIONS = [
  { value: "viewer", label: "查看者", desc: "可查看空间文档" },
  { value: "editor", label: "编辑者", desc: "可上传和编辑文档" },
  { value: "admin", label: "管理员", desc: "可管理空间和成员" },
];

const ROLE_LABELS: Record<string, { text: string; color: string; bg: string }> = {
  admin: { text: "管理员", color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-100" },
  editor: { text: "编辑者", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
  viewer: { text: "查看者", color: "text-slate-500", bg: "bg-slate-100 border-slate-200" },
};

export default function SpaceMembersPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { user, loading } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("viewer");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/spaces/${spaceId}/members`);
      if (res.ok) setMembers(await res.json());
    } catch {
      // ignore
    } finally {
      setFetching(false);
    }
  }, [spaceId]);

  useEffect(() => {
    if (!loading) fetchMembers();
  }, [loading, fetchMembers]);

  async function handleAdd() {
    if (!addUserId.trim()) return;
    setAdding(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/spaces/${spaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: addUserId.trim(), role: addRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "添加失败");
      } else {
        setAddUserId("");
        setShowAdd(false);
        setSuccess("成员已添加");
        fetchMembers();
        setTimeout(() => setSuccess(""), 3000);
      }
    } catch {
      setError("添加失败");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(targetUserId: string, name: string) {
    if (!confirm(`确定要移除成员「${name}」吗？`)) return;
    try {
      const res = await fetch(
        `/api/spaces/${spaceId}/members?userId=${targetUserId}`,
        { method: "DELETE" }
      );
      if (res.ok) fetchMembers();
    } catch {
      // ignore
    }
  }

  const isAdmin =
    user?.tenantRole === "admin" ||
    user?.spaces.find((s) => s.spaceId === spaceId)?.role === "admin";

  const spaceName = user?.spaces.find((s) => s.spaceId === spaceId)?.spaceName ?? "空间";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <span className="inline-block w-6 h-6 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">QueryMind</Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/spaces" className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              空间列表
            </Link>
            <NavAuth />
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-500 to-cyan-500 text-white">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">{spaceName}</h1>
              <p className="text-indigo-200 text-xs mt-0.5">成员管理</p>
            </div>
          </div>
          {!fetching && (
            <p className="text-indigo-100 text-sm mt-3">共 {members.length} 位成员</p>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-6 -mt-4">
        {/* Add member */}
        {isAdmin && (
          showAdd ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 p-5 mb-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">添加成员</h3>
              <div className="space-y-3">
                <input
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                  placeholder="输入用户 ID"
                  autoFocus
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder:text-slate-400"
                />
                <div className="grid grid-cols-3 gap-2">
                  {ROLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setAddRole(opt.value)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        addRole === opt.value
                          ? "border-indigo-300 bg-indigo-50 shadow-sm"
                          : "border-slate-200 hover:border-indigo-200"
                      }`}
                    >
                      <p className={`text-xs font-semibold ${addRole === opt.value ? "text-indigo-600" : "text-slate-700"}`}>
                        {opt.label}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
                {error && (
                  <div className="px-4 py-2.5 rounded-xl text-sm bg-red-50 text-red-600 border border-red-200">{error}</div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleAdd}
                    disabled={adding || !addUserId.trim()}
                    className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-sm font-medium rounded-xl hover:shadow-lg hover:shadow-indigo-200/50 disabled:opacity-40 transition-all"
                  >
                    {adding ? "添加中..." : "确认添加"}
                  </button>
                  <button
                    onClick={() => { setShowAdd(false); setError(""); }}
                    className="px-5 py-2.5 text-slate-500 text-sm rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setShowAdd(true)}
              className="bg-white rounded-2xl border-2 border-dashed border-slate-200 shadow-lg shadow-slate-200/50 hover:border-indigo-300 hover:shadow-xl cursor-pointer transition-all mb-6"
            >
              <div className="flex items-center gap-4 py-5 px-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-md shadow-indigo-200/50 shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">添加成员</p>
                  <p className="text-xs text-slate-400 mt-0.5">邀请团队成员加入此空间</p>
                </div>
              </div>
            </div>
          )
        )}

        {/* Success */}
        {success && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-green-50 text-green-700 border border-green-200 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            {success}
          </div>
        )}

        {/* Members list */}
        {fetching ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-3" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">暂无成员</div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {members.map((member, i) => {
              const roleInfo = ROLE_LABELS[member.role] ?? ROLE_LABELS.viewer;
              const name = member.displayName || member.email.split("@")[0];
              return (
                <div key={member.id} className={`flex items-center justify-between p-4 ${i > 0 ? "border-t border-slate-100" : ""}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {name[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{name}</p>
                      <p className="text-xs text-slate-400 truncate">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${roleInfo.bg} ${roleInfo.color}`}>
                      {roleInfo.text}
                    </span>
                    {isAdmin && member.userId !== user?.userId && (
                      <button
                        onClick={() => handleRemove(member.userId, name)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="移除成员"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="h-12" />
      </div>
    </div>
  );
}
