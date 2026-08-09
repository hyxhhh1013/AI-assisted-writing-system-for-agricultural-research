/**
 * 将 AI 返回的写作蓝图 JSON 纠偏到 writingBlueprintPayloadSchema 可接受的形状。
 * 目标：常见模型偏差不应再落到「写作蓝图结构无效」。
 */

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function coerceInt(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number.parseFloat(v.replace(/,/g, ""));
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return fallback;
}

function coerceLanguage(v: unknown): "zh" | "en" | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().toLowerCase();
  if (t === "zh" || t === "zh-cn" || t === "zh_cn" || t === "chinese" || t === "中文") {
    return "zh";
  }
  if (t === "en" || t === "en-us" || t === "en_us" || t === "english" || t === "英文") {
    return "en";
  }
  return undefined;
}

function coerceProjectMode(v: unknown): "review" | "research" | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().toLowerCase();
  if (
    t === "review"
    || t === "综述"
    || t.includes("literature review")
    || t.includes("综述")
  ) {
    return "review";
  }
  if (
    t === "research"
    || t === "研究"
    || t.includes("imrad")
    || t.includes("原创")
  ) {
    return "research";
  }
  return undefined;
}

function coerceStringArray(v: unknown): string[] {
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    // "a；b" / "a; b" / "a\nb" / 单句
    if (/[；;\n]/.test(s)) {
      return s.split(/[；;\n]/).map((x) => x.trim()).filter(Boolean);
    }
    return [s];
  }
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === "string") return x.trim();
      if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        const text = o.text ?? o.point ?? o.content ?? o.title;
        if (typeof text === "string") return text.trim();
      }
      return String(x ?? "").trim();
    })
    .filter(Boolean);
}

const FIGURE_TYPES = new Set(["flow", "chart", "xrd", "table", "schematic", "other"]);
const DATA_SOURCES = new Set(["experiment", "literature", "synthesis"]);

function coerceDataSource(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().toLowerCase();
  if (DATA_SOURCES.has(t)) return t;
  if (/实验|试验|实测|experiment/.test(t)) return "experiment";
  if (/文献|综述|literature|review/.test(t)) return "literature";
  if (/综合|合成|synthesis|meta/.test(t)) return "synthesis";
  return undefined; // 非法值直接丢弃，避免 zod enum 失败
}

function coerceFigureItem(raw: unknown, index: number): Record<string, unknown> | null {
  const o = asRecord(raw);
  if (!o) return null;
  const typeRaw = String(o.type ?? "other").trim().toLowerCase();
  let type = FIGURE_TYPES.has(typeRaw) ? typeRaw : "";
  if (!type) {
    if (/flow|流程/.test(typeRaw)) type = "flow";
    else if (/chart|图|柱|折线|散点/.test(typeRaw)) type = "chart";
    else if (/xrd/.test(typeRaw)) type = "xrd";
    else if (/table|表/.test(typeRaw)) type = "table";
    else if (/schematic|示意|框架/.test(typeRaw)) type = "schematic";
    else type = "other";
  }
  const priorityRaw = String(o.priority ?? "").trim().toLowerCase();
  const priority =
    priorityRaw === "optional" || priorityRaw === "可选" || priorityRaw === "选配"
      ? "optional"
      : "required";
  const id = String(o.id ?? "").trim() || `fig-${index + 1}`;
  const sectionPath = String(o.sectionPath ?? o.section ?? o.path ?? "").trim();
  const purpose = String(o.purpose ?? o.desc ?? o.description ?? "").trim();
  const suggestedCaption = String(
    o.suggestedCaption ?? o.caption ?? o.title ?? "",
  ).trim();
  if (!sectionPath || !purpose || !suggestedCaption) return null;
  const out: Record<string, unknown> = {
    id,
    sectionPath,
    type,
    purpose,
    suggestedCaption,
    priority,
  };
  const ds = coerceDataSource(o.dataSource);
  if (ds) out.dataSource = ds;
  const binding = asRecord(o.dataBinding);
  if (binding) {
    const kind = String(binding.kind ?? "chartConfig").trim();
    if (kind === "chartConfig") {
      out.dataBinding = {
        kind: "chartConfig",
        chartConfigIndex: coerceInt(
          binding.chartConfigIndex ?? binding.index,
          0,
        ),
        sourceFileName: binding.sourceFileName,
        variable: binding.variable,
        chartTitle: binding.chartTitle,
      };
    }
  }
  return out;
}

