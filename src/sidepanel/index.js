import { get, set, DEFAULTS, getInterviewHistory, clearInterviewHistory } from '../lib/storage.js';
import { MessageType } from '../lib/messages.js';
import { escapeHtml, renderMarkdown } from '../lib/markdown.js';
import {
  getProviderList,
  getProvider,
  getDefaultModel,
  resolveApiConfig,
  inferProviderFromBaseUrl,
} from '../lib/providers.js';

// ---- DOM refs ----
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const tabs = document.querySelectorAll('.tab');
const panels = {};

['settings', 'live', 'results', 'history'].forEach(id => {
  panels[id] = document.getElementById('panel-' + id);
});

// Settings
const providerInput = document.getElementById('provider');
const apiBaseUrlInput = document.getElementById('apiBaseUrl');
const customBaseUrlField = document.getElementById('customBaseUrlField');
const modelInput = document.getElementById('model');
const customModelInput = document.getElementById('customModel');
const customModelField = document.getElementById('customModelField');
const apiKeyInput = document.getElementById('apiKey');
const difficultyInput = document.getElementById('difficulty');
const activeModeInput = document.getElementById('activeMode');
const ttsMutedInput = document.getElementById('ttsMuted');
const durationOverrideInput = document.getElementById('durationOverride');
const customInputPriceInput = document.getElementById('customInputPrice');
const customOutputPriceInput = document.getElementById('customOutputPrice');
const startBtn = document.getElementById('startBtn');

const CUSTOM_MODEL_VALUE = '__custom__';

// Overlays
const evaluatingOverlay = document.getElementById('evaluatingOverlay');

// Live
const timerDisplay = document.getElementById('timerDisplay');
const micStatus = document.getElementById('micStatus');
const aiMessageText = document.getElementById('aiMessageText');
const transcriptBox = document.getElementById('transcriptBox');
const submissionBox = document.getElementById('submissionBox');
const finishBtn = document.getElementById('finishBtn');
const voidBtn = document.getElementById('voidBtn');

// Results
const resultScore = document.getElementById('resultScore');
const resultRecommendation = document.getElementById('resultRecommendation');
const resultDimensions = document.getElementById('resultDimensions');
const resultSummary = document.getElementById('resultSummary');
const newInterviewBtn = document.getElementById('newInterviewBtn');

