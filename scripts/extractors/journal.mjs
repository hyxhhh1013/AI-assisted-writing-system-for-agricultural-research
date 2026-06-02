/**
 * 期刊论文元数据抓取器
 * 三层兜底策略：
 *   1. PDF XMP/Info 元数据（精确）
 *   2. 文件名规律解析（快速）
 *   3. 首页正文正则提取（模糊 + CNKI增强）
 */

/** 从 PDF pdfjs document 的 Info 字典读元数据 */
export async function extractFromPdfInfo(pdfDocument) {
  try {
    const meta = await pdfDocument.getMetadata();
    const info = meta?.info || {};
    const result = {};
    if (info.Title && typeof info.Title === "string" && info.Title.trim().length > 3) {
      result.title = info.Title.trim();
    }
    if (info.Author && typeof info.Author === "string") {
      result.authors = splitAuthors(info.Author);
    }
    if (info.Subject && typeof info.Subject === "string" && info.Subject.trim().length > 2) {
      result.journalHint = info.Subject.trim();
    }
    return result;
  } catch {
    return {};
  }
}

// ── 停用词：非人名的英文单词，不应被识别为作者 ────────────────────
// 收录：介词/连词/冠词、学术标题高频词、学科术语、物质名词等
const ENGLISH_STOP_WORDS = new Set([
  // 语法功能词
  "a", "an", "the", "and", "for", "from", "of", "in", "on", "to",
  "by", "with", "or", "as", "at", "its", "via", "per", "not",
  "is", "are", "was", "were", "been", "be", "no",
  "using", "during", "based", "under", "over", "between",
  "into", "after", "before", "against", "toward", "within",
  "through", "without", "above", "below", "along", "among",
  "upon", "near", "onto", "than", "then", "also", "only",
  "due", "due", "more", "less", "such", "may", "can",
  // 学术标题高频词
  "study", "studies", "research", "effect", "effects", "analysis",
  "analyses", "investigation", "comparison", "contribution", "development",
  "influence", "evaluation", "evaluating", "assessment", "review",
  "method", "methods", "methodology", "approach", "approaches",
  "application", "applications", "preparation", "synthesis",
  "characterization", "characterisation", "characterizing",
  "performance", "mechanism", "mechanisms", "behavior", "behaviour",
  "experimental", "theoretical", "numerical", "comparative",
  "synergistic", "formation", "kinetic", "kinetics", "dynamic", "dynamics",
  "thermodynamic", "thermal", "thermochemical", "catalytic",
  "overview", "perspective", "progress", "advances", "advance",
  "understanding", "insight", "insights", "role", "roles",
  "determination", "identification", "quantification",
  "optimization", "optimisation", "optimizing", "optimized",
  "enhanced", "enhancing", "enhancement", "improved", "improving",
  "combined", "integrated", "integrated", "modified", "modification",
  "selected", "different", "various", "novel", "critical",
  "rapid", "fast", "slow", "new", "recent", "current",
  "future", "potential", "promising", "sustainable",
  "comparison", "difference", "correlation",
  "reduction", "reducing", "removal", "removing", "removed",
  "recovery", "recovering", "recovered", "extraction", "extracting",
  "treatment", "treating", "degradation", "degrading",
  "adsorption", "adsorbing", "desorption", "absorption", "absorbing",
  "conversion", "converting", "production", "producing",
  "upgrading", "regeneration", "regenerating",
  "fabrication", "fabricating", "impregnation",
  "stabilization", "stabilisation", "activation",
  "functionalization", "functionalisation", "immobilization",
  // 学科术语/物质名词（几乎不可能是人名）
  "carbon", "biochar", "nitrogen", "phosphorus", "phosphorous",
  "sulfur", "sulphur", "oxygen", "hydrogen", "potassium",
  "calcium", "magnesium", "sodium", "aluminum", "aluminium",
  "silicon", "iron", "copper", "zinc", "nickel", "cobalt",
  "manganese", "cadmium", "chromium", "lead", "mercury",
  "arsenic", "selenium", "boron", "chlorine", "fluorine",
  "biomass", "biofuel", "biochar", "biodiesel", "biogas",
  "cellulose", "lignin", "hemicellulose", "chitosan", "starch",
  "lignocellulosic", "lignocellulose", "feedstock",
  "waste", "wastes", "sludge", "manure", "sewage", "compost",
  "straw", "sawdust", "wood", "bark", "husk", "shell", "fiber",
  "soil", "soils", "sediment", "sand", "clay", "zeolite",
  "water", "aqueous", "solution", "solutions",
  "catalyst", "catalysts", "catalysis", "catalytic",
  "acid", "acids", "base", "bases", "alkali", "alkaline",
  "oxide", "oxides", "hydroxide", "salt", "salts",
  "phosphate", "nitrate", "nitrite", "sulfate", "ammonium",
  "ion", "ions", "metal", "metals", "heavy", "organic",
  "inorganic", "polymer", "polymers", "composite", "composites",
  "nanoparticle", "nanoparticles", "nanotube", "nanotubes",
  "nanocomposite", "nanocomposites", "nanomaterial", "nanomaterials",
  "molecule", "molecules", "compound", "compounds", "element",
  "pyrolysis", "pyrolytic", "pyrolyze", "pyrolyzing",
  "combustion", "gasification", "oxidation", "reduction",
  "decomposition", "decomposing", "hydrolysis", "condensation",
  "polymerization", "crosslinking", "esterification",
  "transesterification", "fermentation", "digestion",
  "flavor", "flavour", "aroma", "taste", "quality",
  "dna", "rna", "protein", "enzyme", "amino",
  "temperature", "pressure", "heating", "cooling", "drying",
  "size", "surface", "porous", "porosity", "pore", "morphology",
  "structure", "structures", "structural", "microstructure",
  "composition", "compositions", "component", "components",
  "property", "properties", "characteristic", "characteristics",
  "parameter", "parameters", "factor", "factors", "variable",
  "condition", "conditions", "process", "processing",
  "ratio", "yield", "content", "loading", "capacity",
  "efficiency", "efficient", "activity", "stability",
  "resistance", "durability", "reactivity", "selectivity",
  "emission", "emissions", "pollutant", "pollutants",
  "plant", "plants", "crop", "crops", "seed", "seeds",
  "root", "roots", "leaf", "leaves", "stem", "stems",
  "fruit", "grain", "yield", "rice", "wheat", "maize",
  "tea", "coffee", "tobacco", "cotton", "soybean",
  "vegetable", "fertilizer", "fertilisers", "pesticide",
  "insecticide", "herbicide", "fungicide",
  "growth", "uptake", "accumulation", "translocation",
  "transformation", "metabolism", "biosynthesis",
  "senescence", "respiration", "photosynthesis",
  "germination", "flowering", "ripening",
  "china", "chinese", "india", "indian", "american",
  "technolog", "engineering", "science", "sciences",
  "chemistry", "chemical", "physics", "physical",
  "biology", "biological", "biochemistry", "biochemical",
  "agriculture", "agricultural", "environment", "environmental",
  "ecology", "ecological", "energy", "energetic",
  "material", "materials", "fuel", "fuels",
  "oil", "gas", "coal", "char", "charcoal", "ash",
  "report", "note", "communication", "letter",
  "part", "chapter", "section", "supplementary",
  "supplement", "appendix", "supporting", "additional",
  "abstract", "introduction", "conclusions", "references",
  "acknowledgements", "acknowledgment",
  "sinensis", "sativus", "vulgaris", "oleracea", "indica",
  "japonica", "esculenta", "domestica", "officinalis",
  "camellia", "brassica", "arabidopsis", "nicotiana",
  "saccharomyces", "escherichia", "bacillus", "pseudomonas",
  "loss", "low", "high", "large", "small", "total",
  "single", "double", "multiple", "mixed",
  "pure", "raw", "natural", "synthetic", "artificial",
  "complex", "simple", "main", "major", "minor",
  "direct", "indirect", "significant", "insignificant",
  "positive", "negative", "effective", "ineffective",
  "acid", "fatty", "volatile", "essential",
  "saw", "dust", "co", "pre", "post", "non", "sub",
  "micro", "macro", "nano", "ultra", "meso",
  "multi", "inter", "intra", "extra", "endo", "exo",
  "initial", "final", "first", "second", "third",
  "primary", "secondary", "tertiary",
  "common", "uncommon", "typical", "atypical",
  "available", "unavailable", "present", "absent",
  "solid", "liquid", "gaseous", "aqueous", "volatile",
  "green", "blue", "red", "black", "white", "brown",
  "rare", "earth", "light", "heavy", "soft", "hard",
  "hot", "cold", "wet", "dry", "fresh", "aged",
  "top", "bottom", "left", "right", "inner", "outer",
  "whole", "partial", "complete", "incomplete",
  "like", "assisted", "assist", "promoted", "promote",
  "doped", "doping", "derived", "loaded", "coated",
  "supported", "unsupported", "functionalized",
  "pretreated", "posttreated", "treated", "untreated",
  "reduced", "oxidized", "calcined", "sintered",
  "prepared", "synthesized", "fabricated", "processed",
  "obtained", "achieved", "observed", "investigated",
  "studied", "evaluated", "assessed", "tested", "used",
  "applied", "reported", "presented", "described",
  "discussed", "compared", "correlated", "related",
  "powder", "particle", "particles", "granule", "pellet",
  "dust", "film", "coating", "membrane", "layer",
  "foam", "gel", "aerogel", "hydrogel", "xerogel",
  "plastic", "rubber", "resin", "wax", "tar", "pitch",
  "tire", "tires", "tyre", "tyres",
  "straw", "straws", "stalk", "stalks", "husk", "husks",
  "shell", "shells", "peel", "peels", "seed", "seeds",
  "bark", "leaf", "leaves", "needle", "needles",
  "cone", "cones", "flower", "flowers", "fruit",
  "vegetable", "vegetables", "herb", "herbs",
  "twig", "twigs", "branch", "branches", "trunk",
  "wood", "wooden", "timber", "lumber", "log", "logs",
  "pine", "oak", "maple", "birch", "spruce", "fir",
  "cedar", "bamboo", "willow", "poplar", "eucalyptus",
  "palm", "coconut", "olive", "corn", "sugarcane",
  "sorghum", "miscanthus", "switchgrass",
  "time", "temperature", "rate", "ratio", "concentration",
  "dose", "dosage", "amount", "level", "content",
  "inert", "reactive", "active", "inactive", "stable",
  "unstable", "labile", "mobile", "immobile", "soluble",
  "insoluble", "miscible", "immiscible", "volatile",
  "biogas", "syngas", "biooil", "biochar", "hydrochar",
  "co", "co2", "ch4", "h2", "n2", "o2", "no", "so2",
  "catalytic", "catalyst", "catalysts", "catalysis",
  "technology", "technologies", "technique", "techniques",
  "approach", "approaches", "strategy", "strategies",
  "scheme", "schemes", "design", "designs",
  "system", "systems", "process", "processes",
  "model", "models", "modeling", "modelling", "simulation",
  "prediction", "predicting", "optimization", "optimisation",
  "control", "controlling", "monitoring", "detection",
  "sensing", "measurement", "measuring", "quantification",
  "identification", "characterization", "classification",
  "validation", "verification", "calibration",
  "ii", "iii", "iv", "vi", "vii", "viii", "ix",
  "fe", "cu", "zn", "mn", "ni", "mg", "al", "si", "s",
  "ca", "k", "na", "cl", "br", "i", "p", "mo", "co",
  "ap", "nir", "uv", "ir", "vis", "xrd", "sem", "tem",
  "ftir", "xps", "nmr", "gc", "ms", "hplc", "tga",
  "dsc", "bet", "eds", "afm", "stm",
]);

