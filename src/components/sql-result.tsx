export function SqlResult({ data }: { data: Record<string, unknown>[] }) {
  if (!data.length) return <p className="text-slate-400 text-sm py-2">查询无结果</p>;
  const columns = Object.keys(data[0]);
  return (
    <div className="space-y-3 mt-3">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50">
              {columns.map(col => (
                <th key={col} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-indigo-50/50 transition-colors">
                {columns.map(col => (
                  <td key={col} className="px-3 py-2 text-slate-600 whitespace-nowrap">{String(row[col])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-300">{data.length} 条记录</p>
    </div>
  );
}
