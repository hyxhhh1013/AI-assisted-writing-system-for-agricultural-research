import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { IMRAD_LABELS_ZH, IMRAD_ORDER } from "@/lib/imrad"
import { REVIEW_ORDER } from "@/lib/review-structure"
import type { ProjectWritingMode } from "@/contracts/writing-mode"
import type { WritingBlueprint } from "@/contracts/writing-blueprint"
import { formatBlueprintSectionHint } from "@/lib/blueprint-utils"

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
  sectionKey: string;
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

const REVIEW_KEYWORDS: { key: string; patterns: RegExp[] }[] = [
  { key: "abstract", patterns: [/摘要/i, /abstract/i] },
  {
    key: "introduction",
    patterns: [
      /引言/i, /introduction/i, /前言/i, /背景与意义/i, /研究意义/i,
      /综述目的/i, /文章结构/i, /综述范围/i, /综述必要性/i,
    ],
  },
  {
    key: "background",
    patterns: [
      /研究现状/i, /现状与问题/i, /概念/i, /问题框架/i, /background/i,
      /领域背景/i, /发展概况/i, /分布特征/i, /概念界定/i,
      /研究对象/i, /分类体系/i, /主要问题/i, /瓶颈/i, /约束/i,
      /国内外研究/i, /研究脉络/i, /发展阶段/i, /研究历程/i,
    ],
  },
  {
    key: "literature_body",
    patterns: [
      /进展综述/i, /研究进展/i, /文献综述/i, /literature review/i,
      /主题/i, /争议/i, /综合/i, /对比/i, /比较/i,
      /机制/i, /机理/i, /影响因素/i, /调控/i, /优化/i,
      /制备/i, /合成/i, /表征/i, /性能/i, /评价/i,
      /方法.*综述/i, /应用.*进展/i, /技术.*进展/i,
      /土壤/i, /作物/i, /生物/i, /化学/i, /物理/i,
      /效应/i, /作用/i, /影响.*研究/i, /改良/i, /修复/i,
    ],
  },
  {
    key: "conclusion",
    patterns: [
      /结论/i, /展望/i, /conclusion/i, /未来方向/i, /研究空白/i,
      /启示/i, /建议/i, /对策/i, /思路/i, /前沿/i, /趋势/i,
    ],
  },
];

/** 从大纲路径提取主编号（如 "2.1" → 2，"1. 研究现状" → 1） */
function extractMajorNumber(titleOrPath: string): number | null {
  // 路径格式 "> " 分隔 → 取第一段的编号
  const firstSegment = titleOrPath.split(">")[0]?.trim() || titleOrPath;
  const m = firstSegment.match(/^(\d+)[.\s]/);
  return m ? Number(m[1]) : null;
}

/** 将大纲标题映射到 IMRaD 节 key（研究论文） */
export function mapToIMRADSection(titleOrPath: string): string {
  const lower = titleOrPath.toLowerCase();
  for (const group of IMRAD_KEYWORDS) {
    for (const pat of group.patterns) {
      if (pat.test(lower)) return group.key;
    }
  }
  return "introduction";
}

/**
 * 按项目写作模式映射大纲标题到 section key。
 *
 * 综述模式映射规则（优先级递减）：
 * 1. 关键字匹配（REVIEW_KEYWORDS）
 * 2. IMRaD 弱匹配（仅 introduction/conclusion）
 * 3. 路径编号推断（1→introduction, 2→background, 3→literature_body, 4→conclusion）
 * 4. 兜底：literature_body（综述核心章节），而非 introduction
 */
export function mapToSectionForMode(
  titleOrPath: string,
  mode?: ProjectWritingMode,
): string {
  if (mode === "research") return mapToIMRADSection(titleOrPath);

  const lower = titleOrPath.toLowerCase();

  // 1. 综述关键字匹配
  for (const group of REVIEW_KEYWORDS) {
    for (const pat of group.patterns) {
      if (pat.test(lower)) return group.key;
    }
  }

  // 2. IMRaD 弱匹配（仅 introduction/conclusion）
  for (const key of ["introduction", "conclusion"] as const) {
    const group = IMRAD_KEYWORDS.find((g) => g.key === key);
    if (!group) continue;
    for (const pat of group.patterns) {
      if (pat.test(lower)) return group.key;
    }
  }

  // 3. 路径编号推断（综述 5 段式：abstract=0, intro=1, background=2, body=3, conclusion=4）
  const major = extractMajorNumber(titleOrPath);
  if (major != null) {
    if (major === 0 || major === 1) return "introduction";
    if (major === 2) return "background";
    if (major === 3) return "literature_body";
    if (major >= 4) return "conclusion";
  }

  // 4. 兜底：综述主体章节
  return "literature_body";
}

// ==================== Expansion Context Builder ====================

/** 按章节扩写完成后，应标记为已完成的大纲任务 id（含同级子节） */
export function getOutlineTaskIdsForSectionCompletion(
  outlineTasks: OutlineTask[],
  targetSectionKey: string,
  selectedSectionId?: string,
): string[] {
  const ids = outlineTasks.filter((t) => t.sectionKey === targetSectionKey).map((t) => t.id);
  if (ids.length > 0) return ids;
  return selectedSectionId ? [selectedSectionId] : [];
}

const OUTLINE_EXCERPT_MAX = 1000;

