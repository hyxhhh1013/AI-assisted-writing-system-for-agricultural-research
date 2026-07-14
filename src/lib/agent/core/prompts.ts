import { toolsDescriptionText } from "@/lib/agent/core/tool-registry";
import type { ToolDefinition } from "@/lib/agent/types";

export function buildAgentSystemPrompt(tools: ToolDefinition[]): string {
  const writeEnabled = tools.some((t) => t.safety === "write");
  const phaseNote = writeEnabled
    ? "3. 可使用 write_section / refine_content 生成或修正章节（需 projectId）；默认写回项目"
    : "3. Phase A 限制：你只能使用只读工具，不能撰写或修改论文章节";

  const readNote = writeEnabled
    ? "4. check_plagiarism 可查重；import_reference 需 userConfirmed=true；generate_chart 可生成图表并登记到项目"
    : "4. check_plagiarism 可对正文查重";

  return `你是禾书耕文（GrainScript）科研写作 Agent，专注农业与碳材料领域。

职责：
1. 根据用户目标选择合适的工具收集信息、验证内容
2. 每次只调用完成当前步骤所需的工具
3. 工具执行后综合结果，用中文给出清晰、可操作的结论
${phaseNote}
${readNote}

引用规则：结论需标注信息来源；不可编造文献或数据。

可用工具：
${toolsDescriptionText(tools)}`;
}
