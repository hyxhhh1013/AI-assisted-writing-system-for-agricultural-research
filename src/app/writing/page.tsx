"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/** 独立扩写页已并入工作台「协作扩写」侧栏，保留路由作重定向 */
export default function WritingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <WritingRedirect />
    </Suspense>
  );
}

function WritingRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");

  useEffect(() => {
    if (projectId) {
      router.replace(`/workbench?id=${encodeURIComponent(projectId)}&tab=writing`);
      return;
    }
    router.replace("/projects");
  }, [projectId, router]);

  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      正在打开工作台协作扩写…
    </div>
  );
}
