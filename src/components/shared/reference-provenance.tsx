"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ReferenceSourceRecord } from "@/contracts/references";
import { listReferenceSources } from "@/services/references";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Link2,
  Loader2,
} from "lucide-react";

interface ReferenceProvenanceProps {
  projectId: string;
  className?: string;
}

export function ReferenceProvenance({ projectId, className }: ReferenceProvenanceProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [records, setRecords] = useState<ReferenceSourceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    if (!projectId || loaded) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listReferenceSources(projectId);
      setRecords(
        [...data].sort((a, b) => a.refIndex - b.refIndex || a.sourceName.localeCompare(b.sourceName)),
      );
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载溯源失败");
    } finally {
      setLoading(false);
    }
  }, [projectId, loaded]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (next === false) {
      void loadRecords();
    }
  };

  const openReader = (sourceName: string) => {
    router.push(`/reader?file=${encodeURIComponent(sourceName)}`);
  };

  return (
    <div className={cn("border-t pt-2 mt-2", className)}>
      <button
        type="button"
        onClick={toggle}
        className="flex items-center justify-between w-full text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1 py-1"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <Link2 className="h-3 w-3" />
          引用溯源
          {loaded && records.length > 0 && (
            <span className="text-[9px] font-normal">({records.length})</span>
          )}
        </span>
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {!collapsed && (
        <div className="mt-1 px-1">
          {loading && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              加载映射...
            </div>
          )}

          {error && (
            <p className="text-[10px] text-destructive py-1">{error}</p>
          )}

          {!loading && !error && loaded && records.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic py-1">
              扩写完成后，[n] 与 PDF 的映射会显示在这里
            </p>
          )}

          {!loading && records.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-1 pr-2 font-medium">编号</th>
                    <th className="text-left py-1 pr-2 font-medium">文献</th>
                    <th className="text-right py-1 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((row) => (
                    <tr key={row.id} className="border-b border-border/40 last:border-0">
                      <td className="py-1.5 pr-2 font-mono text-primary">[{row.refIndex}]</td>
                      <td className="py-1.5 pr-2 truncate max-w-[140px]" title={row.sourceName}>
                        {row.sourceName}
                      </td>
                      <td className="py-1.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[9px] gap-1"
                          onClick={() => openReader(row.sourceName)}
                        >
                          <ExternalLink className="h-3 w-3" />
                          阅读
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
