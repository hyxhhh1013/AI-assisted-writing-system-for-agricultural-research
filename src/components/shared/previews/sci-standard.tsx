"use client";

import { MarkdownContent, ReferencesSection } from "./shared";
import { ProjectData } from "@/lib/store";

interface TemplateProps {
  project: ProjectData;
  onCiteClick?: (nums: number[]) => void;
}

export function StandardSCIPreview({ project, onCiteClick }: TemplateProps) {
  return (
    <div className="p-12 font-serif text-[#1a1a1a] leading-relaxed max-w-[210mm] mx-auto bg-white">
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
          <MarkdownContent content={project.abstract || "Abstract content will appear here after generation."} onCiteClick={onCiteClick} />
        </div>
      </section>
      {(["introduction", "methods", "results", "conclusion"] as const).map((key, i) => (
        <section key={key} className="mb-8 break-inside-avoid">
          <h2 className="text-base font-bold uppercase mb-4 flex items-center gap-3">
            <span className="bg-black text-white px-2 py-0.5 text-sm">{i + 1}</span>{" "}
            {key === "introduction" ? "Introduction" : key === "methods" ? "Materials and Methods" : key === "results" ? "Results and Discussion" : "Conclusion"}
          </h2>
          <div className="text-sm leading-7">
            <MarkdownContent content={project.sections[key] || ""} sectionNumber={i + 1} onCiteClick={onCiteClick} />
          </div>
        </section>
      ))}
      <ReferencesSection references={project.references} isChinese={false} />
    </div>
  );
}
