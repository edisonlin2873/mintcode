import { create as createCountdown, destroy as destroyCountdown } from './countdown.js';
import { create as createInterviewUI, updateTimer, showAIMessage, updateMicStatus, destroy as destroyInterviewUI } from './interview-ui.js';
import { create as createResults, show as showResults, destroy as destroyResults } from './results.js';
import { start as startSTT, stop as stopSTT, getIsListening as getSTTIsListening } from './stt.js';
import { speak as speakText } from './tts.js';

let isActive = false;
let finalTranscript = '';
let callbacks = {};
let problemData = {};

function init(msg, cbs) {
  callbacks = cbs;
  problemData = msg;

  // Inject overlay CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('overlay.css');
  document.body.appendChild(link);

  // Show countdown
  createCountdown(msg.problem, () => {
    // Countdown complete - show interview UI
    createInterviewUI({
      onStart: () => {
        startInterview();
      },
      onFinish: () => {
        finishInterview();
      },
    });
  });
}

function startInterview() {
  isActive = true;

  startSTT({
    onResult: (final, interim) => {
      finalTranscript = final;
      if (callbacks.onTranscriptUpdate) {
        callbacks.onTranscriptUpdate(final);
      }
      updateMicStatus(true);
    },
    onError: (err) => {
      console.error('STT error:', err);
      updateMicStatus(false);
    },
  });
}

function finishInterview() {
  if (!isActive) return;
  isActive = false;

  stopSTT();

  const snapshots = window.__snapshots || [];

  if (callbacks.onFinish) {
    callbacks.onFinish(finalTranscript, snapshots);
  }
}

function displayResults(result) {
  createResults();
  showResults(result);
}

function showError(msg) {
  showAIMessage('Error: ' + msg);
}

function onTimeExpired() {
  showAIMessage('Time is up! Evaluating your performance...');
  setTimeout(() => finishInterview(), 2000);
}

function destroy() {
  stopSTT();
  destroyCountdown();
  destroyInterviewUI();
  destroyResults();
  const links = document.querySelectorAll('link[href*="overlay.css"]');
  links.forEach(l => l.remove());
}

// Expose API globally for content script bridge
window.__overlayAPI = {
  init,
  showAIMessage,
  displayResults,
  speakText,
  updateTimer,
  showError,
  onTimeExpired,
  destroy,
};
