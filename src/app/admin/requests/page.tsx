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
          <Link
            href="/"
            className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent"
          >
            QueryMind
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/spaces" className="text-slate-500 hover:text-slate-800 transition-colors">
              空间管理
            </Link>
            <NavAuth />
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">审批申请</h1>

        {fetching ? (
          <div className="flex items-center justify-center py-16">
            <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-3" />
            <span className="text-sm text-slate-400">加载中...</span>
          </div>
        ) : (
          <>
            {/* Pending */}
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              待审批 ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm mb-8">暂无待审批申请</div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-8">
                {pending.map((req) => (
                  <div key={req.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold">
                          {(req.displayName || req.email)[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {req.displayName || req.email.split("@")[0]}
                          </p>
                          <p className="text-xs text-slate-400">{req.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAction(req.id, "approve")}
                          disabled={processing === req.id}
                          className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-40 transition-colors"
                        >
                          通过
                        </button>
                        <button
                          onClick={() => handleAction(req.id, "reject")}
                          disabled={processing === req.id}
                          className="px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
                        >
                          拒绝
                        </button>
                      </div>
                    </div>
                    {req.message && (
                      <p className="mt-2 ml-12 text-xs text-slate-400 bg-slate-50 px-3 py-2 rounded-lg">
                        {req.message}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Processed */}
            {processed.length > 0 && (
              <>
                <h2 className="text-sm font-semibold text-slate-700 mb-3">
                  已处理 ({processed.length})
                </h2>
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {processed.map((req) => (
                    <div key={req.id} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xs font-bold">
                          {(req.displayName || req.email)[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-600">
                            {req.displayName || req.email.split("@")[0]}
                          </p>
                          <p className="text-xs text-slate-400">{req.email}</p>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          req.status === "approved"
                            ? "bg-green-50 text-green-600"
                            : "bg-red-50 text-red-600"
                        }`}
                      >
                        {req.status === "approved" ? "已通过" : "已拒绝"}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
