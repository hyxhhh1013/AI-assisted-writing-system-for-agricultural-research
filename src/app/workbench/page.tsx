"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

const WorkbenchPageClient = dynamic(() => import("./workbench-page-client"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <span className="ml-2 text-sm">正在加载工作台...</span>
    </div>
  ),
});

export default function WorkbenchPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2 text-sm">正在加载工作台...</span>
      </div>
    }>
      <WorkbenchPageClient />
    </Suspense>
  );
}

export type { WorkbenchTab } from "./workbench-page-client";
