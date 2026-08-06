"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AdminListMeta } from "@/contracts/admin";

interface AdminPaginationProps {
  meta: AdminListMeta;
  onPageChange: (page: number) => void;
}

export function AdminPagination({ meta, onPageChange }: AdminPaginationProps) {
  if (meta.totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-3 text-xs text-[#6b7c72]">
      <span>
        共 {meta.total} 条 · 第 {meta.page}/{meta.totalPages} 页
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5 mr-1" />
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          下一页
          <ChevronRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
