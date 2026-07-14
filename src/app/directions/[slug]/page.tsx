"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const DirectionPageClient = dynamic(() => import("./direction-page-client"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[40vh] items-center justify-center text-[#6b7c72]">
      <Loader2 className="h-5 w-5 animate-spin text-[#1a5632]" />
      <span className="ml-2 text-sm">正在加载方向工作台…</span>
    </div>
  ),
});

export default function DirectionPage() {
  return <DirectionPageClient />;
}
