"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Eye, EyeOff, Key, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

interface Setting {
  key: string; maskedValue: string; updatedAt: string;
}

const PRESET_KEYS = [
  { key: "DEEPSEEK_API_KEY", label: "DeepSeek API Key", hint: "用于 AI 写作、大纲、翻译等" },
  { key: "ZHIPU_API_KEY", label: "智谱 API Key", hint: "用于写作管线中的审查代理（可选）" },
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editKey, setEditKey] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editPreset, setEditPreset] = useState("");
  const [saving, setSaving] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [fullValues, setFullValues] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then(d => { if (d.success) setSettings(d.data); })
      .catch(() => toast.error("加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleVisible = async (key: string) => {
    if (visibleKeys.has(key)) {
      setVisibleKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
      return;
    }
    // 查询完整值
    const r = await fetch(`/api/admin/settings?key=${encodeURIComponent(key)}`);
    const d = await r.json();
    if (d.success && d.data?.exists) {
      // 需要通过 getSetting 获取解密值
      setVisibleKeys(prev => new Set(prev).add(key));
    }
  };

  const handleSave = async () => {
    if (!editKey.trim()) { toast.error("Key 不能为空"); return; }
    if (!editValue.trim()) { toast.error("Value 不能为空"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: editKey.trim(), value: editValue.trim() }),
      });
      const d = await res.json().catch(() => ({ error: `${res.status} ${res.statusText}` }));
      if (res.ok && d.success) { toast.success(d.message || "已保存"); load(); setShowAdd(false); }
      else toast.error(d.error || d.message || "保存失败");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "网络错误"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch("/api/admin/settings", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: deleteTarget }),
    });
    if (res.ok) { toast.success("已删除"); load(); }
    else toast.error("删除失败");
    setDeleteTarget(null);
  };

  const openAdd = (presetKey?: string) => {
    setEditKey(presetKey || "");
    setEditValue("");
    setEditPreset(presetKey || "");
    setShowAdd(true);
  };

  const existingKeys = new Set(settings.map(s => s.key));

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#122820]">系统设置</h2>
          <p className="text-sm text-[#6b7c72]">API Key 等敏感配置加密存储在数据库中，修改后 30 秒内热生效</p>
        </div>
        <Button size="sm" onClick={() => openAdd()} className="gap-1"><Plus className="h-4 w-4" />添加</Button>
      </div>

      {/* 预设 Key 快捷操作 */}
      <div className="grid gap-3 sm:grid-cols-2">
        {PRESET_KEYS.map(pk => {
          const existing = settings.find(s => s.key === pk.key);
          return (
            <div key={pk.key} className="rounded-xl border border-[#1a5632]/10 bg-white p-4 flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-[#1a5632]" />
                  <span className="text-sm font-medium text-[#122820]">{pk.label}</span>
                  {existing ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}
                </div>
                <p className="text-[10px] text-[#9aa8a0] mt-0.5">{pk.hint}</p>
                {existing && <p className="text-[10px] text-[#1a5632] mt-0.5 font-mono">{existing.maskedValue}</p>}
              </div>
              <Button variant={existing ? "outline" : "default"} size="sm" className="shrink-0 ml-3" onClick={() => openAdd(pk.key)}>
                {existing ? "修改" : "配置"}
              </Button>
            </div>
          );
        })}
      </div>

      {/* 所有设置列表 */}
      <div className="rounded-xl border border-[#1a5632]/10 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1a5632]/10 bg-[#faf9f6] text-left text-[#6b7c72]">
              <th className="py-2.5 px-4 font-medium">Key</th>
              <th className="py-2.5 px-4 font-medium">Value</th>
              <th className="py-2.5 px-4 font-medium hidden sm:table-cell">更新时间</th>
              <th className="py-2.5 px-4 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {settings.map(s => (
              <tr key={s.key} className="border-b border-[#1a5632]/5 hover:bg-[#1a5632]/[0.02]">
                <td className="py-2.5 px-4 font-mono text-xs text-[#122820]">{s.key}</td>
                <td className="py-2.5 px-4 font-mono text-xs text-[#6b7c72]">{s.maskedValue}</td>
                <td className="py-2.5 px-4 hidden sm:table-cell text-xs text-[#9aa8a0]">{new Date(s.updatedAt).toLocaleString("zh-CN")}</td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAdd(s.key)}><Plus className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setDeleteTarget(s.key)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {settings.length === 0 && (
              <tr><td colSpan={4} className="py-12 text-center text-[#9aa8a0] text-sm">暂无设置<br /><span className="text-[10px]">点击「配置」添加 API Key</span></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 添加/编辑弹窗 */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editPreset ? `配置 ${editPreset}` : "添加设置"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Key</Label>
              <Input className="h-9 text-sm font-mono" value={editKey} onChange={e => setEditKey(e.target.value)} placeholder="DEEPSEEK_API_KEY" disabled={!!editPreset} />
            </div>
            <div>
              <Label className="text-xs">Value</Label>
              <Input className="h-9 text-sm font-mono" value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="sk-..." type="password" />
              <p className="text-[10px] text-[#9aa8a0] mt-1">加密存储于数据库，30 秒内热生效</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>取消</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>确认删除</DialogTitle></DialogHeader>
          <p className="text-sm text-[#6b7c72]">删除 <code className="text-[#122820]">{deleteTarget}</code>？此操作不可恢复。</p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
