"use client";

import { useState } from "react";
import type { StudioController } from "../hooks/use-studio-session";
import { configToRows, IRON_RULES } from "../flow";
import { Button, buttonVariants } from "@/components/ui/button";
import { siteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";

interface ConfigConfirmProps {
  studio: StudioController;
}

export function ConfigConfirm({ studio }: ConfigConfirmProps) {
  const { session, confirmConfiguration, goScreen, patch } = studio;
  const rows = configToRows(session.config);
  const hasOwnLit = Boolean(session.config.existingMaterials?.literature);
  const [saving, setSaving] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const projectId = session.linkedProject?.id;

  const onConfirm = async () => {
    setSaving(true);
    setSyncNote(null);
    try {
      await confirmConfiguration();
      if (projectId) {
        setSyncNote("已尝试同步到项目护照配置");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h2 className="text-2xl font-bold text-[#122820]">请确认「论文配置记录」</h2>
        <p className="mt-2 text-sm text-[#6b7c72]">
          确认后进入流水线。若已关联项目，会同步到工作台的论文护照（标题/类型/字数/语言/引用格式）。
        </p>
      </header>

      {!projectId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          尚未关联项目。确认后仍可浏览流水线，但绿色「打开」按钮需要先关联项目才可用。
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#1a5632]/15 bg-white px-4 py-3 text-sm">
          <span className="text-[#6b7c72]">将同步到项目：</span>
          <span className="font-medium text-[#122820]">{session.linkedProject?.title}</span>
          <a
            href={`/workbench?id=${encodeURIComponent(projectId)}&tab=structure&meta=1`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1")}
          >
            预览工作台设置
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      <div className={cn(siteTheme.card, "overflow-hidden")}>
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-[#1a5632]/8 last:border-0">
                <th className="w-36 bg-[#1a5632]/[0.04] px-4 py-3 text-left font-medium text-[#3d4f46]">
                  {row.label}
                </th>
                <td className="px-4 py-3 text-[#122820]">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
        <div className="flex gap-2 font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          确认后将锁定本配置并进入流水线
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-amber-900/90">
          {IRON_RULES.slice(0, 2).map((r) => (
            <li key={r.id}>{r.body}</li>
          ))}
        </ul>
      </div>

      {hasOwnLit && (session.mode === "full" || session.mode === "outline-only") ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#1a5632]/15 bg-white px-4 py-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={session.checkpoints.skipLiterature}
            onChange={(e) => {
              const checked = e.target.checked;
              patch((prev) => ({
                ...prev,
                checkpoints: {
                  ...prev.checkpoints,
                  skipLiterature: checked,
                  sourcesReviewed: checked ? true : prev.checkpoints.sourcesReviewed,
                },
              }));
            }}
          />
          <span>
            我已自备完整文献，或打算先写正文再补文献：确认后跳过「收集与筛选文献」
          </span>
        </label>
      ) : null}

      {syncNote ? <p className="text-xs text-[#1a5632]">{syncNote}</p> : null}

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => goScreen("intake")} disabled={saving}>
          返回修改
        </Button>
        <Button className={siteTheme.btnPrimary} onClick={() => void onConfirm()} disabled={saving}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {saving ? "保存中…" : "确认配置，进入流水线"}
        </Button>
      </div>
    </div>
  );
}