// History
const historyList = document.getElementById('historyList');
const historyEmpty = document.getElementById('historyEmpty');
const exportHistoryBtn = document.getElementById('exportHistoryBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// Usage
const usageModel = document.getElementById('usageModel');
const usageCalls = document.getElementById('usageCalls');
const usagePrompt = document.getElementById('usagePrompt');
const usageCompletion = document.getElementById('usageCompletion');
const usageTotal = document.getElementById('usageTotal');
const usageCost = document.getElementById('usageCost');
const usageLifetimeTokens = document.getElementById('usageLifetimeTokens');
const usageLifetimeCalls = document.getElementById('usageLifetimeCalls');
const usageLifetimeCost = document.getElementById('usageLifetimeCost');

// ---- State ----
let currentState = 'IDLE';
let interviewData = null;
let lastUsage = null;
let lastLifetimeUsage = null;

// Sync state with background on load
chrome.runtime.sendMessage({ type: MessageType.GET_STATE }).catch(() => {});

// ---- Provider / model dropdowns ----
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
    // Custom provider → only Custom in the model dropdown
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

  if (!isCustomProvider) {
    // Keep stored custom URL but use preset base for requests
    apiBaseUrlInput.placeholder = getProvider(providerInput.value).baseUrl || '';
  }
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

// ---- Load saved settings ----
get(DEFAULTS).then(settings => {
  const provider =
    settings.provider ||
    inferProviderFromBaseUrl(settings.apiBaseUrl) ||
    DEFAULTS.provider;

  const customModel = settings.customModel || '';
  const knownModel = getProvider(provider).models.some((m) => m.id === settings.model);
  const useCustomModel = provider === 'custom' || !!customModel || (!!settings.model && !knownModel);

  populateProviders(provider);
  populateModels(provider, settings.model || DEFAULTS.model, useCustomModel);

  if (provider === 'custom') {
    apiBaseUrlInput.value = settings.apiBaseUrl || '';
  } else {
    apiBaseUrlInput.value = settings.apiBaseUrl || getProvider(provider).baseUrl || '';
  }

  customModelInput.value = customModel || (!knownModel ? (settings.model || '') : '');

  apiKeyInput.value = settings.apiKey || '';
  difficultyInput.value = settings.difficulty || 'medium';
  activeModeInput.checked = settings.activeMode || false;
  ttsMutedInput.checked = settings.ttsMuted || false;
  durationOverrideInput.value = settings.durationOverride || 0;
  customInputPriceInput.value = settings.customInputPrice || 0;
  customOutputPriceInput.value = settings.customOutputPrice || 0;

  updateCustomFieldsVisibility();
});

function saveSettings() {
  const cfg = currentApiConfig();
  const isCustomProvider = providerInput.value === 'custom';
  const isCustomModel = modelInput.value === CUSTOM_MODEL_VALUE;

  set({
    provider: cfg.provider,
    apiKey: apiKeyInput.value,
    apiBaseUrl: isCustomProvider
      ? apiBaseUrlInput.value.trim()
      : getProvider(providerInput.value).baseUrl,
    model: isCustomModel ? customModelInput.value.trim() : modelInput.value,
    customModel: isCustomModel ? customModelInput.value.trim() : '',
    difficulty: difficultyInput.value,
    activeMode: activeModeInput.checked,
    ttsMuted: ttsMutedInput.checked,
    durationOverride: parseInt(durationOverrideInput.value) || 0,
    customInputPrice: parseFloat(customInputPriceInput.value) || 0,
    customOutputPrice: parseFloat(customOutputPriceInput.value) || 0,
  });
}

providerInput.addEventListener('change', () => {
  const id = providerInput.value;
  if (id === 'custom') {
    populateModels(id, '', true);
    if (!apiBaseUrlInput.value.trim()) apiBaseUrlInput.value = '';
  } else {
    populateModels(id, getDefaultModel(id), false);
    apiBaseUrlInput.value = getProvider(id).baseUrl;
  }
  updateCustomFieldsVisibility();
  saveSettings();
});

modelInput.addEventListener('change', () => {
  updateCustomFieldsVisibility();
  if (modelInput.value === CUSTOM_MODEL_VALUE) {
    customModelInput.focus();
  }
  saveSettings();
});

['change', 'keyup'].forEach(ev => {
  document.querySelectorAll('#panel-settings input, #panel-settings select').forEach(el => {
    if (el === providerInput || el === modelInput) return;
    el.addEventListener(ev, saveSettings);
  });
});

// ---- Tab switching ----
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const panelId = tab.dataset.tab;
    Object.entries(panels).forEach(([id, el]) => {
      el.classList.toggle('active', id === panelId);
    });
    if (panelId === 'history') loadHistory();
  });
});

// ---- Start interview ----
startBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatusText('Please enter your API key', 'error');
    return;
  }

  const cfg = currentApiConfig();
  if (!cfg.baseUrl) {
    setStatusText('Please enter a provider base URL', 'error');
    return;
  }
  if (!cfg.model) {
    setStatusText('Please select or enter a model name', 'error');
    return;
  }

  saveSettings();
  setStatusText('Picking a problem and opening LeetCode...', '');
  startBtn.disabled = true;

  let tabId = null;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) tabId = tabs[0].id;
  } catch {
    // Will create a new tab from the background if needed
  }

  chrome.runtime.sendMessage({
    type: MessageType.START_INTERVIEW,
    tabId,
    apiKey,
    provider: cfg.provider,
    model: cfg.model,
    apiBaseUrl: cfg.baseUrl,
    difficulty: difficultyInput.value,
    activeMode: activeModeInput.checked,
    durationOverride: parseInt(durationOverrideInput.value) || 0,
  }).catch(err => {
    setStatusText('Error: ' + err.message, 'error');
    startBtn.disabled = false;
  });

  switchTab('live');
  setStatusText('Redirecting to problem...', '');
});

// ---- Finish early ----
finishBtn.addEventListener('click', () => {
  showEvaluatingOverlay();
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: 'FINISH_EARLY' }).catch(() => {});
    }
  });
});

// ---- Void interview (no API credits used) ----
voidBtn.addEventListener('click', () => {
  if (!confirm('Void this interview? No evaluation will be generated.')) return;
  hideEvaluatingOverlay();
  chrome.runtime.sendMessage({ type: MessageType.VOID_INTERVIEW }).catch(() => {});
  switchTab('settings');
  startBtn.disabled = false;
  setStatusText('Interview voided', 'success');
});

// ---- New interview ----
newInterviewBtn.addEventListener('click', () => {
  switchTab('settings');
  startBtn.disabled = false;
  setStatusText('Ready to start a new interview', '');
});

