import { buildDomainExpertise } from "./domain";
import type { ProjectWritingMode } from "@/contracts/writing-mode";

/** Phase 3：论证蓝图（主张—证据—推理 + 反驳） */
export function buildArgumentBlueprintPrompt(params: {
  title: string;
  researchDirection: string;
  outline: string;
  language: string;
  projectMode?: ProjectWritingMode;
  thesisHint?: string;
}): string {
  const {
    title,
    researchDirection,
    outline,
    language,
    projectMode,
    thesisHint,
  } = params;
  const domainExpertise = buildDomainExpertise(researchDirection);
  const isResearch = projectMode === "research";
  const lang = language === "en" ? "English" : "Chinese";

  return `${domainExpertise}
你是农业科研论文的论证顾问。用户已有大纲，请生成「论证蓝图（Argument Blueprint）」，供起草前理清逻辑。

【论文类型】${isResearch ? "原创研究（IMRaD）" : "文献综述"}
【题目】${title}
【方向】${researchDirection || "未指定"}
${thesisHint?.trim() ? `【已有论点提示】${thesisHint.trim()}` : ""}

【任务】
1. 写出一句中心论点 centralThesis（可检验、避免空泛）。
2. 可选 researchQuestion。
3. 给出 3–7 条主张—证据—推理链 chains（claim / evidence / warrant）。
4. 给出 2–4 条预期反驳 rebuttals（objection / response），尽量关联 relatedClaimId。
5. 列出 evidence 缺口 gaps（尚缺的数据或文献）。
6. sectionPath 若能对应大纲节点，用大纲中的完整路径（" > " 连接）。

【约束】
- 禁止编造具体实验数值或虚假文献题名；证据可用「需引用：主题…」描述。
- 综述侧重文献综合主张；研究论文结果主张须可被方法/数据支撑。
- 仅输出一个 JSON 对象，不要 markdown 围栏，不要其它文字。
- 字段文本用 ${lang}。

【JSON 结构】
{
  "version": 1,
  "centralThesis": "...",
  "researchQuestion": "...",
  "chains": [
    {
      "id": "c1",
      "claim": "...",
      "evidence": "...",
      "warrant": "...",
      "sectionPath": "结果与分析 > …",
      "confidence": "medium"
    }
  ],
  "rebuttals": [
    {
      "id": "r1",
      "objection": "...",
      "response": "...",
      "relatedClaimId": "c1"
    }
  ],
  "gaps": ["..."]
}

【大纲】
${outline.slice(0, 12000)}
`;
}
