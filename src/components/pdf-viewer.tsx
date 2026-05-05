"use client";

import { Worker, Viewer, PageChangeEvent } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";
import { toast } from "sonner";

interface PDFViewerProps {
  fileUrl: string;
  onPageChange?: (pageIndex: number) => void;
}

export default function PDFViewer({ fileUrl, onPageChange }: PDFViewerProps) {
  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  const handlePageChange = (e: PageChangeEvent) => {
    if (onPageChange) {
      onPageChange(e.currentPage);
    }
  };

  return (
    <div className="h-full">
      <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
        <Viewer
          fileUrl={fileUrl}
          plugins={[defaultLayoutPluginInstance]}
          onPageChange={handlePageChange}
        />
      </Worker>
    </div>
  );
}
