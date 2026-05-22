"use client";

import { useState, useCallback, useRef } from "react";
import type { ConsistencyIssue, ConsistencyReport } from "@/types/consistency";
import type { FixableIssue, FixableReport, IssueStatus } from "@/contracts/consistency";

export interface UseConsistencyReturn {
  report: FixableReport | null;
  isChecking: boolean;
  fixingIssueIndex: number | null;
  check: (title: string, sections: Record<string, string>, outline?: string, dataClaims?: { id: string; text: string; values: Record<string, number | string> }[]) => Promise<FixableReport>;
  fixIssue: (index: number, sectionContents: Record<string, string>, title: string, outline?: string) => Promise<string | null>;
  applyFix: (index: number) => void;
  dismissIssue: (index: number) => void;
  jumpToSection: (sectionKey: string) => void;
  reset: () => void;
  onJumpToSection?: (sectionKey: string) => void;
  setOnJumpToSection: (fn: (sectionKey: string) => void) => void;
}

function toFixable(report: ConsistencyReport): FixableReport {
  return {
    ...report,
    issues: report.issues.map(issue => ({ ...issue, status: "open" as IssueStatus })),
  };
}

export function useConsistency(): UseConsistencyReturn {
  const [report, setReport] = useState<FixableReport | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [fixingIssueIndex, setFixingIssueIndex] = useState<number | null>(null);
  const onJumpRef = useRef<((sectionKey: string) => void) | null>(null);

  const check = useCallback(async (
    title: string,
    sections: Record<string, string>,
    outline?: string,
    dataClaims?: { id: string; text: string; values: Record<string, number | string> }[],
  ) => {
    setIsChecking(true);
    setReport(null);
    try {
      const res = await fetch("/api/consistency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          sections: Object.entries(sections).map(([key, content]) => ({ key, content })),
          outline,
          dataClaims,
        }),
      });
      if (!res.ok) throw new Error("检查失败");
      const data = await res.json() as ConsistencyReport;
      const fixable = toFixable(data);
      setReport(fixable);
      return fixable;
    } catch {
      const fallback: FixableReport = {
        passed: false, summary: "检查失败，请重试", issues: [],
      };
      setReport(fallback);
      return fallback;
    } finally {
      setIsChecking(false);
    }
  }, []);

  const fixIssue = useCallback(async (
    index: number,
    sectionContents: Record<string, string>,
    title: string,
    outline?: string,
  ): Promise<string | null> => {
    if (!report || index < 0 || index >= report.issues.length) return null;

    const issue = report.issues[index];
    setFixingIssueIndex(index);
    setReport(prev => prev ? {
      ...prev,
      issues: prev.issues.map((iss, i) =>
        i === index ? { ...iss, status: "fixing" as IssueStatus } : iss
      ),
    } : null);

    try {
      const res = await fetch("/api/consistency/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue, sectionContents, outline, title }),
      });
      if (!res.ok) throw new Error("修复失败");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fixedContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;
            if (!trimmed.startsWith("data:")) continue;
            try {
              const event = JSON.parse(trimmed.slice(5));
              if (event.type === "delta") fixedContent += event.content;
              else if (event.type === "done") fixedContent = event.content;
              else if (event.type === "error") throw new Error(event.error);
            } catch (e) {
              if (e instanceof Error && e.message !== "修复失败") throw e;
            }
          }
        }
      }

      setReport(prev => prev ? {
        ...prev,
        issues: prev.issues.map((iss, i) =>
          i === index ? { ...iss, status: "open" as IssueStatus, fixedContent } : iss
        ),
      } : null);

      return fixedContent || null;
    } catch {
      setReport(prev => prev ? {
        ...prev,
        issues: prev.issues.map((iss, i) =>
          i === index ? { ...iss, status: "open" as IssueStatus } : iss
        ),
      } : null);
      return null;
    } finally {
      setFixingIssueIndex(null);
    }
  }, [report]);

  const applyFix = useCallback((index: number) => {
    setReport(prev => prev ? {
      ...prev,
      issues: prev.issues.map((iss, i) =>
        i === index ? { ...iss, status: "fixed" as IssueStatus } : iss
      ),
    } : null);
  }, []);

  const dismissIssue = useCallback((index: number) => {
    setReport(prev => prev ? {
      ...prev,
      issues: prev.issues.map((iss, i) =>
        i === index ? { ...iss, status: "dismissed" as IssueStatus } : iss
      ),
    } : null);
  }, []);

  const jumpToSection = useCallback((sectionKey: string) => {
    onJumpRef.current?.(sectionKey);
  }, []);

  const setOnJumpToSection = useCallback((fn: (sectionKey: string) => void) => {
    onJumpRef.current = fn;
  }, []);

  const reset = useCallback(() => {
    setReport(null);
    setIsChecking(false);
    setFixingIssueIndex(null);
  }, []);

  return {
    report, isChecking, fixingIssueIndex,
    check, fixIssue, applyFix, dismissIssue, jumpToSection, reset,
    setOnJumpToSection,
  };
}
