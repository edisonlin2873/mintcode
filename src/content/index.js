import { MessageType } from '../lib/messages.js';
import { create as createCountdown, destroy as destroyCountdown } from './overlay/countdown.js';

import { create as createResults, show as showResults, destroy as destroyResults } from './overlay/results.js';
import { start as startSTT, stop as stopSTT } from './overlay/stt.js';
import { speak as speakText } from './overlay/tts.js';

import overlayCSS from '../styles/overlay.css';

const CODE_READ_INTERVAL = 15000;
const BRIDGE_GET_EVENT = 'mintcode:get-code';
const BRIDGE_CODE_EVENT = 'mintcode:code';
const SUBMIT_RESULT_SELECTORS = [
  '[data-e2e-locator="submission-result"]',
  '[data-e2e-locator*="result"]',
  '[data-e2e-locator*="Result"]',
  '.ant-alert',
  '[class*="submission-result"]',
  '[class*="SubmissionResult"]',
];
const SUBMIT_STATUS_PATTERN = /(Accepted|Wrong Answer|Time Limit Exceeded|Memory Limit Exceeded|Runtime Error|Compile Error|Output Limit Exceeded|Stack Overflow|Segmentation Fault|Presentation Error|Internal Error)/;

let codeReaderInterval = null;
let overlayInjected = false;
let currentCode = '';
let currentLanguage = '';
let finalTranscript = '';
let isActive = false;
let styleTag = null;
let blurStyleTag = null;
let micStream = null;

let submissionObserver = null;
let submissionCheckTimer = null;
let lastSubmissionStatus = '';
let submitInFlight = false;
let submitStartTime = 0;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case MessageType.INJECT_OVERLAY:
      injectOverlay(msg);
      sendResponse({ ok: true });
      break;
    case MessageType.AI_MESSAGE:
      chrome.storage.sync.get({ ttsMuted: false }, (settings) => {
        if (!settings.ttsMuted) speakText(msg.text);
      });
      break;
    case MessageType.EVALUATION_RESULT:
      showResults(msg.result);
      break;
    case MessageType.INTERVIEW_ENDED:
      cleanupScript();
      break;
    case 'TIME_EXPIRED':
      setTimeout(() => finishInterview(), 2000);
      break;
    case 'FINISH_EARLY':
      finishInterview();
      break;
    case MessageType.ERROR:
      break;
  }
  return false;
});

// Listen for code pushed by the main-world Monaco bridge
document.addEventListener(BRIDGE_CODE_EVENT, (e) => {
  if (typeof e.detail === 'string') onCodeRead(e.detail);
});

function requestCodeFromBridge() {
  try {
    document.dispatchEvent(new CustomEvent(BRIDGE_GET_EVENT));
  } catch (e) {}
}

function onCodeRead(code) {
  if (!code || code === currentCode || !isActive) return;
  currentCode = code;
  sendCodeSnapshot(code);
}

function scrapeProblemDetail() {
  const contentEl =
    document.querySelector('[data-track-load="description_content"]') ||
    document.querySelector('.elfjS') ||
    document.querySelector('[class*="question-content"]') ||
    document.querySelector('[class*="Description"]');

  const titleEl =
    document.querySelector('[data-cy="question-title"]') ||
    document.querySelector('a[href*="/problems/"][class*="title"]') ||
    document.querySelector('div[class*="text-title"]');

  const difficultyEl =
    document.querySelector('[diff]') ||
    document.querySelector('.text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard') ||
    document.querySelector('[class*="difficulty"]');

  let difficulty = '';
  if (difficultyEl) {
    const text = (difficultyEl.getAttribute('diff') || difficultyEl.textContent || '').trim();
    if (/easy/i.test(text)) difficulty = 'Easy';
    else if (/medium/i.test(text)) difficulty = 'Medium';
    else if (/hard/i.test(text)) difficulty = 'Hard';
  }

  return {
    title: titleEl ? titleEl.textContent.trim() : '',
    content: contentEl ? contentEl.innerHTML : '',
    difficulty,
  };
}

