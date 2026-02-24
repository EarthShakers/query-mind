"use client";

import { useState, useRef, useEffect } from "react";

const QUICK_SUGGESTIONS = [
  "语言更简洁",
  "加上同比数据",
  "增加总结",
  "用更专业的语气",
];

export function SectionEditPopover({
  sectionId,
  onSubmit,
  onClose,
}: {
  sectionId: string;
  onSubmit: (instruction: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  function handleSubmit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onClose();
  }

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-0 z-20 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 mb-2">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-indigo-500 shrink-0"
        >
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
        <span className="text-xs font-medium text-slate-600">AI 编辑章节</span>
        <button
          onClick={onClose}
          className="ml-auto p-0.5 text-slate-400 hover:text-slate-600"
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
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(value);
        }}
        className="flex gap-1.5"
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="输入修改指令..."
          className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="shrink-0 px-3 py-2 bg-indigo-500 text-white text-xs font-medium rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors"
        >
          修改
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5 mt-2">
        {QUICK_SUGGESTIONS.map((text) => (
          <button
            key={text}
            onClick={() => handleSubmit(text)}
            className="px-2 py-1 text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
