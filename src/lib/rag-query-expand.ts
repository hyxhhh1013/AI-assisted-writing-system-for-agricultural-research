/**
 * RAG 查询扩展：实验室领域同义词 + 中英文互搜 + 多 query 变体
 * 提升 BM25 召回，尤其是 Agent 短 query / 英文术语 / 跨表述检索
 */

/** 同义词组：检索时任一组内词项一并加入 BM25 terms */
const SYNONYM_GROUPS: string[][] = [
  ["生物炭", "biochar", "char", "pyrogenic carbon", "black carbon"],
  ["热解", "pyrolysis", "裂解", "热分解", "fast pyrolysis", "slow pyrolysis"],
  ["气化", "gasification", "syngas", "合成气"],
  ["水热", "hydrothermal", "htc", "hydrothermal carbonization"],
  ["催化", "catalyst", "catalytic", "催化剂", "催化裂解"],
  ["生物质", "biomass", "lignocellulosic", "秸秆", "straw", "wood"],
  ["塑料", "plastic", "pp", "pe", "pet", "共热解", "co-pyrolysis"],
  ["土壤", "soil", "农田", "farmland", "改良", "amendment"],
  ["氮", "nitrogen", "n fertilizer", "氮肥", "硝化", "nitrification"],
  ["磷", "phosphorus", "p uptake", "磷肥", "溶磷"],
  ["钾", "potassium", "钾肥"],
  ["控释", "缓释", "controlled release", "slow release", "包膜", "包衣", "coating"],
  ["肥料", "fertilizer", "fertiliser", "nutrient"],
  ["烟草", "tobacco", "烟叶", "烤烟", "curing"],
  ["茶", "tea", "茶叶", "杀青", "茶多酚", "catechins"],
  ["烟花", "firework", "烟火", "propellant", "推进剂", "含能"],
  ["重金属", "heavy metal", "cd", "pb", "zn", "cu", "铬", "镉", "铅"],
  ["吸附", "adsorption", "sorption", "固定", "immobilization"],
  ["比表面积", "bet", "surface area", "porosity", "孔隙"],
  ["ftir", "红外", "infrared", "spectroscopy"],
  ["xrd", "衍射", "diffraction", "晶体", "crystallite"],
  ["xps", "x射线光电子", "photoelectron"],
  ["sem", "tem", "电镜", "microscopy"],
  ["元素", "elemental", "chons", "ultimate analysis"],
  ["灰分", "ash", "fixed carbon", "固定碳", "volatile", "挥发分"],
  ["温度", "temperature", "heating rate", "升温速率"],
  ["产率", "yield", "char yield", "bio-oil", "焦油", "tar"],
  ["机制", "mechanism", "pathway", "机理", "作用机制"],
  ["碳纳米", "carbon nanotube", "cnt", "graphene", "石墨烯"],
  ["微生物", "microbe", "microbial", "细菌", "真菌", "菌群"],
  ["温室气体", "ghg", "co2", "ch4", "n2o", "排放", "emission"],
  ["生命周期", "lca", "life cycle", "碳足迹", "carbon footprint"],
  ["专利", "patent", "发明"],
];

const SYNONYM_INDEX = buildSynonymIndex(SYNONYM_GROUPS);

/** 不作为 CJK 单字入倒排/查询，避免「的/了/是」撑爆 posting、稀释 BM25 */
const CJK_STOP_UNIGRAMS = new Set(
  "的了在是和与或对及等为中其就都而也把被从到这那有不无于以之乎者亦还很更最但因所以如果可以什么".split(""),
);

const EN_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "are", "was", "were",
  "been", "have", "has", "had", "not", "but", "its", "into", "onto", "over",
  "than", "then", "also", "such", "using", "used", "based", "study", "paper",
  "these", "those", "which", "their", "them", "there", "here", "only", "more",
  "other", "between", "after", "before", "about", "under", "above",
  "of", "in", "on", "an", "or", "by", "as", "at", "to",
]);

const NOISY_SYNONYMS = new Set([
  "char", "black", "fast", "slow", "wood",
]);

export function isCjkStopUnigram(ch: string): boolean {
  return ch.length === 1 && CJK_STOP_UNIGRAMS.has(ch);
}

