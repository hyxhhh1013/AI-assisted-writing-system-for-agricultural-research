"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminDataTableColumn<T> {
  key: string;
  header: ReactNode;
  sortable?: boolean;
  className?: string;
  hideOnMobile?: boolean;
  cell: (row: T) => ReactNode;
}

interface AdminDataTableProps<T> {
  columns: AdminDataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string) => void;
}

function SortIcon({ active, order }: { active: boolean; order?: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return order === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

export function AdminDataTable<T>({
  columns,
  data,
  rowKey,
  loading,
  emptyTitle = "暂无数据",
  emptyDescription,
  emptyAction,
  sortBy,
  sortOrder,
  onSort,
}: AdminDataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex justify-center py-14">
        <Loader2 className="h-6 w-6 animate-spin text-[#1a5632]/40" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#1a5632]/20 bg-white px-6 py-12 text-center">
        <p className="text-sm font-medium text-[#122820]">{emptyTitle}</p>
        {emptyDescription && <p className="mt-1 text-xs text-[#9aa8a0]">{emptyDescription}</p>}
        {emptyAction && <div className="mt-4 flex justify-center">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#1a5632]/10 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1a5632]/10 bg-[#faf9f6] text-left text-[#6b7c72]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-2.5 text-xs font-medium",
                  col.hideOnMobile && "hidden sm:table-cell",
                  col.className,
                )}
              >
                {col.sortable && onSort ? (
                  <button
                    type="button"
                    onClick={() => onSort(col.key)}
                    className="inline-flex items-center gap-1 hover:text-[#1a5632]"
                  >
                    {col.header}
                    <SortIcon active={sortBy === col.key} order={sortOrder} />
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-[#1a5632]/5 last:border-0 hover:bg-[#1a5632]/[0.03]"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-4 py-2.5",
                    col.hideOnMobile && "hidden sm:table-cell",
                    col.className,
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
