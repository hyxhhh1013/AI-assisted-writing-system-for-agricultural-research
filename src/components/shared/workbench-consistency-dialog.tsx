"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { DIALOG_WORK } from "@/components/ui/dialog-sizes";
import {
  Loader2, AlertTriangle, CheckCheck, XCircle, RefreshCw,
  Wand2, Check, EyeOff, ArrowRight, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import type { ProjectData } from "@/contracts/project";
import { mergeEditorIntoProject, collectProjectSectionEntries } from "@/lib/export-content";
import { useConsistency } from "@/hooks/use-consistency";
import type { FixableIssue } from "@/contracts/consistency";
import { getProjectWritingMode, getSectionLabelForMode } from "@/lib/section-registry";

interface WorkbenchConsistencyDialogProps {
  open: boolean;
  onClose: () => void;
  project: ProjectData;
  activeSection: string;
  editingContent: string;
  onApplyFix?: (content: string, sectionKey: string) => void;
  onJumpToSection?: (sectionKey: string) => void;
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    terminology: "术语", data: "数据", logic: "逻辑",
    conclusion: "结论", citation: "引用", overclaim: "过度推断",
  };
  return map[type] || "引用";
}

function typeColor(type: string): string {
  const map: Record<string, string> = {
    terminology: "bg-blue-100 text-blue-700",
    data: "bg-purple-100 text-purple-700",
    logic: "bg-orange-100 text-orange-700",
    conclusion: "bg-green-100 text-green-700",
    overclaim: "bg-pink-100 text-pink-700",
  };
  return map[type] || "bg-gray-100 text-gray-700";
}