/** 检查字符串是否像英文人名：纯字母、3-20 字符、非停用词、包含元音 */
function looksLikeAuthorName(s) {
  if (!s || s.length < 2 || s.length > 20) return false;
  if (ENGLISH_STOP_WORDS.has(s.toLowerCase())) return false;
  // 带数字的不是人名（如 "cr6b00647"、"Liu2017"）
  if (/\d/.test(s)) return false;
  // 含括号等特殊字符
  if (/[()（）\[\]{}]/.test(s)) return false;
  // 纯字母，至少包含一个元音（大小写均可，"wang"、"Khan"、"USMAN" 都接受）
  if (/^[a-zA-Z]{2,20}$/.test(s) && /[aeiou]/i.test(s)) return true;
  return false;
}

/** 从文件名解析年份和第一作者
 *  英文: 2008-khan-title.pdf / Khan2008_biochar.pdf
 *  CNKI中文: 赵凤起-含能复合催化剂-2024.pdf / 2024-张三-论文标题.pdf
 *  纯标题: 含能复合催化剂对微烟推进剂燃烧性能的影响.pdf（无作者信息）
 */
export function extractFromFilename(filename) {
  const base = filename.replace(/\.pdf$/i, "");
  const result = {};

  // 年份
  const yearMatch = base.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) result.year = parseInt(yearMatch[0], 10);

  const segments = base.split(/[\s\-_]+/).filter(Boolean);

  // ── 策略 1：年份-作者-标题 格式 (2008-khan-title...) ──
  const yearSegIdx = segments.findIndex(s => /^(19|20)\d{2}$/.test(s));
  if (yearSegIdx >= 0 && yearSegIdx + 1 < segments.length) {
    const nextSeg = segments[yearSegIdx + 1];
    // 移除年份后用 word boundary 提取词段
    const afterYear = segments.slice(yearSegIdx).join(" ");
    const words = afterYear.replace(/^\d{4}\s*/, "").split(/[\s\-_]+/).filter(Boolean);
    // 找第一个看起来像人名的片段
    for (const w of words) {
      if (looksLikeAuthorName(w)) {
        result.firstAuthor = capitalize(w);
        break;
      }
      // 中文名
      if (/^[一-鿿]{2,4}$/.test(w)) { result.firstAuthor = w; break; }
    }
  }

  // ── 策略 2：中文名 2-4 字 ──
  if (!result.firstAuthor) {
    const zhName = segments.find(s => /^[一-鿿]{2,4}$/.test(s));
    if (zhName) result.firstAuthor = zhName;
  }

  // ── 策略 3：英文人名 ──
  // 仅提取首字母大写的片段作为作者；
  // 太多候选 (>4) 且无年份 → 大概率是全大写的论文标题，不提取
  if (!result.firstAuthor) {
    const capitalizedNames = segments.filter(s =>
      looksLikeAuthorName(s) && /^[A-Z]/.test(s)
    );
    if (capitalizedNames.length >= 2 && capitalizedNames.length <= 4) {
      const short = capitalizedNames.reduce((a, b) => a.length <= b.length ? a : b);
      result.firstAuthor = capitalize(short);
    } else if (capitalizedNames.length === 1) {
      result.firstAuthor = capitalize(capitalizedNames[0]);
    }
  }

  // ── 策略 4：AuthorYear 合并格式（Khan2008 → Khan） ──
  if (!result.firstAuthor) {
    for (const s of segments) {
      const m = s.match(/^([A-Z][a-z]{1,19})(19|20)\d{2}$/);
      if (m && !ENGLISH_STOP_WORDS.has(m[1].toLowerCase())) {
        result.firstAuthor = m[1];
        if (!result.year) result.year = parseInt(m[2], 10);
        break;
      }
    }
  }

  // ── 兜底：中文长段（>6字）可能是标题 ──
  if (!result.firstAuthor) {
    const zhTitle = segments.find(s => /[一-鿿]/.test(s) && s.length >= 6);
    if (zhTitle) result.titleHint = zhTitle.slice(0, 200);
  }

  // ── 策略 5：纯中文文件名（无作者/年份）整段作标题 ──
  if (!result.titleHint && !result.firstAuthor) {
    const zhParts = segments.filter((s) => /[一-鿿]/.test(s) && !/^(19|20)\d{2}$/.test(s));
    if (zhParts.length > 0) {
      const joined = zhParts.join("").replace(/^(19|20)\d{2}/, "");
      if (joined.length >= 6) result.titleHint = joined.slice(0, 200);
    }
  }

  return result;
}

