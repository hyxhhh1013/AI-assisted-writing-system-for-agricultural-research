/**
 * 写作模式视觉 token — 项目中心与工作台共用
 * review → 蓝；research → 绿
 */

import type { ProjectWritingMode } from "@/contracts/writing-mode";
import { siteTheme } from "@/lib/site-theme";

export interface ModeAccent {
  /** 主色 hex */
  primary: string;
  primaryHover: string;
  /** Tailwind 工具类 */
  iconBg: string;
  iconText: string;
  badge: string;
  borderLeft: string;
  progress: string;
  activeTab: string;
  sectionActive: string;
  headerTint: string;
  borderTint: string;
  ring: string;
  btnPrimary: string;
}

const RESEARCH_ACCENT: ModeAccent = {
  primary: siteTheme.primary,
  primaryHover: "#144228",
  iconBg: "bg-[#1a5632]/10",
  iconText: "text-[#1a5632]",
  badge: "bg-[#1a5632]/10 text-[#1a5632]",
  borderLeft: "border-l-[#1a5632]",
  progress: "bg-[#1a5632]",
  activeTab: "bg-[#1a5632] text-white hover:bg-[#144228]",
  sectionActive: "bg-[#1a5632] text-white shadow-sm",
  headerTint: "bg-[#1a5632]/[0.04]",
  borderTint: "border-[#1a5632]/10",
  ring: "ring-[#1a5632]/30",
  btnPrimary: siteTheme.btnPrimary,
};

const REVIEW_ACCENT: ModeAccent = {
  primary: "#2563eb",
  primaryHover: "#1d4ed8",
  iconBg: "bg-[#2563eb]/10",
  iconText: "text-[#2563eb]",
  badge: "bg-[#2563eb]/10 text-[#1d4ed8]",
  borderLeft: "border-l-[#2563eb]",
  progress: "bg-[#2563eb]",
  activeTab: "bg-[#2563eb] text-white hover:bg-[#1d4ed8]",
  sectionActive: "bg-[#2563eb] text-white shadow-sm",
  headerTint: "bg-[#2563eb]/[0.04]",
  borderTint: "border-[#2563eb]/10",
  ring: "ring-[#2563eb]/30",
  btnPrimary: "bg-[#2563eb] text-white hover:bg-[#1d4ed8]",
};

export function getModeAccent(mode: ProjectWritingMode | undefined): ModeAccent {
  return mode === "research" ? RESEARCH_ACCENT : REVIEW_ACCENT;
}

export function getStructurePanelTitle(mode: ProjectWritingMode | undefined): string {
  return mode === "research" ? "IMRaD 章节" : "综述章节";
}

export function getStructurePanelHint(mode: ProjectWritingMode | undefined): string {
  return mode === "research"
    ? "与「论证提纲」并列：此处管五段正文；Outline 页管 AI 目录树。"
    : "与「论证提纲」并列：此处管综述五章正文；Outline 页管 AI 目录树。";
}

export function getStructureTabTooltip(mode: ProjectWritingMode | undefined): string {
  return mode === "research"
    ? "IMRaD 章节：摘要 / 引言 / 方法 / 结果 / 结论"
    : "综述章节：摘要 / 引言 / 背景 / 文献综述 / 结论";
}

export function getOutlineTabTooltip(mode: ProjectWritingMode | undefined): string {
  return mode === "research"
    ? "论证提纲：AI 生成目录树（与左侧 IMRaD 并列，非同一套）"
    : "论证提纲：AI 生成综述目录树（与左侧章节并列，非同一套）";
}
