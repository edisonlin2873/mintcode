import { get, set, DEFAULTS } from '../lib/storage.js';
import { MessageType } from '../lib/messages.js';

const startBtn = document.getElementById('startBtn');
const cancelBtn = document.getElementById('cancelBtn');
const statusEl = document.getElementById('status');
const advancedToggle = document.getElementById('advancedToggle');
const advancedSection = document.getElementById('advancedSection');

// Load saved settings
get(DEFAULTS).then((settings) => {
  document.getElementById('apiKey').value = settings.apiKey || '';
  document.getElementById('difficulty').value = settings.difficulty || 'medium';
  document.getElementById('activeMode').checked = settings.activeMode || false;
  document.getElementById('apiBaseUrl').value = settings.apiBaseUrl || DEFAULTS.apiBaseUrl;
  document.getElementById('model').value = settings.model || DEFAULTS.model;
  document.getElementById('durationOverride').value = settings.durationOverride || 0;
});

// Save settings on change
document.querySelectorAll('input, select').forEach(el => {
  el.addEventListener('change', saveSettings);
});

// Advanced toggle
advancedToggle.addEventListener('click', () => {
  const visible = advancedSection.classList.toggle('visible');
  advancedToggle.textContent = visible ? 'Advanced Settings ▾' : 'Advanced Settings ▸';
});

async function saveSettings() {
  await set({
    apiKey: document.getElementById('apiKey').value,
    difficulty: document.getElementById('difficulty').value,
    activeMode: document.getElementById('activeMode').checked,
    apiBaseUrl: document.getElementById('apiBaseUrl').value || DEFAULTS.apiBaseUrl,
    model: document.getElementById('model').value || DEFAULTS.model,
    durationOverride: parseInt(document.getElementById('durationOverride').value) || 0,
  });
}

startBtn.addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) {
    setStatus('Please enter your API key', 'error');
    return;
  }

  const difficulty = document.getElementById('difficulty').value;
  const activeMode = document.getElementById('activeMode').checked;
  const apiBaseUrl = document.getElementById('apiBaseUrl').value.trim() || DEFAULTS.apiBaseUrl;
  const model = document.getElementById('model').value.trim() || DEFAULTS.model;
  const durationOverride = parseInt(document.getElementById('durationOverride').value) || 0;

  await set({ apiKey, difficulty, activeMode, apiBaseUrl, model, durationOverride });

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id || null;

  setStatus('Starting interview...', 'success');
  startBtn.disabled = true;
  cancelBtn.style.display = 'block';

  chrome.runtime.sendMessage({
    type: MessageType.START_INTERVIEW,
    tabId,
    apiKey,
    difficulty,
    activeMode,
    apiBaseUrl,
    model,
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
