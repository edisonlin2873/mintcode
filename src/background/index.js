import { State, getState, setState } from './state-machine.js';
import { configure as configureAI, callApi, getUsageStats, resetUsage, buildSystemPrompt, buildEvaluationPrompt } from './ai-client.js';
import { start as startTimer, stop as stopTimer, getElapsed } from './timer.js';
import { getAll, getLifetimeUsage, addLifetimeUsage } from '../lib/storage.js';
import { MessageType } from '../lib/messages.js';
import { getRandomProblem, getProblemDetail } from '../lib/leetcode-api.js';

let tabId = null;
let interviewData = null;
let transcript = '';
let codeSnapshots = [];
let submissionHistory = [];
let activeMode = false;
let currentLanguage = '';
let pendingSession = null;
let injectRetries = 0;

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.tabs.onUpdated.addListener((updatedTabId, changeInfo) => {
  if (!pendingSession || updatedTabId !== pendingSession.tabId) return;
  if (changeInfo.status !== 'complete') return;

  const session = pendingSession;
  injectRetries = 0;
  tryInjectOverlay(session);
});

function tryInjectOverlay(session) {
  sendToTab(session.tabId, {
    type: MessageType.INJECT_OVERLAY,
    problem: session.problem,
    problemDetail: session.problemDetail,
  }).then(() => {
    injectPageBridge(session.tabId);
    pendingSession = null;
  }).catch(() => {
    injectRetries += 1;
    if (injectRetries <= 8) {
      setTimeout(() => tryInjectOverlay(session), 750);
    } else {
      pendingSession = null;
      broadcastError('Failed to inject interview overlay. Reload the LeetCode tab and try again.');
      setState(State.IDLE);
      broadcastState();
    }
  });
}

function injectPageBridge(tab) {
  chrome.scripting.executeScript({
    target: { tabId: tab },
    world: 'MAIN',
    files: ['page-bridge.js'],
  }).catch((err) => {
    console.warn('Failed to inject page bridge:', err);
  });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  switch (msg.type) {
    case MessageType.START_INTERVIEW:
      handleStartInterview(msg);
      break;
    case MessageType.CANCEL_INTERVIEW:
      handleCancel();
      break;
    case MessageType.VOID_INTERVIEW:
      handleVoidInterview();
      break;
    case MessageType.INTERVIEW_STARTED:
      handleInterviewStarted();
      break;
    case MessageType.INTERVIEW_FINISHED:
      handleInterviewFinished(msg);
      break;
    case MessageType.CODE_SNAPSHOT:
      codeSnapshots.push({ code: msg.code, timestamp: Math.floor(getElapsed()) });
      break;
    case MessageType.TRANSCRIPT_UPDATE:
      transcript = msg.text;
      sendToSidePanel({ type: MessageType.TRANSCRIPT_UPDATE, text: msg.text });
      break;
    case MessageType.MIC_STATUS:
      sendToSidePanel({ type: MessageType.MIC_STATUS, listening: msg.listening });
      break;
    case MessageType.SUBMISSION_RESULT:
      submissionHistory.push({
        status: msg.status,
        timeSeconds: Math.floor(getElapsed()),
      });
      sendToSidePanel({
        type: MessageType.SUBMISSION_RESULT,
        status: msg.status,
        timeSeconds: Math.floor(getElapsed()),
      });
      break;
    case MessageType.PROBLEM_LOADED:
      currentLanguage = msg.language || '';
      if (msg.problemDetail && interviewData) {
        interviewData.problemDetail = {
          ...interviewData.problemDetail,
          ...msg.problemDetail,
        };
      }
      break;
    case MessageType.OVERLAY_READY:
      break;
    case MessageType.GET_STATE:
      handleGetState();
      break;
  }
});

async function handleGetState() {
  const lifetimeUsage = await getLifetimeUsage();
  sendToSidePanel({
    type: MessageType.STATE_UPDATE,
    state: getState(),
    interviewData,
    transcript,
    codeSnapshots: codeSnapshots.length,
    submissionHistory,
    usage: getUsageStats(),
    lifetimeUsage,
    remaining: 0,
  });
}

