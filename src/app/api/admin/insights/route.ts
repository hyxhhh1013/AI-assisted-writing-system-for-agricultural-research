import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { parseListParams, success } from "@/lib/admin-response";
import { isAgentSessionSnapshot } from "@/contracts/agent-session";

const SCAN_CAP = 2000;
const DEFAULT_WINDOW_DAYS = 30;

export const dynamic = "force-dynamic";

/** 用户目标意图词表（任务意图，非全分词——可解释、零依赖；ADMIN-044 补齐新功能词） */
const INTENT_WORDS = [
  "综述", "写作", "写论文", "摘要", "引言", "结论", "方法",
  "参考文献", "引用", "查重", "降重", "改写", "翻译", "润色",
  "大纲", "蓝图", "写作蓝图", "论证", "图表", "数据分析", "XRD", "双语",
  "PPT", "演示", "扩展", "格式", "校对", "投稿", "实验",
  "研究方向", "方向规划", "路线图", "文献桥接", "申报", "基金", "课题",
  "Agent", "配置", "护照", "Passport",
];

/** 失败模式聚类规则（按 errorMessage 关键词，顺序即优先级） */
const ERROR_PATTERNS: { label: string; test: RegExp }[] = [
  { label: "会话落库失败", test: /22P05|空字节|unsupported Unicode|persist-failed/i },
  { label: "超时", test: /超时|timeout/i },
  { label: "上游限流/繁忙", test: /429|503|繁忙|限流|rate\s*limit|too many/i },
  { label: "API Key 问题", test: /api\s*key|401|鉴权|unauthorized|未配置/i },
  { label: "连接失败", test: /连接|网络|econn|502|504|fetch failed/i },
  { label: "门禁拦截", test: /pre-gate|post-gate|空转|熔断|antispam|配额/i },
  { label: "会话中断", test: /中断|重启|cancelled|aborted/i },
  { label: "工具执行失败", test: /工具|执行失败|tool/i },
  { label: "模型/解析错误", test: /json|解析|model|模型/i },
];

function toTop<T extends { count: number }>(items: T[], n: number): T[] {
  return items.sort((a, b) => b.count - a.count).slice(0, n);
}

/**
 * GET /api/admin/insights — 从 AgentSession 窗口聚合使用洞察：
 * 1. 用户目标高频：goal 里的任务意图词
 * 2. 工具调用榜：uiTranscript 里每个 action.tool 的调用次数
 * 3. 失败模式：status=error 会话按 errorMessage / toolTrace 关键词聚类
 * 4. 失败工具榜：toolTrace.ok=false
 * 查询：days（默认 30）；最多扫描 SCAN_CAP 条最近会话
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const params = parseListParams(new URL(req.url).searchParams);
  const windowDays = params.days && params.days > 0 ? params.days : DEFAULT_WINDOW_DAYS;
  const since = new Date(Date.now() - windowDays * 86400_000);

  const rows = await prisma.agentSession.findMany({
    where: { updatedAt: { gte: since } },
    orderBy: { updatedAt: "desc" },
    take: SCAN_CAP,
    select: { goal: true, status: true, errorMessage: true, snapshot: true },
  });

  // 意图词统计（每个 goal 对每个词最多计 1 次）
  const intentCount = new Map<string, number>();
  for (const r of rows) {
    const seen = new Set<string>();
    for (const w of INTENT_WORDS) {
      if (r.goal.includes(w) && !seen.has(w)) {
        seen.add(w);
        intentCount.set(w, (intentCount.get(w) ?? 0) + 1);
      }
    }
  }

  // 工具调用榜
  const toolCount = new Map<string, number>();
  for (const r of rows) {
    if (!isAgentSessionSnapshot(r.snapshot) || !Array.isArray(r.snapshot.uiTranscript)) continue;
    for (const m of r.snapshot.uiTranscript) {
      if (m.kind === "action") toolCount.set(m.tool, (toolCount.get(m.tool) ?? 0) + 1);
    }
  }

  // 失败模式聚类
  const errorCount = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "error") continue;
    const msg = [
      r.errorMessage ?? "",
      isAgentSessionSnapshot(r.snapshot)
        ? (r.snapshot.toolTrace ?? [])
            .filter((t) => !t.ok)
            .slice(-3)
            .map((t) => `${t.via ?? ""} ${t.reason ?? ""}`)
            .join(" ")
        : "",
    ].join(" ");
    let label = "无错误信息";
    if (msg) {
      for (const p of ERROR_PATTERNS) {
        if (p.test.test(msg)) { label = p.label; break; }
      }
      if (label === "无错误信息") label = "其他";
    }
    errorCount.set(label, (errorCount.get(label) ?? 0) + 1);
  }

  const failToolCount = new Map<string, number>();
  for (const r of rows) {
    if (!isAgentSessionSnapshot(r.snapshot)) continue;
    for (const t of r.snapshot.toolTrace ?? []) {
      if (t.ok) continue;
      failToolCount.set(t.tool, (failToolCount.get(t.tool) ?? 0) + 1);
    }
  }

  return success({
    totalSessions: rows.length,
    errorSessionCount: rows.filter((r) => r.status === "error").length,
    windowDays,
    scanned: rows.length,
    goalIntents: toTop(
      [...intentCount.entries()].map(([intent, count]) => ({ intent, count })),
      12,
    ),
    toolCalls: toTop(
      [...toolCount.entries()].map(([tool, count]) => ({ tool, count })),
      12,
    ),
    failTools: toTop(
      [...failToolCount.entries()].map(([tool, count]) => ({ tool, count })),
      12,
    ),
    errorPatterns: toTop(
      [...errorCount.entries()].map(([pattern, count]) => ({ pattern, count })),
      10,
    ),
  });
}
