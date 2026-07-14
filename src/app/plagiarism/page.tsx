"use client";

import { Suspense } from "react";
import { QualityWorkspace } from "@/components/shared/quality/quality-workspace";

export default function PlagiarismPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-muted-foreground">加载中...</div>}>
      <QualityWorkspace />
    </Suspense>
  );
}
