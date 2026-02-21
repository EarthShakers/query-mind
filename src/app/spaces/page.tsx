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

export default function SpacesPage() {
  const { user, loading, activeSpace, switchSpace } = useAuth();
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
      }
    } catch {
      setError("创建失败");
    } finally {
      setCreating(false);
    }
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <p className="text-slate-500">你还未加入任何企业</p>
        <Link
          href="/join"
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors text-sm"
        >
          加入企业
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent"
          >
            QueryMind
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-slate-500 hover:text-slate-800 transition-colors">
              首页
            </Link>
            <Link
              href="/chat"
              className="px-4 py-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
            >
              在线体验
            </Link>
            <NavAuth />
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800">空间管理</h1>
          {user.tenantRole === "admin" && (
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="px-4 py-2 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 transition-colors"
            >
              创建空间
            </button>
          )}
        </div>

        {showCreate && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6 space-y-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="空间名称"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="空间描述（可选）"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="px-4 py-2 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors"
              >
                {creating ? "创建中..." : "确认创建"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-slate-500 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {fetching ? (
          <div className="flex items-center justify-center py-16">
            <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-3" />
            <span className="text-sm text-slate-400">加载中...</span>
          </div>
        ) : spaces.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">暂无空间</div>
        ) : (
          <div className="grid gap-4">
            {spaces.map((space) => {
              const isActive = user.activeSpaceId === space.id;
              return (
                <div
                  key={space.id}
                  className={`bg-white rounded-xl border p-5 transition-all ${
                    isActive
                      ? "border-indigo-300 shadow-md shadow-indigo-50"
                      : "border-slate-200 hover:border-indigo-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-800">{space.name}</h3>
                        {space.is_default && (
                          <span className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 rounded-full">
                            默认
                          </span>
                        )}
                        {isActive && (
                          <span className="px-2 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-600 rounded-full">
                            当前
                          </span>
                        )}
                      </div>
                      {space.description && (
                        <p className="text-sm text-slate-400 mt-1">{space.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/spaces/${space.id}/members`}
                        className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        成员
                      </Link>
                      {!isActive && (
                        <button
                          onClick={() => switchSpace(space.id)}
                          className="px-3 py-1.5 text-xs text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                        >
                          切换
                        </button>
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