// ---- Listen for messages from background ----
// Ignore messages sent directly by content scripts (they broadcast to every
// extension context). The background re-broadcasts these to us with proper
// data, so processing both would duplicate entries (e.g. submissions at 00:00).
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender && sender.tab) return;
  switch (msg.type) {
    case MessageType.STATE_UPDATE:
      updateState(msg);
      break;
    case MessageType.AI_MESSAGE:
      aiMessageText.innerHTML = renderMarkdown(msg.text);
      break;
    case MessageType.EVALUATION_RESULT:
      showResults(msg.result, msg.usage, msg.lifetimeUsage);
      break;
    case MessageType.TRANSCRIPT_UPDATE:
      updateTranscript(msg.text);
      break;
    case MessageType.MIC_STATUS:
      updateMicStatus(msg.listening);
      break;
    case MessageType.SUBMISSION_RESULT:
      addSubmission(msg.status, msg.timeSeconds);
      break;
    case MessageType.ERROR:
      setStatusText('Error: ' + msg.error, 'error');
      if (currentState === 'INTERVIEWING' || currentState === 'EVALUATING') {
        aiMessageText.innerHTML = `<span style="color:#f44336;">Error: ${escapeHtml(msg.error)}</span>`;
      } else {
        startBtn.disabled = false;
        switchTab('settings');
      }
      break;
    case 'TIMER_UPDATE':
      updateTimer(msg.remaining, msg.total);
      break;
  }
});

// ---- State updates ----
function updateState(msg) {
  currentState = msg.state;
  interviewData = msg.interviewData || interviewData;
  if (msg.usage) lastUsage = msg.usage;
  if (msg.lifetimeUsage) lastLifetimeUsage = msg.lifetimeUsage;

  const stateLabels = {
    IDLE: 'Idle',
    SELECTING_PROBLEM: 'Selecting Problem...',
    COUNTDOWN: 'Starting...',
    INTERVIEWING: 'In Progress',
    EVALUATING: 'Evaluating...',
    COMPLETED: 'Completed',
  };

  const stateClasses = {
    IDLE: 'status-idle',
    SELECTING_PROBLEM: 'status-selecting',
    COUNTDOWN: 'status-countdown',
    INTERVIEWING: 'status-interviewing',
    EVALUATING: 'status-evaluating',
    COMPLETED: 'status-completed',
  };

  statusBadge.textContent = stateLabels[currentState] || 'Unknown';
  statusBadge.className = 'header-status ' + (stateClasses[currentState] || 'status-idle');

  if (currentState === 'SELECTING_PROBLEM') {
    resetSubmissions();
  }

  if (currentState === 'EVALUATING') {
    showEvaluatingOverlay();
  } else {
    hideEvaluatingOverlay();
  }

  if (currentState === 'COMPLETED') {
    resetLivePanel();
    startBtn.disabled = false;
    if (lastUsage) renderUsage(lastUsage, lastLifetimeUsage);
    switchTab('results');
  }
  if (currentState === 'IDLE') {
    resetLivePanel();
    if (startBtn.disabled) {
      startBtn.disabled = false;
      switchTab('settings');
    }
  }
}

function showEvaluatingOverlay() {
  evaluatingOverlay.classList.add('visible');
}

function hideEvaluatingOverlay() {
  evaluatingOverlay.classList.remove('visible');
}

function setStatusText(msg, type) {
  statusText.textContent = msg;
  if (type === 'error') statusText.style.color = '#f44336';
  else if (type === 'success') statusText.style.color = '#4caf50';
  else statusText.style.color = '#666';
}

// ---- Timer ----
function updateTimer(remaining, total) {
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  timerDisplay.className = 'timer-display';
  if (remaining < 60) timerDisplay.classList.add('danger');
  else if (remaining < 300) timerDisplay.classList.add('warning');
}

// ---- Mic status ----
function updateMicStatus(listening) {
  if (listening) {
    micStatus.className = 'mic-status mic-listening';
    micStatus.textContent = '🎙️ Listening...';
  } else {
    micStatus.className = 'mic-status mic-idle';
    micStatus.textContent = '🎤 Ready';
  }
}

// ---- Transcript ----
function updateTranscript(text) {
  transcriptBox.textContent = text || '(waiting for speech...)';
}

