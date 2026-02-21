"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NavAuth } from "@/components/nav-auth";

interface Member {
  id: string;
  userId: string;
  role: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "管理员",
  editor: "编辑者",
  viewer: "查看者",
};

export default function SpaceMembersPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { user, loading } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [fetching, setFetching] = useState(true);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("viewer");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

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
    if (!addEmail.trim()) return;
    setAdding(true);
    setError("");
    // We need to find userId by email — for simplicity we pass it and let the API handle
    // Actually the API expects userId, so we need a lookup. Let's do a simple approach.
    try {
      // First, search for user by email via a simple query param approach
      // Since we don't have a user search API, we'll use the email directly
      // The admin can provide userId or email. Let's adapt the member add to use email lookup on server.
      // For now, we'll pass email and let it work if it's a userId
      const res = await fetch(`/api/spaces/${spaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: addEmail.trim(), role: addRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "添加失败");
      } else {
        setAddEmail("");
        fetchMembers();
      }
    } catch {
      setError("添加失败");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(targetUserId: string) {
    if (!confirm("确定要移除该成员吗？")) return;
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
          <Link
            href="/"
            className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent"
          >
            QueryMind
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/spaces" className="text-slate-500 hover:text-slate-800 transition-colors">
              返回空间
            </Link>
            <NavAuth />
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">空间成员</h1>

        {isAdmin && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">添加成员</h3>
            <div className="flex gap-2">
              <input
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="用户 ID"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="viewer">查看者</option>
                <option value="editor">编辑者</option>
                <option value="admin">管理员</option>
              </select>
              <button
                onClick={handleAdd}
                disabled={adding || !addEmail.trim()}
                className="px-4 py-2 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors"
              >
                {adding ? "添加中..." : "添加"}
              </button>
            </div>
            {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          </div>
        )}

        {fetching ? (
          <div className="flex items-center justify-center py-16">
            <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-3" />
            <span className="text-sm text-slate-400">加载中...</span>
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">暂无成员</div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold">
                    {(member.displayName || member.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {member.displayName || member.email.split("@")[0]}
                    </p>
                    <p className="text-xs text-slate-400">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      member.role === "admin"
                        ? "bg-indigo-50 text-indigo-600"
                        : member.role === "editor"
                        ? "bg-green-50 text-green-600"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {ROLE_LABELS[member.role] || member.role}
                  </span>
                  {isAdmin && member.userId !== user?.userId && (
                    <button
                      onClick={() => handleRemove(member.userId)}
                      className="px-2.5 py-0.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      移除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
