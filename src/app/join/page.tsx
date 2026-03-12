"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { NavAuth } from "@/components/nav-auth";

interface Tenant {
  id: string;
  name: string;
  created_at: string;
}

interface MyRequest {
  id: string;
  tenantId: string;
  tenantName: string;
  status: string;
  message: string;
  createdAt: string;
}

const STATUS_META: Record<string, { text: string; color: string; bg: string; icon: string }> = {
  pending: { text: "待审批", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6v4l3 3" },
  approved: { text: "已通过", color: "text-green-600", bg: "bg-green-50 border-green-200", icon: "M20 6 9 17l-5-5" },
  rejected: { text: "已拒绝", color: "text-red-500", bg: "bg-red-50 border-red-200", icon: "M18 6 6 18M6 6l12 12" },
};

export default function JoinPage() {
  const { user, loading, refresh } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [fetching, setFetching] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (loading) return;
    Promise.all([
      fetch("/api/tenants").then((r) => r.ok ? r.json() : []),
      fetch("/api/join-requests").then((r) => r.ok ? r.json() : []),
    ]).then(([t, r]) => {
      setTenants(t);
      setMyRequests(r);
    }).finally(() => setFetching(false));
  }, [loading]);

  async function handleApply(tenantId: string) {
    setSubmitting(tenantId);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/join-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, message: "" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "提交失败");
      } else {
        setSuccess("申请已提交，请等待管理员审批");
        const r = await fetch("/api/join-requests");
        if (r.ok) setMyRequests(await r.json());
      }
    } catch {
      setError("提交失败");
    } finally {
      setSubmitting(null);
    }
  }

  if (loading || fetching) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <span className="inline-block w-6 h-6 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (user?.tenantRole) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <nav className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-lg">
          <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
            <Link href="/" className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">QueryMind</Link>
            <NavAuth />
          </div>
        </nav>
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-200/50">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-800">你已加入企业</h2>
            <p className="text-sm text-slate-400 mt-1">前往空间管理查看和管理你的空间</p>
          </div>
          <Link href="/spaces" className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-sm font-medium rounded-xl hover:shadow-lg hover:shadow-indigo-200/50 transition-all">
            查看我的空间
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
            <Link href="/" className="text-slate-500 hover:text-slate-800 transition-colors">首页</Link>
            <Link href="/chat" className="text-slate-500 hover:text-slate-800 transition-colors">在线体验</Link>
            <NavAuth />
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-500 to-cyan-500 text-white">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-12">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold">加入企业</h1>
          </div>
          <p className="text-indigo-100 text-sm md:text-base max-w-lg">
            加入企业后，你可以访问企业的专属知识库和数据空间，与团队协作。
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 -mt-6">
        {/* Messages */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-50 text-red-600 border border-red-200 flex items-center gap-2">
            <span className="font-medium">!</span> {error}
          </div>
        )}
        {success && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-green-50 text-green-700 border border-green-200 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            {success}
          </div>
        )}

        {/* My Requests */}
        {myRequests.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 mb-6 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">我的申请</h2>
            </div>
            {myRequests.map((req, i) => {
              const st = STATUS_META[req.status] ?? STATUS_META.pending;
              return (
                <div key={req.id} className={`flex items-center justify-between px-5 py-4 ${i > 0 ? "border-t border-slate-100" : ""}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-bold shrink-0">
                      {req.tenantName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{req.tenantName}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(req.createdAt).toLocaleDateString("zh-CN")}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${st.bg} ${st.color}`}>
                    {st.text}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Available Tenants */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">可加入的企业</h2>
          </div>
          {tenants.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-100 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <p className="text-sm text-slate-500 font-medium">暂无可加入的企业</p>
              <p className="text-xs text-slate-400 mt-1">你可以在下方创建自己的企业</p>
            </div>
          ) : (
            tenants.map((tenant, i) => {
              const hasPending = myRequests.some(
                (r) => r.tenantId === tenant.id && r.status === "pending"
              );
              return (
                <div key={tenant.id} className={`flex items-center justify-between px-5 py-4 ${i > 0 ? "border-t border-slate-100" : ""}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {tenant.name[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{tenant.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        创建于 {new Date(tenant.created_at).toLocaleDateString("zh-CN")}
                      </p>
                    </div>
                  </div>
                  {hasPending ? (
                    <span className="px-3 py-1.5 text-[11px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg shrink-0">
                      已申请
                    </span>
                  ) : (
                    <button
                      onClick={() => handleApply(tenant.id)}
                      disabled={submitting === tenant.id}
                      className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-xs font-medium rounded-xl hover:shadow-md hover:shadow-indigo-200/50 disabled:opacity-40 transition-all shrink-0"
                    >
                      {submitting === tenant.id ? "提交中..." : "申请加入"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Create Tenant */}
        <CreateTenantSection onCreated={() => {
          refresh().then(() => {
            window.location.href = "/spaces";
          });
        }} />

        <div className="h-12" />
      </div>
    </div>
  );
}

function CreateTenantSection({ onCreated }: { onCreated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "创建失败");
      } else {
        onCreated();
      }
    } catch {
      setError("创建失败");
    } finally {
      setCreating(false);
    }
  }

  if (!expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        className="bg-white rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:shadow-xl shadow-lg shadow-slate-200/50 cursor-pointer transition-all"
      >
        <div className="flex items-center gap-4 py-6 px-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-lg shadow-violet-200/50 shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">创建新企业</p>
            <p className="text-xs text-slate-400 mt-0.5">成为企业管理员，创建空间并邀请团队成员</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 p-6">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">创建新企业</h3>
      <div className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="企业名称"
          autoFocus
          className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder:text-slate-400"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        {error && (
          <div className="px-4 py-2.5 rounded-xl text-sm bg-red-50 text-red-600 border border-red-200">{error}</div>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="px-5 py-2.5 bg-gradient-to-r from-violet-500 to-purple-500 text-white text-sm font-medium rounded-xl hover:shadow-lg hover:shadow-violet-200/50 disabled:opacity-40 transition-all"
          >
            {creating ? "创建中..." : "确认创建"}
          </button>
          <button
            onClick={() => { setExpanded(false); setError(""); }}
            className="px-5 py-2.5 text-slate-500 text-sm rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