/**
 * 从 pdfjs 还原的首页行文本提取英文题录（Elsevier/Springer/Wiley 等）
 */
export function extractEnglishFromHeaderLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return {};
  const result = {};

  const absIdx = lines.findIndex((l) => /^\s*abstract\s*$/i.test(l.trim()));
  const headerLines = (absIdx > 0 ? lines.slice(0, absIdx) : lines.slice(0, 30))
    .map((l) => l.trim())
    .filter(Boolean);

  const skipLine = (l) =>
    /^(journal|article|research|review|communication|letter|paper|open access|creative commons)/i.test(l)
    || /^(vol\.|volume|issue|issn|doi:|https?:\/\/|www\.|©|copyright|elsevier|springer|wiley|nature|taylor)/i.test(l)
    || /^\d{4}\s*$/.test(l)
    || l.length < 4;

  let startIdx = 0;
  for (let i = 0; i < headerLines.length; i++) {
    if (!skipLine(headerLines[i])) {
      startIdx = i;
      break;
    }
  }

  const titleParts = [];
  for (let i = startIdx; i < headerLines.length; i++) {
    const l = headerLines[i];
    if (/^abstract$/i.test(l)) break;
    if (/@|university|institute|college|department|laboratory|corresponding author|author affiliations/i.test(l)) break;
    if (/^[A-Z][a-zA-Z\-']+(?:,\s*[A-Z]\.?)(?:\s*,\s*[A-Z][a-zA-Z\-']+(?:,\s*[A-Z]\.?)?)*$/.test(l)) break;
    if (/\bet al\.?\b/i.test(l) && l.length < 120) break;
    if (l.length >= 8 && !skipLine(l)) titleParts.push(l);
    if (titleParts.join(" ").length > 280) break;
  }

  if (titleParts.length > 0) {
    const title = titleParts.join(" ").replace(/\s+/g, " ").trim();
    if (title.length >= 15) result.title = title.slice(0, 300);
  }

  for (const l of headerLines) {
    if (/@|university|abstract|affiliation/i.test(l)) continue;
    const etAl = l.match(/^([A-Z][a-zA-Z\-']+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-zA-Z\-']+)*)\s+et\s+al\.?/i);
    if (etAl) {
      result.firstAuthor = etAl[1].split(/\s+/)[0];
      result.authors = [result.firstAuthor];
      break;
    }
    const commaAuthors = l.match(/^([A-Z][a-zA-Z\-']+(?:,\s*[A-Z]\.?)+(?:\s*,\s*[A-Z][a-zA-Z\-']+(?:,\s*[A-Z]\.?)?){0,8})$/);
    if (commaAuthors) {
      result.authors = parseAuthorLine(commaAuthors[1]);
      if (result.authors.length > 0) result.firstAuthor = result.authors[0].split(/[,\s]/)[0];
      break;
    }
  }

  for (const l of headerLines) {
    const journalMatch = l.match(/^([A-Z][A-Za-z &\-:()]{4,80})$/);
    if (journalMatch && /journal|science|letters|materials|energy|chemistry|biology|research/i.test(l)) {
      result.journal = journalMatch[1].trim();
      break;
    }
  }

  return result;
}