/** 提取与当前任务所属一级章节相关的完整大纲片段（非全文前 N 字） */
export function buildOutlineExcerptForSection(
  section: OutlineSection,
  allSections: OutlineSection[],
): string {
  if (allSections.length === 0) return "";

  const formatBlock = (s: OutlineSection): string => {
    const heading = `${"#".repeat(Math.min(Math.max(s.level, 1), 6))} ${s.title}`;
    const body = s.content.trim();
    return body ? `${heading}\n${body}` : heading;
  };

  // 子节任务：只展示同父路径下的兄弟子节要点，避免整章 dump
  if (section.level > 1) {
    const parentPath = section.fullPath.split(" > ").slice(0, -1).join(" > ");
    const chapterRoot = section.fullPath.split(" > ")[0];
    const peerSections = allSections.filter((s) => {
      const sParent = s.fullPath.split(" > ").slice(0, -1).join(" > ");
      return sParent === parentPath;
    });
    let body = peerSections.map(formatBlock).join("\n\n");
    body = `【「${chapterRoot}」相关子节】\n${body}`;
    if (body.length > OUTLINE_EXCERPT_MAX) {
      return `${body.slice(0, OUTLINE_EXCERPT_MAX)}\n…（已截断）`;
    }
    return body;
  }

  const chapterRoot = section.fullPath.split(" > ")[0];
  const inChapter = allSections.filter(
    (s) => s.fullPath === chapterRoot || s.fullPath.startsWith(`${chapterRoot} > `),
  );

  let body = inChapter.map(formatBlock).join("\n\n");

  const peerTitles = allSections
    .filter((s) => s.level === 1 && s.fullPath !== chapterRoot)
    .map((s) => s.title);

  if (peerTitles.length > 0) {
    body =
      `【其他章节目录】${peerTitles.join("、")}\n\n` +
      `【「${chapterRoot}」章节大纲（含子节要点）】\n${body}`;
  }

  if (body.length > OUTLINE_EXCERPT_MAX) {
    return `${body.slice(0, OUTLINE_EXCERPT_MAX)}\n…（本章节大纲较长，已截断尾部）`;
  }
  return body;
}

/**
 * 为目标子节构建精准的扩写上下文，彻底替代"把整个大纲 dump 进去"的做法
 */
export function buildExpansionContext(
  section: OutlineSection,
  allSections: OutlineSection[],
  outlineText?: string,
  mode?: ProjectWritingMode,
  blueprint?: WritingBlueprint | null,
): string {
  const parentKey = mapToSectionForMode(section.fullPath, mode);
  const parentLabel = IMRAD_LABELS[parentKey] || REVIEW_LABELS[parentKey] || parentKey;

  // 找到同级兄弟子节（同父路径下 level 相同的章节）
  const parentPath = section.fullPath.split(" > ").slice(0, -1).join(" > ");
  const siblings = allSections.filter((s) => {
    const sParent = s.fullPath.split(" > ").slice(0, -1).join(" > ");
    return sParent === parentPath && s.id !== section.id;
  });

  let ctx = `【扩写目标子节】：${section.fullPath}
【所属章节】：${parentLabel}
`;

  if (section.content.trim()) {
    ctx += `【子节要点】：${section.content.trim()}\n`;
  }

  if (siblings.length > 0) {
    ctx += `【同级子节（保持逻辑衔接）】：${siblings.map((s) => s.title).join("、")}\n`;
  }

  if (outlineText?.trim()) {
    const excerpt =
      allSections.length > 0
        ? buildOutlineExcerptForSection(section, allSections)
        : outlineText.replace(/\n{3,}/g, "\n\n").slice(0, 800);
    if (excerpt.trim()) {
      ctx += `\n【论文大纲概览】：\n${excerpt}\n`;
    }
  }

  ctx += `\n【写作要求】：请针对「${section.title}」这一具体主题展开专业、深入的学术论述。结合文献库中的相关研究，遵循学术论文写作规范。`;

  if (blueprint) {
    const hint = formatBlueprintSectionHint(blueprint, section.fullPath);
    if (hint) ctx += `\n${hint}`;
  }

  return ctx;
}

const IMRAD_LABELS: Record<string, string> = IMRAD_LABELS_ZH;

const REVIEW_LABELS: Record<string, string> = {
  background: "研究现状与问题",
  literature_body: "研究进展综述",
};

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
    const cleanLine = trimmed
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
        id: stableHash(`${pathStack.map((p) => p.title).join(" > ")}#${sections.length}`),
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
        id: stableHash(`${firstLine || `para-${i}`}#${i}`),
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
export function buildOutlineTasks(
  outlineText: string,
  mode?: ProjectWritingMode,
): OutlineTask[] {
  const sections = parseOutline(outlineText);
  return sections.map((s) => ({
    id: s.id,
    title: s.title,
    sectionKey: mapToSectionForMode(s.fullPath, mode),
    level: s.level,
    fullPath: s.fullPath,
    content: s.content,
  }));
}

/** 论文章节的标准顺序（用于跨章节图表全局编号） */
export const SECTION_ORDER: Record<string, number> = {
  ...IMRAD_ORDER,
  ...REVIEW_ORDER,
};

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
  // Verifier 审稿备注（以审稿特征词开头的句子）
  t = t.replace(
    /(?:需要注意的是，|若需确证|应在后续修改中|需在后续修改中|此处应|建议在后续)\s*[^。；\n]{10,}[。；]/g,
    ""
  );
  // 未渲染的 FIGURE 标记 + 插图占位
  t = t.replace(/【FIGURE:\{[^】]*\}】/g, "");
  t = t.replace(/【插[图画]占[位位]：[^】]*】/g, "");
  t = t.replace(/（待补充数据）/g, "");
  // 【】占位符清理（请填写、待补充、待确认等）
  t = t.replace(/【[^】]*(?:请填写|待补充|待确认|待完善|请补充|TODO|TBD)[^】]*】/g, "");
  // GFM 删除线语法（~~text~~）→ 只保留文字
  t = t.replace(/~~([^~]+)~~/g, "$1");
  // em dash 替换为逗号（中文语境用全角逗号）
  t = t.replace(/—/g, "，");
  t = t.replace(/–/g, "，");
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
