"use client";

import Link from "next/link";
import { BookOpen, ExternalLink, Quote } from "lucide-react";
import type { ProjectData } from "@/contracts/project";
import type { ReferenceSourceDetail } from "@/contracts/references";
import { citeYear, groupCiteContextsBySection, shortCiteTitle } from "@/lib/cite-inspect";
import { findCiteContextsInProject } from "@/components/shared/previews/shared";
import { CiteSnippetText } from "@/components/shared/cite-snippet";
import {
  ReferenceSourceView,
  SourceModePill,
  sourcePrimaryAction,
} from "@/components/shared/reference-source-view";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function CitationInspectDialog({
  open,
  onOpenChange,
  project,
  selectedNums,
  sourceDetails,
  sourceLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectData;
  selectedNums: number[];
  sourceDetails: Record<number, ReferenceSourceDetail>;
  sourceLoading: boolean;
}) {
  const refs = project.references || [];
  const titleNums = selectedNums.filter((n) => refs[n - 1]);
  const headerLabel =
    titleNums.length <= 1
      ? `[${titleNums[0] ?? selectedNums[0] ?? "?"}]`
      : `[${titleNums.join(", ")}]`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[720px] max-h-[85vh]">
        <DialogHeader className="border-b border-[#1a5632]/10 bg-[#faf9f6] px-6 py-4 pr-12 text-left">
          <DialogTitle className="text-[13px] font-medium text-[#6b7c72]">
            引用文献 {headerLabel}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[calc(85vh-56px)] space-y-6 overflow-y-auto px-6 py-5">
          {titleNums.map((n) => (
            <CitationInspectCard
              key={n}
              citeNum={n}
              citation={refs[n - 1]}
              detail={sourceDetails[n] ?? null}
              loading={sourceLoading}
              project={project}
              stacked={titleNums.length > 1}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CitationInspectCard({
  citeNum,
  citation,
  detail,
  loading,
  project,
  stacked,
}: {
  citeNum: number;
  citation: string;
  detail: ReferenceSourceDetail | null;
  loading: boolean;
  project: ProjectData;
  stacked: boolean;
}) {
  const title = shortCiteTitle(citation, detail?.title);
  const year = citeYear(citation);
  const action = sourcePrimaryAction(detail);
  const groups = groupCiteContextsBySection(findCiteContextsInProject(project, citeNum));
  const hitCount = groups.reduce((sum, g) => sum + g.snippets.length, 0);

  return (
    <article className={cn(stacked && "border-b border-[#1a5632]/10 pb-6 last:border-b-0 last:pb-0")}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-[#1a5632]">[{citeNum}]</span>
            {detail ? <SourceModePill mode={detail.mode} /> : null}
            {year ? <span className="text-[11px] text-[#9aa8a0]">{year}</span> : null}
          </div>
          <h3 className="mt-1.5 text-[15px] font-semibold leading-snug text-[#122820]">{title}</h3>
          {title !== citation ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#6b7c72]">{citation}</p>
          ) : null}
        </div>
        {action ? (
          action.external ? (
            <a
              href={action.href}
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "h-8 shrink-0 text-xs text-[#1a5632]",
              )}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {action.label}
            </a>
          ) : (
            <Link
              href={action.href}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "h-8 shrink-0 text-xs text-[#1a5632]",
              )}
            >
              <BookOpen className="h-3.5 w-3.5" />
              {action.label}
            </Link>
          )
        ) : null}
      </header>

      <section className="mt-4">
        <h4 className="mb-2 text-[11px] font-semibold tracking-wide text-[#9aa8a0]">出处</h4>
        <ReferenceSourceView detail={detail} loading={loading} hideActions />
      </section>

      {groups.length > 0 ? (
        <section className="mt-5">
          <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[#9aa8a0]">
            <Quote className="h-3 w-3" />
            文中 {hitCount} 处
          </h4>
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.sectionLabel}>
                <p className="mb-1.5 text-[11px] font-medium text-[#1a5632]">{group.sectionLabel}</p>
                <div className="space-y-2">
                  {group.snippets.map((snippet, i) => (
                    <p
                      key={`${group.sectionLabel}-${i}`}
                      className="rounded-lg bg-[#f6f5f1] px-3 py-2.5"
                    >
                      <CiteSnippetText snippet={snippet} citeNum={citeNum} />
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <p className="mt-4 text-[12px] text-[#9aa8a0]">正文里还没有标 [{citeNum}]。</p>
      )}
    </article>
  );
}
