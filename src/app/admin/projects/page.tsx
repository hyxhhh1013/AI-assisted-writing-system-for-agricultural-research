"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface Project {
  id: string;
  title: string;
  template: string;
  mode: string;
  userName: string;
  userEmail: string;
  progress: number;
  referenceCount: number;
  createdAt: string;
  lastUpdated: string;
}

const TEMPLATE_LABELS: Record<string, string> = {
  sci: "SCI",
  ieee: "IEEE",
  gbt7713: "GB/T 7713",
  nature: "Nature",
};

function getProgressColor(p: number) {
  if (p === 0) return "bg-gray-200";
  if (p < 50) return "bg-blue-400";
  if (p < 90) return "bg-amber-400";
  return "bg-[#1a5632]";
}

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    const url = filter ? `/api/admin/projects?template=${filter}` : "/api/admin/projects";
    fetch(url)
      .then((r) => r.json())
      .then((d) => { setProjects(d); setLoading(false); })
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
        <h1 className="text-lg font-semibold text-[#122820]">项目管理</h1>
        <div className="flex gap-1">
          {["", "sci", "ieee", "gbt7713", "nature"].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                filter === t
                  ? "bg-[#1a5632] text-white"
                  : "text-[#6b7c72] hover:bg-[#1a5632]/8"
              }`}
            >
              {t ? TEMPLATE_LABELS[t] ?? t : "全部"}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[#1a5632]/10 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1a5632]/10 bg-[#f8f7f4]">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                标题
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                作者
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                模板
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                进度
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                引用
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                更新时间
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-b border-[#1a5632]/5 last:border-0">
                <td className="px-4 py-2.5 font-medium text-[#122820] truncate max-w-[200px]">
                  {p.title || "未命名"}
                </td>
                <td className="px-4 py-2.5 text-xs text-[#3d4f46]">
                  {p.userName}
                </td>
                <td className="px-4 py-2.5">
                  <span className="rounded bg-[#1a5632]/8 px-1.5 py-0.5 text-[10px] text-[#1a5632]">
                    {TEMPLATE_LABELS[p.template] ?? p.template}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-[#1a5632]/8 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getProgressColor(p.progress)}`}
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-[#9aa8a0]">{p.progress}%</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs text-[#3d4f46]">
                  {p.referenceCount}
                </td>
                <td className="px-4 py-2.5 text-xs text-[#9aa8a0]">
                  {new Date(p.lastUpdated).toLocaleDateString("zh-CN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {projects.length === 0 && (
          <p className="py-8 text-center text-xs text-[#9aa8a0]">暂无项目</p>
        )}
      </div>
    </div>
  );
}
