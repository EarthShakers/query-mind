"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { NavAuth } from "@/components/nav-auth";

interface Space {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  created_at: string;
}

const ROLE_LABELS: Record<string, { text: string; color: string; bg: string }> = {
  admin: { text: "管理员", color: "text-indigo-600", bg: "bg-indigo-50" },
  editor: { text: "编辑者", color: "text-emerald-600", bg: "bg-emerald-50" },
  viewer: { text: "查看者", color: "text-slate-500", bg: "bg-slate-100" },
};

export default function SpacesPage() {
  const { user, loading, switchSpace, refresh } = useAuth();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const fetchSpaces = useCallback(async () => {
    if (!user?.tenantRole) return;
    try {
      const res = await fetch(`/api/tenants/${user.tenantId}/spaces`);
      if (res.ok) setSpaces(await res.json());
    } catch {
      // ignore
    } finally {
      setFetching(false);
    }
  }, [user?.tenantId, user?.tenantRole]);

  useEffect(() => {
    if (!loading && user?.tenantRole) fetchSpaces();
    else if (!loading) setFetching(false);
  }, [loading, user, fetchSpaces]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`/api/tenants/${user!.tenantId}/spaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "创建失败");
      } else {
        setNewName("");
        setNewDesc("");
        setShowCreate(false);
        fetchSpaces();
        refresh();
      }
    } catch {
      setError("创建失败");
    } finally {
      setCreating(false);
    }
  }

  function getUserRole(spaceId: string) {
    return user?.spaces.find((s) => s.spaceId === spaceId)?.role ?? null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <span className="inline-block w-6 h-6 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user?.tenantRole) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <nav className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-lg">
          <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
            <Link href="/" className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">QueryMind</Link>
            <NavAuth />
          </div>
        </nav>
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-200/50">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-800">你还未加入任何企业</h2>
            <p className="text-sm text-slate-400 mt-1">加入企业后即可使用空间功能</p>
          </div>
          <Link href="/join" className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-sm font-medium rounded-xl hover:shadow-lg hover:shadow-indigo-200/50 transition-all">
            加入企业
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">QueryMind</Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/chat" className="text-slate-500 hover:text-slate-800 transition-colors">在线体验</Link>
            <Link href="/knowledge" className="text-slate-500 hover:text-slate-800 transition-colors">知识库</Link>
            <NavAuth />
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-500 to-cyan-500 text-white">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-12">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/></svg>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold">空间管理</h1>
          </div>
          <p className="text-indigo-100 text-sm md:text-base max-w-lg">
            空间是数据隔离的最小单元。不同空间的知识库和文档相互独立。
          </p>
          {!fetching && spaces.length > 0 && (
            <div className="flex items-center gap-6 mt-6">
              <div>
                <p className="text-2xl font-bold">{spaces.length}</p>
                <p className="text-xs text-indigo-200">个空间</p>
              </div>
              <div className="w-px h-8 bg-white/20" />
              <div>
                <p className="text-2xl font-bold">{user.spaces.length}</p>
                <p className="text-xs text-indigo-200">已加入</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 -mt-6">
        {/* Create Card */}
        {user.tenantRole === "admin" && (
          showCreate ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 p-6 mb-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">创建新空间</h3>
              <div className="space-y-3">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="空间名称"
                  autoFocus
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder:text-slate-400"
                />
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="空间描述（可选）"
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder:text-slate-400"
                />
                {error && (
                  <div className="px-4 py-2.5 rounded-xl text-sm bg-red-50 text-red-600 border border-red-200">
                    {error}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleCreate}
                    disabled={creating || !newName.trim()}
                    className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-sm font-medium rounded-xl hover:shadow-lg hover:shadow-indigo-200/50 disabled:opacity-40 transition-all"
                  >
                    {creating ? "创建中..." : "确认创建"}
                  </button>
                  <button
                    onClick={() => { setShowCreate(false); setError(""); }}
                    className="px-5 py-2.5 text-slate-500 text-sm rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setShowCreate(true)}
              className="bg-white rounded-2xl border-2 border-dashed border-slate-200 shadow-lg shadow-slate-200/50 hover:border-indigo-300 hover:shadow-xl cursor-pointer transition-all mb-6"
            >
              <div className="flex items-center gap-4 py-6 px-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-200/50 shrink-0">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">创建新空间</p>
                  <p className="text-xs text-slate-400 mt-0.5">为不同项目或团队创建独立的数据空间</p>
                </div>
              </div>
            </div>
          )
        )}

        {/* Spaces Grid */}
        {fetching ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-3" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : spaces.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300">
                <rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/>
              </svg>
            </div>
            <p className="text-sm text-slate-500 font-medium">暂无空间</p>
            <p className="text-xs text-slate-400 mt-1">点击上方创建你的第一个空间</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-12">
            {spaces.map((space) => {
              const isActive = user.activeSpaceId === space.id;
              const role = getUserRole(space.id);
              const roleInfo = role ? ROLE_LABELS[role] : null;
              return (
                <div
                  key={space.id}
                  className={`group relative bg-white rounded-2xl border overflow-hidden transition-all hover:shadow-lg ${
                    isActive
                      ? "border-indigo-300 shadow-md shadow-indigo-50"
                      : "border-slate-200 hover:border-indigo-200 hover:shadow-indigo-50"
                  }`}
                >
                  <div className={`h-1 ${isActive ? "bg-gradient-to-r from-indigo-500 to-cyan-500" : "bg-slate-200 group-hover:bg-gradient-to-r group-hover:from-indigo-400 group-hover:to-cyan-400"} transition-all`} />
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                          isActive
                            ? "bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-sm"
                            : "bg-slate-100 text-slate-500"
                        }`}>
                          {space.name[0]}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-800 text-sm truncate">{space.name}</h3>
                          {space.description && (
                            <p className="text-xs text-slate-400 truncate mt-0.5">{space.description}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center flex-wrap gap-1.5 mb-4">
                      {space.is_default && (
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-600 rounded-md border border-amber-100">默认</span>
                      )}
                      {isActive && (
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100">当前</span>
                      )}
                      {roleInfo && (
                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-md border ${roleInfo.bg} ${roleInfo.color} border-current/10`}>
                          {roleInfo.text}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/spaces/${space.id}/members`}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 hover:text-slate-700 transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        成员管理
                      </Link>
                      {!isActive ? (
                        <button
                          onClick={() => switchSpace(space.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-xl hover:shadow-md hover:shadow-indigo-200/50 transition-all"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/><polyline points="21 3 21 12 12 12" className="origin-center" /></svg>
                          切换到此空间
                        </button>
                      ) : (
                        <div className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-500 bg-indigo-50 rounded-xl border border-indigo-100">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                          使用中
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
