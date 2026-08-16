"use client";

import { MarkdownContent, ReferencesSection } from "./shared";
import { formatKeywords } from "@/lib/paper-metadata";
import type { ProjectData } from "@/contracts/project";
import { getRenderableSections, type TemplateSectionDef } from "@/lib/template-sections";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

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

export function IEEEPreview({ project, onCiteClick }: TemplateProps) {
  const keywords = formatKeywords(project, "en");
  const templateSections = getRenderableSections("ieee", project.mode, project.sections);
  return (
    <div className="p-8 text-[9pt] leading-[1.1] text-black max-w-[210mm] mx-auto bg-white" style={{ fontFamily: '"Times New Roman", Georgia, serif' }}>
      <div className="text-center mb-8">
        <h1 className="text-[24pt] mb-6 font-normal tracking-tight leading-tight">{project.title || "Untitled Paper"}</h1>
        <p className="text-[11pt] mb-4">{project.authors}</p>
      </div>
      <div>
        <div className="mb-4">
          <div className="text-justify font-bold italic">
            Abstract—<span className="font-normal not-italic"><MarkdownContent content={project.abstract || "Abstract content..."} onCiteClick={onCiteClick} refCount={project.references?.length} /></span>
          </div>
          <p className="mt-2 text-justify font-bold italic">Keywords—{keywords}.</p>
        </div>
        <div className="[column-count:2] [column-gap:2rem]">
          {templateSections.map((def) => (
            <section key={def.key} className="mb-4 break-inside-avoid">
              <h2 className="text-center text-[10pt] uppercase mb-2 mt-4 tracking-widest font-normal">{ROMAN[def.sectionNumber - 1] || def.sectionNumber}. {def.label}</h2>
              <div className="text-justify indent-4">
                <MarkdownContent content={getSectionContent(project, def)} sectionNumber={def.sectionNumber} onCiteClick={onCiteClick} refCount={project.references?.length} />
              </div>
            </section>
          ))}
        </div>
      </div>
      <ReferencesSection references={project.references} isChinese={false} />
    </div>
  );
}
