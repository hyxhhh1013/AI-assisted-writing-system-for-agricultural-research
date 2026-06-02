"use client";

import { MarkdownContent, ReferencesSection } from "./shared";
import type { ProjectData } from "@/contracts/project";
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

export function StandardSCIPreview({ project, onCiteClick }: TemplateProps) {
  const templateSections = getTemplateSections("sci", project.mode);
  return (
    <div className="p-12 text-[#1a1a1a] leading-relaxed max-w-[210mm] mx-auto bg-white" style={{ fontFamily: '"Times New Roman", Georgia, serif', fontSize: '10.5pt', lineHeight: '1.68' }}>
      <header className="text-center mb-12 border-b pb-8">
        <h1 className="text-3xl font-bold mb-6 uppercase tracking-tight leading-tight">
          {project.title || "Untitled Research Paper"}
        </h1>
        <div className="flex flex-col gap-2">
          <p className="text-base font-medium">{project.authors || "Author Name Not Set"}</p>
          <p className="text-xs text-muted-foreground italic">Agricultural Science Laboratory, Research Institute of Agriculture, 2024</p>
        </div>
      </header>
      <section className="mb-10 break-inside-avoid">
        <h2 className="text-lg font-bold uppercase mb-3 border-b-2 border-black pb-1 inline-block">Abstract</h2>
        <div className="text-sm leading-7 first-letter:text-2xl first-letter:font-bold first-letter:mr-1">
          <MarkdownContent content={project.abstract || "Abstract content will appear here after generation."} onCiteClick={onCiteClick} refCount={project.references?.length} />
        </div>
      </section>
      {templateSections.map((def) => (
        <section key={def.key} className="mb-8 break-inside-avoid">
          <h2 className="text-base font-bold uppercase mb-4 flex items-center gap-3">
            <span className="bg-black text-white px-2 py-0.5 text-sm">{def.sectionNumber}</span>{" "}
            {def.label}
          </h2>
          <div className="text-sm leading-7">
            <MarkdownContent content={getSectionContent(project, def)} sectionNumber={def.sectionNumber} onCiteClick={onCiteClick} refCount={project.references?.length} />
          </div>
        </section>
      ))}
      <ReferencesSection references={project.references} isChinese={false} />
    </div>
  );
}
