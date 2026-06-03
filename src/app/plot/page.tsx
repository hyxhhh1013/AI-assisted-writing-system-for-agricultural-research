"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const PlotPageClient = dynamic(() => import("./plot-page-client"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" />
    </div>
  ),
});

export default function PlotPage() {
  return <PlotPageClient />;
}