// ---- Submissions ----
function addSubmission(status, timeSeconds) {
  const mins = Math.floor((timeSeconds || 0) / 60);
  const secs = (timeSeconds || 0) % 60;
  const timeLabel = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const statusClass = /accepted/i.test(status)
    ? 'submission-status-accepted'
    : /wrong|error|exceeded|compile|segmentation/i.test(status)
      ? 'submission-status-wrong'
      : 'submission-status-other';

  if (submissionBox.textContent.includes('(no submissions yet)')) {
    submissionBox.textContent = '';
  }

  const entry = document.createElement('div');
  entry.className = 'submission-entry';
  entry.innerHTML = `
    <span class="${statusClass}">${status}</span>
    <span class="submission-time">${timeLabel}</span>
  `;
  submissionBox.appendChild(entry);
  submissionBox.scrollTop = submissionBox.scrollHeight;
}

function resetSubmissions() {
  if (submissionBox) submissionBox.textContent = '(no submissions yet)';
}

function resetLivePanel() {
  timerDisplay.textContent = '--:--';
  timerDisplay.className = 'timer-display';
  micStatus.className = 'mic-status mic-idle';
  micStatus.textContent = '🎤 Waiting to start...';
  aiMessageText.textContent = 'Interview not yet started.';
  transcriptBox.textContent = '(waiting for speech...)';
  resetSubmissions();
}

// ---- Results ----
function showResults(result, usage, lifetimeUsage) {
  const overall = result.overallScore || 0;
  resultScore.textContent = Math.round(overall);

  const rec = result.recommendation || 'N/A';
  resultRecommendation.textContent = rec;
  resultRecommendation.className = 'result-recommendation';
  if (rec === 'Hire') resultRecommendation.classList.add('rec-hire');
  else if (rec === 'Leaning Hire') resultRecommendation.classList.add('rec-leaning-hire');
  else if (rec === 'Leaning No') resultRecommendation.classList.add('rec-leaning-no');
  else if (rec === 'No') resultRecommendation.classList.add('rec-no');
  else resultRecommendation.classList.add('rec-na');

  const scores = result.scores || {};
  resultDimensions.innerHTML = Object.entries(scores).map(([key, val]) => {
    const label = escapeHtml(key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()));
    const score = val.score || 0;
    const reason = escapeHtml(val.reason || '');
    const barColor = score >= 7 ? '#4caf50' : score >= 4 ? '#ff9800' : '#f44336';
    return `
      <div class="dimension">
        <div class="dimension-header">
          <span>${label}</span>
          <span class="dimension-score">${score}/10</span>
        </div>
        <div class="dimension-bar">
          <div class="dimension-fill" style="width:${score * 10}%;background:${barColor};"></div>
        </div>
        <div class="dimension-reason">${reason}</div>
      </div>
    `;
  }).join('');

  resultSummary.innerHTML = renderMarkdown(result.summary || '');

  if (usage) {
    lastUsage = usage;
    if (lifetimeUsage) lastLifetimeUsage = lifetimeUsage;
    renderUsage(usage, lifetimeUsage || lastLifetimeUsage);
  }

  switchTab('results');
}

// ---- History ----
function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || '';
  }
}

function formatDuration(seconds) {
  const m = Math.floor((seconds || 0) / 60);
  const s = (seconds || 0) % 60;
  return `${m}m ${s}s`;
}

async function loadHistory() {
  const list = await getInterviewHistory();
  renderHistory(list);
}

function renderHistory(list) {
  historyList.innerHTML = '';
  if (!list.length) {
    historyEmpty.style.display = 'block';
    return;
  }
  historyEmpty.style.display = 'none';

  list.forEach(rec => {
    const el = document.createElement('div');
    el.className = 'history-card';

    const score = rec.overallScore || 0;
    const recClass = /hire/i.test(rec.recommendation || '')
      ? 'rec-hire'
      : /no/i.test(rec.recommendation || '')
        ? 'rec-no'
        : 'rec-maybe';

    el.innerHTML = `
      <div class="history-card-header">
        <div class="history-title">${escapeHtml(rec.problem?.title || 'Unknown problem')}</div>
        <div class="history-score">${Math.round(score)}</div>
      </div>
      <div class="history-meta">
        <span>${escapeHtml(rec.problem?.difficulty || '')}</span>
        <span>${formatDate(rec.date)}</span>
        <span>${formatDuration(rec.duration)}</span>
        <span class="${recClass}">${escapeHtml(rec.recommendation || 'N/A')}</span>
      </div>
      <div class="history-detail" style="display:none;"></div>
      <div class="history-actions">
        <button class="btn btn-secondary" data-toggle>Show Details</button>
        <button class="btn btn-secondary" data-export>Export</button>
      </div>
    `;

    el.querySelector('[data-toggle]').addEventListener('click', () => {
      const detail = el.querySelector('.history-detail');
      const btn = el.querySelector('[data-toggle]');
      if (detail.style.display === 'none') {
        detail.style.display = 'block';
        detail.innerHTML = buildHistoryDetail(rec);
        btn.textContent = 'Hide Details';
      } else {
        detail.style.display = 'none';
        btn.textContent = 'Show Details';
      }
    });

    el.querySelector('[data-export]').addEventListener('click', () => {
      downloadFile(`mintcode-${rec.id || Date.now()}.json`, JSON.stringify(rec, null, 2));
    });

    historyList.appendChild(el);
  });
}