function coerceSectionGuide(raw: unknown): Record<string, unknown> | null {
  const o = asRecord(raw);
  if (!o) return null;
  const sectionPath = String(o.sectionPath ?? o.section ?? o.path ?? "").trim();
  const purpose = String(o.purpose ?? o.desc ?? o.description ?? "").trim();
  let keyPoints = coerceStringArray(o.keyPoints ?? o.points ?? o.bullets);
  if (keyPoints.length === 0 && purpose) keyPoints = [purpose];
  if (!sectionPath || !purpose || keyPoints.length === 0) return null;
  const out: Record<string, unknown> = { sectionPath, purpose, keyPoints };
  if (o.estimatedParagraphs !== undefined) {
    const n = coerceInt(o.estimatedParagraphs, 1);
    out.estimatedParagraphs = Math.max(1, n);
  }
  if (o.assignedSources !== undefined) {
    out.assignedSources = coerceStringArray(o.assignedSources);
  }
  for (const k of ["claim", "evidenceHint", "warrant"] as const) {
    if (typeof o[k] === "string" && o[k].trim()) out[k] = o[k].trim();
  }
  const rebuttal = asRecord(o.rebuttal);
  if (rebuttal) {
    const objection = String(rebuttal.objection ?? "").trim();
    const response = String(rebuttal.response ?? rebuttal.answer ?? "").trim();
    if (objection && response) out.rebuttal = { objection, response };
  }
  return out;
}

function coerceEstimatedWordCount(raw: unknown): { min: number; max: number } | undefined {
  const o = asRecord(raw);
  if (o) {
    return {
      min: coerceInt(o.min ?? o.low ?? o.from, 0),
      max: coerceInt(o.max ?? o.high ?? o.to, 0),
    };
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.trunc(raw);
    return { min: n, max: n };
  }
  if (typeof raw === "string") {
    const m = raw.match(/(\d[\d,]*)\s*[-–—~至到]\s*(\d[\d,]*)/);
    if (m) {
      return { min: coerceInt(m[1], 0), max: coerceInt(m[2], 0) };
    }
    const n = coerceInt(raw, 0);
    if (n > 0) return { min: n, max: n };
  }
  return undefined;
}

function ensureMinItems(
  items: Record<string, unknown>[],
  guides: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (items.length > 0) return items;
  const path = String(guides[0]?.sectionPath ?? "全文").trim() || "全文";
  return [
    {
      id: "fig-1",
      sectionPath: path,
      type: "schematic",
      purpose: "全文结构示意（自动补全，可在蓝图中修改）",
      suggestedCaption: "图1 论文结构示意",
      priority: "optional",
      dataSource: "synthesis",
    },
  ];
}

function ensureMinGuides(
  guides: Record<string, unknown>[],
  writingOrder: string[],
): Record<string, unknown>[] {
  if (guides.length > 0) return guides;
  const paths = writingOrder.length > 0 ? writingOrder : ["引言", "主体", "结论"];
  return paths.slice(0, 3).map((sectionPath) => ({
    sectionPath,
    purpose: `撰写「${sectionPath}」`,
    keyPoints: [`围绕「${sectionPath}」展开论述`],
  }));
}

