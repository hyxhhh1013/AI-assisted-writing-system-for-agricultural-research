import { Loader2 } from "lucide-react";

/** 路由切换时的全局占位，避免白屏等待 */
export default function RootLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-[#6b7c72]">
      <Loader2 className="h-5 w-5 animate-spin text-[#1a5632]" aria-hidden />
      <span className="ml-2 text-sm">加载中…</span>
    </div>
  );
}
