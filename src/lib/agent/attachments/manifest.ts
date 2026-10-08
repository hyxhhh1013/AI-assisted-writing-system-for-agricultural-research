import type { AgentAttachmentInfo } from "@/contracts/agent-attachment";

const STATUS_LABEL: Record<AgentAttachmentInfo["status"], string> = {
  extracting: "提取中",
  ready: "已提取",
  extract_failed: "未提取成功",
  unsupported: "不支持的类型",
};

/** 提取失败时给人和 Agent 的同一句话 */
export const ATTACHMENT_EXTRACT_RECOVERY =
  "未能解析。请重新上传、粘贴 CSV，或稍后再读；表格也可让助手「把这个表入库」。";

function attachmentHint(a: AgentAttachmentInfo): string {
  if (a.kind === "image" && a.status === "ready") {
    return `已有图。请 ingest_project_data（attachmentId="${a.id}"）：确认卡会列出从图上读出的数值，用户勾选后才写成证据并登记图片。没确认的数字不能写入正文。`;
  }
  if (a.ingest?.status === "ingested") {
    return `表格已入库（${a.ingest.claimCount ?? 0} 条声明）。可 list_plot_sources / generate_chart / write_section(results)，不必再 ingest_project_data。`;
  }
  if ((a.kind === "tabular" || a.kind === "instrument") && a.status === "ready") {
    return `先 read_attachment("${a.id}") 看带行号的原文，再调用 ingest_project_data，用 tablesJson 写明读法（label、note、sheet、headerRow、columns）。确认卡只展示你的读法，用户勾选后才写入。不要套固定表头，也不要把谱收成均值。`;
  }
  if (a.status === "ready") {
    return `可调用 read_attachment("${a.id}") 读取；长文本用 part="head"/"tail" 或 offset 分页。表格请 ingest_project_data。`;
  }
  if (a.status === "extracting") {
    return "正在后台提取（可能需几秒）；稍后（如先做别的步骤或读其它资料）再调用 read_attachment 重试读取，不要反复立即重读。";
  }
  return ATTACHMENT_EXTRACT_RECOVERY;
}

/** 把附件清单拼成首条 user 消息前缀（state.goal 保持干净，不影响意图正则） */
export function buildAttachmentManifest(attachments: AgentAttachmentInfo[]): string {
  if (attachments.length === 0) return "";
  const lines = attachments.map((a) => {
    const status = a.status === "ready"
      ? `已提取（约 ${a.charCount ?? 0} 字${a.truncated ? "，已截断" : ""}）`
      : STATUS_LABEL[a.status];
    const hint = attachmentHint(a);
    return `- ${a.originalName}（${status}）\n  → ${hint}`;
  });
  return `【附件】\n${lines.join("\n")}`;
}