/** 纠偏 AI JSON；尽量产出 zod 可通过的最小合法蓝图 */
export function coerceWritingBlueprintPayload(raw: unknown): unknown {
  const o = asRecord(raw);
  if (!o) return raw;

  const next: Record<string, unknown> = { ...o };

  // version：缺省 / "1" / 1.0 → 1
  if (
    next.version === undefined
    || next.version === null
    || next.version === "1"
    || next.version === 1.0
    || (typeof next.version === "string" && Number.parseInt(next.version, 10) === 1)
  ) {
    next.version = 1;
  }

  const lang = coerceLanguage(next.language);
  if (lang) next.language = lang;
  else if (next.language !== undefined && next.language !== "zh" && next.language !== "en") {
    delete next.language;
  }

  const mode = coerceProjectMode(next.projectMode);
  if (mode) next.projectMode = mode;
  else if (next.projectMode !== undefined && next.projectMode !== "review" && next.projectMode !== "research") {
    delete next.projectMode;
  }

  if (typeof next.narrativeSummary !== "string" || !next.narrativeSummary.trim()) {
    next.narrativeSummary =
      typeof next.summary === "string" && next.summary.trim()
        ? next.summary.trim()
        : "（模型未返回叙事摘要，请在蓝图中补充）";
  } else {
    next.narrativeSummary = next.narrativeSummary.trim();
  }

  if (typeof next.thesis !== "string" || !next.thesis.trim()) {
    next.thesis =
      typeof next.centralThesis === "string" && next.centralThesis.trim()
        ? next.centralThesis.trim()
        : "（模型未返回核心论点，请在蓝图中补充）";
  } else {
    next.thesis = next.thesis.trim();
  }

  const ewc = coerceEstimatedWordCount(next.estimatedWordCount) ?? {
    min: 6000,
    max: 10000,
  };
  next.estimatedWordCount =
    ewc.max < ewc.min ? { min: ewc.max, max: ewc.min } : ewc;

  let writingOrder = coerceStringArray(next.writingOrder);
  const prerequisites = coerceStringArray(next.prerequisites);

  let guides = Array.isArray(next.sectionGuides)
    ? next.sectionGuides
        .map(coerceSectionGuide)
        .filter((x): x is Record<string, unknown> => x !== null)
    : [];
  guides = ensureMinGuides(guides, writingOrder);

  if (writingOrder.length === 0) {
    writingOrder = guides.map((g) => String(g.sectionPath));
  }

  const fp = asRecord(next.figurePlan) ?? {};
  let items = Array.isArray(fp.items)
    ? fp.items
        .map((item, i) => coerceFigureItem(item, i))
        .filter((x): x is Record<string, unknown> => x !== null)
    : [];
  items = ensureMinItems(items, guides);

  next.figurePlan = {
    totalMin: coerceInt(fp.totalMin, Math.min(1, items.length)),
    totalMax: coerceInt(fp.totalMax, Math.max(items.length, 1)),
    items,
  };
  const fpOut = next.figurePlan as {
    totalMin: number;
    totalMax: number;
    items: unknown[];
  };
  if (fpOut.totalMax < fpOut.totalMin) {
    fpOut.totalMax = fpOut.totalMin;
  }

  next.sectionGuides = guides;
  next.writingOrder = writingOrder;
  next.prerequisites = prerequisites;

  if (next.argumentGaps !== undefined) {
    next.argumentGaps = coerceStringArray(next.argumentGaps);
  }

  if (typeof next.researchQuestion === "string") {
    next.researchQuestion = next.researchQuestion.trim();
  } else if (next.researchQuestion != null) {
    delete next.researchQuestion;
  }

  if (typeof next.generatedAt === "string" || typeof next.generatedAt === "number") {
    next.generatedAt = coerceInt(next.generatedAt, 0);
  } else if (next.generatedAt != null) {
    next.generatedAt = 0;
  }

  return next;
}

/** 把 zod flatten 压成短错误文案（给 toast / Agent） */
export function formatBlueprintValidationError(
  issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>,
  max = 3,
): string {
  const parts = issues.slice(0, max).map((i) => {
    const path = i.path.length > 0 ? i.path.map(String).join(".") : "(root)";
    return `${path}: ${i.message}`;
  });
  const more = issues.length > max ? ` 等 ${issues.length} 项` : "";
  return `写作蓝图结构无效（${parts.join("；")}${more}）`;
}
