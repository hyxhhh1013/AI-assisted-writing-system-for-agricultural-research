"use client";

import { useState, type ReactNode } from "react";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";

interface AdminExpandableListProps<T extends { id: string }> {
  items: T[];
  loading?: boolean;
  emptyText?: string;
  emptyAction?: ReactNode;
  renderSummary: (item: T) => ReactNode;
  renderDetail: (item: T) => ReactNode;
  renderFooter?: (item: T) => ReactNode;
  loadDetail: (id: string) => Promise<void>;
  detailLoading?: boolean;
}

export function AdminExpandableList<T extends { id: string }>({
  items,
  loading,
  emptyText = "暂无记录",
  emptyAction,
  renderSummary,
  renderDetail,
  renderFooter,
  loadDetail,
  detailLoading,
}: AdminExpandableListProps<T>) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    await loadDetail(id);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[#9aa8a0] text-sm">{emptyText}</p>
        {emptyAction && <div className="mt-4 flex justify-center">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isOpen = expanded === item.id;
        return (
          <div key={item.id}>
            <button
              type="button"
              onClick={() => void toggle(item.id)}
              className="w-full text-left rounded-xl border border-[#1a5632]/10 bg-white p-4 hover:border-[#1a5632]/20 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">{renderSummary(item)}</div>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-[#1a5632]/50" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-[#1a5632]/30" />
                )}
              </div>
            </button>
            {isOpen && (
              <div className="border-x border-b border-[#1a5632]/20 rounded-b-xl bg-[#faf9f6] p-4">
                {detailLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <>
                    {renderDetail(item)}
                    {renderFooter?.(item)}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
