import type { AgentAttachmentInfo } from "@/contracts/agent-attachment";

const STATUS_LABEL: Record<AgentAttachmentInfo["status"], string> = {
  extracting: "提取中",
  ready: "已提取",
  extract_failed: "未提取成功",
  unsupported: "不支持的类型",
};

/** 把附件清单拼成首条 user 消息前缀（state.goal 保持干净，不影响意图正则） */
export function buildAttachmentManifest(attachments: AgentAttachmentInfo[]): string {
  if (attachments.length === 0) return "";
  const lines = attachments.map((a) => {
    const status = a.status === "ready"
      ? `已提取（约 ${a.charCount ?? 0} 字${a.truncated ? "，已截断" : ""}）`
      : STATUS_LABEL[a.status];
    const hint =
      a.status === "ready"
        ? `可调用 read_attachment("${a.id}") 读取；长文本用 part="head"/"tail" 或 offset 分页。`
        : "该附件仅展示文件名，无法读取内容。";
    return `- ${a.originalName}（${status}）\n  → ${hint}`;
  });
  return `【附件】\n${lines.join("\n")}`;
}