function buildHistoryDetail(rec) {
  const scores = rec.scores || {};
  const dims = Object.entries(scores).map(([key, val]) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    return `
      <div class="history-dim">
        <span>${escapeHtml(label)}</span>
        <span class="history-dim-score">${val.score || 0}/10</span>
      </div>
      <div class="history-dim-reason">${escapeHtml(val.reason || '')}</div>
    `;
  }).join('');

  const subs = (rec.submissions || []).map(s => {
    const m = Math.floor((s.timeSeconds || 0) / 60);
    const sec = (s.timeSeconds || 0) % 60;
    const cls = /accepted/i.test(s.status) ? 'submission-status-accepted'
      : /wrong|error|exceeded|compile|segmentation/i.test(s.status) ? 'submission-status-wrong'
        : 'submission-status-other';
    return `<div><span class="${cls}">${escapeHtml(s.status)}</span> <span class="submission-time">${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}</span></div>`;
  }).join('') || '(no submissions)';

  const usage = rec.usage || {};

  return `
    <div class="history-section">
      <div class="history-section-title">Summary</div>
      <div class="md-body">${renderMarkdown(rec.summary || '')}</div>
    </div>
    <div class="history-section">
      <div class="history-section-title">Dimensions</div>
      ${dims}
    </div>
    <div class="history-section">
      <div class="history-section-title">Submissions</div>
      <div>${subs}</div>
    </div>
    <div class="history-section">
      <div class="history-section-title">Transcript</div>
      <div class="history-pre">${escapeHtml(rec.transcript || '(no speech detected)')}</div>
    </div>
    ${rec.finalCode ? `
      <div class="history-section">
        <div class="history-section-title">Final Code</div>
        <pre class="md-code"><code>${escapeHtml(rec.finalCode)}</code></pre>
      </div>
    ` : ''}
    <div class="history-section">
      <div class="history-section-title">Usage</div>
      <div class="history-meta">
        <span>${escapeHtml(rec.model || '')}</span>
        <span>${(usage.totalTokens || 0).toLocaleString()} tokens</span>
        <span>$${((usage.estimatedCost || 0)).toFixed(4).replace(/\.?0+$/, '')}</span>
      </div>
    </div>
  `;
}

exportHistoryBtn.addEventListener('click', async () => {
  const list = await getInterviewHistory();
  if (!list.length) return;
  downloadFile('mintcode-history.json', JSON.stringify(list, null, 2));
});

clearHistoryBtn.addEventListener('click', async () => {
  if (!confirm('Clear all interview history?')) return;
  await clearInterviewHistory();
  renderHistory([]);
});

// ---- API usage ----
function formatTokens(n) {
  return (n || 0).toLocaleString();
}

function formatCost(n) {
  if (n === null || n === undefined) return '—';
  return '$' + (n).toFixed(4).replace(/\.?0+$/, '');
}

function renderUsage(usage, lifetimeUsage) {
  usageModel.textContent = usage.model || '—';
  usageCalls.textContent = formatTokens(usage.calls);
  usagePrompt.textContent = formatTokens(usage.promptTokens);
  usageCompletion.textContent = formatTokens(usage.completionTokens);
  usageTotal.textContent = formatTokens(usage.totalTokens);
  usageCost.textContent = formatCost(usage.estimatedCost);

  const lt = lifetimeUsage || lastLifetimeUsage;
  if (lt) {
    usageLifetimeTokens.textContent = formatTokens(lt.totalTokens);
    usageLifetimeCalls.textContent = formatTokens(lt.calls);
    usageLifetimeCost.textContent = formatCost(lt.estimatedCost);
  }
}

// ---- Helpers ----
function switchTab(tabId) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  Object.entries(panels).forEach(([id, el]) => {
    el.classList.toggle('active', id === tabId);
  });
}

// ---- Expose for content script bridge ----
window.__sidepanelAPI = {
  updateMicStatus,
  updateTranscript,
};
