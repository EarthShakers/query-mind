"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export function NavAuth() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
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
          className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 transition-colors"
        >
          登录
        </Link>
        <Link
          href="/register"
          className="px-3 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
        >
          注册
        </Link>
      </div>
    );
  }

  const initial = (user.displayName || user.email)[0].toUpperCase();

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold hover:opacity-90 transition-opacity"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-50">
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
          {user.role === "admin" && (
            <Link
              href="/docs"
              className="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              onClick={() => setOpen(false)}
            >
              管理文档
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
