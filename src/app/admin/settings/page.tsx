"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Key, CheckCircle2, XCircle, Cpu, Zap, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteAdminSetting,
  getAiStatus,
  listAdminSettings,
  saveAdminSetting,
  testAiConnection,
  type AdminAiRoles,
  type AdminAiStatusResponse,
  type AdminSettingRecord,
} from "@/services/admin";
import type { AiProviderKey } from "@/contracts/admin";
import {
  DEEPSEEK_MODEL_OPTIONS,
  ZHIPU_MODEL_OPTIONS,
} from "@/lib/models";

type EditKind = "secret" | "model";

const PROVIDERS: {
  provider: AiProviderKey;
  name: string;
  hint: string;
  apiKeyPrefix: string;
  modelKey: string;
  modelOptions: readonly string[];
}[] = [
  {
    provider: "deepseek",
    name: "DeepSeek",
    hint: "AI 写作、Agent、大纲、翻译等",
    apiKeyPrefix: "DEEPSEEK_API_KEY",
    modelKey: "DEEPSEEK_MODEL",
    modelOptions: DEEPSEEK_MODEL_OPTIONS,
  },
  {
    provider: "zhipu",
    name: "智谱",
    hint: "写作管线中的审查代理（Verifier）",
    apiKeyPrefix: "ZHIPU_API_KEY",
    modelKey: "ZHIPU_MODEL",
    modelOptions: ZHIPU_MODEL_OPTIONS,
  },
];

const ROLE_LABELS: { role: keyof AdminAiRoles; label: string; desc: string }[] = [
  { role: "writer", label: "Writer（写作）", desc: "Agent / 写作管线主模型" },
  { role: "verifier", label: "Verifier（审查）", desc: "一致性 / 引用审查" },
  { role: "refiner", label: "Refiner（润色）", desc: "写作后润色" },
];

