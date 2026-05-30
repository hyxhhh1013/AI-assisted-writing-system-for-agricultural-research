"use client";

import { MarkdownContent, ReferencesSection } from "./shared";
import { ProjectData } from "@/lib/store";
import { getTemplateSections, type TemplateSectionDef } from "@/lib/template-sections";

interface TemplateProps {
  project: ProjectData;
  onCiteClick?: (nums: number[]) => void;
}

function getSectionContent(project: ProjectData, def: TemplateSectionDef): string {
  const main = project.sections[def.key] || "";
  if (!def.mergeKeys || def.mergeKeys.length === 0) return main;
  const merged = def.mergeKeys.map(mk => project.sections[mk] || "").filter(Boolean).join("\n\n");
  return merged ? `${main}\n\n${merged}` : main;
}

export function NaturePreview({ project, onCiteClick }: TemplateProps) {
  const templateSections = getTemplateSections("nature");
  const introDef = templateSections.find(d => d.key === "introduction");
  const resultsDef = templateSections.find(d => d.key === "results");
  const methodsDef = templateSections.find(d => d.key === "methods");
  const discussionDef = templateSections.find(d => d.key === "discussion");

  return (
    <div className="p-10 text-[10pt] leading-tight text-black max-w-[210mm] mx-auto bg-white" style={{ fontFamily: '"Times New Roman", Georgia, serif' }}>
      <div className="mb-10">
        <h1 className="text-[28pt] font-bold tracking-tighter leading-[1.1] mb-6">{project.title || "Untitled Nature Article"}</h1>
        <div className="text-[11pt] font-bold border-b-2 border-black pb-2 mb-4">{project.authors}</div>
      </div>
      <div className="mb-8 text-[11pt] font-bold leading-relaxed text-justify">
        <MarkdownContent content={project.abstract || "Abstract without heading, as per Nature style."} onCiteClick={onCiteClick} refCount={project.references?.length} />
      </div>
      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-4">
          {introDef && (
            <div className="text-justify first-letter:text-4xl first-letter:font-bold first-letter:float-left first-letter:mr-2 first-letter:mt-1">
              <MarkdownContent content={getSectionContent(project, introDef)} sectionNumber={introDef.sectionNumber} onCiteClick={onCiteClick} refCount={project.references?.length} />
            </div>
          )}
          {resultsDef && (
            <>
              <h2 className="text-[12pt] font-bold border-t pt-4">{resultsDef.label}</h2>
              <div className="text-justify">
                <MarkdownContent content={getSectionContent(project, resultsDef)} sectionNumber={resultsDef.sectionNumber} onCiteClick={onCiteClick} refCount={project.references?.length} />
              </div>
            </>
          )}
        </div>
        <div className="space-y-4">
          {methodsDef && (
            <>
              <h2 className="text-[12pt] font-bold border-t pt-4">{methodsDef.label}</h2>
              <div className="text-justify text-[9pt] bg-muted/20 p-4 rounded">
                <MarkdownContent content={getSectionContent(project, methodsDef)} sectionNumber={methodsDef.sectionNumber} onCiteClick={onCiteClick} refCount={project.references?.length} />
              </div>
            </>
          )}
          {discussionDef && (
            <>
              <h2 className="text-[12pt] font-bold border-t pt-4">{discussionDef.label}</h2>
              <div className="text-justify">
                <MarkdownContent content={getSectionContent(project, discussionDef)} sectionNumber={discussionDef.sectionNumber} onCiteClick={onCiteClick} refCount={project.references?.length} />
              </div>
            </>
          )}
        </div>
      </div>
      <ReferencesSection references={project.references} isChinese={false} />
    </div>
  );
}