export function WorkbenchConsistencyDialog({
  open, onClose, project, activeSection, editingContent,
  onApplyFix, onJumpToSection,
}: WorkbenchConsistencyDialogProps) {
  const ctrl = useConsistency();
  const [fixedContents, setFixedContents] = useState<Record<number, string>>({});

  const handleCheck = async () => {
    const merged = mergeEditorIntoProject(project, activeSection, editingContent);
    const sections = collectProjectSectionEntries(merged);

    if (sections.length < 2) {
      toast.error("至少需要 2 个章节有内容才能进行一致性检查");
      return;
    }

    setFixedContents({});
    const contentMap: Record<string, string> = {};
    sections.forEach(s => { contentMap[s.key] = s.content; });

    // 解析数据证据声明
    let dataClaims: { id: string; text: string; values: Record<string, number | string> }[] | undefined;
    try {
      if (merged.dataClaims) {
        dataClaims = JSON.parse(merged.dataClaims);
      }
    } catch { /* ignore */ }

    const r = await ctrl.check(merged.title, contentMap, merged.outline, dataClaims, merged.mode);
    if (r.passed) toast.success("一致性检查通过！");
    else toast.warning(`发现 ${r.issues.length} 个一致性问题`);
  };

  useEffect(() => {
    if (open) { ctrl.reset(); handleCheck(); }
  }, [open]);

  const handleFix = async (index: number) => {
    const merged = mergeEditorIntoProject(project, activeSection, editingContent);
    const sections: Record<string, string> = {};
    for (const { key, content } of collectProjectSectionEntries(merged)) {
      sections[key] = content;
    }

    if (Object.keys(sections).length === 0) {
      toast.error("没有可用的章节内容");
      return;
    }

    const result = await ctrl.fixIssue(index, sections, merged.title, merged.outline, merged.mode);
    if (result) {
      setFixedContents(prev => ({ ...prev, [index]: result }));
      toast.success("AI 修复完成，请预览后应用");
    } else {
      toast.error("修复失败，请重试");
    }
  };

  const handleApply = (index: number) => {
    const issue = ctrl.report?.issues[index];
    const content = fixedContents[index];
    if (!issue || !content) return;

    const sectionKey = issue.sections[0] || "introduction";
    onApplyFix?.(content, sectionKey);
    ctrl.applyFix(index);
    toast.success(`已应用到 ${sectionKey} 章节`);
  };

  const handleJump = (sectionKey: string) => {
    onJumpToSection?.(sectionKey);
    const label = getSectionLabelForMode(sectionKey, getProjectWritingMode(project.mode));
    toast.info(`已跳转到 ${label}`);
  };

  const fixedCount = ctrl.report?.issues.filter(i => i.status === "fixed").length || 0;
  const totalCount = ctrl.report?.issues.length || 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={DIALOG_WORK}>
        <DialogHeader className="shrink-0">
          <div className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              跨章节一致性检查
              {totalCount > 0 && (
                <span className="text-xs font-normal text-muted-foreground ml-auto">
                  已修复 {fixedCount}/{totalCount}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              检查各章节之间的术语、数据、逻辑及引用一致性
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {ctrl.isChecking ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">正在逐章对比分析...</p>
            </div>
          ) : ctrl.report ? (
            <div className="space-y-6">
              <div className={`p-4 rounded-lg border ${
                ctrl.report.passed ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"
              }`}>
                <div className="flex items-center gap-3">
                  {ctrl.report.passed ? (
                    <CheckCheck className="h-8 w-8 text-green-500" />
                  ) : (
                    <XCircle className="h-8 w-8 text-amber-500" />
                  )}
                  <div>
                    <p className={`font-bold text-sm ${ctrl.report.passed ? "text-green-700" : "text-amber-700"}`}>
                      {ctrl.report.passed ? "一致性检查通过" : `发现 ${totalCount} 个问题`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ctrl.report.summary || ""}</p>
                  </div>
                </div>
                {totalCount > 0 && (
                  <div className="mt-3 h-1.5 bg-amber-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all duration-300"
                      style={{ width: `${totalCount > 0 ? (fixedCount / totalCount) * 100 : 0}%` }}
                    />
                  </div>
                )}
              </div>

              {totalCount > 0 && (
                <div className="space-y-3">
                  {ctrl.report.issues.map((issue: FixableIssue, idx: number) => (
                    <div key={idx} className={`p-4 rounded-lg border transition-opacity ${
                      issue.status === "dismissed" ? "opacity-40" :
                      issue.status === "fixed" ? "opacity-60 border-green-300" :
                      issue.severity === "high" ? "bg-red-50 border-red-200"
                        : issue.severity === "medium" ? "bg-amber-50 border-amber-200"
                        : "bg-yellow-50 border-yellow-200"
                    }`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            issue.severity === "high" ? "bg-red-200 text-red-800"
                              : issue.severity === "medium" ? "bg-amber-200 text-amber-800"
                              : "bg-yellow-200 text-yellow-800"
                          }`}>{issue.severity}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${typeColor(issue.type)}`}>
                            {typeLabel(issue.type)}
                          </span>
                          {issue.status === "fixed" && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-200 text-green-800">
                              已修复
                            </span>
                          )}
                          {issue.status === "fixing" && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-200 text-blue-800 flex items-center gap-1">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" /> 修复中
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-xs mt-2 leading-relaxed">{issue.description}</p>
                      {issue.sections.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {issue.sections.map((s, si) => (
                            <button
                              key={si}
                              onClick={() => handleJump(s)}
                              className="text-[9px] bg-background border px-2 py-0.5 rounded-full text-muted-foreground hover:text-primary hover:border-primary transition-colors cursor-pointer flex items-center gap-0.5"
                            >
                              {s} <ExternalLink className="h-2.5 w-2.5" />
                            </button>
                          ))}
                        </div>
                      )}
                      {issue.suggestion && (
                        <p className="text-[11px] mt-2 text-muted-foreground italic border-t pt-2 border-dashed border-current/10">
                          {issue.suggestion}
                        </p>
                      )}

                      {/* AI 修复结果预览 */}
                      {fixedContents[idx] && (
                        <div className="mt-2 p-3 bg-white border rounded text-[11px] leading-relaxed max-h-32 overflow-y-auto">
                          {fixedContents[idx]}
                        </div>
                      )}

                      {/* 操作按钮 */}
                      {issue.status !== "fixed" && issue.status !== "dismissed" && (
                        <div className="flex gap-2 mt-3 pt-2 border-t border-dashed border-current/10">
                          {!fixedContents[idx] ? (
                            <Button
                              size="sm" variant="default"
                              className="h-7 text-[10px]"
                              disabled={ctrl.fixingIssueIndex === idx}
                              onClick={() => handleFix(idx)}
                            >
                              {ctrl.fixingIssueIndex === idx ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <Wand2 className="h-3 w-3 mr-1" />
                              )}
                              AI 修复
                            </Button>
                          ) : (
                            <Button
                              size="sm" variant="default"
                              className="h-7 text-[10px] bg-green-600 hover:bg-green-700"
                              onClick={() => handleApply(idx)}
                            >
                              <Check className="h-3 w-3 mr-1" /> 应用到章节
                            </Button>
                          )}
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 text-[10px]"
                            onClick={() => handleJump(issue.sections[0] || "introduction")}
                          >
                            <ArrowRight className="h-3 w-3 mr-1" /> 跳转
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 text-[10px]"
                            onClick={() => ctrl.dismissIssue(idx)}
                          >
                            <EyeOff className="h-3 w-3 mr-1" /> 忽略
                          </Button>
                        </div>
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
          {ctrl.report && !ctrl.isChecking && (
            <Button variant="default" onClick={handleCheck}>
              <RefreshCw className="h-4 w-4 mr-1" /> 重新检查
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
