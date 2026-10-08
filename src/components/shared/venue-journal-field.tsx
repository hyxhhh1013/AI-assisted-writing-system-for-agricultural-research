"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listVenueJournalNames, venueSpecDiffers, type VenueAlignable, type VenueSuggestion } from "@/lib/venues/registry";

interface VenueJournalFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function VenueJournalField({
  id,
  value,
  onChange,
  placeholder = "如 Applied Soil Ecology",
  className,
  disabled,
}: VenueJournalFieldProps) {
  const listId = `${id}-venues`;
  return (
    <>
      <Input
        id={id}
        list={listId}
        value={value}
        disabled={disabled}
        className={className}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {listVenueJournalNames().map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}

export function VenueSpecUpdateBanner({
  current,
  journal,
  onApply,
}: {
  current: VenueAlignable;
  journal: string;
  onApply: (suggestion: VenueSuggestion) => void;
}) {
  const diff = venueSpecDiffers(current, journal);
  if (!diff) return null;
  const languageLabel = diff.language === "en" ? "英文" : "中文";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-[#1a5632]/20 bg-[#f6f5f1]/70 px-2.5 py-2">
      <p className="text-[10px] text-[#6b7c72]">
        {diff.reason}：{languageLabel} · {diff.template} · {diff.citationStyle} · {diff.chartPreset}
      </p>
      <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onApply(diff)}>
        按该刊规格更新
      </Button>
    </div>
  );
}
