/**
 * Popular LLM providers with OpenAI-compatible (or Anthropic) endpoints.
 * Users pick a provider + model; base URL is resolved automatically.
 */
const PROVIDERS = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    apiStyle: 'openai',
    keyPlaceholder: 'sk-...',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', input: 2.5, output: 10 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', input: 0.15, output: 0.6 },
      { id: 'gpt-4.1', name: 'GPT-4.1', input: 2.0, output: 8 },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', input: 0.4, output: 1.6 },
      { id: 'o4-mini', name: 'o4-mini', input: 1.1, output: 4.4 },
      { id: 'o3-mini', name: 'o3-mini', input: 1.1, output: 4.4 },
    ],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiStyle: 'anthropic',
    keyPlaceholder: 'sk-ant-...',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', input: 3, output: 15 },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', input: 15, output: 75 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', input: 0.8, output: 4 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', input: 3, output: 15 },
    ],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiStyle: 'openai',
    keyPlaceholder: 'sk-...',
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', input: 0.14, output: 0.28 },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', input: 0.435, output: 0.87 },
    ],
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    apiStyle: 'openai',
    keyPlaceholder: 'sk-or-...',
    models: [
      { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o', input: 2.5, output: 10 },
      { id: 'openai/gpt-4o-mini', name: 'OpenAI GPT-4o Mini', input: 0.15, output: 0.6 },
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', input: 3, output: 15 },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', input: 3, output: 15 },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', input: 1.25, output: 10 },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', input: 0.27, output: 1.1 },
      { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', input: 0.2, output: 0.6 },
    ],
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiStyle: 'openai',
    keyPlaceholder: 'gsk_...',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', input: 0.59, output: 0.79 },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', input: 0.05, output: 0.08 },
      { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', input: 0.29, output: 0.59 },
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', input: 0.15, output: 0.6 },
    ],
  },
  google: {
    id: 'google',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiStyle: 'openai',
    keyPlaceholder: 'AIza...',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', input: 1.25, output: 10 },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', input: 0.3, output: 2.5 },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', input: 0.1, output: 0.4 },
    ],
  },
  xai: {
    id: 'xai',
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    apiStyle: 'openai',
    keyPlaceholder: 'xai-...',
    models: [
      { id: 'grok-3', name: 'Grok 3', input: 3, output: 15 },
      { id: 'grok-3-mini', name: 'Grok 3 Mini', input: 0.3, output: 0.5 },
      { id: 'grok-2-1212', name: 'Grok 2', input: 2, output: 10 },
    ],
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    apiStyle: 'openai',
    keyPlaceholder: '...',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', input: 2, output: 6 },
      { id: 'mistral-small-latest', name: 'Mistral Small', input: 0.2, output: 0.6 },
      { id: 'codestral-latest', name: 'Codestral', input: 0.3, output: 0.9 },
    ],
  },
  together: {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    apiStyle: 'openai',
    keyPlaceholder: '...',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', input: 0.88, output: 0.88 },
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', input: 1.25, output: 1.25 },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B Turbo', input: 1.2, output: 1.2 },
    ],
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    baseUrl: '',
    apiStyle: 'openai',
    keyPlaceholder: 'API key...',
    models: [],
  },
};

const PROVIDER_ORDER = [
  'openai',
  'anthropic',
  'deepseek',
  'openrouter',
  'groq',
  'google',
  'xai',
  'mistral',
  'together',
  'custom',
];

function getProviderList() {
  return PROVIDER_ORDER.map((id) => PROVIDERS[id]).filter(Boolean);
}

function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS.openai;
}

function getDefaultModel(providerId) {
  const provider = getProvider(providerId);
  return provider.models[0]?.id || '';
}

function getModelPricing(providerId, modelId) {
  const provider = getProvider(providerId);
  const model = provider.models.find((m) => m.id === modelId);
  if (model) return { input: model.input, output: model.output };
  // Fallback: search all providers
  for (const p of Object.values(PROVIDERS)) {
    const m = p.models.find((x) => x.id === modelId);
    if (m) return { input: m.input, output: m.output };
  }
  return { input: 2.5, output: 10 };
}

/**
 * Resolve effective API config.
 * overrides.baseUrl / overrides.model win when non-empty.
 */
function resolveApiConfig(providerId, modelId, overrides = {}) {
  const provider = getProvider(providerId || 'openai');
  const models = provider.models;
  const overrideModel = (overrides.model || '').trim();
  const overrideBaseUrl = (overrides.baseUrl || '').trim();

  let model = overrideModel;
  if (!model) {
    if (models.some((m) => m.id === modelId)) model = modelId;
    else if (modelId && provider.id === 'custom') model = modelId;
    else model = getDefaultModel(provider.id) || modelId || '';
  }

  const baseUrl = overrideBaseUrl || provider.baseUrl;
  let apiStyle = provider.apiStyle || 'openai';
  if (provider.id === 'custom') {
    apiStyle = /anthropic/i.test(baseUrl) ? 'anthropic' : 'openai';
  }

  return {
    provider: provider.id,
    name: provider.name,
    baseUrl,
    apiStyle,
    model,
    keyPlaceholder: provider.keyPlaceholder || 'sk-...',
    models,
    isCustom: provider.id === 'custom',
  };
}

/** Infer provider from a legacy stored base URL. */
function inferProviderFromBaseUrl(baseUrl) {
  const url = (baseUrl || '').toLowerCase();
  if (!url) return 'custom';
  if (url.includes('anthropic')) return 'anthropic';
  if (url.includes('deepseek')) return 'deepseek';
  if (url.includes('openrouter')) return 'openrouter';
  if (url.includes('groq')) return 'groq';
  if (url.includes('googleapis') || url.includes('generativelanguage')) return 'google';
  if (url.includes('x.ai')) return 'xai';
  if (url.includes('mistral')) return 'mistral';
  if (url.includes('together')) return 'together';
  if (url.includes('openai.com')) return 'openai';
  return 'custom';
}

export {
  PROVIDERS,
  PROVIDER_ORDER,
  getProviderList,
  getProvider,
  getDefaultModel,
  getModelPricing,
  resolveApiConfig,
  inferProviderFromBaseUrl,
};
