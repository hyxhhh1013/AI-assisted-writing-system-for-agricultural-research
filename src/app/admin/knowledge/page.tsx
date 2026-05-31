"use client";

import { useEffect, useState } from "react";
import { Loader2, Database } from "lucide-react";

interface KnowledgeFile {
  id: string;
  name: string;
  category: string;
  documentType: string;
  size: number;
  chunkCount: number;
  mtime: string | null;
}

interface CategoryStat {
  category: string;
  count: number;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminKnowledgePage() {
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    const url = filter
      ? `/api/admin/knowledge?category=${encodeURIComponent(filter)}`
      : "/api/admin/knowledge";
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setFiles(d.files);
        setCategoryStats(d.categoryStats);
        setTotal(d.total);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filter]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#122820]">
          文献库管理
          <span className="ml-2 text-sm font-normal text-[#9aa8a0]">
            {total} 篇
          </span>
        </h1>
      </div>

      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilter("")}
          className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
            filter === ""
              ? "bg-[#1a5632] text-white"
              : "text-[#6b7c72] hover:bg-[#1a5632]/8"
          }`}
        >
          全部 ({total})
        </button>
        {categoryStats.map((c) => (
          <button
            key={c.category}
            onClick={() => setFilter(c.category)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              filter === c.category
                ? "bg-[#1a5632] text-white"
                : "text-[#6b7c72] hover:bg-[#1a5632]/8"
            }`}
          >
            {c.category || "未分类"} ({c.count})
          </button>
        ))}
      </div>

      {/* 文件列表 */}
      <div className="rounded-xl border border-[#1a5632]/10 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1a5632]/10 bg-[#f8f7f4]">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                文件名
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                分类
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                类型
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                文本块
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                大小
              </th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id} className="border-b border-[#1a5632]/5 last:border-0">
                <td className="px-4 py-2.5 font-medium text-[#122820] truncate max-w-[300px]">
                  <div className="flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 shrink-0 text-[#1a5632]/40" />
                    {f.name.replace(/\.pdf$/i, "")}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className="rounded bg-[#1a5632]/8 px-1.5 py-0.5 text-[10px] text-[#1a5632]">
                    {f.category || "未分类"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-[#3d4f46]">
                  {f.documentType === "paper" ? "论文" : f.documentType}
                </td>
                <td className="px-4 py-2.5 text-xs text-[#3d4f46]">
                  {f.chunkCount}
                </td>
                <td className="px-4 py-2.5 text-xs text-[#9aa8a0]">
                  {formatSize(f.size)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {files.length === 0 && (
          <p className="py-8 text-center text-xs text-[#9aa8a0]">暂无文献</p>
        )}
      </div>
    </div>
  );
}