function parseAuthorLine(line) {
  return line
    .split(/\s*,\s*/)
    .map((a) => a.trim())
    .filter((a) => a.length >= 2 && /[a-zA-Z]/.test(a))
    .slice(0, 10);
}

/** 从 PDF 首页文字提取结构化信息（增强 CNKI 论文支持）
 *  pdfjs 对中文 PDF 会把字拆成单字加空格，所以需要先去空格再匹配中文
 *  @param {string} firstPageText
 *  @param {{ headerLines?: string[] }} [options]
 */
export function extractFromFirstPage(firstPageText, options = {}) {
  if (!firstPageText || firstPageText.length < 20) return {};
  const rawText = firstPageText.slice(0, 10000);
  const { headerLines = [] } = options;
  // 去除 pdfjs 插入的单字空格（用于中文匹配）
  const compact = rawText.replace(/\s+/g, "");
  const result = {};

  // DOI（原始文本匹配，DOI 不会被 pdfjs 拆空格）
  const doiPatterns = [
    /doi[：:\s]*(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,}\/[^\s,;）\]>]+)/i,
    /\b(10\.\d{4,}\/[^\s,;）\]>]+)/i,
  ];
  for (const re of doiPatterns) {
    const m = rawText.match(re);
    if (m) {
      result.doi = m[1].replace(/[.,;)>\]}]+$/g, "");
      break;
    }
  }

  // 年份
  const yearMatch = compact.match(/(20\d{2}|19[89]\d)/);
  if (yearMatch) result.year = parseInt(yearMatch[0], 10);

  // ── CNKI 作者（必须在标题提取之前运行，供标题截断用） ──
  const cnAuthorPatterns2 = [
    /作者[：:]\s*([一-鿿]{2,4}(?:[，,;；\s]+[一-鿿]{2,4}){0,10})/,
    /(?:题目|作者)[：:]\s*([^(\nDOI]{3,60}?)(?:\bDOI\b|\b收稿\b|\b摘要\b|\bAbstract\b)/,
    /(?:作者简介[：:]\s*)([一-鿿]{2,4})/,
  ];
  for (const re of cnAuthorPatterns2) {
    const m = compact.match(re);
    if (m) {
      const names = m[1].split(/[，,;；\s]+/).filter(n => n.length >= 2 && n.length <= 4 && /[一-鿿]/.test(n));
      if (names.length > 0) { result.authors = names; break; }
    }
  }

  // ── CNKI 标题：按"，"分割，找到作者名簇 → 标题 = 簇之前的所有内容 ──
  // 策略：分段中连续3个以上"2-4字纯中文"段 → 那是作者列表 → 标题在其之前
  const abstractIdx = compact.search(/(?:摘要|Abstract|摘[要])/);
  const titleTagMatch = compact.match(/题目[：:]\s*([^\n]{10,200}?)\s*(?:作者|DOI|收稿)/);
  const headText = abstractIdx > 20 ? compact.slice(0, abstractIdx) : compact;
  const segs = headText.split(/[，,;；]/).filter(Boolean);
  // 找连续2-4字纯中文段的起始位置
  let authorStartSeg = -1;
  for (let i = 0; i < segs.length - 2; i++) {
    const a = segs[i], b = segs[i + 1], c = segs[i + 2];
    const isName = (s) => s.length >= 2 && s.length <= 4 && /^[一-鿿]+$/.test(s);
    if (isName(a) && isName(b) && isName(c)) { authorStartSeg = i; break; }
  }
  if (authorStartSeg > 0) {
    const titleSegs = segs.slice(0, authorStartSeg);
    let t = titleSegs.join("，").trim();
    t = t.replace(/^[\s\d.,;:，、]+/, "").replace(/[\s.,;:，、]+$/, "");
    // 尾部清理：如果第一作者名在标题尾部，砍掉
    if (result.authors && result.authors.length > 0) {
      const firstAuth = result.authors[0];
      if (t.endsWith(firstAuth)) t = t.slice(0, -firstAuth.length);
    }
    if (t.length >= 10 && /[一-鿿]/.test(t)) {
      result.title = t.slice(0, 200);
    }
  }
  // 网络首发论文无"摘要"，直接取"题目："字段
  if (!result.title && titleTagMatch) {
    const t = titleTagMatch[1].trim();
    if (t.length >= 10) result.title = t.slice(0, 200);
  }
  // 网络首发 / 优先发表：题目常在摘要前大段中文
  if (!result.title) {
    const onlineMatch = compact.match(/(?:网络首发|优先发表|在线发表)(.{0,20})?([\u4e00-\u9fff，、：:（）()\-—\d\s]{12,200}?)(?:摘要|Abstract|关键词|Key words)/);
    if (onlineMatch?.[2]) {
      const t = onlineMatch[2].replace(/^[\s\d.,;:，、]+/, "").trim();
      if (t.length >= 10) result.title = t.slice(0, 200);
    }
  }

  // fallback: 从作者簇提取 authors（如果上面的 pattern 没抓到）
  if (!result.authors && result.title) {
    const afterTitle = compact.slice(compact.indexOf(result.title) + result.title.length);
    const authorCluster = afterTitle.match(/^([一-鿿]{2,4}(?:[，,;；\s]+[一-鿿]{2,4}){0,10})/);
    if (authorCluster) {
      const names = authorCluster[1].split(/[，,;；\s]+/).filter(n => n.length >= 2 && n.length <= 4 && /[一-鿿]/.test(n));
      if (names.length > 0 && names.length <= 10) result.authors = names;
    }
  }

  // ── CNKI 期刊名 ──
  const journalPatterns = [
    /《([^》]{3,40})》/,
    /(?:发表于|刊载于|期刊名?[：:])\s*([一-鿿A-Za-z &]{3,40}?)(?:\s*\d|\s*第|\s*$)/,
    // 扩展期刊名库：涵盖农业、环境、化工、材料等常见中文期刊
    /(作物学报|作物杂志|中国烟草学报|烟草科技|中国烟草科学|土壤学报|土壤通报|土壤|水土保持学报|农业工程学报|农业机械学报|农业环境科学学报|环境科学学报|环境科学|环境化学|环境工程学报|安全与环境学报|生态学报|应用生态学报|植物营养与肥料学报|中国农业科学|中国农学通报|中国生态农业学报|干旱地区农业研究|中国土壤与肥料|植物生理学报|西北植物学报|生物工程学报|化工学报|化工进展|化学学报|物理化学学报|无机化学学报|有机化学|分析化学|应用化学|催化学报|燃料化学学报|煤炭学报|煤炭转化|燃料科学与技术|洁净煤技术|过程工程学报|化工环保|林产化学与工业|可再生能源|太阳能学报|新能源进展|热科学与技术|工程热物理学报|燃烧科学与技术|推进技术|含能材料|火炸药学报|固体火箭技术|兵工学报|爆炸与冲击|精细化工|高分子学报|高分子材料科学与工程|材料导报|材料研究学报|复合材料学报|无机材料学报|硅酸盐学报|功能材料|碳素技术|新型炭材料|化工新型材料|离子交换与吸附|食品科学|食品工业科技|食品与发酵工业|茶叶科学|园艺学报|中国水稻科学|作物学报|核农学报|棉花学报|中国油料作物学报)/,
  ];

  // Check if the raw text paragraph starts with journal pattern
  const headArea = rawText.slice(0, 600);
  for (const re of journalPatterns) {
    const m = compact.match(re);
    if (m) { result.journal = m[1].trim(); break; }
  }

  // ── 从 DOI 提取 ISSN（始终提取，用于后续校验 CNKI 模式匹配的准确性） ──
  if (result.doi) {
    const issnMatch = result.doi.match(/j\.issn\.(\d{4}-\d{3}[\dX])/i);
    if (issnMatch) result._issn = issnMatch[1];
  }

  // ── CNKI 卷期页码 ──
  // 模式1: 第N卷第M期
  const volIssueMatch = compact.match(/第(\d{1,2})卷(?:第(\d{1,2})期)?/);
  if (volIssueMatch) {
    result.volume = volIssueMatch[1];
    if (volIssueMatch[2]) result.issue = volIssueMatch[2];
  }
  // 模式2: CNKI header 格式 "总第N期"
  if (!result.issue) {
    const totalIssue = compact.match(/总第(\d{1,4})期/);
    if (totalIssue) result._totalIssue = totalIssue[1];
  }
  // 模式3: 从 DOI 提取年月期号 (如 2017.04.003 → year=2017, issue=4)
  // DOI 数据通常比 CNKI 页眉更可靠，这里使用覆盖策略
  if (result.doi) {
    const doiParts = result.doi.match(/[./](\d{4})\.(\d{2})\.(\d{3,4})$/);
    if (doiParts) {
      result.year = parseInt(doiParts[1], 10); // DOI year 覆盖文件名年份
      result.issue = String(parseInt(doiParts[2], 10)); // DOI issue 覆盖总期号
      if (!result.pages) result.pages = String(parseInt(doiParts[3], 10));
    }
  }

  // ── 页码：从 CNKI header 提取（格式：页码+总期号，如 "15总第179期"） ──
  if (!result.pages) {
    const headerPage = headArea.match(/^(\d{1,4})\s*(?:总第|卷|期|第|，|,)/);
    if (headerPage && parseInt(headerPage[1], 10) < 500) {
      result._startPage = headerPage[1];
    }
  }
  if (!result.pages) {
    // 文章编号 → 提取页码
    const articleId = compact.match(/文章(?:编号|号)[：:]\s*[\d-]+\((\d{4})\)(\d{2})-(\d{4})-(\d{2,4})/);
    if (articleId) {
      result.pages = `${parseInt(articleId[3], 10)}-${parseInt(articleId[4], 10)}`;
    }
  }

  // 英文期刊
  if (!result.journal) {
    const enJournalMatch = rawText.match(
      /(?:published in|journal of|proceedings of|in:\s*)([A-Z][A-Za-z &\-]{3,50})(?:\s*,|\s*\d{4})/i
    );
    if (enJournalMatch) result.journal = enJournalMatch[1].trim();
  }

  // 英文卷期页码
  if (!result.volume) {
    const enVolMatch = rawText.match(/\b(?:Vol\.?|Volume)\s*(\d{1,3})/i);
    if (enVolMatch) result.volume = enVolMatch[1];
  }
  if (!result.pages) {
    const enPageMatch = rawText.match(/\b(?:pp?\.?|pages?)\s*(\d+)[\-–—]\s*(\d+)/i);
    if (enPageMatch) result.pages = `${enPageMatch[1]}-${enPageMatch[2]}`;
  }

  const fromLines = extractEnglishFromHeaderLines(headerLines);
  return mergeBibEntries(result, fromLines);
}

