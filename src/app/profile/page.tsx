"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function ProfilePage() {
  const { user, loading, logout, activeSpace } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <span className="inline-block w-6 h-6 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">请先登录</p>
      </div>
    );
  }

  const ROLE_LABELS: Record<string, string> = {
    admin: "管理员",
    user: "普通用户",
  };

  const TENANT_ROLE_LABELS: Record<string, string> = {
    admin: "企业管理员",
    member: "企业成员",
  };

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
            <Link
              href="/"
              className="text-slate-500 hover:text-slate-800 transition-colors"
            >
              首页
            </Link>
            <Link
              href="/chat"
              className="px-4 py-1.5 text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              在线体验
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-lg mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-slate-800 mb-8">个人中心</h1>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-xl font-bold">
              {(user.displayName || user.email)[0].toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-slate-800">
                {user.displayName || user.email.split("@")[0]}
              </p>
              <p className="text-sm text-slate-500">{user.email}</p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">角色</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  user.role === "superAdmin"
                    ? "bg-indigo-50 text-indigo-600"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {ROLE_LABELS[user.role] || user.role}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">企业角色</span>
              {user.tenantRole ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
                  {TENANT_ROLE_LABELS[user.tenantRole] || user.tenantRole}
                </span>
              ) : (
                <span className="text-sm text-slate-400">未加入企业</span>
              )}
            </div>
            {activeSpace && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">当前空间</span>
                <span className="text-sm text-slate-600">{activeSpace.spaceName}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">租户 ID</span>
              <span className="text-sm text-slate-600 font-mono">
                {user.tenantId.slice(0, 8)}...
              </span>
            </div>
          </div>

          {/* Spaces list */}
          {user.spaces.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-500 mb-2">我的空间</p>
              <div className="space-y-1.5">
                {user.spaces.map((s) => (
                  <div
                    key={s.spaceId}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                      s.spaceId === user.activeSpaceId
                        ? "bg-indigo-50 text-indigo-600"
                        : "bg-slate-50 text-slate-600"
                    }`}
                  >
                    <span>{s.spaceName}</span>
                    <span className="text-xs text-slate-400">
                      {s.role === "admin" ? "管理员" : s.role === "editor" ? "编辑者" : "查看者"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-slate-100 pt-4 space-y-2">
            {user.tenantRole ? (
              <Link
                href="/spaces"
                className="block w-full py-2.5 text-center border border-indigo-200 text-indigo-600 text-sm font-medium rounded-xl hover:bg-indigo-50 transition-colors"
              >
                管理空间
              </Link>
            ) : (
              <Link
                href="/join"
                className="block w-full py-2.5 text-center border border-indigo-200 text-indigo-600 text-sm font-medium rounded-xl hover:bg-indigo-50 transition-colors"
              >
                加入企业
              </Link>
            )}
            <button
              onClick={logout}
              className="w-full py-2.5 border border-red-200 text-red-600 text-sm font-medium rounded-xl hover:bg-red-50 transition-colors"
            >
              退出登录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
