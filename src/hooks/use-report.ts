"use client";

import { useState, useCallback } from "react";
import type { ReportSection } from "@/lib/report-types";

export function useReport(reportId: string | null) {
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [title, setTitle] = useState("未命名报告");
  const [saving, setSaving] = useState(false);

  /** Upsert a section — match by section_id, insert or replace */
  const upsertSection = useCallback((section: ReportSection) => {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.section_id === section.section_id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = section;
        return next.sort((a, b) => a.sort_order - b.sort_order);
      }
      return [...prev, section].sort((a, b) => a.sort_order - b.sort_order);
    });
  }, []);

  /** Save report to backend */
  const save = useCallback(async () => {
    if (!reportId) return;
    setSaving(true);
    try {
      await fetch(`/api/reports/${reportId}/sections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, sections }),
      });
    } finally {
      setSaving(false);
    }
  }, [reportId, title, sections]);

  /** Load existing report from backend */
  const load = useCallback(async () => {
    if (!reportId) return;
    const res = await fetch(`/api/reports/${reportId}`);
    if (res.ok) {
      const data = await res.json();
      setTitle(data.title || "未命名报告");
      setSections(
        (data.sections ?? []).sort(
          (a: ReportSection, b: ReportSection) => a.sort_order - b.sort_order
        )
      );
    }
  }, [reportId]);

  /** Replace all sections at once (for version restore) */
  const replaceAllSections = useCallback((newSections: ReportSection[]) => {
    setSections(
      [...newSections].sort((a, b) => a.sort_order - b.sort_order)
    );
  }, []);

  return { sections, title, setTitle, upsertSection, replaceAllSections, save, saving, load };
}
