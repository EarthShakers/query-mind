"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
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

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  pending: { text: "待审批", color: "bg-yellow-50 text-yellow-600" },
  approved: { text: "已通过", color: "bg-green-50 text-green-600" },
  rejected: { text: "已拒绝", color: "bg-red-50 text-red-600" },
};

export default function JoinPage() {
  const { user, loading, refresh } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState("");
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
        body: JSON.stringify({ tenantId, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "提交失败");
      } else {
        setSuccess("申请已提交，请等待管理员审批");
        setMessage("");
        // Refresh requests
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <p className="text-slate-500">你已加入企业</p>
        <Link
          href="/spaces"
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors text-sm"
        >
          查看空间
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
            <NavAuth />
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">加入企业</h1>
        <p className="text-sm text-slate-500 mb-6">
          选择一个企业申请加入，或
          <Link href="/api/tenants" className="text-indigo-500 hover:underline ml-1">
            创建自己的企业
          </Link>
        </p>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-50 text-red-600 border border-red-200">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-green-50 text-green-700 border border-green-200">
            {success}
          </div>
        )}

        {/* My requests */}
        {myRequests.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">我的申请</h2>
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {myRequests.map((req) => {
                const st = STATUS_LABELS[req.status] ?? STATUS_LABELS.pending;
                return (
                  <div key={req.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{req.tenantName}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(req.createdAt).toLocaleDateString("zh-CN")}
                      </p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                      {st.text}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Available tenants */}
        <h2 className="text-sm font-semibold text-slate-700 mb-3">可加入的企业</h2>
        {tenants.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            暂无可加入的企业，你可以创建一个
          </div>
        ) : (
          <div className="grid gap-3">
            {tenants.map((tenant) => {
              const hasPending = myRequests.some(
                (r) => r.tenantId === tenant.id && r.status === "pending"
              );
              return (
                <div
                  key={tenant.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-semibold text-slate-800">{tenant.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      创建于 {new Date(tenant.created_at).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                  {hasPending ? (
                    <span className="px-3 py-1.5 text-xs text-yellow-600 bg-yellow-50 rounded-lg">
                      已申请
                    </span>
                  ) : (
                    <button
                      onClick={() => handleApply(tenant.id)}
                      disabled={submitting === tenant.id}
                      className="px-4 py-1.5 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors"
                    >
                      {submitting === tenant.id ? "提交中..." : "申请加入"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Create tenant */}
        <div className="mt-8 pt-6 border-t border-slate-200">
          <CreateTenantSection onCreated={() => refresh().then(() => window.location.reload())} />
        </div>
      </div>
    </div>
  );
}

function CreateTenantSection({ onCreated }: { onCreated: () => void }) {
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

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 mb-3">或者创建新企业</h2>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="企业名称"
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !name.trim()}
          className="px-4 py-2 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors"
        >
          {creating ? "创建中..." : "创建"}
        </button>
      </div>
      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
    </div>
  );
}
