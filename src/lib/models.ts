export interface ModelProvider {
  name: string;
  model: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  getApiKey: () => string | undefined;
  enabled: boolean;
}

export const MODEL_PROVIDERS = {
  deepseek: {
    name: "DeepSeek",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/chat/completions",
    apiKeyEnvVar: "DEEPSEEK_API_KEY",
    getApiKey: () => process.env.DEEPSEEK_API_KEY,
    enabled: true,
  },
  zhipu: {
    name: "智谱AI",
    model: process.env.ZHIPU_MODEL || "glm-4-plus",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    apiKeyEnvVar: "ZHIPU_API_KEY",
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
// 可独立配置 Writer / Verifier / Refiner 使用不同模型提供者
// 当 Verifier 使用与 Writer 不同的模型时，实现真正的独立验证

export type AgentRole = "writer" | "verifier" | "refiner";

export const AGENT_MODELS: Record<AgentRole, ModelProviderKey> = {
  writer: "deepseek",
  verifier: MODEL_PROVIDERS.zhipu.enabled ? "zhipu" : "deepseek",
  refiner: "deepseek",
};

export function getAgentProvider(role: AgentRole): ModelProviderKey {
  return AGENT_MODELS[role];
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