function detectLanguage() {
  const selectors = [
    'select[class*="language"]',
    'button[class*="language"]',
    '[data-cy*="lang-select"]',
    '#lang-select',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      currentLanguage = el.textContent.trim() || el.value || '';
      break;
    }
  }
}

function readCodeFromDOM() {
  const editors = document.querySelectorAll('.monaco-editor');
  if (!editors.length) return '';
  let best = '';
  for (const ed of editors) {
    const viewLines = ed.querySelectorAll('.view-lines .view-line, .view-line');
    const code = Array.from(viewLines).map((l) => l.textContent || '').join('\n');
    if (code.length > best.length) best = code;
  }
  return best;
}

function startCodeReader() {
  requestCodeFromBridge();
  const domCode = readCodeFromDOM();
  if (domCode) onCodeRead(domCode);

  codeReaderInterval = setInterval(() => {
    requestCodeFromBridge();
    const domCode = readCodeFromDOM();
    if (domCode) onCodeRead(domCode);
  }, CODE_READ_INTERVAL);
}

function sendCodeSnapshot(code) {
  chrome.runtime.sendMessage({
    type: MessageType.CODE_SNAPSHOT,
    code,
  }).catch(() => {});
}

function setupSubmissionDetection() {
  if (submissionObserver) return;

  document.addEventListener('click', onDocumentClick, true);

  submissionObserver = new MutationObserver(() => {
    if (submissionCheckTimer) return;
    submissionCheckTimer = setTimeout(() => {
      submissionCheckTimer = null;
      checkSubmissionResult();
    }, 300);
  });
  submissionObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function onDocumentClick(e) {
  const btn = e.target && e.target.closest ? e.target.closest('button') : null;
  if (btn && /submit/i.test(btn.textContent || '')) {
    submitInFlight = true;
    submitStartTime = Date.now();
  }
}

function checkSubmissionResult() {
  const text = findSubmissionResultText();
  if (!text) return;

  const match = text.match(SUBMIT_STATUS_PATTERN);
  if (!match) return;

  const status = match[1];

  if (submitInFlight) {
    // Skip stale verdict text lingering from a previous submission.
    if (Date.now() - submitStartTime < 800) return;
    submitInFlight = false;
    sendSubmission(status);
  } else if (status !== lastSubmissionStatus) {
    sendSubmission(status);
  }
}

function sendSubmission(status) {
  lastSubmissionStatus = status;
  chrome.runtime.sendMessage({
    type: MessageType.SUBMISSION_RESULT,
    status,
  }).catch(() => {});
}

function findSubmissionResultText() {
  for (const sel of SUBMIT_RESULT_SELECTORS) {
    const el = document.querySelector(sel);
    if (el && el.textContent && el.textContent.trim()) {
      return el.textContent.trim();
    }
  }
  return '';
}

function stopSubmissionDetection() {
  if (submissionObserver) {
    submissionObserver.disconnect();
    submissionObserver = null;
  }
  document.removeEventListener('click', onDocumentClick, true);
  if (submissionCheckTimer) {
    clearTimeout(submissionCheckTimer);
    submissionCheckTimer = null;
  }
  submitInFlight = false;
  lastSubmissionStatus = '';
  submitStartTime = 0;
}

function applyProblemBlur() {
  if (blurStyleTag) return;
  blurStyleTag = document.createElement('style');
  blurStyleTag.id = 'mintcode-problem-blur';
  blurStyleTag.textContent = `
    [data-track-load="description_content"],
    .elfjS,
    div[data-key="description-content"],
    div[class*="question-content"] {
      filter: blur(12px) !important;
      user-select: none !important;
      pointer-events: none !important;
      transition: filter 0.4s ease;
    }
  `;
  document.head.appendChild(blurStyleTag);
}

function removeProblemBlur() {
  if (blurStyleTag) {
    blurStyleTag.remove();
    blurStyleTag = null;
  }
}

function injectOverlay(msg) {
  if (overlayInjected) return;
  overlayInjected = true;

  injectCSS();
  applyProblemBlur();

  detectLanguage();
  const scraped = scrapeProblemDetail();
  chrome.runtime.sendMessage({
    type: MessageType.PROBLEM_LOADED,
    language: currentLanguage,
    problemDetail: {
      title: scraped.title || msg.problem?.title,
      content: scraped.content || msg.problemDetail?.content || '',
      difficulty: scraped.difficulty || msg.problem?.difficulty || msg.problemDetail?.difficulty,
      titleSlug: msg.problem?.titleSlug || msg.problemDetail?.titleSlug,
    },
  }).catch(() => {});

  // Ask for mic early so the permission prompt appears during the blurred countdown
  requestMicrophone()
    .then(() => {
      stopMicStream();
      chrome.runtime.sendMessage({
        type: MessageType.MIC_STATUS,
        listening: true,
      }).catch(() => {});
    })
    .catch((err) => {
      console.warn('Early mic permission request failed:', err);
    });

  createCountdown(msg.problem, async () => {
    await startInterview();
  });

  chrome.runtime.sendMessage({ type: MessageType.OVERLAY_READY }).catch(() => {});
}

function injectCSS() {
  styleTag = document.createElement('style');
  styleTag.id = 'mintcode-styles';
  styleTag.textContent = overlayCSS;
  document.head.appendChild(styleTag);
}

async function requestMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone API not available');
  }
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return micStream;
}

