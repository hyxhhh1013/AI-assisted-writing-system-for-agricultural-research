import type { WritingSSEEvent } from "@/contracts/sse";
import type { WritingStage } from "@/contracts/agent";
import { sectionDisplayName } from "@/lib/agent/ui-progress";
import type { WriteProgressPayload } from "@/lib/agent/write-status";

/** delta 实时字数推送的最小间隔 */
export const DELTA_THROTTLE_MS = 1000;

export interface WriteProgressState {
  chars: number;
  lastDeltaEmitAt: number;
  startedAt: number;
  verificationChars: number;
  info: string[];
  warnings: string[];
  stage: WritingStage;
}

export function createWriteProgressState(): WriteProgressState {
  return {
    chars: 0,
    lastDeltaEmitAt: 0,
    startedAt: 0,
    verificationChars: 0,
    info: [],
    warnings: [],
    stage: "writing",
  };
}

/**
 * 把写作管道事件翻译成结构化 agent/progress 负载。
 * 返回 null 表示不转发（非进度事件 / 节流中）。now 参数默认取 Date.now()，测试可注入。
 */
export function translateWritingEventToProgress(
  section: string,
  event: WritingSSEEvent,
  state: WriteProgressState,
  now: number = Date.now(),
): WriteProgressPayload | null {
  if (state.startedAt === 0) state.startedAt = now;
  const base = `正在撰写「${sectionDisplayName(section)}」`;
  const elapsedMs = now - state.startedAt;

  const out = (
    stage: WritingStage,
    detail?: string,
    extra: Partial<WriteProgressPayload> = {},
  ): WriteProgressPayload => ({
    label: detail ? `${base}· ${detail}` : base,
    stage,
    ...(detail !== undefined ? { detail } : {}),
    chars: state.chars,
    elapsedMs,
    ...(state.info.length ? { info: [...state.info] } : {}),
    ...(state.warnings.length ? { warnings: [...state.warnings] } : {}),
    ...extra,
  });

  switch (event.type) {
    case "status": {
      switch (event.status) {
        case "retrieving": state.stage = "retrieving"; return out("retrieving", "检索文献中…");
        case "writing": state.stage = "writing"; return out("writing", "生成初稿…");
        case "verifying": state.stage = "verifying"; return out("verifying", "自动核查中…");
        case "refining": state.stage = "refining"; return out("refining", "修正中…");
        case "completed": state.stage = "completed"; return out("completed", "完成");
        case "building_context": state.stage = "writing"; return out("writing", "整理上下文…");
        case "checking_citations": state.stage = "verifying"; return out("verifying", "检查引用…");
        default: return null; // 非转发状态（generating_figures 等）不改 state.stage
      }
    }
    case "delta": {
      state.chars += event.content.length;
      if (now - state.lastDeltaEmitAt < DELTA_THROTTLE_MS) return null;
      state.lastDeltaEmitAt = now;
      state.stage = "writing";
      return out("writing", `生成初稿… 已 ${state.chars} 字`);
    }
    case "bullet_done": {
      state.stage = "writing";
      return out("writing", `要点 ${event.bulletIndex + 1}/${event.bulletCount} 完成`);
    }
    case "pipeline_step": {
      if (!event.detail) return null;
      state.stage = event.step === "verifying" ? "verifying" : event.step === "refining" ? "refining" : state.stage;
      return out(state.stage, event.detail);
    }
    case "verification": {
      state.verificationChars += event.verification.length;
      state.stage = "verifying";
      return out("verifying", `已输出 ${state.verificationChars} 字`);
    }
    case "verification_progress": {
      state.stage = "verifying";
      return out("verifying", `已核查 ${event.checked}/${event.total} 条引用`);
    }
    case "corrected_text":
    case "clear_result": {
      state.stage = "refining";
      return out("refining", "应用核查修正…");
    }
    case "info": {
      if (!state.info.includes(event.info)) state.info.push(event.info);
      return out(state.stage);
    }
    case "data_claim_warnings": {
      for (const w of event.warnings) {
        const line = `数据声明未核实：${w.claimText.slice(0, 40)}`;
        if (!state.warnings.includes(line)) state.warnings.push(line);
      }
      return out(state.stage);
    }
    case "error": {
      state.stage = "error";
      return out("error", event.error);
    }
    default:
      return null;
  }
}
