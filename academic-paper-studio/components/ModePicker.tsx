"use client";

import { BEGINNER_MODE_IDS, MODE_DEFINITIONS, type OperationalMode } from "../flow";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ModePickerProps {
  onSelect: (mode: OperationalMode) => void;
}

export function ModePicker({ onSelect }: ModePickerProps) {
  const beginners = MODE_DEFINITIONS.filter((m) => BEGINNER_MODE_IDS.includes(m.id));
  const others = MODE_DEFINITIONS.filter((m) => !BEGINNER_MODE_IDS.includes(m.id));

  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-2xl font-bold text-[#122820]">你现在最想完成哪一件事？</h2>
        <p className="mt-2 text-sm text-[#6b7c72]">
          先选目标，系统只会打开相关步骤，避免一次塞给你整条流水线。
        </p>
      </header>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-[#1a5632]">适合大多数同学</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {beginners.map((mode) => (
            <ModeCard key={mode.id} modeId={mode.id} featured onSelect={onSelect} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-[#6b7c72]">专项工具</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {others.map((mode) => (
            <ModeCard key={mode.id} modeId={mode.id} onSelect={onSelect} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ModeCard({
  modeId,
  featured,
  onSelect,
}: {
  modeId: OperationalMode;
  featured?: boolean;
  onSelect: (mode: OperationalMode) => void;
}) {
  const mode = MODE_DEFINITIONS.find((m) => m.id === modeId)!;
  return (
    <button
      type="button"
      onClick={() => onSelect(mode.id)}
      className={cn(
        "group w-full rounded-2xl border p-4 text-left transition",
        featured
          ? "border-[#1a5632]/20 bg-white shadow-sm hover:border-[#1a5632]/40 hover:shadow-md"
          : "border-[#1a5632]/10 bg-white/70 hover:border-[#1a5632]/25 hover:bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-[#122820] group-hover:text-[#1a5632]">{mode.title}</h4>
        {mode.beginnerFriendly ? (
          <Badge variant="secondary" className="shrink-0 bg-[#1a5632]/10 text-[#1a5632]">
            新手友好
          </Badge>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[#3d4f46]">{mode.blurb}</p>
      <p className="mt-3 text-xs text-[#6b7c72]">
        何时用：{mode.when}
      </p>
      <p className="mt-1 text-xs text-[#9aa8a0]">产出：{mode.output} · {mode.duration}</p>
    </button>
  );
}
