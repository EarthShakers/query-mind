'use client';

import { useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#6366f1', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#8b5cf6', '#f97316'];

function pivot(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  groupKey: string
) {
  const groups = [...new Set(data.map((r) => String(r[groupKey])))];
  const map = new Map<string, Record<string, unknown>>();
  for (const row of data) {
    const x = String(row[xKey]);
    if (!map.has(x)) map.set(x, { [xKey]: x });
    map.get(x)![String(row[groupKey])] = row[yKey];
  }
  return { pivoted: [...map.values()], groups };
}

export function ChartResult({
  sql, data, chartType, xKey, yKey, groupKey,
}: {
  sql: string;
  data: Record<string, unknown>[];
  chartType: 'bar' | 'line' | 'pie';
  xKey: string;
  yKey: string;
  groupKey?: string;
}) {
  const { pivoted, groups } = useMemo(() => {
    if (groupKey) return pivot(data, xKey, yKey, groupKey);
    return { pivoted: data, groups: [] as string[] };
  }, [data, xKey, yKey, groupKey]);

  const hasGroups = groups.length > 0;

  return (
    <div className="space-y-3 mt-3">
      <details className="group">
        <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 transition-colors">
          查看 SQL ▸
        </summary>
        <pre className="mt-2 bg-slate-900 text-emerald-400 p-3 rounded-lg text-xs overflow-x-auto font-mono leading-relaxed">{sql}</pre>
      </details>
      <div className="h-56 md:h-72 bg-slate-50/50 rounded-lg border border-slate-200 p-2 md:p-3">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={pivoted}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              {hasGroups && <Legend />}
              {hasGroups ? (
                groups.map((g, i) => (
                  <Bar key={g} dataKey={g} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                ))
              ) : (
                <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
                  {pivoted.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              )}
            </BarChart>
          ) : chartType === 'line' ? (
            <LineChart data={pivoted}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              {hasGroups && <Legend />}
              {hasGroups ? (
                groups.map((g, i) => (
                  <Line key={g} type="monotone" dataKey={g} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 4 }} />
                ))
              ) : (
                <Line type="monotone" dataKey={yKey} stroke={COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
              )}
            </LineChart>
          ) : (
            <PieChart>
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Legend />
              <Pie data={pivoted} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius={80} innerRadius={30} label={{ fontSize: 11 }} paddingAngle={2}>
                {pivoted.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
