const DEFAULTS = {
  apiKey: '',
  provider: 'openai',
  apiBaseUrl: 'https://api.openai.com',
  customModel: '', // optional free-text model override
  model: 'gpt-4o',
  difficulty: 'medium',
  activeMode: false,
  ttsMuted: false,
  durationOverride: 0,
  customInputPrice: 0,
  customOutputPrice: 0,
};

const LIFETIME_USAGE_KEY = 'mintcodeLifetimeUsage';
const INTERVIEW_HISTORY_KEY = 'mintcodeInterviewHistory';
const MAX_HISTORY_ITEMS = 30;

async function get(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, resolve);
  });
}

async function set(items) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(items, resolve);
  });
}

async function getAll() {
  return get(DEFAULTS);
}

async function resetToDefaults() {
  return set(DEFAULTS);
}

function getLocal(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function setLocal(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, resolve);
  });
}

async function getLifetimeUsage() {
  const data = await getLocal(LIFETIME_USAGE_KEY);
  return data[LIFETIME_USAGE_KEY] || {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    calls: 0,
    estimatedCost: 0,
  };
}

async function addLifetimeUsage(usage) {
  const current = await getLifetimeUsage();
  const updated = {
    promptTokens: current.promptTokens + usage.promptTokens,
    completionTokens: current.completionTokens + usage.completionTokens,
    totalTokens: current.totalTokens + usage.totalTokens,
    calls: current.calls + usage.calls,
    estimatedCost: current.estimatedCost + usage.estimatedCost,
    updatedAt: Date.now(),
  };
  await setLocal({ [LIFETIME_USAGE_KEY]: updated });
  return updated;
}

async function getInterviewHistory() {
  const data = await getLocal(INTERVIEW_HISTORY_KEY);
  return data[INTERVIEW_HISTORY_KEY] || [];
}

async function addInterviewHistory(record) {
  const current = await getInterviewHistory();
  const updated = [record, ...current].slice(0, MAX_HISTORY_ITEMS);
  await setLocal({ [INTERVIEW_HISTORY_KEY]: updated });
  return updated;
}

async function clearInterviewHistory() {
  await setLocal({ [INTERVIEW_HISTORY_KEY]: [] });
}

export {
  DEFAULTS,
  LIFETIME_USAGE_KEY,
  INTERVIEW_HISTORY_KEY,
  get,
  set,
  getAll,
  resetToDefaults,
  getLifetimeUsage,
  addLifetimeUsage,
  getInterviewHistory,
  addInterviewHistory,
  clearInterviewHistory,
};