export function isEnglishStopword(term: string): boolean {
  return EN_STOPWORDS.has(term.toLowerCase());
}

function buildSynonymIndex(groups: string[][]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const group of groups) {
    const normalized = group.map((t) => t.trim().toLowerCase()).filter(Boolean);
    const bag = new Set(normalized);
    for (const term of normalized) {
      const existing = index.get(term) ?? new Set<string>();
      for (const t of bag) existing.add(t);
      index.set(term, existing);
    }
  }
  return index;
}

/** 中文段写入 char + bigram +（短段）trigram；索引与查询共用 */
export function addCjkNgrams(seg: string, sink: (term: string) => void): void {
  if (!seg) return;
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (!isCjkStopUnigram(ch)) sink(ch);
  }
  if (seg.length >= 2) {
    for (let i = 0; i < seg.length - 1; i++) sink(seg.substring(i, i + 2));
  }
  // trigram 仅短段写入，避免千字 chunk 倒排膨胀
  if (seg.length >= 3 && seg.length <= 64) {
    for (let i = 0; i <= seg.length - 3; i++) sink(seg.substring(i, i + 3));
  }
  if (seg.length >= 2 && seg.length <= 24) sink(seg);
}

/**
 * 索引侧词项 TF：与 extractQueryTerms 粒度对齐（含 CJK 2/3-gram）
 * 倒排构建时必须调用此函数，否则 query bigram 查不到 posting
 */
export function collectIndexTermTf(content: string): Map<string, number> {
  const tfMap = new Map<string, number>();
  const add = (term: string, n = 1) => {
    if (!term) return;
    tfMap.set(term, (tfMap.get(term) || 0) + n);
  };
  const tokens = content.toLowerCase().split(/[^a-z0-9一-鿿]+/).filter(Boolean);
  for (const t of tokens) {
    if (/[一-鿿]/.test(t)) {
      addCjkNgrams(t, (term) => add(term));
    } else if (t.length > 1 && !isEnglishStopword(t)) {
      add(t);
    }
  }
  return tfMap;
}

/** 从 query 抽取 BM25 词项（含 bigram / trigram / 短整段中文） */
export function extractQueryTerms(query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  const keywords: string[] = [];
  const push = (t: string) => {
    if (t) keywords.push(t);
  };
  if (/[一-龥]/.test(q)) {
    const segments = q.toLowerCase().split(/[^一-龥a-z0-9]+/i).filter((s) => s.length >= 1);
    for (const seg of segments) {
      if (/[一-龥]/.test(seg)) {
        addCjkNgrams(seg, push);
      } else if (seg.length > 1 && !isEnglishStopword(seg)) {
        push(seg);
      }
    }
  } else {
    for (const k of q.toLowerCase().split(/\s+/)) {
      if (k.length > 1 && !isEnglishStopword(k)) push(k);
    }
  }
  return Array.from(new Set(keywords)).filter((t) => t.length > 0);
}

/** 是否值得开多 query（弱召回 / 纯英文 / Top 分类偏离提示） */
export function shouldUseMultiQuery(
  query: string,
  hits: Array<{ metadata: { category: string } }>,
  limit: number,
): boolean {
  if (hits.length < Math.min(4, Math.max(2, Math.ceil(limit / 2)))) return true;
  const hasCjk = /[一-龥]/.test(query);
  const hasLatin = /[a-zA-Z]{3,}/.test(query);
  // 纯英文短 query：依赖同义词变体补中文
  if (hasLatin && !hasCjk) return true;
  const hints = inferCategoriesFromQuery(query);
  if (hints.length > 0 && hits.length > 0) {
    const topCats = new Set(hits.slice(0, Math.min(3, hits.length)).map((h) => h.metadata.category));
    if (!hints.some((h) => topCats.has(h))) return true;
  }
  return false;
}

function collectSynonymsForTerm(term: string): string[] {
  const key = term.trim().toLowerCase();
  if (!key) return [];
  const group = SYNONYM_INDEX.get(key);
  if (!group) return [];
  return Array.from(group).filter((t) => t !== key);
}

