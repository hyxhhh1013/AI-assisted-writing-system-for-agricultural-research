/**
 * 质量评测 golden fixtures：一份「好论文」与一份「坏论文」，
 * 供单测断言分数方向 + 脚本演示评分口径。
 *
 * 注意：阈值（摘要≥150、引言≥400、主体节≥300、结论≥150）对齐真实论文篇幅，
 * 故 fixture 文本需写到该量级。
 */

import type { QualityEvalInput } from "./types";

const ABSTRACT =
  "耐盐碱水稻秸秆是一种量大且亟待资源化利用的农业废弃物，直接还田存在腐解慢、养分释放不均等问题。本文在不同热解温度下制备水稻秸秆生物炭，" +
  "系统考察了生物炭产率、灰分以及氮、磷、钾等关键营养元素的迁移与固存规律，并结合 XRD 与 SEM 表征分析炭化程度与孔隙结构。结果表明，随热解温度升高，" +
  "生物炭产率由 45.2% 显著下降至 28.6%，碳结构趋于有序，营养元素总体向固相富集但保留率逐渐降低。研究为盐碱地农业废弃物的热化学资源化利用提供了数据支撑，" +
  "并对热解温度的选择给出了方向性建议。";

const INTRODUCTION =
  "盐碱地农业废弃物处置与土壤改良是当前农业可持续发展的关键议题。水稻秸秆作为大宗农业副产物，直接还田存在腐解周期长、养分释放不均、盐分累积等问题，" +
  "热解制备生物炭则是实现其减量化、稳定化与资源化的重要途径[1]。已有研究普遍表明，热解温度是调控生物炭产率、比表面积、官能团组成以及元素赋存形态的核心参数[2]。" +
  "随着热解温度的升高，生物炭的碳结构由无定形向有序石墨化转变，同时挥发性组分大量析出，导致产率下降而碳稳定性提高。然而，针对耐盐碱水稻秸秆这一特定原料，" +
  "不同热解温度下氮、磷、钾等关键营养元素迁移转化规律的研究仍不充分，尤其是营养元素在固相产物中的保留率与形态变化尚缺乏系统数据。" +
  "因此，本研究以耐盐碱水稻秸秆为原料，考察不同热解温度对生物炭产率、灰分及氮磷钾迁移固存的影响，以期阐明关键营养元素在热化学转化过程中的迁移规律，" +
  "为盐碱地秸秆的资源化利用与生物炭产品的定向调控提供理论依据，这对于指导生物炭产品在农业领域的精准应用具有重要意义。";

const METHODS =
  "供试耐盐碱水稻秸秆采集自滨海盐碱地试验区，风干后经粉碎机粉碎并过 60 目筛备用。热解采用管式炉进行，在 300、400、500、600、700℃ 五个终温梯度下限氧热解，" +
  "升温速率统一为 10℃/min，保温时间 60 min，全程通入高纯氮气以维持惰性气氛。生物炭产率按热解后固体质量与原料质量的比值计算，灰分含量按 750℃ 灼烧法测定。" +
  "碳结构采用 XRD 衍射仪分析，扫描范围为 5°～80°；表面形貌采用 SEM 扫描电镜观察。氮含量采用凯氏定氮法测定，磷含量采用钼锑抗比色法测定，" +
  "钾含量采用火焰光度法测定。每个处理设置三次重复，数据以均值±标准差表示，采用单因素方差分析进行显著性检验，所有样品测定前均经充分混匀与缩分处理。";

const RESULTS =
  "随热解温度从 300℃ 升高至 700℃，生物炭产率由 45.2% 显著下降至 28.6%，灰分含量则由 18.3% 相应升高至 32.7%。XRD 图谱显示，随温度升高，无定形碳的弥散峰逐渐减弱，" +
  "石墨化碳的衍射峰逐步增强，表明炭化程度不断提高。SEM 观察表明，高温生物炭孔隙结构更加发达，孔壁变薄且出现明显贯通孔。氮、磷、钾的固相保留率整体随温度升高而降低，" +
  "其中钾元素在 700℃ 下的挥发损失最为明显，保留率仅约 41.2%；磷元素的保留率相对较高，仍维持在 60% 以上。值得注意的是，尽管绝对保留率下降，单位质量生物炭中部分难挥发营养元素的相对含量反而有所升高，" +
  "这与灰分浓缩效应相吻合，上述结果均具有统计学意义（P<0.05）。";

const DISCUSSION =
  "生物炭产率随热解温度升高而下降，主要归因于纤维素、半纤维素与木质素等组分在升温过程中发生裂解，挥发性产物大量析出，这一趋势与已有关于秸秆类生物质热解的报道一致。" +
  "灰分含量的升高则反映了有机质持续分解后的无机矿物浓缩效应。氮、磷、钾三种营养元素的迁移行为存在明显差异，这可能与各元素在热解过程中的挥发温度、结合形态以及无机矿物组分密切相关。" +
  "钾元素保留率下降最快，提示其在较低温度下即以含钾挥发物形式逸散；磷元素则更倾向于与无机矿物结合而滞留于固相。上述结果表明，若以营养元素固存为主要目标，宜选择中等热解温度；" +
  "若以碳封存与材料孔隙调控为目标，则可适当提高热解温度。后续研究可结合同步热分析进一步揭示各元素挥发的动力学机制。";

const CONCLUSION =
  "本研究明确了耐盐碱水稻秸秆生物炭产率与关键营养元素迁移随热解温度的变化规律：随温度由 300℃ 升至 700℃，生物炭产率由 45.2% 降至 28.6%，" +
  "碳结构趋于有序，氮磷钾总体向固相富集但保留率随温度升高而降低，其中钾损失最为明显。研究表明，中等热解温度有利于兼顾生物炭产率与营养元素固存。" +
  "上述结论有待在田间尺度进一步验证，未来可结合不同改性工艺优化生物炭的养分缓释性能。";

export const GOOD_PAPER: QualityEvalInput = {
  title: "不同热解温度下耐盐碱水稻秸秆生物炭产率与营养元素迁移研究",
  sections: [
    { key: "abstract", title: "摘要", content: ABSTRACT },
    { key: "introduction", title: "引言", content: INTRODUCTION },
    { key: "methods", title: "方法", content: METHODS },
    { key: "results", title: "结果", content: RESULTS },
    { key: "discussion", title: "讨论", content: DISCUSSION },
    { key: "conclusion", title: "结论", content: CONCLUSION },
  ],
  references: [
    {
      index: 1,
      title: "Biochar soil amendment and crop productivity",
      abstract:
        "Biochar application improves soil fertility and crop yield in saline soils. " +
        "Long-term field trials show increased nutrient retention and water holding capacity.",
    },
    {
      index: 2,
      title: "Effect of pyrolysis temperature on biochar properties",
      abstract:
        "Higher pyrolysis temperature reduces biochar yield but increases carbon stability " +
        "and specific surface area, affecting nutrient retention behavior.",
    },
  ],
};

export const BAD_PAPER: QualityEvalInput = {
  title: "坏样例（缺节 + 越界引用 + overclaim）",
  sections: [
    { key: "abstract", title: "摘要", content: "本文研究了生物炭[1]。" },
    {
      key: "introduction",
      title: "引言",
      content: "生物炭是一种新材料[9]。本文首创了一种全新方法。",
    },
  ],
  references: [{ index: 1, title: "Biochar", abstract: "x" }],
};