/** 合并三层结果，高置信度优先；智能修复 firstAuthor→title 误判 */
export function mergeBibEntries(...sources) {
  const merged = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if (v != null && merged[k] == null) merged[k] = v;
    }
  }

  // 智能修复：firstAuthor 像标题时 → 转存为 title
  if (merged.firstAuthor) {
    const isChinese = /[一-鿿]/.test(merged.firstAuthor);
    const isStopWord = ENGLISH_STOP_WORDS.has(String(merged.firstAuthor).toLowerCase());
    const isTitle =
      isStopWord ||
      (isChinese && merged.firstAuthor.length > 6) ||
      (!isChinese && merged.firstAuthor.length > 30);
    if (isTitle && !merged.title) {
      merged.title = merged.firstAuthor;
      merged.firstAuthor = undefined;
    }
    // firstAuthor 含数字或有效字符过少 → 清除
    const meaningful = String(merged.firstAuthor).replace(/[^\w一-鿿]/g, "");
    if (meaningful.length < 3 && !/^[A-Z]{2,4}$/.test(merged.firstAuthor)) {
      merged.firstAuthor = undefined;
    }
  }

  // 如果 PDF 元数据有 authors 列表，优先用它的第一作者替换可疑的 firstAuthor
  if (merged.authors && Array.isArray(merged.authors) && merged.authors.length > 0) {
    const firstFromInfo = merged.authors[0];
    const isFirstAuthorBad =
      !merged.firstAuthor ||
      ENGLISH_STOP_WORDS.has(String(merged.firstAuthor).toLowerCase()) ||
      (String(merged.firstAuthor).length > 20);
    if (isFirstAuthorBad && firstFromInfo && firstFromInfo.length >= 2) {
      merged.firstAuthor = firstFromInfo;
    }
  }

  // journalHint（XMP Subject 字段）→ journal
  if (merged.journalHint && !merged.journal) {
    merged.journal = merged.journalHint;
  }
  delete merged.journalHint;

  // ISSN → journal name lookup（DOI-based ISSN is more reliable than CNKI header pattern matching）
  if (merged._issn) {
    const issnJournal = ISSN_JOURNAL_MAP[merged._issn];
    if (issnJournal) {
      // ISSN-match overrides a pattern-matched journal that's too short/generic
      if (!merged.journal || merged.journal.length <= 3) {
        merged.journal = issnJournal;
      }
    }
  }
  delete merged._issn;

  // _totalIssue → issue (fallback)
  if (!merged.issue && merged._totalIssue) {
    merged.issue = merged._totalIssue;
  }
  delete merged._totalIssue;

  // _startPage → pages (fallback)
  if (!merged.pages && merged._startPage) {
    merged.pages = merged._startPage;
  }
  delete merged._startPage;

  // titleHint（文件名提取的候选标题）→ 正式 title
  if (merged.titleHint && !merged.title) {
    merged.title = merged.titleHint;
  }
  delete merged.titleHint;

  // PDF Info 标题常为文件名或短垃圾串，丢弃以便首页/Crossref 覆盖
  if (merged.title && typeof merged.title === "string") {
    const t = merged.title.trim();
    const isChinese = /[一-鿿]/.test(t);
    if (!isChinese && t.length < 20) {
      const words = t.split(/\s+/).filter(Boolean);
      const stopCount = words.filter((w) => ENGLISH_STOP_WORDS.has(w.toLowerCase())).length;
      if (words.length >= 2 && stopCount / words.length >= 0.45) {
        merged.title = undefined;
      }
    }
  }

  return merged;
}

