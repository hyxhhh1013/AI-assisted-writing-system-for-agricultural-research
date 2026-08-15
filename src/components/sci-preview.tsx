"use client";

import { useState, useCallback, useEffect } from "react";
import { Quote, BookOpen } from "lucide-react";
import type { ProjectData } from "@/contracts/project";
import { cn } from "@/lib/utils";
import { findCiteContextsInProject, expandCiteGroup } from "@/components/shared/previews/shared";
import { StandardSCIPreview } from "@/components/shared/previews/sci-standard";
import { IEEEPreview } from "@/components/shared/previews/ieee";
import { GBT7713Preview } from "@/components/shared/previews/gbt7713";
import { NaturePreview } from "@/components/shared/previews/nature";
import { CASPreview } from "@/components/shared/previews/cas";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchReferenceSources } from "@/services/references";
import type { ReferenceSourceDetail } from "@/contracts/references";
import { ReferenceSourceView } from "@/components/shared/reference-source-view";

interface SCIPreviewProps {
  project: ProjectData;
}

export default function SCIPreview({ project }: SCIPreviewProps) {
  const [citeDialogOpen, setCiteDialogOpen] = useState(false);
  const [selectedCiteNums, setSelectedCiteNums] = useState<number[]>([]);
  const [sourceDetails, setSourceDetails] = useState<Record<number, ReferenceSourceDetail>>({});
  const [sourceLoading, setSourceLoading] = useState(false);

  const refs = project.references || [];

  const handleCiteClick = useCallback((nums: number[]) => {
    setSelectedCiteNums(nums);
    setCiteDialogOpen(true);
  }, []);

  useEffect(() => {
    if (!citeDialogOpen || selectedCiteNums.length === 0) return;
    setSourceLoading(true);
    const fetchResults = async () => {
      try {
        const items = await fetchReferenceSources(project.id, selectedCiteNums);
        const map: Record<number, ReferenceSourceDetail> = {};
        for (const item of items) map[item.refIndex] = item;
        setSourceDetails(map);
      } catch {
        setSourceDetails({});
      } finally {
        setSourceLoading(false);
      }
    };
    void fetchResults();
  }, [citeDialogOpen, selectedCiteNums, project.id]);

  const citeDialogContent = selectedCiteNums
    .map((n) => { const ref = refs[n - 1]; return ref ? `[${n}] ${ref}` : null; })
    .filter(Boolean).join("\n\n");

  const template = project.template || "sci";
  const previewProps = { project, onCiteClick: handleCiteClick };

  return (
    <>
      <div className="bg-white shadow-inner min-h-full print:shadow-none print:p-0 pdf-export-container">
        {template === "ieee" ? <IEEEPreview {...previewProps} />
          : template === "gbt7713" ? <GBT7713Preview {...previewProps} />
          : template === "cas" ? <CASPreview {...previewProps} />
          : template === "nature" ? <NaturePreview {...previewProps} />
          : <StandardSCIPreview {...previewProps} />}
      </div>

      <Dialog open={citeDialogOpen} onOpenChange={setCiteDialogOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-hidden p-0">
          <DialogHeader>
            <div className="px-6 pt-5 pb-3 border-b">
              <DialogTitle className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground font-mono">[{selectedCiteNums.join(", ")}]</span> 引用文献
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-4 max-h-[calc(85vh-80px)] space-y-5">
            {selectedCiteNums.map((n) => {
              const ref = refs[n - 1];
              if (!ref) return null;
              const contexts = findCiteContextsInProject(project, n);
              return (
                <div key={n} className="space-y-3">
                  <div className="p-3 rounded-lg bg-muted/30 border text-xs leading-relaxed">
                    <span className="font-bold text-primary font-mono">[{n}]</span> {ref}
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                      <BookOpen className="h-3 w-3" /> 原文出处
                    </span>
                    <ReferenceSourceView
                      detail={sourceDetails[n] ?? null}
                      loading={sourceLoading}
                    />
                  </div>
                  {contexts.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                        <Quote className="h-3 w-3" /> 文中引用位置
                      </span>
                      {contexts.map((ctx, ci) => (
                        <div key={ci} className="space-y-0.5">
                          {ctx.sectionLabel && <span className="text-[9px] text-muted-foreground/60 font-medium ml-1">{ctx.sectionLabel}</span>}
                          <div className="text-[11px] leading-relaxed text-foreground bg-amber-50 border border-amber-200 rounded-md p-2.5">
                            {ctx.snippet.split(/(\[[\d,\s\-–—]+\])/g).map((part, pi) => {
                              const isCite = /^\[[\d,\s\-–—]+\]$/.test(part);
                              const matchesOwn = new RegExp(`\\[${n}(?:[,\\s\\-–—\\d]*)\\]`).test(part);
                              return isCite ? (
                                <span key={pi} className={cn("font-bold", matchesOwn ? "text-blue-600" : "text-gray-400")}>{part}</span>
                              ) : <span key={pi}>{part}</span>;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
