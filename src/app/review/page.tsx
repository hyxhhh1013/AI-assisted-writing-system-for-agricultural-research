"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/** 兼容旧链接：/review?id= → /plagiarism?id=&tab=review */
function ReviewRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "review");
    router.replace(`/plagiarism?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="flex h-screen items-center justify-center bg-[#f6f5f1]">
      <Loader2 className="h-6 w-6 animate-spin text-[#1a5632]/40" />
      <span className="ml-2 text-sm text-[#6b7c72]">正在跳转到论文质量中心…</span>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
      <ReviewRedirect />
    </Suspense>
  );
}