// ── ISSN → 期刊名映射（农业/环境/化工等常见中文期刊） ──
const ISSN_JOURNAL_MAP = {
  "1001-7283": "作物杂志",
  "0496-3490": "作物学报",
  "1004-5708": "中国烟草学报",
  "1002-0861": "烟草科技",
  "1007-5119": "中国烟草科学",
  "0564-3929": "土壤学报",
  "0564-3945": "土壤通报",
  "0253-9829": "土壤",
  "1009-2242": "水土保持学报",
  "1002-6819": "农业工程学报",
  "1000-1298": "农业机械学报",
  "1672-2043": "农业环境科学学报",
  "0250-3301": "环境科学",
  "0254-6108": "环境化学",
  "2095-644X": "环境工程学报",
  "1001-6929": "环境科学学报",
  "1000-0933": "生态学报",
  "1001-9332": "应用生态学报",
  "1008-505X": "植物营养与肥料学报",
  "0578-1752": "中国农业科学",
  "1000-6850": "中国农学通报",
  "1671-3990": "中国生态农业学报",
  "1000-7601": "干旱地区农业研究",
  "1673-6257": "中国土壤与肥料",
  "1000-4025": "西北植物学报",
  "1671-3877": "植物生理学报",
  "1671-5497": "吉林大学学报(工学版)",
  "0438-1157": "化工学报",
  "1000-6613": "化工进展",
  "0567-7351": "化学学报",
  "1002-681X": "农业工程学报",
  "1002-6630": "食品科学",
  "0253-990X": "食品与发酵工业",
  "1000-9973": "茶叶科学",
  "0513-353X": "园艺学报",
  "1001-7216": "中国水稻科学",
  "1000-8551": "核农学报",
  "1002-7807": "棉花学报",
  "1007-9084": "中国油料作物学报",
  "0253-2409": "燃料化学学报",
  "0253-9993": "煤炭学报",
  "1006-6772": "煤炭转化",
  "1001-8719": "石油学报(石油加工)",
  "1000-6761": "过程工程学报",
  "0253-2417": "林产化学与工业",
  "1671-5292": "可再生能源",
  "0254-0096": "太阳能学报",
  "1671-0460": "化工环保",
  "1000-324X": "无机材料学报",
  "1000-7555": "高分子材料科学与工程",
  "1005-023X": "材料导报",
  "1001-4381": "材料工程",
  "1001-9731": "功能材料",
  "1001-3741": "碳素技术",
  "1007-8827": "新型炭材料",
  "1001-3555": "含能材料",
  "1001-4055": "推进技术",
  "1000-1093": "兵工学报",
  "1000-6893": "航空动力学报",
  "0253-231X": "工程热物理学报",
  "1000-1026": "热力发电",
  "1000-6761": "热能动力工程",
  "1672-9897": "固体火箭技术",
};

// ── 辅助工具 ────────────────────────────────────────────────────────────────

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function splitAuthors(authorStr) {
  return authorStr
    .split(/[;,]|\band\b|\bAND\b/)
    .map(a => a.trim())
    .filter(a => a.length > 1 && /[a-zA-Z一-鿿]/.test(a))
    .slice(0, 6);
}
