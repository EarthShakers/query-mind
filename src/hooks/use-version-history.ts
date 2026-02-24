"use client";

import { useState, useCallback } from "react";
import type { ReportSection } from "@/lib/report-types";

export interface VersionRecord {
  id: string;
  version_num: number;
  edited_section_id: string | null;
  edit_instruction: string | null;
  created_at: string;
}

export function useVersionHistory(
  reportId: string | null,
  onRestore: (sections: ReportSection[]) => void
) {
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const fetchVersions = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data);
      }
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  const restoreVersion = useCallback(
    async (versionId: string) => {
      if (!reportId || restoring) return;
      setRestoring(true);
      try {
        const res = await fetch(
          `/api/reports/${reportId}/versions/${versionId}/restore`,
          { method: "POST" }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.sections) {
            onRestore(data.sections);
          }
          // Refresh version list
          await fetchVersions();
        }
      } finally {
        setRestoring(false);
      }
    },
    [reportId, restoring, onRestore, fetchVersions]
  );

  return {
    versions,
    loading,
    restoring,
    fetchVersions,
    restoreVersion,
  };
}
