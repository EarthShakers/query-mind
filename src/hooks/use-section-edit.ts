"use client";

import { useState, useCallback, useRef } from "react";
import type { ReportSection } from "@/lib/report-types";

export type EditStep = "plan" | "query" | "analyze" | "write";

interface EditProgress {
  step: EditStep;
  needsQuery?: boolean;
}

export function useSectionEdit(
  reportId: string | null,
  getSections: () => ReportSection[],
  onSectionUpdated: (section: ReportSection) => void
) {
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editProgress, setEditProgress] = useState<EditProgress | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const editSection = useCallback(
    async (sectionId: string, instruction: string) => {
      if (!reportId || isEditing) return;

      // Abort any previous edit
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setEditingSectionId(sectionId);
      setIsEditing(true);
      setEditProgress({ step: "plan" });

      const allSections = getSections();
      const section = allSections.find((s) => s.section_id === sectionId);

      try {
        const res = await fetch(
          `/api/reports/${reportId}/edit-section`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sectionId,
              instruction,
              section,
              allSections,
            }),
            signal: controller.signal,
          }
        );

        if (!res.ok || !res.body) {
          throw new Error("编辑请求失败");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let event = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              event = line.slice(7);
            } else if (line.startsWith("data: ") && event) {
              try {
                const data = JSON.parse(line.slice(6));
                if (event === "step") {
                  setEditProgress({
                    step: data.currentStep as EditStep,
                    needsQuery: data.needsQuery,
                  });
                } else if (event === "section") {
                  onSectionUpdated(data as ReportSection);
                  // Also persist the updated section
                  fetch(`/api/reports/${reportId}/sections`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      sections: [data],
                    }),
                  }).catch(() => {});
                } else if (event === "error") {
                  console.error("Edit error:", data.message);
                }
              } catch {
                // Skip malformed JSON
              }
              event = "";
            }
          }
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("Section edit failed:", e);
      } finally {
        setIsEditing(false);
        setEditingSectionId(null);
        setEditProgress(null);
        abortRef.current = null;
      }
    },
    [reportId, isEditing, getSections, onSectionUpdated]
  );

  const cancelEdit = useCallback(() => {
    abortRef.current?.abort();
    setIsEditing(false);
    setEditingSectionId(null);
    setEditProgress(null);
  }, []);

  return {
    editSection,
    cancelEdit,
    editingSectionId,
    editProgress,
    isEditing,
  };
}
