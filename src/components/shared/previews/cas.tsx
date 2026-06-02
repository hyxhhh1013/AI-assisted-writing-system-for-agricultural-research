"use client";

import { MarkdownContent, ReferencesSection } from "./shared";
import { formatKeywords } from "@/lib/paper-metadata";
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

export function CASPreview({ project, onCiteClick }: TemplateProps) {
  const keywords = formatKeywords(project, "zh");
  const templateSections = getTemplateSections("cas");
  return (
    <div className="p-12 text-[10.5pt] text-black max-w-[210mm] mx-auto bg-white" style={{ fontFamily: '"SimSun", "Microsoft YaHei", "Noto Sans CJK SC", serif', lineHeight: '1.78' }}>
      <header className="text-center mb-12">
        <h1 className="text-[18pt] font-bold mb-6">{project.title || "中国科学院学术论文模板"}</h1>
        <p className="text-[12pt] mb-4 font-sans">{project.authors}</p>
        <p className="text-[10pt] italic">（{project.affiliations || "中国科学院农业资源研究中心，石家庄 050021"}）</p>
      </header>
      <section className="mb-10 bg-gray-50 p-6 border-y border-gray-200 break-inside-avoid">
        <div className="text-justify mb-2">
          <span className="font-bold font-sans">摘要：</span>
          <MarkdownContent content={project.abstract || ""} onCiteClick={onCiteClick} refCount={project.references?.length} />
        </div>
        <p><span className="font-bold font-sans">关键词：</span>{keywords}</p>
      </section>
      <div className="space-y-8">
        {templateSections.map((def) => (
          <section key={def.key} className="break-inside-avoid">
            <h2 className="text-[14pt] font-bold mb-4 border-l-4 border-primary pl-3">{def.sectionNumber} {def.label}</h2>
            <div className="text-justify indent-8">
              <MarkdownContent content={getSectionContent(project, def)} sectionNumber={def.sectionNumber} onCiteClick={onCiteClick} refCount={project.references?.length} />
            </div>
          </section>
        ))}
        <ReferencesSection references={project.references} isChinese={true} />
      </div>
    </div>
  );
}
