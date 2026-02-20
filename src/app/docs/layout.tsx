"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS } from "./sections";

function Sidebar() {
  const pathname = usePathname();
  const currentSection = pathname.split("/").pop();

  return (
    <aside className="w-52 shrink-0 py-8 pr-6 border-r border-slate-100 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto hidden md:block">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-3">
        文档
      </p>
      <nav className="space-y-1">
        {SECTIONS.map((s) => (
          <Link
            key={s.id}
            href={`/docs/${s.id}`}
            className={`block px-3 py-2 text-sm rounded-lg transition-colors ${
              currentSection === s.id
                ? "bg-indigo-50 text-indigo-700 font-medium"
                : "text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent"
          >
            QueryMind
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link
              href="/"
              className="text-slate-500 hover:text-slate-800"
            >
              首页
            </Link>
            <Link
              href="/knowledge"
              className="text-slate-500 hover:text-slate-800"
            >
              知识库
            </Link>
            <Link
              href="/chat"
              className="px-4 py-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
            >
              在线体验
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto flex">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-x-hidden py-8 md:py-12 px-4 md:px-8 max-w-none prose prose-slate prose-headings:scroll-mt-20 prose-h2:text-xl md:prose-h2:text-2xl prose-h2:font-bold prose-h2:border-b prose-h2:border-slate-100 prose-h2:pb-3 prose-h3:text-lg prose-pre:bg-slate-900 prose-pre:text-sm prose-pre:overflow-x-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
