"use client";

import { MarkdownContent, ReferencesSection } from "./shared";
import { ProjectData } from "@/lib/store";

interface TemplateProps {
  project: ProjectData;
  onCiteClick?: (nums: number[]) => void;
}

export function NaturePreview({ project, onCiteClick }: TemplateProps) {
  return (
    <div className="p-10 font-serif text-[10pt] leading-tight text-black max-w-[210mm] mx-auto bg-white">
      <div className="mb-10">
        <h1 className="text-[28pt] font-bold tracking-tighter leading-[1.1] mb-6">{project.title || "Untitled Nature Article"}</h1>
        <div className="text-[11pt] font-bold border-b-2 border-black pb-2 mb-4">{project.authors}</div>
      </div>
      <div className="mb-8 text-[11pt] font-bold leading-relaxed text-justify">
        <MarkdownContent content={project.abstract || "Abstract without heading, as per Nature style."} onCiteClick={onCiteClick} />
      </div>
      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="text-justify first-letter:text-4xl first-letter:font-bold first-letter:float-left first-letter:mr-2 first-letter:mt-1">
            <MarkdownContent content={project.sections.introduction || ""} onCiteClick={onCiteClick} />
          </div>
          <h2 className="text-[12pt] font-bold border-t pt-4">Results</h2>
          <div className="text-justify">
            <MarkdownContent content={project.sections.results || ""} onCiteClick={onCiteClick} />
          </div>
        </div>
        <div className="space-y-4">
          <h2 className="text-[12pt] font-bold border-t pt-4">Methods</h2>
          <div className="text-justify text-[9pt] bg-muted/20 p-4 rounded">
            <MarkdownContent content={project.sections.methods || ""} onCiteClick={onCiteClick} />
          </div>
          <h2 className="text-[12pt] font-bold border-t pt-4">Discussion</h2>
          <div className="text-justify">
            <MarkdownContent content={project.sections.conclusion || ""} onCiteClick={onCiteClick} />
          </div>
        </div>
      </div>
      <ReferencesSection references={project.references} isChinese={false} />
    </div>
  );
}
