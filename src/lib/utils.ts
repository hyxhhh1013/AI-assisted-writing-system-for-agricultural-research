import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { IMRAD_LABELS_ZH, IMRAD_ORDER } from "@/lib/imrad"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ==================== Outline Types ====================

export interface OutlineSection {
  id: string;
  title: string;
  level: number;
  content: string;
  fullPath: string; // 完整路径，如 "结果与讨论 > 温度对产率的影响"
}

export interface OutlineTask {
  id: string;
  title: string;
  sectionKey: string;  // IMRaD key: abstract | introduction | methods | results | conclusion
  level: number;
  fullPath: string;
  content: string;
}

// ==================== IMRaD Mapping ====================

const IMRAD_KEYWORDS: { key: string; patterns: RegExp[] }[] = [
  {
    key: "abstract",
    patterns: [/摘要/i, /abstract/i],
  },
  {
    key: "introduction",
    patterns: [/引言/i, /introduction/i, /前言/i, /背景/i, /前言/i],
  },
  {
    key: "methods",
    patterns: [/方法/i, /method/i, /材料/i, /material/i, /实验[设计方案]/i, /制备/i, /合成/i, /表征/i, /实验部分/i],
  },
  {
    key: "results",
    patterns: [/结果/i, /讨论/i, /result/i, /discussion/i, /分析/i, /性能/i, /影响/i, /机理/i, /优化/i],
  },
  {
    key: "conclusion",
    patterns: [/结论/i, /conclusion/i, /总结/i, /展望/i, /创新点/i, /贡献/i],
  },
];

/** 将大纲标题映射到 IMRaD 节 key */
export function mapToIMRADSection(titleOrPath: string): string {
  const lower = titleOrPath.toLowerCase();
  for (const group of IMRAD_KEYWORDS) {
    for (const pat of group.patterns) {
      if (pat.test(lower)) return group.key;
    }
  }
  return "introduction"; // fallback
}

// ==================== Expansion Context Builder ====================

/**
 * 为目标子节构建精准的扩写上下文，彻底替代"把整个大纲 dump 进去"的做法
 */
export function buildExpansionContext(
  section: OutlineSection,
  allSections: OutlineSection[],
  outlineText?: string,
): string {
  const parentKey = mapToIMRADSection(section.fullPath);
  const parentLabel = IMRAD_LABELS[parentKey] || parentKey;

  // 找到同级兄弟子节（同父路径下 level 相同的章节）
  const parentPath = section.fullPath.split(" > ").slice(0, -1).join(" > ");
  const siblings = allSections.filter((s) => {
    const sParent = s.fullPath.split(" > ").slice(0, -1).join(" > ");
    return sParent === parentPath && s.id !== section.id;
  });

  let ctx = `【扩写目标子节】：${section.fullPath}
【所属章节】：${parentLabel}
`;

  if (section.content) {
    ctx += `【子节要点】：${section.content}\n`;
  }

  if (siblings.length > 0) {
    ctx += `【同级子节（保持逻辑衔接）】：${siblings.map((s) => s.title).join("、")}\n`;
  }

  // 附上精简的大纲结构概览（最多 300 字），帮助 AI 理解整体位置
  if (outlineText && outlineText.trim()) {
    const compact = outlineText.replace(/\n{3,}/g, "\n\n").slice(0, 400);
    ctx += `\n【论文大纲概览】：\n${compact}\n`;
  }

  ctx += `\n【写作要求】：请针对「${section.title}」这一具体主题展开专业、深入的学术论述。结合文献库中的相关研究，遵循学术论文写作规范。`;
  return ctx;
}

const IMRAD_LABELS: Record<string, string> = IMRAD_LABELS_ZH;

// ==================== Outline Parser ====================

/**
 * 稳定的短 hash，替代 Math.random() 保证同一大纲项跨解析 ID 不变
 */
function stableHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return "sec-" + Math.abs(h).toString(36);
}

