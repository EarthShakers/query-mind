"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export function NavAuth() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch pending join request count for admin
  useEffect(() => {
    if (!user || user.tenantRole !== "admin") return;
    let cancelled = false;
    async function fetchPending() {
      try {
        const res = await fetch("/api/join-requests");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setPendingCount(
              Array.isArray(data) ? data.filter((r: { status: string }) => r.status === "pending").length : 0
            );
          }
        }
      } catch {
        // ignore
      }
    }
    fetchPending();
    // Poll every 30 seconds
    const interval = setInterval(fetchPending, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  if (loading) {
    return (
      <span className="inline-block w-4 h-4 border-2 border-slate-200 border-t-indigo-400 rounded-full animate-spin" />
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="px-3 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
        >
          登录
        </Link>
      </div>
    );
  }

  const initial = (user.displayName || user.email)[0].toUpperCase();

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold hover:opacity-90 transition-opacity"
      >
        {initial}
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
            {pendingCount > 9 ? "9+" : pendingCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-50">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-800 truncate">
              {user.displayName || user.email.split("@")[0]}
            </p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>

          <Link
            href="/profile"
            className="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            onClick={() => setOpen(false)}
          >
            个人中心
          </Link>
          {user.tenantRole && (
            <Link
              href="/knowledge"
              className="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              onClick={() => setOpen(false)}
            >
              知识库
            </Link>
          )}
          {!user.tenantRole && (
            <Link
              href="/join"
              className="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              onClick={() => setOpen(false)}
            >
              加入企业
            </Link>
          )}
          {user.role === "superAdmin" && (
            <Link
              href="/docs"
              className="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              onClick={() => setOpen(false)}
            >
              管理文档
            </Link>
          )}
          {user.tenantRole === "admin" && (
              <Link
                href="/admin/requests"
                className="flex items-center justify-between px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                onClick={() => setOpen(false)}
              >
                <span>审批申请</span>
                {pendingCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold text-white bg-red-500 rounded-full min-w-[18px] text-center">
                    {pendingCount}
                  </span>
                )}
              </Link>
          )}
          <button
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
