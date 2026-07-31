import { get, set, DEFAULTS } from '../lib/storage.js';
import { MessageType } from '../lib/messages.js';

// ---- DOM refs ----
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const tabs = document.querySelectorAll('.tab');
const panels = {};

['settings', 'live', 'results'].forEach(id => {
  panels[id] = document.getElementById('panel-' + id);
});

// Settings
const apiKeyInput = document.getElementById('apiKey');
const difficultyInput = document.getElementById('difficulty');
const activeModeInput = document.getElementById('activeMode');
const ttsMutedInput = document.getElementById('ttsMuted');
const apiBaseUrlInput = document.getElementById('apiBaseUrl');
const modelInput = document.getElementById('model');
const durationOverrideInput = document.getElementById('durationOverride');
const customInputPriceInput = document.getElementById('customInputPrice');
const customOutputPriceInput = document.getElementById('customOutputPrice');
const startBtn = document.getElementById('startBtn');

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

// ---- Load saved settings ----
get(DEFAULTS).then(settings => {
  apiKeyInput.value = settings.apiKey || '';
  difficultyInput.value = settings.difficulty || 'medium';
  activeModeInput.checked = settings.activeMode || false;
  ttsMutedInput.checked = settings.ttsMuted || false;
  apiBaseUrlInput.value = settings.apiBaseUrl || DEFAULTS.apiBaseUrl;
  modelInput.value = settings.model || DEFAULTS.model;
  durationOverrideInput.value = settings.durationOverride || 0;
  customInputPriceInput.value = settings.customInputPrice || 0;
  customOutputPriceInput.value = settings.customOutputPrice || 0;
});

function saveSettings() {
  set({
    apiKey: apiKeyInput.value,
    difficulty: difficultyInput.value,
    activeMode: activeModeInput.checked,
    ttsMuted: ttsMutedInput.checked,
    apiBaseUrl: apiBaseUrlInput.value || DEFAULTS.apiBaseUrl,
    model: modelInput.value || DEFAULTS.model,
    durationOverride: parseInt(durationOverrideInput.value) || 0,
    customInputPrice: parseFloat(customInputPriceInput.value) || 0,
    customOutputPrice: parseFloat(customOutputPriceInput.value) || 0,
  });
}

['change', 'keyup'].forEach(ev => {
  document.querySelectorAll('#panel-settings input, #panel-settings select').forEach(el => {
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
  });
});

// ---- Start interview ----
startBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatusText('Please enter your API key', 'error');
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
    difficulty: difficultyInput.value,
    activeMode: activeModeInput.checked,
    apiBaseUrl: apiBaseUrlInput.value || DEFAULTS.apiBaseUrl,
    model: modelInput.value || DEFAULTS.model,
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
  if (!confirm('Void this interview? No AI credits will be used and no evaluation will be generated.')) return;
  hideEvaluatingOverlay();
  chrome.runtime.sendMessage({ type: MessageType.VOID_INTERVIEW }).catch(() => {});
  switchTab('settings');
  startBtn.disabled = false;
  setStatusText('Interview voided — no AI credits used', 'success');
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
      aiMessageText.textContent = msg.text;
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
      startBtn.disabled = false;
      switchTab('settings');
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
    startBtn.disabled = false;
    if (lastUsage) renderUsage(lastUsage, lastLifetimeUsage);
    switchTab('results');
  }
  if (currentState === 'IDLE' && startBtn.disabled) {
    startBtn.disabled = false;
    switchTab('settings');
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
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    const score = val.score || 0;
    const reason = val.reason || '';
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

  resultSummary.textContent = result.summary || '';

  if (usage) {
    lastUsage = usage;
    if (lifetimeUsage) lastLifetimeUsage = lifetimeUsage;
    renderUsage(usage, lifetimeUsage || lastLifetimeUsage);
  }

  switchTab('results');
}

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
