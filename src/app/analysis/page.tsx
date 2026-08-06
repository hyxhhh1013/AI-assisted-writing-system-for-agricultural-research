"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/** 独立数据分析页已并入工作台「数据」侧栏，保留路由作重定向 */
export default function AnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AnalysisRedirect />
    </Suspense>
  );
}

function AnalysisRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");

  useEffect(() => {
    if (projectId) {
      router.replace(`/workbench?id=${encodeURIComponent(projectId)}&tab=data`);
      return;
    }
    router.replace("/projects");
  }, [projectId, router]);

  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      正在打开工作台数据分析…
    </div>
  );
}
