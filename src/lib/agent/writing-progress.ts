import type { WritingSSEEvent } from "@/contracts/sse";
import { sectionDisplayName } from "@/lib/agent/ui-progress";

/** delta 实时字数推送的最小间隔 */
export const DELTA_THROTTLE_MS = 1000;

export interface WriteProgressState {
  /** 已累计的 delta 原始字符数（节流期内继续累计） */
  chars: number;
  /** 上次 delta 发射时间戳 */
  lastDeltaEmitAt: number;
}

export function createWriteProgressState(): WriteProgressState {
  return { chars: 0, lastDeltaEmitAt: 0 };
}

/**
 * 把写作管道事件翻译成 agent/progress 的展示 label。
 * 返回 null 表示不转发（非进度事件 / 节流中）。now 参数默认取 Date.now()，测试可注入。
 */
export function translateWritingEventToProgress(
  section: string,
  event: WritingSSEEvent,
  state: WriteProgressState,
  now: number = Date.now(),
): { label: string } | null {
  const base = `正在撰写「${sectionDisplayName(section)}」`;

  switch (event.type) {
    case "status": {
      switch (event.status) {
        case "writing":
          return { label: `${base}· 生成初稿…` };
        case "verifying":
          return { label: `${base}· 自动核查中…` };
        case "refining":
          return { label: `${base}· 修正中…` };
        default:
          return null;
      }
    }
    case "pipeline_step": {
      if (!event.detail) return null;
      return { label: `${base}· ${event.detail}` };
    }
    case "bullet_done": {
      return { label: `${base}· 要点 ${event.bulletIndex + 1}/${event.bulletCount} 完成` };
    }
    case "delta": {
      state.chars += event.content.length;
      if (now - state.lastDeltaEmitAt < DELTA_THROTTLE_MS) return null;
      state.lastDeltaEmitAt = now;
      return { label: `${base}· 生成初稿… 已 ${state.chars} 字` };
    }
    default:
      return null;
  }
}
