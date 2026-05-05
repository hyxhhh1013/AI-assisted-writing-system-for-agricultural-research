import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface OutlineSection {
  id: string;
  title: string;
  level: number;
  content: string;
  fullPath: string; // 完整路径，如 "2. 结果与讨论 > 2.1 数据分析"
}

/**
 * 解析 Markdown 大纲为结构化的章节列表
 * 更加鲁棒的解析逻辑，处理各种 AI 可能生成的 Markdown 格式
 */
export function parseOutline(markdown: string): OutlineSection[] {
  if (!markdown) return [];

  const lines = markdown.split("\n");
  const sections: OutlineSection[] = [];
  const pathStack: { title: string; level: number }[] = [];

  let currentSection: OutlineSection | null = null;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // 1. 预处理：去除常见的列表符号和加粗符号
    // 例如 "* **1.1 引言**" -> "1.1 引言"
    let cleanLine = trimmed
      .replace(/^[\*\-\+]\s+/, "") // 去除列表符号
      .replace(/\*\*/g, "")        // 去除加粗
      .trim();

    // 2. 识别标题 (支持 # 或 数字编号)
    // 匹配 # 系列
    const hashMatch = cleanLine.match(/^(#{1,6})\s+(.*)$/);
    // 匹配数字系列 (支持 1., 1.1, 1 Introduction, 一、, (1) 等)
    const numMatch = cleanLine.match(/^(\(?[\d\.]+\)?|[\d\.]+|[一二三四五六七八九十]+[\.、\s])\s*(.*)$/);
    
    if (hashMatch || numMatch) {
      // 如果标题行没有实际内容（只有编号），尝试合并下一行
      let title = hashMatch ? hashMatch[2] : numMatch![2];
      if (!title && lines[index + 1]) {
        title = lines[index + 1].trim();
      }

      // 如果之前有正在处理的章节，保存它
      if (currentSection) {
        sections.push(currentSection);
      }

      let level = 1;

      if (hashMatch) {
        level = hashMatch[1].length;
      } else if (numMatch) {
        const marker = numMatch[1];
        
        // 估算层级：根据点号数量或缩进
        const dotCount = marker.split(".").filter(Boolean).length;
        level = dotCount > 0 ? dotCount : 1;
        
        // 特殊处理
        if (marker.includes("、")) level = 1;
        if (marker.startsWith("(")) level += 1; 
      }

      // 维护路径栈，确保 fullPath 准确
      while (pathStack.length > 0 && pathStack[pathStack.length - 1].level >= level) {
        pathStack.pop();
      }
      pathStack.push({ title, level });

      currentSection = {
        id: `section-${index}-${Math.random().toString(36).substr(2, 9)}`,
        title,
        level,
        content: "",
        fullPath: pathStack.map(p => p.title).join(" > ")
      };
    } else if (currentSection) {
      // 累加非标题行作为该章节的内容描述
      currentSection.content += (currentSection.content ? "\n" : "") + trimmed;
    }
  });

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}
