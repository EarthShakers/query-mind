"use client";

import { useState, useRef, useEffect } from "react";

export function SpacePicker({
  spaces,
  selected,
  onChange,
}: {
  spaces: { spaceId: string; spaceName: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const allSelected = selected.size === spaces.length && spaces.length > 0;
  const noneSelected = selected.size === 0;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  }

  function toggleAll() {
    if (allSelected) {
      onChange(new Set());
    } else {
      onChange(new Set(spaces.map((s) => s.spaceId)));
    }
  }

  const statusLabel = noneSelected
    ? "仅查数据"
    : allSelected
    ? "全部空间"
    : selected.size === 1
    ? spaces.find((s) => selected.has(s.spaceId))?.spaceName ?? "1 个空间"
    : `${selected.size} 个空间`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors shrink-0 ${
          noneSelected
            ? "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
            : "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100"
        }`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={noneSelected ? "text-slate-400" : "text-indigo-400"}
        >
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
        </svg>
        <span className="hidden sm:inline text-slate-400 font-normal">知识库:</span>
        <span className="max-w-[100px] truncate">{statusLabel}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? "rotate-180" : ""} ${noneSelected ? "text-slate-400" : "text-indigo-400"}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50">
          <div className="px-4 py-2 border-b border-slate-100">
            <p className="text-[11px] font-medium text-slate-500">知识库搜索范围</p>
            <p className="text-[10px] text-slate-400 mt-0.5">不选择则仅查询数据库，不搜索知识库</p>
          </div>
          <div className="py-1">
            <button
              onClick={toggleAll}
              className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs hover:bg-slate-50 transition-colors ${
                allSelected ? "text-indigo-600 font-medium" : "text-slate-600"
              }`}
            >
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  allSelected
                    ? "bg-indigo-500 border-indigo-500"
                    : "border-slate-300"
                }`}
              >
                {allSelected && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                )}
              </span>
              全选
            </button>
            <div className="border-t border-slate-100 my-0.5" />
            {spaces.map((s) => {
              const checked = selected.has(s.spaceId);
              return (
                <button
                  key={s.spaceId}
                  onClick={() => toggle(s.spaceId)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs hover:bg-slate-50 transition-colors ${
                    checked ? "text-indigo-600 font-medium" : "text-slate-600"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      checked
                        ? "bg-indigo-500 border-indigo-500"
                        : "border-slate-300"
                    }`}
                  >
                    {checked && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    )}
                  </span>
                  <span className="truncate">{s.spaceName}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
