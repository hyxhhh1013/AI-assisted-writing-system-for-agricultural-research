"use client";

import { useState, useCallback, useRef } from "react";
import type { FixableReport, IssueStatus } from "@/contracts/consistency";
import {
  fixConsistencyIssue,
  runConsistencyCheck,
  toFixableReport,
} from "@/services/consistency";

export interface UseConsistencyReturn {
  report: FixableReport | null;
  isChecking: boolean;
  fixingIssueIndex: number | null;
  check: (
    title: string,
    sections: Record<string, string>,
    outline?: string,
    dataClaims?: { id: string; text: string; values: Record<string, number | string> }[],
  ) => Promise<FixableReport>;
  fixIssue: (
    index: number,
    sectionContents: Record<string, string>,
    title: string,
    outline?: string,
  ) => Promise<string | null>;
  applyFix: (index: number) => void;
  dismissIssue: (index: number) => void;
  jumpToSection: (sectionKey: string) => void;
  reset: () => void;
  onJumpToSection?: (sectionKey: string) => void;
  setOnJumpToSection: (fn: (sectionKey: string) => void) => void;
}

export function useConsistency(): UseConsistencyReturn {
  const [report, setReport] = useState<FixableReport | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [fixingIssueIndex, setFixingIssueIndex] = useState<number | null>(null);
  const onJumpRef = useRef<((sectionKey: string) => void) | null>(null);

  const check = useCallback(
    async (
      title: string,
      sections: Record<string, string>,
      outline?: string,
      dataClaims?: { id: string; text: string; values: Record<string, number | string> }[],
    ) => {
      setIsChecking(true);
      setReport(null);
      try {
        const data = await runConsistencyCheck({
          title,
          sections: Object.entries(sections).map(([key, content]) => ({ key, content })),
          outline,
          dataClaims,
        });
        const fixable = toFixableReport(data);
        setReport(fixable);
        return fixable;
      } catch {
        const fallback: FixableReport = {
          passed: false,
          summary: "检查失败，请重试",
          issues: [],
        };
        setReport(fallback);
        return fallback;
      } finally {
        setIsChecking(false);
      }
    },
    [],
  );

  const fixIssue = useCallback(
    async (
      index: number,
      sectionContents: Record<string, string>,
      title: string,
      outline?: string,
    ): Promise<string | null> => {
      if (!report || index < 0 || index >= report.issues.length) return null;

      const issue = report.issues[index];
      setFixingIssueIndex(index);
      setReport((prev) =>
        prev
          ? {
              ...prev,
              issues: prev.issues.map((iss, i) =>
                i === index ? { ...iss, status: "fixing" as IssueStatus } : iss,
              ),
            }
          : null,
      );

      try {
        const fixedContent = await fixConsistencyIssue({
          issue,
          sectionContents,
          outline,
          title,
        });

        setReport((prev) =>
          prev
            ? {
                ...prev,
                issues: prev.issues.map((iss, i) =>
                  i === index
                    ? { ...iss, status: "open" as IssueStatus, fixedContent: fixedContent ?? undefined }
                    : iss,
                ),
              }
            : null,
        );

        return fixedContent;
      } catch {
        setReport((prev) =>
          prev
            ? {
                ...prev,
                issues: prev.issues.map((iss, i) =>
                  i === index ? { ...iss, status: "open" as IssueStatus } : iss,
                ),
              }
            : null,
        );
        return null;
      } finally {
        setFixingIssueIndex(null);
      }
    },
    [report],
  );

  const applyFix = useCallback((index: number) => {
    setReport((prev) =>
      prev
        ? {
            ...prev,
            issues: prev.issues.map((iss, i) =>
              i === index ? { ...iss, status: "fixed" as IssueStatus } : iss,
            ),
          }
        : null,
    );
  }, []);

  const dismissIssue = useCallback((index: number) => {
    setReport((prev) =>
      prev
        ? {
            ...prev,
            issues: prev.issues.map((iss, i) =>
              i === index ? { ...iss, status: "dismissed" as IssueStatus } : iss,
            ),
          }
        : null,
    );
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
    report,
    isChecking,
    fixingIssueIndex,
    check,
    fixIssue,
    applyFix,
    dismissIssue,
    jumpToSection,
    reset,
    setOnJumpToSection,
  };
}
