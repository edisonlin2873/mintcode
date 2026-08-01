import { get, set, DEFAULTS } from '../lib/storage.js';
import { MessageType } from '../lib/messages.js';
import {
  getProviderList,
  getProvider,
  getDefaultModel,
  resolveApiConfig,
  inferProviderFromBaseUrl,
} from '../lib/providers.js';

const CUSTOM_MODEL_VALUE = '__custom__';

const startBtn = document.getElementById('startBtn');
const cancelBtn = document.getElementById('cancelBtn');
const statusEl = document.getElementById('status');
const advancedToggle = document.getElementById('advancedToggle');
const advancedSection = document.getElementById('advancedSection');
const providerInput = document.getElementById('provider');
const apiBaseUrlInput = document.getElementById('apiBaseUrl');
const customBaseUrlField = document.getElementById('customBaseUrlField');
const modelInput = document.getElementById('model');
const customModelInput = document.getElementById('customModel');
const customModelField = document.getElementById('customModelField');
const apiKeyInput = document.getElementById('apiKey');

function populateProviders(selectedId) {
  providerInput.innerHTML = getProviderList()
    .map((p) => `<option value="${p.id}">${p.name}</option>`)
    .join('');
  providerInput.value = selectedId || 'openai';
}

function populateModels(providerId, selectedModel, useCustomModel = false) {
  const provider = getProvider(providerId);
  const isCustomProvider = providerId === 'custom';

  modelInput.disabled = false;

  if (isCustomProvider) {
    modelInput.innerHTML = `<option value="${CUSTOM_MODEL_VALUE}">Custom</option>`;
    modelInput.value = CUSTOM_MODEL_VALUE;
  } else {
    const options = provider.models
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join('');
    modelInput.innerHTML = options + `<option value="${CUSTOM_MODEL_VALUE}">Custom</option>`;

    if (useCustomModel) {
      modelInput.value = CUSTOM_MODEL_VALUE;
    } else {
      const exists = provider.models.some((m) => m.id === selectedModel);
      modelInput.value = exists ? selectedModel : getDefaultModel(providerId);
    }
  }

  apiKeyInput.placeholder = provider.keyPlaceholder || 'sk-...';
  updateCustomFieldsVisibility();
}

function updateCustomFieldsVisibility() {
  const isCustomProvider = providerInput.value === 'custom';
  const isCustomModel = modelInput.value === CUSTOM_MODEL_VALUE;
  customBaseUrlField.style.display = isCustomProvider ? 'block' : 'none';
  customModelField.style.display = isCustomModel ? 'block' : 'none';
}

function currentApiConfig() {
  const isCustomProvider = providerInput.value === 'custom';
  const isCustomModel = modelInput.value === CUSTOM_MODEL_VALUE;
  const provider = getProvider(providerInput.value);
  const selectedModel = isCustomModel ? '' : modelInput.value;

  return resolveApiConfig(providerInput.value, selectedModel, {
    baseUrl: isCustomProvider ? apiBaseUrlInput.value.trim() : provider.baseUrl,
    model: isCustomModel ? customModelInput.value.trim() : undefined,
  });
}

get(DEFAULTS).then((settings) => {
  const provider =
    settings.provider ||
    inferProviderFromBaseUrl(settings.apiBaseUrl) ||
    DEFAULTS.provider;

  const customModel = settings.customModel || '';
  const knownModel = getProvider(provider).models.some((m) => m.id === settings.model);
  const useCustomModel = provider === 'custom' || !!customModel || (!!settings.model && !knownModel);

  populateProviders(provider);
  populateModels(provider, settings.model || DEFAULTS.model, useCustomModel);

  apiBaseUrlInput.value = settings.apiBaseUrl || getProvider(provider).baseUrl || '';
  customModelInput.value = customModel || (!knownModel ? (settings.model || '') : '');
  apiKeyInput.value = settings.apiKey || '';
  document.getElementById('difficulty').value = settings.difficulty || 'medium';
  document.getElementById('activeMode').checked = settings.activeMode || false;
  document.getElementById('durationOverride').value = settings.durationOverride || 0;
  updateCustomFieldsVisibility();
});

providerInput.addEventListener('change', () => {
  const id = providerInput.value;
  if (id === 'custom') {
    populateModels(id, '', true);
  } else {
    populateModels(id, getDefaultModel(id), false);
    apiBaseUrlInput.value = getProvider(id).baseUrl;
  }
  updateCustomFieldsVisibility();
  saveSettings();
});

modelInput.addEventListener('change', () => {
  updateCustomFieldsVisibility();
  if (modelInput.value === CUSTOM_MODEL_VALUE) customModelInput.focus();
  saveSettings();
});

document.querySelectorAll('input, select').forEach(el => {
  if (el === providerInput || el === modelInput) return;
  el.addEventListener('change', saveSettings);
});

advancedToggle.addEventListener('click', () => {
  const visible = advancedSection.classList.toggle('visible');
  advancedToggle.textContent = visible ? 'Advanced Settings ▾' : 'Advanced Settings ▸';
});

async function saveSettings() {
  const cfg = currentApiConfig();
  const isCustomProvider = providerInput.value === 'custom';
  const isCustomModel = modelInput.value === CUSTOM_MODEL_VALUE;

  await set({
    provider: cfg.provider,
    apiKey: apiKeyInput.value,
    apiBaseUrl: isCustomProvider
      ? apiBaseUrlInput.value.trim()
      : getProvider(providerInput.value).baseUrl,
    model: isCustomModel ? customModelInput.value.trim() : modelInput.value,
    customModel: isCustomModel ? customModelInput.value.trim() : '',
    difficulty: document.getElementById('difficulty').value,
    activeMode: document.getElementById('activeMode').checked,
    durationOverride: parseInt(document.getElementById('durationOverride').value) || 0,
  });
}

startBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus('Please enter your API key', 'error');
    return;
  }

  const cfg = currentApiConfig();
  if (!cfg.baseUrl) {
    setStatus('Please enter a provider base URL', 'error');
    return;
  }
  if (!cfg.model) {
    setStatus('Please select or enter a model name', 'error');
    return;
  }

  const difficulty = document.getElementById('difficulty').value;
  const activeMode = document.getElementById('activeMode').checked;
  const durationOverride = parseInt(document.getElementById('durationOverride').value) || 0;
  const isCustomProvider = providerInput.value === 'custom';
  const isCustomModel = modelInput.value === CUSTOM_MODEL_VALUE;

  await set({
    provider: cfg.provider,
    apiKey,
    apiBaseUrl: cfg.baseUrl,
    model: isCustomModel ? customModelInput.value.trim() : modelInput.value,
    customModel: isCustomModel ? customModelInput.value.trim() : '',
    difficulty,
    activeMode,
    durationOverride,
  });

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id || null;

  setStatus('Starting interview...', 'success');
  startBtn.disabled = true;
  cancelBtn.style.display = 'block';

  chrome.runtime.sendMessage({
    type: MessageType.START_INTERVIEW,
    tabId,
    apiKey,
    provider: cfg.provider,
    model: cfg.model,
    apiBaseUrl: cfg.baseUrl,
    difficulty,
    activeMode,
    durationOverride,
  }).catch((err) => {
    setStatus('Error: ' + err.message, 'error');
    startBtn.disabled = false;
    cancelBtn.style.display = 'none';
  });

  window.close();
});

cancelBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: MessageType.CANCEL_INTERVIEW });
  setStatus('Interview cancelled', '');
  startBtn.disabled = false;
  cancelBtn.style.display = 'none';
});

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (type ? ' ' + type : '');
}
