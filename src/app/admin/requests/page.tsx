"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { NavAuth } from "@/components/nav-auth";

interface JoinRequest {
  id: string;
  tenantId: string;
  userId: string;
  status: string;
  message: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminRequestsPage() {
  const { user, loading } = useAuth();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [fetching, setFetching] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/join-requests");
      if (res.ok) setRequests(await res.json());
    } catch {
      // ignore
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!loading) fetchRequests();
  }, [loading, fetchRequests]);

  async function handleAction(requestId: string, action: "approve" | "reject") {
    setProcessing(requestId);
    try {
      const res = await fetch("/api/join-requests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      if (res.ok) fetchRequests();
    } catch {
      // ignore
    } finally {
      setProcessing(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <span className="inline-block w-6 h-6 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  const pending = requests.filter((r) => r.status === "pending");
  const processed = requests.filter((r) => r.status !== "pending");

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">QueryMind</Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/spaces" className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              空间管理
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
            </div>
            <h1 className="text-xl md:text-2xl font-bold">审批申请</h1>
          </div>
          {!fetching && (
            <div className="flex items-center gap-4 mt-3">
              <p className="text-indigo-100 text-sm">
                {pending.length > 0
                  ? `${pending.length} 条待处理申请`
                  : "暂无待处理申请"}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-6 -mt-4">
        {fetching ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-3" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : (
          <>
            {/* Pending */}
            {pending.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden">
                <div className="text-center py-20 px-4">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-green-50 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400"><path d="M20 6 9 17l-5-5"/></svg>
                  </div>
                  <p className="text-sm text-slate-500 font-medium">所有申请已处理</p>
                  <p className="text-xs text-slate-400 mt-1">暂无待审批的加入申请</p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden mb-6">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">待审批</h2>
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-600 rounded-full border border-amber-200">
                    {pending.length}
                  </span>
                </div>
                {pending.map((req, i) => {
                  const name = req.displayName || req.email.split("@")[0];
                  return (
                    <div key={req.id} className={`px-5 py-4 ${i > 0 ? "border-t border-slate-100" : ""}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                            {name[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{name}</p>
                            <p className="text-xs text-slate-400 truncate">{req.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <button
                            onClick={() => handleAction(req.id, "approve")}
                            disabled={processing === req.id}
                            className="px-4 py-2 text-xs font-medium bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:shadow-md hover:shadow-green-200/50 disabled:opacity-40 transition-all"
                          >
                            通过
                          </button>
                          <button
                            onClick={() => handleAction(req.id, "reject")}
                            disabled={processing === req.id}
                            className="px-4 py-2 text-xs font-medium border border-red-200 text-red-500 rounded-xl hover:bg-red-50 disabled:opacity-40 transition-colors"
                          >
                            拒绝
                          </button>
                        </div>
                      </div>
                      {req.message && (
                        <div className="mt-3 ml-[52px] px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-100">
                          <p className="text-xs text-slate-500">{req.message}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Processed */}
            {processed.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-6">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-500">已处理 ({processed.length})</h2>
                </div>
                {processed.map((req, i) => {
                  const name = req.displayName || req.email.split("@")[0];
                  return (
                    <div key={req.id} className={`flex items-center justify-between px-5 py-3.5 ${i > 0 ? "border-t border-slate-100" : ""}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-bold shrink-0">
                          {name[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-slate-600 truncate">{name}</p>
                          <p className="text-xs text-slate-400 truncate">{req.email}</p>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border shrink-0 ${
                          req.status === "approved"
                            ? "bg-green-50 text-green-600 border-green-200"
                            : "bg-red-50 text-red-500 border-red-200"
                        }`}
                      >
                        {req.status === "approved" ? "已通过" : "已拒绝"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        <div className="h-12" />
      </div>
    </div>
  );
}
