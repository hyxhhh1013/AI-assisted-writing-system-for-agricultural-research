"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, AlertTriangle, CheckCheck, XCircle, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { ProjectData } from "@/lib/store";
import { mergeEditorIntoProject } from "@/lib/export-content";
import type { ConsistencyReport, ConsistencyIssue } from "@/types/consistency";

interface WorkbenchConsistencyDialogProps {
  open: boolean;
  onClose: () => void;
  project: ProjectData;
  activeSection: string;
  editingContent: string;
}

export function WorkbenchConsistencyDialog({
  open, onClose, project, activeSection, editingContent,
}: WorkbenchConsistencyDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<ConsistencyReport | null>(null);

  const handleCheck = async () => {
    const merged = mergeEditorIntoProject(project, activeSection, editingContent);
    const sections = [
      { key: "abstract", content: merged.abstract || "" },
      { key: "introduction", content: merged.sections.introduction || "" },
      { key: "methods", content: merged.sections.methods || "" },
      { key: "results", content: merged.sections.results || "" },
      { key: "conclusion", content: merged.sections.conclusion || "" },
    ].filter((s) => s.content.trim().length > 0);

    if (sections.length < 2) {
      toast.error("至少需要 2 个章节有内容才能进行一致性检查");
      return;
    }

    setIsLoading(true);
    setReport(null);

    try {
      const response = await fetch("/api/consistency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: merged.title, sections, outline: merged.outline }),
      });
      if (!response.ok) throw new Error("一致性检查请求失败");
      const res = await response.json();
      setReport(res);
      if (res.passed) toast.success("一致性检查通过！");
      else toast.warning(`发现 ${res.issues?.length || 0} 个一致性问题`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-run on open
  useEffect(() => {
    if (open) { setReport(null); handleCheck(); }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[720px] h-[88vh] max-h-[88vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="shrink-0">
          <div className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              跨章节一致性检查
            </DialogTitle>
            <DialogDescription>
              检查各章节之间的术语、数据、逻辑及引用一致性
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">正在逐章对比分析...</p>
            </div>
          ) : report ? (
            <div className="space-y-6">
              <div className={`p-4 rounded-lg border ${
                report.passed ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"
              }`}>
                <div className="flex items-center gap-3">
                  {report.passed ? (
                    <CheckCheck className="h-8 w-8 text-green-500" />
                  ) : (
                    <XCircle className="h-8 w-8 text-amber-500" />
                  )}
                  <div>
                    <p className={`font-bold text-sm ${report.passed ? "text-green-700" : "text-amber-700"}`}>
                      {report.passed ? "一致性检查通过" : `发现 ${report.issues?.length || 0} 个问题`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{report.summary || ""}</p>
                  </div>
                </div>
              </div>

              {report.issues && report.issues.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">具体问题</h4>
                  {report.issues.map((issue: ConsistencyIssue, idx: number) => (
                    <div key={idx} className={`p-4 rounded-lg border ${
                      issue.severity === "high" ? "bg-red-50 border-red-200"
                        : issue.severity === "medium" ? "bg-amber-50 border-amber-200"
                        : "bg-yellow-50 border-yellow-200"
                    }`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            issue.severity === "high" ? "bg-red-200 text-red-800"
                              : issue.severity === "medium" ? "bg-amber-200 text-amber-800"
                              : "bg-yellow-200 text-yellow-800"
                          }`}>{issue.severity}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            issue.type === "terminology" ? "bg-blue-100 text-blue-700"
                              : issue.type === "data" ? "bg-purple-100 text-purple-700"
                              : issue.type === "logic" ? "bg-orange-100 text-orange-700"
                              : issue.type === "conclusion" ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-700"
                          }`}>
                            {issue.type === "terminology" ? "术语" :
                             issue.type === "data" ? "数据" :
                             issue.type === "logic" ? "逻辑" :
                             issue.type === "conclusion" ? "结论" : "引用"}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs mt-2 leading-relaxed">{issue.description}</p>
                      {issue.sections && issue.sections.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {issue.sections.map((s, si) => (
                            <span key={si} className="text-[9px] bg-background border px-2 py-0.5 rounded-full text-muted-foreground">{s}</span>
                          ))}
                        </div>
                      )}
                      {issue.suggestion && (
                        <p className="text-[11px] mt-2 text-muted-foreground italic border-t pt-2 border-dashed border-current/10">
                          {issue.suggestion}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <AlertTriangle className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">准备执行检查...</p>
            </div>
          )}
        </div>
        <DialogFooter className="border-t px-6 py-4 shrink-0">
          <Button variant="outline" onClick={onClose}>关闭</Button>
          {report && !isLoading && (
            <Button variant="default" onClick={handleCheck}>
              <RefreshCw className="h-4 w-4 mr-1" /> 重新检查
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
