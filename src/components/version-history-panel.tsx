"use client";

import type { VersionRecord } from "@/hooks/use-version-history";

function formatTime(isoStr: string) {
  const d = new Date(isoStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${month}/${day} ${h}:${m}`;
}

export function VersionHistoryPanel({
  versions,
  loading,
  restoring,
  onRestore,
  onClose,
}: {
  versions: VersionRecord[];
  loading: boolean;
  restoring: boolean;
  onRestore: (versionId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-full mt-1.5 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 max-h-[60vh] flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-slate-500"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="text-xs font-semibold text-slate-700">
            版本历史
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 text-slate-400 hover:text-slate-600"
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

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 text-xs text-slate-400">
            <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin mr-2" />
            加载中...
          </div>
        )}

        {!loading && versions.length === 0 && (
          <div className="text-center py-8 text-xs text-slate-400">
            暂无版本历史
          </div>
        )}

        {!loading &&
          versions.map((v) => (
            <div
              key={v.id}
              className="px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-700">
                      v{v.version_num}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatTime(v.created_at)}
                    </span>
                  </div>
                  {v.edit_instruction && (
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {v.edit_instruction}
                    </p>
                  )}
                  {v.edited_section_id && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      编辑: {v.edited_section_id}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onRestore(v.id)}
                  disabled={restoring}
                  className="shrink-0 ml-3 px-2.5 py-1.5 text-[11px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 disabled:opacity-40 transition-colors"
                >
                  {restoring ? "恢复中..." : "恢复"}
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
