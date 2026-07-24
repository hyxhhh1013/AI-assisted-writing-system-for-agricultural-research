"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { siteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import { BookOpen, PenLine, SkipForward } from "lucide-react";

interface LiteratureBeginnerGuideProps {
  projectId: string | null;
  onSkipAndContinue: () => void;
}

/**
 * 给学生讲清：文献不是必须手填；可检索导入，也可先写后补。
 */
export function LiteratureBeginnerGuide({
  projectId,
  onSkipAndContinue,
}: LiteratureBeginnerGuideProps) {
  const readerHref = projectId
    ? `/workbench?id=${encodeURIComponent(projectId)}&tab=reader`
    : null;
  const writingHref = projectId
    ? `/workbench?id=${encodeURIComponent(projectId)}&tab=writing`
    : null;

  return (
    <div className={cn(siteTheme.card, "space-y-4 p-4")}>
      <div>
        <h3 className="text-sm font-semibold text-[#122820]">新手怎么弄文献？</h3>
        <p className="mt-1 text-xs leading-relaxed text-[#6b7c72]">
          写论文常见两种顺序，禾书耕文都支持。挑一种即可，不必一开始就建完整参考文献表。
        </p>
      </div>

      <ol className="space-y-3">
        <li className="rounded-xl border border-[#1a5632]/15 bg-[#1a5632]/[0.04] p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-[#122820]">
            <BookOpen className="h-4 w-4 text-[#1a5632]" />
            路径 A：先检索一批核心文献（推荐综述 / 开题）
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#3d4f46]">
            打开「补录文献」→ 用<strong>外部检索</strong>（OpenAlex / PubMed）或<strong>知识库 PDF</strong>导入到当前项目。不是一个个手敲条目。
          </p>
          {readerHref ? (
            <a
              href={readerHref}
              className={cn(buttonVariants({ size: "sm" }), siteTheme.btnPrimary, "mt-2")}
            >
              去检索导入
            </a>
          ) : null}
        </li>

        <li className="rounded-xl border border-[#1a5632]/15 bg-white p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-[#122820]">
            <PenLine className="h-4 w-4 text-[#1a5632]" />
            路径 B：先写正文，边写边补文献（推荐实验论文初稿）
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#3d4f46]">
            去「章节协作」：先写要点 → 点<strong>检索</strong> → 勾选命中文献 → 再扩写。系统会自动插入 [1][2]…，后面再在「核对引用」阶段清理。
          </p>
          {writingHref ? (
            <a
              href={writingHref}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }), "mt-2")}
            >
              去扩写（边写边检索）
            </a>
          ) : null}
        </li>

        <li className="rounded-xl border border-dashed border-[#1a5632]/20 bg-[#faf9f6] p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-[#122820]">
            <SkipForward className="h-4 w-4 text-[#1a5632]" />
            路径 C：现在先跳过，搭好结构再说
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#3d4f46]">
            若题目还没定死、或文献很少：可以跳过本步，先做大纲与论证，回来再补文献。
          </p>
          <Button variant="ghost" size="sm" className="mt-2 h-8 px-2" onClick={onSkipAndContinue}>
            跳过文献收集，进入下一步
          </Button>
        </li>
      </ol>
    </div>
  );
}