function isNoisySynonym(term: string): boolean {
  const key = term.trim().toLowerCase();
  if (NOISY_SYNONYMS.has(key)) return true;
  // 过短英文易误伤（char/cd/pp/pe）
  if (/^[a-z0-9]+$/i.test(term) && term.length < 3) return true;
  if (isEnglishStopword(key)) return true;
  return false;
}

/** BM25 用词项 = 抽取词 + 同义词扩展（上限 48 防噪声） */
export function buildRagSearchTerms(query: string): string[] {
  const base = extractQueryTerms(query);
  const expanded = new Set(base);
  for (const term of base) {
    for (const syn of collectSynonymsForTerm(term)) {
      if (isNoisySynonym(syn)) continue;
      expanded.add(syn);
      if (/[一-龥]/.test(syn)) {
        for (const sub of extractQueryTerms(syn)) expanded.add(sub);
      }
    }
  }
  const qLower = query.toLowerCase();
  for (const [key, group] of SYNONYM_INDEX) {
    if (key.length >= 2 && qLower.includes(key)) {
      for (const t of group) {
        if (!isNoisySynonym(t)) expanded.add(t);
      }
    }
  }
  return Array.from(expanded).slice(0, 48);
}

/**
 * BM25 词项权重：原查询词=1；跨语种翻译≈0.9；同语种近义扩展=0.4。
 * 避免 synonym bag 把「char / study」抬到和用户原词一样高。
 */
export function buildRagSearchTermWeights(query: string): Map<string, number> {
  const original = new Set(extractQueryTerms(query));
  const all = buildRagSearchTerms(query);
  const qHasCjk = /[一-龥]/.test(query);
  const weights = new Map<string, number>();
  for (const term of all) {
    if (original.has(term)) {
      weights.set(term, 1);
      continue;
    }
    const tHasCjk = /[一-龥]/.test(term);
    weights.set(term, qHasCjk !== tHasCjk ? 0.9 : 0.4);
  }
  return weights;
}

/** 多 query 变体（RRF 融合）；去重且保留原 query 优先 */
export function expandRagQueries(query: string): string[] {
  const q = query.trim();
  if (!q) return [];

  const variants = new Set<string>([q]);
  const qLower = q.toLowerCase();

  for (const group of SYNONYM_GROUPS) {
    const hits = group.filter((term) => {
      const t = term.toLowerCase();
      return t.length >= 2 && (qLower.includes(t) || q.includes(term));
    });
    if (hits.length === 0) continue;
    for (const term of hits) {
      variants.add(term);
      if (/[一-龥]/.test(term) && term.length >= 2) {
        variants.add(`${q} ${term}`);
      }
    }
    const en = group.find((t) => /^[a-z]/i.test(t));
    const zh = group.find((t) => /[一-龥]/.test(t));
    if (en && zh && hits.some((h) => h === en || h === zh)) {
      variants.add(`${zh} ${en}`);
    }
  }

  const list = Array.from(variants).slice(0, 4);
  return list.length > 0 ? list : [q];
}

/** 查询 → 知识库分类提示（与 writing-context 对齐，避免 rag ↔ services 循环依赖） */
const QUERY_CATEGORY_HINTS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /茶|绿茶|红茶|乌龙|普洱|香气|挥发性|杀青|摊放|茶汤|茶多酚|catechins|tea\b/i, category: "茶学" },
  { pattern: /烟花|烟火|推进剂|含能|火药|燃烧剂|高氯酸|firework|propellant/i, category: "烟花" },
  { pattern: /烤烟|烟草|烟叶|植烟|卷烟|tobacco|curing/i, category: "烟草" },
  { pattern: /热解|共热解|热化学|裂解|气化|生物质.*塑料|碳纳米|秸秆.*热解|pyrolysis|gasification/i, category: "热化学" },
  { pattern: /控释|缓释|包衣|包膜|肥料|氮素淋|生物炭基肥|fertilizer|coating/i, category: "控释肥类" },
  { pattern: /生物炭|biochar/i, category: "热化学" },
];

export function inferCategoriesFromQuery(query: string): string[] {
  const blob = query.trim();
  if (!blob) return [];
  const cats = new Set<string>();
  for (const { pattern, category } of QUERY_CATEGORY_HINTS) {
    if (pattern.test(blob)) cats.add(category);
  }
  return Array.from(cats);
}
