"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/** 独立大纲页已并入工作台「论证提纲」侧栏，保留路由作重定向 */
export default function OutlinePage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <OutlineRedirect />
    </Suspense>
  );
}

function OutlineRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");

  useEffect(() => {
    if (projectId) {
      router.replace(`/workbench?id=${encodeURIComponent(projectId)}&tab=outline`);
      return;
    }
    router.replace("/projects");
  }, [projectId, router]);

  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      正在打开工作台论证提纲…
    </div>
  );
}
