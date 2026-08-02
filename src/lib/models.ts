export interface ModelProvider {
  name: string;
  model: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  /** Admin / DB 热加载用的模型名设置键 */
  modelSettingKey: string;
  getApiKey: () => string | undefined;
  enabled: boolean;
}

/** DeepSeek 当前可用模型（chat/reasoner 已退役） */
export const DEEPSEEK_MODEL_OPTIONS = [
  "deepseek-v4-flash",
  "deepseek-v4-pro",
] as const;

export const ZHIPU_MODEL_OPTIONS = [
  "glm-4-plus",
  "glm-4-flash",
  "glm-4",
  "glm-4-air",
] as const;

export const MODEL_PROVIDERS = {
  deepseek: {
    name: "DeepSeek",
    // 2026-07-24 起 deepseek-chat / deepseek-reasoner 已退役，仅支持 v4-flash / v4-pro
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    baseUrl: "https://api.deepseek.com/chat/completions",
    apiKeyEnvVar: "DEEPSEEK_API_KEY",
    modelSettingKey: "DEEPSEEK_MODEL",
    getApiKey: () => process.env.DEEPSEEK_API_KEY,
    enabled: true,
  },
  zhipu: {
    name: "智谱AI",
    model: process.env.ZHIPU_MODEL || "glm-4-plus",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    apiKeyEnvVar: "ZHIPU_API_KEY",
    modelSettingKey: "ZHIPU_MODEL",
    getApiKey: () => process.env.ZHIPU_API_KEY,
    enabled: !!process.env.ZHIPU_API_KEY,
  },
} as const;

export type ModelProviderKey = keyof typeof MODEL_PROVIDERS;

export const ALL_PROVIDERS = Object.entries(MODEL_PROVIDERS).map(([key, config]) => ({
  key,
  ...config,
  enabled: key === "deepseek" ? true : !!config.getApiKey(),
}));

export function getModelConfig(provider: ModelProviderKey): ModelProvider {
  const config = MODEL_PROVIDERS[provider];
  if (!config) {
    console.warn(`Unknown provider "${provider}", falling back to DeepSeek`);
    return MODEL_PROVIDERS.deepseek;
  }
  return config;
}

export function validateProviderKey(provider: ModelProviderKey): string | null {
  const config = getModelConfig(provider);
  const key = config.getApiKey();
  if (!key || key.includes("your_")) {
    return `${config.name} API Key 未正确配置，请在 .env.local 中填写 ${config.apiKeyEnvVar}`;
  }
  return null;
}

// ==================== Agent 角色模型映射 ====================
// Writer / Verifier / Refiner 可独立配置使用不同模型提供者
// 当 Verifier 使用与 Writer 不同的模型时，实现真正的独立验证。
// 默认值硬编码；Admin 保存 AGENT_ROLE_* 设置后由 loadAgentRoleProviders() 刷新内存缓存，
// 保持 getAgentProvider 同步——全库有 27+ 处同步调用，不能改成 async。

export type AgentRole = "writer" | "verifier" | "refiner";

/** 角色→provider 设置的存储键（值: "deepseek" | "zhipu"） */
export const AGENT_ROLE_SETTING_KEYS: Record<AgentRole, string> = {
  writer: "AGENT_ROLE_WRITER",
  verifier: "AGENT_ROLE_VERIFIER",
  refiner: "AGENT_ROLE_REFINER",
};

function defaultAgentRoleProviders(): Record<AgentRole, ModelProviderKey> {
  return {
    writer: "deepseek",
    verifier: MODEL_PROVIDERS.zhipu.enabled ? "zhipu" : "deepseek",
    refiner: "deepseek",
  };
}

let agentRoleProviders: Record<AgentRole, ModelProviderKey> = defaultAgentRoleProviders();

/** 从 DB 设置加载角色→provider 映射（应用启动时 + Admin 保存设置后调用） */
export async function loadAgentRoleProviders(): Promise<void> {
  try {
    const { getSetting } = await import("./settings");
    const next: Record<AgentRole, ModelProviderKey> = { ...agentRoleProviders };
    for (const role of ["writer", "verifier", "refiner"] as const) {
      const v = await getSetting(AGENT_ROLE_SETTING_KEYS[role]);
      if (v === "deepseek" || v === "zhipu") next[role] = v;
    }
    agentRoleProviders = next;
  } catch {
    /* DB 读取失败则保持当前映射 */
  }
}

export function getAgentProvider(role: AgentRole): ModelProviderKey {
  return agentRoleProviders[role];
}

/** 获取某 agent 角色的模型配置，含 key 有效性检查 */
export function getAgentModelConfig(role: AgentRole): {
  provider: ModelProviderKey;
  config: ModelProvider;
  keyError: string | null;
} {
  const provider = getAgentProvider(role);
  const config = getModelConfig(provider);
  const keyError = validateProviderKey(provider);
  return { provider, config, keyError };
}