async function startInterview() {
  if (isActive) return;
  isActive = true;

  removeProblemBlur();
  startCodeReader();
  setupSubmissionDetection();

  try {
    chrome.runtime.sendMessage({
      type: MessageType.MIC_STATUS,
      listening: true,
    }).catch(() => {});

    await requestMicrophone();
    stopMicStream();

    startSTT({
      onResult: (final, interim) => {
        finalTranscript = final;
        chrome.runtime.sendMessage({
          type: MessageType.TRANSCRIPT_UPDATE,
          text: (final + ' ' + interim).trim(),
        }).catch(() => {});
      },
      onError: (err) => {
        console.error('STT error:', err);
        chrome.runtime.sendMessage({
          type: MessageType.MIC_STATUS,
          listening: false,
        }).catch(() => {});
      },
    });
  } catch (err) {
    console.error('Microphone permission failed:', err);
    chrome.runtime.sendMessage({
      type: MessageType.MIC_STATUS,
      listening: false,
    }).catch(() => {});
    chrome.runtime.sendMessage({
      type: MessageType.ERROR,
      error: 'Microphone permission denied. Allow access and try again.',
    }).catch(() => {});
    isActive = false;
    return;
  }

  chrome.runtime.sendMessage({ type: MessageType.INTERVIEW_STARTED }).catch(() => {});
}

function finishInterview() {
  if (!isActive) return;
  isActive = false;

  stopSTT();
  stopMicStream();
  stopCodeReader();
  stopSubmissionDetection();

  const finalCode = readCodeFromDOM();
  if (finalCode && finalCode !== currentCode) {
    currentCode = finalCode;
    sendCodeSnapshot(finalCode);
  }

  chrome.runtime.sendMessage({
    type: MessageType.INTERVIEW_FINISHED,
    transcript: finalTranscript,
  }).catch(() => {});
}

function stopMicStream() {
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

function stopCodeReader() {
  if (codeReaderInterval) {
    clearInterval(codeReaderInterval);
    codeReaderInterval = null;
  }
}

function cleanupScript() {
  stopSTT();
  stopMicStream();
  stopCodeReader();
  stopSubmissionDetection();
  destroyCountdown();
  destroyResults();
  removeProblemBlur();
  removeCSS();
  overlayInjected = false;
  isActive = false;
  finalTranscript = '';
  currentCode = '';
}

function removeCSS() {
  if (styleTag) {
    styleTag.remove();
    styleTag = null;
  }
}
