"use client";

import { MarkdownContent, ReferencesSection } from "./shared";
import { formatKeywords } from "@/lib/paper-metadata";
import { ProjectData } from "@/lib/store";

interface TemplateProps {
  project: ProjectData;
  onCiteClick?: (nums: number[]) => void;
}

export function IEEEPreview({ project, onCiteClick }: TemplateProps) {
  const keywords = formatKeywords(project, "en");
  return (
    <div className="p-8 font-serif text-[9pt] leading-[1.1] text-black max-w-[210mm] mx-auto bg-white">
      <div className="text-center mb-8">
        <h1 className="text-[24pt] mb-6 font-normal tracking-tight leading-tight">{project.title || "Untitled Paper"}</h1>
        <p className="text-[11pt] mb-4">{project.authors}</p>
      </div>
      <div>
        <div className="mb-4">
          <div className="text-justify font-bold italic">
            Abstract—<span className="font-normal not-italic"><MarkdownContent content={project.abstract || "Abstract content..."} onCiteClick={onCiteClick} /></span>
          </div>
          <p className="mt-2 text-justify font-bold italic">Keywords—{keywords}.</p>
        </div>
        <div className="[column-count:2] [column-gap:2rem]">
          {([
            ["I. Introduction", "introduction"],
            ["II. Materials and Methods", "methods"],
            ["III. Results", "results"],
            ["IV. Conclusion", "conclusion"],
          ] as const).map(([label, key]) => (
            <section key={key} className="mb-4 break-inside-avoid">
              <h2 className="text-center text-[10pt] uppercase mb-2 mt-4 tracking-widest font-normal">{label}</h2>
              <div className="text-justify indent-4">
                <MarkdownContent content={project.sections[key] || ""} onCiteClick={onCiteClick} />
              </div>
            </section>
          ))}
        </div>
      </div>
      <ReferencesSection references={project.references} isChinese={false} />
    </div>
  );
}
