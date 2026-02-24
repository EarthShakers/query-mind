"use client";

import { useState, useCallback, useRef } from "react";
import type { ReportSection } from "@/lib/report-types";

export type EditStep = "plan" | "query" | "analyze" | "write" | "validate" | "reflect";

export interface StepLog {
  step: EditStep;
  reasoning?: string;
  suggestedSQL?: string;
  queryResult?: string;
  queryRowCount?: number;
  analysisPlan?: string;
  newContentType?: string;
  validationErrors?: string[];
  passed?: boolean;
  retries?: number;
}

interface EditProgress {
  step: EditStep;
  needsQuery?: boolean;
  logs: StepLog[];
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
      setEditProgress({ step: "plan", logs: [] });

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
                  const stepLog: StepLog = {
                    step: data.currentStep as EditStep,
                    reasoning: data.reasoning,
                    suggestedSQL: data.suggestedSQL,
                    queryResult: data.queryResult,
                    queryRowCount: data.queryRowCount,
                    analysisPlan: data.analysisPlan,
                    newContentType: data.newContentType,
                    validationErrors: data.validationErrors,
                    passed: data.passed,
                    retries: data.retries,
                  };
                  setEditProgress((prev) => ({
                    step: data.currentStep as EditStep,
                    needsQuery: data.needsQuery ?? prev?.needsQuery,
                    logs: [...(prev?.logs ?? []), stepLog],
                  }));
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
