const DEFAULTS = {
  apiKey: '',
  apiBaseUrl: 'https://api.openai.com',
  model: 'gpt-4o',
  difficulty: 'medium',
  activeMode: false,
  ttsMuted: false,
  durationOverride: 0,
};

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

export { DEFAULTS, get, set, getAll, resetToDefaults };
