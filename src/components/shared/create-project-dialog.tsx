"use client";

import { useState } from "react";
import { BookOpen, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getDefaultProjectTitle,
  WRITING_MODES,
  type ProjectWritingMode,
} from "@/contracts/writing-mode";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (mode: ProjectWritingMode, title: string) => void | Promise<void>;
  isCreating?: boolean;
}

const MODE_ICONS = {
  review: BookOpen,
  research: FlaskConical,
} as const;

const MODE_ACCENT = {
  review: {
    ring: "ring-[#2563eb]/40",
    border: "border-[#2563eb]/30",
    bg: "bg-[#2563eb]/[0.06]",
    icon: "text-[#2563eb]",
    badge: "bg-[#2563eb]/10 text-[#1d4ed8]",
  },
  research: {
    ring: "ring-[#1a5632]/40",
    border: "border-[#1a5632]/30",
    bg: "bg-[#1a5632]/[0.06]",
    icon: "text-[#1a5632]",
    badge: "bg-[#1a5632]/10 text-[#1a5632]",
  },
} as const;

export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreate,
  isCreating = false,
}: CreateProjectDialogProps) {
  const [mode, setMode] = useState<ProjectWritingMode>("review");
  const [title, setTitle] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setMode("review");
      setTitle("");
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const trimmed = title.trim();
    const finalTitle = trimmed || getDefaultProjectTitle(mode);
    await onCreate(mode, finalTitle);
    setMode("review");
    setTitle("");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>新建论文项目</DialogTitle>
          <DialogDescription>
            请先选择写作类型。类型在创建后固定，可在项目中心通过卡片样式区分。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {(["review", "research"] as const).map((id) => {
            const meta = WRITING_MODES[id];
            const Icon = MODE_ICONS[id];
            const accent = MODE_ACCENT[id];
            const selected = mode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cn(
                  "rounded-xl border p-4 text-left transition-all",
                  selected
                    ? cn(accent.border, accent.bg, "ring-2", accent.ring)
                    : "border-border hover:border-[#1a5632]/20 hover:bg-muted/40",
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      selected ? accent.bg : "bg-muted",
                    )}
                  >
                    <Icon className={cn("h-5 w-5", selected ? accent.icon : "text-muted-foreground")} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-[#122820]">{meta.label}</p>
                    <p className="text-xs leading-relaxed text-[#6b7c72]">{meta.description}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1 border-t border-black/5 pt-3">
                  {meta.features.map((f) => (
                    <li key={f} className="text-[11px] text-[#5c6b63] before:mr-1.5 before:content-['·']">
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="create-project-title">论文题目（可选）</Label>
          <Input
            id="create-project-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={getDefaultProjectTitle(mode)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isCreating) void handleSubmit();
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isCreating}>
            取消
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isCreating}>
            {isCreating ? "创建中…" : "创建并进入工作台"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