const SOURCE_LABEL: Record<string, string> = { db: "DB", env: "env", default: "默认" };

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AdminSettingRecord[]>([]);
  const [aiStatus, setAiStatus] = useState<AdminAiStatusResponse | null>(null);
  const [roles, setRoles] = useState<AdminAiRoles>({
    writer: "deepseek",
    verifier: "deepseek",
    refiner: "deepseek",
  });
  const [loading, setLoading] = useState(true);

  // 编辑对话框
  const [showEdit, setShowEdit] = useState(false);
  const [editProvider, setEditProvider] = useState<AiProviderKey>("deepseek");
  const [editKey, setEditKey] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editKind, setEditKind] = useState<EditKind>("secret");
  const [editOptions, setEditOptions] = useState<readonly string[] | null>(null);
  const [customModel, setCustomModel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [savingRoles, setSavingRoles] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, st] = await Promise.allSettled([listAdminSettings(), getAiStatus()]);
    if (s.status === "fulfilled") setSettings(s.value);
    else toast.error("加载设置失败");
    if (st.status === "fulfilled") {
      setAiStatus(st.value);
      setRoles(st.value.roles);
    } else {
      toast.error("加载 AI 状态失败");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** 新增 API Key：自动取下一个编号（DEEPSEEK_API_KEY → _2 → _3 …） */
  const openAddKey = (provider: (typeof PROVIDERS)[number]) => {
    const dbKeys = settings.filter(
      (x) => x.key === provider.apiKeyPrefix || x.key.startsWith(`${provider.apiKeyPrefix}_`),
    );
    const nextName = dbKeys.length === 0
      ? provider.apiKeyPrefix
      : `${provider.apiKeyPrefix}_${dbKeys.length + 1}`;
    setEditProvider(provider.provider);
    setEditKey(nextName);
    setEditValue("");
    setEditKind("secret");
    setEditOptions(null);
    setCustomModel(false);
    setShowEdit(true);
  };

  /** 配置模型：预设下拉 + 自定义（当前 DB 值不在预设时自动进入自定义模式） */
  const openEditModel = (provider: (typeof PROVIDERS)[number]) => {
    const existing = settings.find((x) => x.key === provider.modelKey);
    const current = existing?.maskedValue ?? "";
    setEditProvider(provider.provider);
    setEditKey(provider.modelKey);
    setEditValue(current);
    setEditKind("model");
    setEditOptions(provider.modelOptions);
    setCustomModel(current !== "" && !provider.modelOptions.includes(current));
    setShowEdit(true);
  };

  /** 编辑已有 DB Key（仅 Key 名 + 重填值） */
  const openEditKey = (key: string) => {
    const provider = PROVIDERS.find(
      (p) => key === p.apiKeyPrefix || key.startsWith(`${p.apiKeyPrefix}_`),
    );
    setEditProvider(provider?.provider ?? "deepseek");
    setEditKey(key);
    setEditValue("");
    setEditKind("secret");
    setEditOptions(null);
    setCustomModel(false);
    setShowEdit(true);
  };

  const handleSave = async () => {
    if (!editKey.trim()) { toast.error("Key 不能为空"); return; }
    if (!editValue.trim()) { toast.error("Value 不能为空"); return; }
    setSaving(true);
    try {
      const d = await saveAdminSetting(editKey.trim(), editValue.trim());
      if (d.ok) {
        toast.success(d.message || "已保存");
        setShowEdit(false);
        await load();
      } else {
        toast.error(d.error || "保存失败");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "网络错误");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const ok = await deleteAdminSetting(deleteTarget);
    if (ok) { toast.success("已删除"); setDeleteTarget(null); await load(); }
    else { toast.error("删除失败"); setDeleteTarget(null); }
  };

  const handleTest = async (provider: AiProviderKey, model?: string, apiKey?: string) => {
    setTesting(true);
    try {
      const r = await testAiConnection({ provider, model, apiKey });
      if (r.ok) toast.success(r.message || "连接正常");
      else toast.error(r.error || "连接失败");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "测试失败");
    } finally {
      setTesting(false);
    }
  };

  const handleSaveRoles = async () => {
    setSavingRoles(true);
    try {
      for (const { role } of ROLE_LABELS) {
        const d = await saveAdminSetting(`AGENT_ROLE_${role.toUpperCase()}`, roles[role]);
        if (!d.ok) { toast.error(d.error || `保存 ${role} 失败`); return; }
      }
      toast.success("角色映射已保存，立即生效");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingRoles(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#122820]">系统设置</h2>
          <p className="text-sm text-[#6b7c72]">
            API Key 与模型名写入数据库，保存后立即生效（无需重启）
          </p>
        </div>
      </div>

      {/* ==================== AI Provider 卡片 ==================== */}
      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDERS.map((p) => {
          const status = aiStatus?.providers.find((x) => x.provider === p.provider);
          const ready = Boolean(status && (status.enabled || status.keyCount > 0));
          const dbKeys = settings.filter(
            (x) => x.key === p.apiKeyPrefix || x.key.startsWith(`${p.apiKeyPrefix}_`),
          );
          return (
            <div key={p.provider} className="rounded-xl border border-[#1a5632]/10 bg-white p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-[#1a5632]" />
                  <span className="text-sm font-medium text-[#122820]">{p.name}</span>
                  {ready
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    : <XCircle className="h-3.5 w-3.5 text-red-400" />}
                </div>
                <Button
                  variant="outline" size="sm" className="gap-1" disabled={testing}
                  onClick={() => void handleTest(p.provider, status?.model)}
                >
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  测试连接
                </Button>
              </div>

              <div className="text-[10px] text-[#9aa8a0]">{p.hint}</div>

              {/* 当前生效模型 */}
              <div className="rounded-lg bg-[#faf9f6] px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-xs text-[#6b7c72] shrink-0">当前生效模型</span>
                <span className="flex items-center gap-2 min-w-0">
                  <code className="text-xs font-mono text-[#122820] truncate">{status?.model ?? "—"}</code>
                  {status && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${
                      status.modelSource === "db"
                        ? "bg-[#1a5632]/10 text-[#1a5632]"
                        : status.modelSource === "env"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-[#e8e4dc] text-[#6b7c72]"
                    }`}>
                      {SOURCE_LABEL[status.modelSource]}
                    </span>
                  )}
                </span>
              </div>

              {/* Key 概览（env + DB，脱敏只读） */}
              <div>
                <div className="text-xs text-[#6b7c72] mb-1">可用 Key（{status?.keyCount ?? 0}）</div>
                <div className="flex flex-wrap gap-1.5">
                  {(status?.keys ?? []).map((k, i) => (
                    <code key={i} className="text-[10px] font-mono px-2 py-1 rounded bg-[#f4f2ec] text-[#6b7c72]">{k}</code>
                  ))}
                  {(status?.keys ?? []).length === 0 && (
                    <span className="text-xs text-[#9aa8a0]">未配置</span>
                  )}
                </div>
              </div>

              {/* DB 已存 Key 管理 */}
              <div className="border-t border-[#1a5632]/5 pt-2 space-y-1">
                <div className="text-xs text-[#6b7c72]">DB 已存 Key（可多填，自动轮转）</div>
                {dbKeys.map((k) => (
                  <div key={k.key} className="flex items-center justify-between gap-2 text-xs">
                    <code className="font-mono text-[#122820] truncate">{k.key}</code>
                    <span className="flex items-center gap-0.5 shrink-0">
                      <code className="font-mono text-[#9aa8a0]">{k.maskedValue}</code>
                      <Button variant="ghost" size="icon" className="h-6 w-6" title="重新设置" onClick={() => openEditKey(k.key)}>
                        <Key className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" title="删除" onClick={() => setDeleteTarget(k.key)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </span>
                  </div>
                ))}
                {dbKeys.length === 0 && (
                  <div className="text-xs text-[#9aa8a0]">—（在 .env 中配置的 Key 不在此列，仍会被使用）</div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-auto">
                <Button size="sm" variant="outline" className="gap-1 flex-1" onClick={() => openEditModel(p)}>
                  <Settings2 className="h-3.5 w-3.5" />配置模型
                </Button>
                <Button size="sm" className="gap-1 flex-1" onClick={() => openAddKey(p)}>
                  <Plus className="h-3.5 w-3.5" />添加 Key
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ==================== Agent 角色模型映射 ==================== */}
      <div className="rounded-xl border border-[#1a5632]/10 bg-white p-4">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-[#1a5632]" />
          <h3 className="text-sm font-medium text-[#122820]">Agent 角色模型映射</h3>
        </div>
        <p className="text-[10px] text-[#9aa8a0] mt-1 mb-3">
          Writer / Verifier / Refiner 可分别使用 DeepSeek 或智谱；Verifier 与 Writer 用不同模型时实现真正的独立审查。保存后立即生效。
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {ROLE_LABELS.map(({ role, label, desc }) => (
            <div key={role} className="rounded-lg bg-[#faf9f6] px-3 py-2">
              <div className="text-xs font-medium text-[#122820]">{label}</div>
              <div className="text-[9px] text-[#9aa8a0] mb-1">{desc}</div>
              <select
                className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs font-mono"
                value={roles[role]}
                onChange={(e) => setRoles((prev) => ({ ...prev, [role]: e.target.value as AiProviderKey }))}
              >
                <option value="deepseek">deepseek</option>
                <option value="zhipu">zhipu</option>
              </select>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Button size="sm" className="gap-1" onClick={() => void handleSaveRoles()} disabled={savingRoles}>
            {savingRoles ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            保存映射
          </Button>
        </div>
      </div>

      {/* ==================== 全部设置（高级） ==================== */}
      <div className="rounded-xl border border-[#1a5632]/10 bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a5632]/10 bg-[#faf9f6] text-sm text-[#6b7c72]">
          全部设置（高级，含自定义 Key）
        </div>
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
            {settings.map((s) => (
              <tr key={s.key} className="border-b border-[#1a5632]/5 hover:bg-[#1a5632]/[0.02]">
                <td className="py-2.5 px-4 font-mono text-xs text-[#122820]">{s.key}</td>
                <td className="py-2.5 px-4 font-mono text-xs text-[#6b7c72]">{s.maskedValue}</td>
                <td className="py-2.5 px-4 hidden sm:table-cell text-xs text-[#9aa8a0]">
                  {new Date(s.updatedAt).toLocaleString("zh-CN")}
                </td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="重新设置" onClick={() => openEditKey(s.key)}>
                      <Key className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" title="删除" onClick={() => setDeleteTarget(s.key)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {settings.length === 0 && (
              <tr>
                <td colSpan={4} className="py-12 text-center text-[#9aa8a0] text-sm">
                  暂无设置<br />
                  <span className="text-[10px]">点击上方卡片「添加 Key」或「配置模型」</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ==================== 编辑 / 新增对话框 ==================== */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editKind === "model" ? "配置模型" : "配置 API Key"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Key</Label>
              <Input className="h-9 text-sm font-mono" value={editKey} readOnly />
            </div>
            <div>
              <Label className="text-xs">Value</Label>
              {editKind === "model" && editOptions && editOptions.length > 0 ? (
                <div className="space-y-2">
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm font-mono"
                    value={customModel ? "__custom__" : editValue}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setCustomModel(true);
                        setEditValue("");
                      } else {
                        setCustomModel(false);
                        setEditValue(e.target.value);
                      }
                    }}
                  >
                    <option value="" disabled>选择模型</option>
                    {editOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                    <option value="__custom__">自定义…</option>
                  </select>
                  {customModel && (
                    <Input
                      className="h-9 text-sm font-mono"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="输入自定义模型 ID"
                      autoFocus
                    />
                  )}
                  <p className="text-[10px] text-[#9aa8a0]">从预设选择，或选「自定义」填写模型 ID</p>
                </div>
              ) : (
                <>
                  <Input
                    className="h-9 text-sm font-mono"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="sk-..."
                    type="password"
                  />
                  <p className="text-[10px] text-[#9aa8a0] mt-1">加密存储，保存后立即生效</p>
                </>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="gap-1" disabled={testing}
              onClick={() => {
                if (editKind === "model") {
                  void handleTest(editProvider, editValue.trim() || undefined);
                } else if (editValue.trim()) {
                  void handleTest(editProvider, undefined, editValue.trim());
                } else {
                  toast.info("填写 Key 后即可测试");
                }
              }}
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              测试
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowEdit(false)}>取消</Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== 删除确认 ==================== */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>确认删除</DialogTitle></DialogHeader>
          <p className="text-sm text-[#6b7c72]">
            删除 <code className="text-[#122820]">{deleteTarget}</code>？此操作不可恢复。
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" size="sm" onClick={() => void handleDelete()}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
