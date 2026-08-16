"use client";

import { useState, useCallback, useEffect } from "react";
import type { ProjectData } from "@/contracts/project";
import { StandardSCIPreview } from "@/components/shared/previews/sci-standard";
import { IEEEPreview } from "@/components/shared/previews/ieee";
import { GBT7713Preview } from "@/components/shared/previews/gbt7713";
import { NaturePreview } from "@/components/shared/previews/nature";
import { CASPreview } from "@/components/shared/previews/cas";
import { CitationInspectDialog } from "@/components/shared/citation-inspect-dialog";
import { fetchReferenceSources } from "@/services/references";
import type { ReferenceSourceDetail } from "@/contracts/references";

interface SCIPreviewProps {
  project: ProjectData;
}

export default function SCIPreview({ project }: SCIPreviewProps) {
  const [citeDialogOpen, setCiteDialogOpen] = useState(false);
  const [selectedCiteNums, setSelectedCiteNums] = useState<number[]>([]);
  const [sourceDetails, setSourceDetails] = useState<Record<number, ReferenceSourceDetail>>({});
  const [sourceLoading, setSourceLoading] = useState(false);

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

      <CitationInspectDialog
        open={citeDialogOpen}
        onOpenChange={setCiteDialogOpen}
        project={project}
        selectedNums={selectedCiteNums}
        sourceDetails={sourceDetails}
        sourceLoading={sourceLoading}
      />
    </>
  );
}