async function handleStartInterview(msg) {
  try {
    tabId = msg.tabId || null;
    activeMode = msg.activeMode;
    interviewData = {
      difficulty: msg.difficulty,
      durationOverride: msg.durationOverride || 0,
    };
    transcript = '';
    codeSnapshots = [];
    submissionHistory = [];
    currentLanguage = '';
    resetUsage();

    const settings = await getAll();
    configureAI(
      msg.apiKey || settings.apiKey,
      msg.apiBaseUrl || settings.apiBaseUrl,
      msg.model || settings.model,
      settings.customInputPrice,
      settings.customOutputPrice
    );

    setState(State.SELECTING_PROBLEM);
    broadcastState();

    const problem = await getRandomProblem(msg.difficulty);
    let problemDetail = await getProblemDetail(problem.titleSlug);

    if (!problemDetail) {
      problemDetail = {
        title: problem.title,
        titleSlug: problem.titleSlug,
        difficulty: problem.difficulty,
        content: '',
        topicTags: [],
      };
    }

    interviewData.problem = problem;
    interviewData.problemDetail = problemDetail;

    setState(State.COUNTDOWN);
    broadcastState();

    const problemUrl = problem.url || `https://leetcode.com/problems/${problem.titleSlug}/`;

    if (tabId) {
      pendingSession = { tabId, problem, problemDetail };
      await chrome.tabs.update(tabId, { url: problemUrl, active: true });
    } else {
      const tab = await chrome.tabs.create({ url: problemUrl, active: true });
      tabId = tab.id;
      pendingSession = { tabId, problem, problemDetail };
    }
  } catch (err) {
    console.error('Failed to start interview:', err);
    broadcastError(err.message || 'Failed to start interview');
    setState(State.IDLE);
    broadcastState();
  }
}

function handleCancel() {
  cleanupInterview();
  setState(State.IDLE);
  broadcastState();
}

function handleVoidInterview() {
  // Voids the interview WITHOUT calling the AI API, so no credits are used.
  if (tabId) {
    sendToTab(tabId, { type: MessageType.INTERVIEW_ENDED }).catch(() => {});
  }
  cleanupInterview();
  setState(State.IDLE);
  broadcastState();
}

function handleInterviewStarted() {
  setState(State.INTERVIEWING);
  broadcastState();

  const override = interviewData.durationOverride || 0;
  startTimer(interviewData.difficulty, override, {
    onTick: (remaining, total) => {
      sendToSidePanel({ type: 'TIMER_UPDATE', remaining, total });
      sendToTab(tabId, { type: 'TIMER_UPDATE', remaining, total }).catch(() => {});
    },
    onExpired: () => {
      sendToTab(tabId, { type: 'TIME_EXPIRED' });
    },
  });

  sendInitialPrompt();
}

async function handleInterviewFinished(msg) {
  setState(State.EVALUATING);
  broadcastState();
  stopTimer();

  transcript = msg.transcript || transcript;
  const elapsed = getElapsed();

  try {
    const { content } = await callApi([
      { role: 'system', content: buildSystemPrompt(interviewData.problemDetail, currentLanguage) },
      {
        role: 'user',
        content: buildEvaluationPrompt(
          interviewData.problemDetail,
          currentLanguage,
          transcript,
          codeSnapshots,
          elapsed,
          submissionHistory
        ),
      },
    ]);

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { summary: content, scores: {}, overallScore: 0, recommendation: 'N/A' };
    }

    const usage = getUsageStats();
    const lifetimeUsage = await addLifetimeUsage(usage);

    sendToSidePanel({ type: MessageType.EVALUATION_RESULT, result: parsed, usage, lifetimeUsage });
    sendToTab(tabId, { type: MessageType.EVALUATION_RESULT, result: parsed });

    setState(State.COMPLETED);
    broadcastState();
  } catch (err) {
    console.error('Evaluation failed:', err);
    broadcastError('Evaluation failed: ' + err.message);
    setState(State.IDLE);
    broadcastState();
  }
}

async function sendInitialPrompt() {
  const problem = interviewData.problemDetail;
  const minutes = interviewData.durationOverride > 0
    ? interviewData.durationOverride
    : ({ easy: 20, medium: 30, hard: 45 }[interviewData.difficulty] || 30);

  const prompt = `Let's begin your interview. You have been given the problem "${problem.title}" (${problem.difficulty}). Read the problem statement carefully, explain your understanding, then discuss your approach before coding. You have ${minutes} minutes. Good luck!`;

  sendToTab(tabId, { type: MessageType.AI_MESSAGE, text: prompt });
  sendToSidePanel({ type: MessageType.AI_MESSAGE, text: prompt });
}

function sendToTab(tab, msg) {
  if (!tab) return Promise.resolve();
  return chrome.tabs.sendMessage(tab, msg);
}

function sendToSidePanel(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function broadcastState() {
  sendToSidePanel({
    type: MessageType.STATE_UPDATE,
    state: getState(),
    interviewData,
    usage: getUsageStats(),
    remaining: 0,
  });
}

function broadcastError(error) {
  sendToSidePanel({ type: MessageType.ERROR, error });
  if (tabId) sendToTab(tabId, { type: MessageType.ERROR, error }).catch(() => {});
}

function cleanupInterview() {
  stopTimer();
  interviewData = null;
  transcript = '';
  codeSnapshots = [];
  submissionHistory = [];
  currentLanguage = '';
  pendingSession = null;
  injectRetries = 0;
}
