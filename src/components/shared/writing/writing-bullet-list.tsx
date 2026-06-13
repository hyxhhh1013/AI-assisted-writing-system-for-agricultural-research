"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { MAX_WRITING_BULLETS, MIN_WRITING_BULLETS } from "@/contracts/writing";

interface WritingBulletListProps {
  bullets: string[];
  onChange: (bullets: string[]) => void;
  disabled?: boolean;
  sectionLabel?: string;
}

export function WritingBulletList({
  bullets,
  onChange,
  disabled,
  sectionLabel = "扩写要点",
}: WritingBulletListProps) {
  const updateBullet = (index: number, value: string) => {
    const next = [...bullets];
    next[index] = value;
    onChange(next);
  };

  const addBullet = () => {
    if (bullets.length >= MAX_WRITING_BULLETS) return;
    onChange([...bullets, ""]);
  };

  const removeBullet = (index: number) => {
    if (bullets.length <= MIN_WRITING_BULLETS) return;
    onChange(bullets.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{sectionLabel}</Label>
        <span className="text-[10px] text-muted-foreground">
          {bullets.filter((b) => b.trim()).length}/{MIN_WRITING_BULLETS}～{MAX_WRITING_BULLETS} 条
        </span>
      </div>
      <ul className="space-y-1.5">
        {bullets.map((bullet, index) => (
          <li key={index} className="flex items-center gap-1.5">
            <span className="w-5 shrink-0 text-[10px] text-muted-foreground text-right">{index + 1}.</span>
            <Input
              value={bullet}
              disabled={disabled}
              placeholder={`要点 ${index + 1}：一句话说明本节要写的论点或证据方向`}
              className="h-8 text-xs"
              onChange={(e) => updateBullet(index, e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={disabled || bullets.length <= MIN_WRITING_BULLETS}
              onClick={() => removeBullet(index)}
              title={bullets.length <= MIN_WRITING_BULLETS ? `至少保留 ${MIN_WRITING_BULLETS} 条` : "删除要点"}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-full text-[10px]"
        disabled={disabled || bullets.length >= MAX_WRITING_BULLETS}
        onClick={addBullet}
      >
        <Plus className="mr-1 h-3 w-3" />
        添加要点
      </Button>
    </div>
  );
}