/**
 * 解析 Markdown 大纲为结构化的章节列表
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

    // 1. 预处理
    let cleanLine = trimmed
      .replace(/^[\*\-\+]\s+/, "")
      .replace(/\*\*/g, "")
      .trim();

    // 2. 识别标题
    // 优先：Markdown 标题语法的 #
    const hashMatch = cleanLine.match(/^(#{1,6})\s+(.+)$/);
    // 其次：显式章节编号（1.  / 1.1  / 1.1.1 / (1) / 一、等）
    const numMatch = cleanLine.match(
      /^(\d+(?:\.\d+)*)\s+(.+)$/,
    );
    // 中文编号
    const cnNumMatch = cleanLine.match(
      /^([一二三四五六七八九十]+)[、\.]\s*(.+)$/,
    );
    // 括号编号
    const parenMatch = cleanLine.match(
      /^(\(\d+\))\s+(.+)$/,
    );

    if (hashMatch || numMatch || cnNumMatch || parenMatch) {
      let title = "";
      let level = 1;

      if (hashMatch) {
        title = hashMatch[2];
        level = hashMatch[1].length;
      } else if (numMatch) {
        title = numMatch[2];
        const marker = numMatch[1];
        const dotCount = marker.split(".").filter(Boolean).length;
        level = Math.max(1, dotCount);
      } else if (cnNumMatch) {
        title = cnNumMatch[2];
        level = 1;
      } else if (parenMatch) {
        title = parenMatch[2];
        level = 2;
      }

      // 标题文本太短或太像普通文本 → 跳过（过滤误匹配）
      if (!title || title.length < 2) {
        // 尝试合并下一行
        if (lines[index + 1]) {
          title = lines[index + 1].trim();
          if (title.length < 2) {
            if (currentSection) {
              currentSection.content +=
                (currentSection.content ? "\n" : "") + trimmed;
            }
            return;
          }
        } else {
          if (currentSection) {
            currentSection.content +=
              (currentSection.content ? "\n" : "") + trimmed;
          }
          return;
        }
      }

      if (currentSection) {
        sections.push(currentSection);
      }

      while (
        pathStack.length > 0 &&
        pathStack[pathStack.length - 1].level >= level
      ) {
        pathStack.pop();
      }
      pathStack.push({ title, level });

      currentSection = {
        id: stableHash(pathStack.map((p) => p.title).join(" > ")),
        title,
        level,
        content: "",
        fullPath: pathStack.map((p) => p.title).join(" > "),
      };
    } else if (currentSection) {
      currentSection.content +=
        (currentSection.content ? "\n" : "") + trimmed;
    }
  });

  if (currentSection) {
    sections.push(currentSection);
  }

  // 如果标题解析失败，按空行分段作为降级任务
  if (sections.length === 0 && markdown.trim()) {
    const paragraphs = markdown
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 20);
    paragraphs.forEach((p, i) => {
      const firstLine = p
        .trim()
        .split("\n")[0]
        .replace(/^[#*\-\s]+/, "")
        .slice(0, 60);
      sections.push({
        id: stableHash(firstLine || `para-${i}`),
        title: firstLine || `章节 ${i + 1}`,
        level: 2,
        content: p.trim(),
        fullPath: firstLine || `章节 ${i + 1}`,
      });
    });
  }

  return sections;
}

/** 从解析后的大纲生成 OutlineTask 列表（供 WritingPanel 使用） */
export function buildOutlineTasks(outlineText: string): OutlineTask[] {
  const sections = parseOutline(outlineText);
  return sections.map((s) => ({
    id: s.id,
    title: s.fullPath,
    sectionKey: mapToIMRADSection(s.fullPath),
    level: s.level,
    fullPath: s.fullPath,
    content: s.content,
  }));
}

/** 论文章节的标准顺序（用于跨章节图表全局编号） */
export const SECTION_ORDER: Record<string, number> = IMRAD_ORDER;

function countFiguresInText(text: string): number {
  const imgMatches = text.match(/!\[[^\]]*\]\([^)]+\)/g);
  const figMarkerMatches = text.match(/【FIGURE:/g);
  return (imgMatches?.length || 0) + (figMarkerMatches?.length || 0);
}

/** 统计论文中在指定章节之前的图表数量（按论文章节顺序，非写作顺序） */
export function countProjectFigures(
  project: {
    abstract?: string;
    sections?: Record<string, string | undefined>;
  },
  beforeSection?: string,
): number {
  const order = beforeSection ? (SECTION_ORDER[beforeSection] ?? 999) : 999;

  // 统计当前章节之前所有 section 的图表数
  const texts: string[] = [];
  if (order > SECTION_ORDER.abstract) texts.push(project.abstract || "");
  for (const [key, content] of Object.entries(project.sections || {})) {
    if ((SECTION_ORDER[key] ?? 999) < order && content) {
      texts.push(content);
    }
  }
  const beforeCount = countFiguresInText(texts.join("\n"));

  // 统计除当前章节外所有 section 的图表数（防止写 out-of-order 时编号重叠）
  const otherTexts: string[] = [];
  if (beforeSection !== "abstract") otherTexts.push(project.abstract || "");
  for (const [key, content] of Object.entries(project.sections || {})) {
    if (key !== beforeSection && content) {
      otherTexts.push(content);
    }
  }
  const otherCount = countFiguresInText(otherTexts.join("\n"));

  // 取两者中较大值：既尊重论文顺序，又确保不和其他已有章节编号重叠
  return Math.max(beforeCount, otherCount);
}

