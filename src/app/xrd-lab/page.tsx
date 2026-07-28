"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { XRD_DEFAULT_FIGURE_ID } from "@/contracts/xrd-figures";

/** 兼容旧链接：/xrd-lab → /plot?category=xrd */
function XrdLabRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("category", "xrd");
    params.set("figure", XRD_DEFAULT_FIGURE_ID);
    const projectId = searchParams.get("projectId");
    if (projectId) params.set("id", projectId);
    router.replace(`/plot?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="flex h-screen items-center justify-center bg-[#faf9f6]">
      <Loader2 className="h-6 w-6 animate-spin text-[#1a5632]/40" />
      <span className="ml-2 text-sm text-[#6b7c72]">正在跳转到光谱分析…</span>
    </div>
  );
}

export default function XrdLabPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <XrdLabRedirect />
    </Suspense>
  );
}
