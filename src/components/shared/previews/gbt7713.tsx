"use client";

import { MarkdownContent, CompactMarkdown, ReferencesSection } from "./shared";
import { formatKeywords } from "@/lib/paper-metadata";
import { formatClassification } from "@/lib/paper-metadata";
import type { ProjectData } from "@/contracts/project";
import { getTemplateSections, type TemplateSectionDef } from "@/lib/template-sections";

interface TemplateProps {
  project: ProjectData;
  onCiteClick?: (nums: number[]) => void;
}

/** 获取 section 内容，合并 mergeKeys */
function getSectionContent(project: ProjectData, def: TemplateSectionDef): string {
  const main = project.sections[def.key] || "";
  if (!def.mergeKeys || def.mergeKeys.length === 0) return main;
  const merged = def.mergeKeys
    .map(mk => project.sections[mk] || "")
    .filter(Boolean)
    .join("\n\n");
  return merged ? `${main}\n\n${merged}` : main;
}

export function GBT7713Preview({ project, onCiteClick }: TemplateProps) {
  const keywords = formatKeywords(project, "zh");
  const classification = formatClassification(project);
  const templateSections = getTemplateSections("gbt7713");
  return (
    <div className="p-[20mm] text-[10.5pt] leading-[1.6] text-black max-w-[210mm] mx-auto bg-white" style={{ fontFamily: '"SimSun", "Noto Serif CJK SC", "Source Han Serif SC", serif', lineHeight: '1.7' }}>
      <header className="text-center mb-10">
        <h1 className="text-[16pt] font-bold mb-6 font-sans tracking-wide">{project.title || "无标题论文"}</h1>
        <p className="text-[12pt] mb-2">{project.authors || "作者姓名"}</p>
        <p className="text-[9pt] text-gray-700 mb-8">（{project.affiliations || "作者单位信息"}）</p>
      </header>
      <section className="mb-8 text-[10.5pt] space-y-2 break-inside-avoid">
        <div className="flex text-justify">
          <span className="font-bold shrink-0">摘要：</span>
          <div className="flex-1"><CompactMarkdown content={project.abstract || "摘要内容..."} onCiteClick={onCiteClick} /></div>
        </div>
        <div className="flex"><span className="font-bold shrink-0">关键词：</span><div className="flex-1">{keywords}</div></div>
        {classification ? (
          <div className="flex text-[9pt]"><span className="font-bold shrink-0">中图分类号：</span><div className="flex-1">{classification}</div></div>
        ) : null}
      </section>
      <div className="space-y-8">
        {templateSections.map((def) => (
          <section key={def.key} className="block break-inside-avoid">
            <h2 className="text-[12pt] font-bold mb-4 border-b pb-1">{def.sectionNumber} {def.label}</h2>
            <div className="text-justify indent-[2em]">
              <MarkdownContent content={getSectionContent(project, def)} sectionNumber={def.sectionNumber} onCiteClick={onCiteClick} refCount={project.references?.length} />
            </div>
          </section>
        ))}
        <ReferencesSection references={project.references} isChinese={true} />
      </div>
    </div>
  );
}
