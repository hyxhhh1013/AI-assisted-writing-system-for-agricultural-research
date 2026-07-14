"use client";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface AdminSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function AdminSearchInput({
  value,
  onChange,
  placeholder = "搜索...",
}: AdminSearchInputProps) {
  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9aa8a0]" />
      <Input
        className="pl-9 h-9 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
