/**
 * 浅接：工作室 Phase（skill 0–7）→ GrainScript 真实页面
 *
 * 注意：工作台 PaperPassport 阶段标签与 skill 不完全同构
 * （Passport：5=引用 6=摘要 7=审查；skill：5=引用+摘要并行 6=审稿 7=排版）。
 * 这里按「能力落点」跳转，文案写清会打开什么，避免对学生撒谎。
 */

import type { StudioPhase } from "./types";

export interface WorkbenchJumpTarget {
  id: string;
  label: string;
  hint: string;
  href: string;
  /** 需要登录才能用 */
  requiresAuth: boolean;
}

function workbenchHref(
  projectId: string,
  opts?: { tab?: string; section?: string; meta?: boolean },
): string {
  const params = new URLSearchParams();
  params.set("id", projectId);
  if (opts?.tab) params.set("tab", opts.tab);
  if (opts?.section) params.set("section", opts.section);
  if (opts?.meta) params.set("meta", "1");
  return `/workbench?${params.toString()}`;
}

export function getPhaseJumpTargets(
  phase: StudioPhase,
  projectId: string | null,
  track?: "5a" | "5b",
): WorkbenchJumpTarget[] {
  const pid = projectId?.trim() || "__PROJECT__";

  switch (phase) {
    case 0:
      return [
        {
          id: "cfg-meta",
          label: "打开项目设置（标题/模板/引用格式）",
          hint: "工作台「项目信息」对话框——改标题、作者、模板、引用样式。工作坊里的完整配置记录仍以本页为准。",
          href: workbenchHref(pid, { tab: "structure", meta: true }),
          requiresAuth: true,
        },
      ];
    case 1:
      return [
        {
          id: "lit-search",
          label: "检索并导入文献（推荐）",
          hint: "工作台「补录文献」里可搜 OpenAlex / PubMed，或从知识库 PDF 一键导入——不是一篇篇手打。",
          href: workbenchHref(pid, { tab: "reader" }),
          requiresAuth: true,
        },
        {
          id: "lit-write-first",
          label: "先去扩写（边写边检索文献）",
          hint: "章节协作里点「检索」勾选文献再扩写，系统会自动带上 [1][2]… 引用。适合先写 Introduction / Discussion。",
          href: workbenchHref(pid, { tab: "writing" }),
          requiresAuth: true,
        },
        {
          id: "lit-knowledge",
          label: "打开文献库上传 PDF",
          hint: "实验室本地知识库：上传 PDF 后可被扩写检索，也可再导入到本项目。",
          href: "/knowledge",
          requiresAuth: false,
        },
      ];
    case 2:
      return [
        {
          id: "arch-outline",
          label: "打开「论证提纲」",
          hint: "工作台「论证提纲」Tab：生成/编辑大纲与章节骨架。",
          href: workbenchHref(pid, { tab: "outline" }),
          requiresAuth: true,
        },
      ];
    case 3:
      return [
        {
          id: "arg-outline",
          label: "打开论证提纲并生成论证蓝图",
          hint: "工作台「论证提纲」Tab：生成写作蓝图后，再点「生成论证蓝图」（主张—证据—推理）。",
          href: workbenchHref(pid, { tab: "outline" }),
          requiresAuth: true,
        },
      ];
    case 4:
      return [
        {
          id: "draft-writing",
          label: "打开「章节协作」扩写",
          hint: "工作台「章节协作」Tab：检索 → 写作 → 核查流水线。",
          href: workbenchHref(pid, { tab: "writing" }),
          requiresAuth: true,
        },
        {
          id: "draft-structure",
          label: "打开「章节结构」手改正文",
          hint: "在中间编辑器直接改各节文稿。",
          href: workbenchHref(pid, { tab: "structure" }),
          requiresAuth: true,
        },
        {
          id: "draft-data",
          label: "打开「数据」面板",
          hint: "上传实验数据、看证据声明（写 Results 时用）。",
          href: workbenchHref(pid, { tab: "data" }),
          requiresAuth: true,
        },
        {
          id: "draft-plot",
          label: "打开绘图页",
          hint: "独立页面 /plot：柱状图、折线、XRD 等。",
          href: `/plot?id=${pid}`,
          requiresAuth: false,
        },
      ];
    case 5: {
      if (track === "5b") {
        return [
          {
            id: "abs-section",
            label: "打开摘要章节",
            hint: "工作台章节结构 → 摘要（对应产品里 Passport 第 6 步「摘要」）。",
            href: workbenchHref(pid, { tab: "structure", section: "abstract" }),
            requiresAuth: true,
          },
        ];
      }
      if (track === "5a") {
        return [
          {
            id: "cite-reader",
            label: "打开参考文献列表",
            hint: "「补录文献」Tab 核对条目（对应 Passport 第 5 步「引用」）。",
            href: workbenchHref(pid, { tab: "reader" }),
            requiresAuth: true,
          },
          {
            id: "cite-body",
            label: "打开正文核对引用编号",
            hint: "在章节结构里检查文内 [n] 是否与列表一致。",
            href: workbenchHref(pid, { tab: "structure" }),
            requiresAuth: true,
          },
        ];
      }
      return [
        {
          id: "cite-reader",
          label: "5a · 核对参考文献",
          hint: "补录文献 Tab。",
          href: workbenchHref(pid, { tab: "reader" }),
          requiresAuth: true,
        },
        {
          id: "abs-section",
          label: "5b · 写摘要",
          hint: "章节结构 → 摘要。",
          href: workbenchHref(pid, { tab: "structure", section: "abstract" }),
          requiresAuth: true,
        },
      ];
    }
    case 6:
      return [
        {
          id: "review-wb",
          label: "打开工作台「质量检测」",
          hint: "侧栏查重/审查（对应产品 Passport 第 7 步「审查」，不是排版）。",
          href: workbenchHref(pid, { tab: "plagiarism" }),
          requiresAuth: true,
        },
        {
          id: "review-full",
          label: "打开论文质量中心",
          hint: "完整查重与四维度审查页 /plagiarism。",
          href: "/plagiarism",
          requiresAuth: false,
        },
      ];
    case 7:
      return [
        {
          id: "fmt-export",
          label: "打开工作台后点顶部「导出」",
          hint: "导出在工作台顶栏下拉：Word / Markdown / PDF。本系统暂无独立「排版」页（Wave 4）。",
          href: workbenchHref(pid, { tab: "structure" }),
          requiresAuth: true,
        },
        {
          id: "fmt-plot",
          label: "补齐配图",
          hint: "投稿前确认图表：/plot。",
          href: `/plot?id=${pid}`,
          requiresAuth: false,
        },
      ];
    default:
      return [];
  }
}

export function resolveJumpHref(href: string, projectId: string | null): string | null {
  if (!href.includes("__PROJECT__")) return href;
  if (!projectId?.trim()) return null;
  return href.replaceAll("__PROJECT__", encodeURIComponent(projectId.trim()));
}
