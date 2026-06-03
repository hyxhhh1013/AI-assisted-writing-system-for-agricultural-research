"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const ReaderPageClient = dynamic(() => import("./reader-page-client"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
});

export default function ReaderPage() {
  return <ReaderPageClient />;
}
