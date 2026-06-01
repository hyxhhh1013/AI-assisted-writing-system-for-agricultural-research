import { Suspense } from "react";
import { ReviewWorkspace } from "@/components/shared/review/review-workspace";
import { Loader2 } from "lucide-react";

export default function ReviewPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-[#f6f5f1]">
        <Loader2 className="h-6 w-6 animate-spin text-[#1a5632]/40" />
      </div>
    }>
      <ReviewWorkspace />
    </Suspense>
  );
}