// ==================== Content Cleanup ====================

/**
 * 清理 AI 生成的草稿痕迹：
 * - 系统生成的插图占位提示语
 * - 未渲染的 LaTeX 标记碎片
 * - "Lab Member" 等占位署名
 */
export function cleanDraftArtifacts(text: string): string {
  let cleaned = text;
  // 移除系统生成的插图占位提示（含多行变体）
  cleaned = cleaned.replace(
    />\s*📊\s*\*?\*?建议插图\*?\*?[：:][^>\n]*(?:\([^)]*此处为系统[^)]*\))?\s*\n?/g,
    ""
  );
  cleaned = cleaned.replace(
    />\s*\*[^*]*此处为系统根据上下文自动标记[^*]*\*\s*\n?/g,
    ""
  );
  cleaned = cleaned.replace(
    />\s*\*[^*]*请提供数据后点击重新生成[^*]*\*\s*\n?/g,
    ""
  );
  // 清理纯占位署名
  cleaned = cleaned.replace(/\bLab\s*Member\b/gi, "【作者信息待填写】");
  cleaned = cleaned.replace(/【请填写作者姓名】/g, "【作者信息待填写】");
  return cleaned;
}

/**
 * 清理 Markdown 残余语法和系统标记，确保输出文本干净。
 * 用于 PDF/DOCX 导出前的最终文本处理。
 */
export function cleanMarkdownArtifacts(text: string): string {
  let t = text;
  // blockquote 残余（> 开头的行）
  t = t.replace(/^>\s*/gm, "");
  // 图表 emoji 残余（📊 📈 📉）
  t = t.replace(/[📊📈📉]\s*/g, "");
  // 系统占位符
  t = t.replace(/\[引用\?\]/g, "");
  return t;
}

/**
 * 检测并移除重复段落。
 * 将文本按双换行分段，段落长度 > minChars 才参与去重。
 * 保留第一次出现，后续相同/高度相似的段落被移除。
 */
export function deduplicateParagraphs(text: string, minChars = 60): string {
  const paragraphs = text.split(/\n\n+/);
  const seen: { text: string; normalized: string }[] = [];
  const result: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length < minChars) {
      result.push(para);
      continue;
    }
    // 规范化用于比较：去空白、去标点、小写
    const normalized = trimmed
      .replace(/\s+/g, " ")
      .replace(/[，,。\.！!？?：:；;、""''（）()【】\[\]{}#\*\-–—]/g, "")
      .toLowerCase();

    // 检查是否与已有段落相似（完全相同或高度重叠 > 80%）
    let isDuplicate = false;
    for (const s of seen) {
      if (normalized === s.normalized) { isDuplicate = true; break; }
      // 长段落做包含检测
      if (normalized.length > 120 && s.normalized.length > 120) {
        const overlap = longestCommonSubstring(normalized, s.normalized);
        if (overlap.length > normalized.length * 0.8 || overlap.length > s.normalized.length * 0.8) {
          isDuplicate = true;
          break;
        }
      }
    }
    if (isDuplicate) continue;
    seen.push({ text: trimmed, normalized });
    result.push(para);
  }
  return result.join("\n\n");
}

function longestCommonSubstring(a: string, b: string): string {
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let maxLen = 0;
  let endIdx = 0;
  // 动态规划，但只保留两行节省内存
  let prev = new Uint16Array(shorter.length + 1);
  let curr = new Uint16Array(shorter.length + 1);
  for (let i = 0; i < longer.length; i++) {
    for (let j = 0; j < shorter.length; j++) {
      if (longer[i] === shorter[j]) {
        curr[j + 1] = prev[j] + 1;
        if (curr[j + 1] > maxLen) {
          maxLen = curr[j + 1];
          endIdx = i + 1;
        }
      } else {
        curr[j + 1] = 0;
      }
    }
    [prev, curr] = [curr, prev];
  }
  return longer.slice(endIdx - maxLen, endIdx);
}
