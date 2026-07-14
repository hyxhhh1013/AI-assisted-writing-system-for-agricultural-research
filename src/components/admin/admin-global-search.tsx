"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, User, FileText, Database } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { searchAdmin } from "@/services/admin";
import type { AdminSearchResponse } from "@/contracts/admin";

const EMPTY: AdminSearchResponse = { users: [], projects: [], knowledge: [] };

export function AdminGlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AdminSearchResponse>(EMPTY);

  const debouncedQ = useDebouncedValue(q, 250);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const term = debouncedQ.trim();
    if (!term) {
      setResults(EMPTY);
      return;
    }
    let cancelled = false;
    setLoading(true);
    searchAdmin(term)
      .then((data) => { if (!cancelled) setResults(data); })
      .catch(() => { if (!cancelled) setResults(EMPTY); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedQ, open]);

  const navigate = useCallback((href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  }, [router]);

  const hasResults =
    results.users.length + results.projects.length + results.knowledge.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-[#1a5632]/15 bg-white px-3 py-1.5 text-xs text-[#6b7c72] hover:border-[#1a5632]/30"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">全局搜索</span>
        <kbd className="hidden sm:inline rounded border border-[#1a5632]/15 px-1.5 py-0.5 text-[10px]">Ctrl+K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-sm">全局搜索</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-3">
            <Input
              autoFocus
              placeholder="搜索用户、项目、文献..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="max-h-80 overflow-y-auto border-t border-[#1a5632]/10 px-2 py-2">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[#6b7c72]" />
              </div>
            ) : !debouncedQ.trim() ? (
              <p className="py-8 text-center text-xs text-[#9aa8a0]">输入关键词开始搜索</p>
            ) : !hasResults ? (
              <p className="py-8 text-center text-xs text-[#9aa8a0]">无匹配结果</p>
            ) : (
              <div className="space-y-3">
                <SearchGroup title="用户" icon={User}>
                  {results.users.map((u) => (
                    <SearchRow
                      key={u.id}
                      label={u.label}
                      onClick={() => navigate(`/admin/users/${u.id}`)}
                    />
                  ))}
                </SearchGroup>
                <SearchGroup title="项目" icon={FileText}>
                  {results.projects.map((p) => (
                    <SearchRow
                      key={p.id}
                      label={p.label}
                      sub={p.userName ?? undefined}
                      onClick={() => navigate(`/workbench?id=${p.id}`)}
                    />
                  ))}
                </SearchGroup>
                <SearchGroup title="文献" icon={Database}>
                  {results.knowledge.map((k) => (
                    <SearchRow
                      key={k.id}
                      label={k.label}
                      sub={k.category}
                      onClick={() => navigate("/admin/knowledge")}
                    />
                  ))}
                </SearchGroup>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SearchGroup({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof User;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium uppercase text-[#9aa8a0]">
        <Icon className="h-3 w-3" />
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SearchRow({
  label,
  sub,
  onClick,
}: {
  label: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-[#1a5632]/5"
    >
      <span className="truncate text-[#122820]">{label}</span>
      {sub && <Badge variant="outline" className="ml-2 shrink-0 text-[10px]">{sub}</Badge>}
    </button>
  );
}
