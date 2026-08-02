import { State, getState, setState } from './state-machine.js';
import { configure as configureAI, callApi, getUsageStats, resetUsage, buildSystemPrompt, buildActiveSystemPrompt, buildActivePrompt, buildEvaluationPrompt } from './ai-client.js';
import { start as startTimer, stop as stopTimer, getElapsed } from './timer.js';
import { getAll, getLifetimeUsage, addLifetimeUsage, addInterviewHistory } from '../lib/storage.js';
import { MessageType } from '../lib/messages.js';
import { getRandomProblem, getProblemDetail } from '../lib/leetcode-api.js';
import { resolveApiConfig, inferProviderFromBaseUrl } from '../lib/providers.js';

const ACTIVE_CHECK_INTERVAL = 5000;
const SILENCE_THRESHOLD = 15000;
const PROMPT_COOLDOWN = 60000;
const IMMEDIATE_COOLDOWN = 3000;
const UTTERANCE_DEBOUNCE = 1500;
const APPROACH_SILENCE_THRESHOLD = 6000;
const APPROACH_CODE_IDLE = 5000;
const APPROACH_REVIEW_COOLDOWN = 90000;
const MAX_APPROACH_REVIEWS = 3;

let tabId = null;
let interviewData = null;
let transcript = '';
let codeSnapshots = [];
let submissionHistory = [];
let activeMode = false;
let currentLanguage = '';
let pendingSession = null;
let injectRetries = 0;

// Active interviewer state
let activePromptInterval = null;
let lastUserSpeech = 0;
let lastCodeChange = 0;
let lastSilencePromptTime = 0;
let lastQuestionTime = 0;
let lastSubmissionTime = 0;
let promptInFlight = false;
let conversationHistory = [];
let lastTranscriptOffset = 0;
let lastFinalLength = 0;
let utteranceTimer = null;
let pendingUtterance = '';
let codingStarted = false;
let lastApproachReviewTime = 0;
let lastReviewedSnapshotCount = 0;
let approachReviewCount = 0;

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
      lastCodeChange = Date.now();
      if (codeSnapshots.length > 1) codingStarted = true;
      break;
    case MessageType.TRANSCRIPT_UPDATE:
      transcript = (msg.final || '').trim();
      lastUserSpeech = Date.now();
      sendToSidePanel({
        type: MessageType.TRANSCRIPT_UPDATE,
        text: (msg.final + ' ' + (msg.interim || '')).trim(),
      });
      handleNewFinalSpeech(msg.final || '', msg.interim || '');
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
      handleSubmissionResult(msg.status);
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
    lastInitialPrompt = '';
    resetUsage();
    stopActiveInterviewer();

    const settings = await getAll();
    const provider =
      msg.provider ||
      settings.provider ||
      inferProviderFromBaseUrl(msg.apiBaseUrl || settings.apiBaseUrl);
    const baseUrl = (msg.apiBaseUrl || settings.apiBaseUrl || '').trim();
    const model = (msg.model || settings.customModel || settings.model || '').trim();
    const apiCfg = resolveApiConfig(provider, model, { baseUrl, model });

    if (!apiCfg.baseUrl) {
      throw new Error('Please enter a provider base URL');
    }
    if (!apiCfg.model) {
      throw new Error('Please enter or select a model');
    }

    configureAI(msg.apiKey || settings.apiKey, {
      provider: apiCfg.provider,
      model: apiCfg.model,
      baseUrl: apiCfg.baseUrl,
      apiStyle: apiCfg.apiStyle,
      customInputPrice: settings.customInputPrice,
      customOutputPrice: settings.customOutputPrice,
    });

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

  if (activeMode) {
    startActiveInterviewer();
  }
}

function startActiveInterviewer() {
  stopActiveInterviewer();
  lastUserSpeech = Date.now();
  lastCodeChange = Date.now();
  lastSilencePromptTime = 0;
  lastQuestionTime = 0;
  lastSubmissionTime = 0;
  promptInFlight = false;
  conversationHistory = [];
  lastTranscriptOffset = 0;
  lastFinalLength = transcript.length;
  pendingUtterance = '';
  codingStarted = false;
  lastApproachReviewTime = 0;
  lastReviewedSnapshotCount = 0;
  approachReviewCount = 0;

  if (lastInitialPrompt) {
    conversationHistory.push({ role: 'assistant', content: lastInitialPrompt });
    lastTranscriptOffset = transcript.length;
  }

  activePromptInterval = setInterval(checkActiveInterviewer, ACTIVE_CHECK_INTERVAL);
}

function checkActiveInterviewer() {
  if (getState() !== State.INTERVIEWING) return;
  if (promptInFlight) return;

  const now = Date.now();

  if (codingStarted) {
    checkApproachReview(now);
    return;
  }

  if (now - lastUserSpeech < SILENCE_THRESHOLD) return;
  if (now - lastSilencePromptTime < PROMPT_COOLDOWN) return;

  triggerInterviewer('silence', '');
}

// During the coding phase, periodically examine the latest code against the
// problem. Only fires once the user has stopped speaking AND editing for a few
// seconds, and never more often than the cooldown, so it doesn't interrupt.
function checkApproachReview(now) {
  if (!codeSnapshots.length) return;
  if (approachReviewCount >= MAX_APPROACH_REVIEWS) return;
  if (codeSnapshots.length <= lastReviewedSnapshotCount) return;
  if (now - lastUserSpeech < APPROACH_SILENCE_THRESHOLD) return;
  if (now - lastCodeChange < APPROACH_CODE_IDLE) return;
  if (now - lastApproachReviewTime < APPROACH_REVIEW_COOLDOWN) return;

  lastReviewedSnapshotCount = codeSnapshots.length;
  triggerInterviewer('approach_review', '');
}

// Called on every transcript update; detects a freshly finalized utterance
// (interim is empty and the final transcript grew), then analyzes it.
function handleNewFinalSpeech(final, interim) {
  const newFinal = final.slice(lastFinalLength);
  lastFinalLength = final.length;

  // Ignore while the user is still talking (interim text present).
  if (interim && interim.trim()) return;
  if (!newFinal.trim()) return;

  pendingUtterance = newFinal.trim();
  if (utteranceTimer) clearTimeout(utteranceTimer);
  utteranceTimer = setTimeout(() => {
    utteranceTimer = null;
    if (getState() !== State.INTERVIEWING) return;
    analyzeUtterance(pendingUtterance);
  }, UTTERANCE_DEBOUNCE);
}

const QUESTION_PATTERNS = [
  /\?/,
  /\b(what|why|which|where|when|who)\b/i,
  /\bhow (do|does|to|should|can|could|would)\b/i,
  /\b(should|could|would|can) (i|we|it|this|that)\b/i,
  /\b(is|are|does|do|did) (it|this|that|there|the)\b/i,
  /\b(is it|are there|any idea|any suggestion|what about|what if|how about)\b/i,
];

const CODING_INTENT_PATTERNS = [
  /\b(begin|start|let'?s|gonna|going to|ready to|time to|i'?ll|i will|about to)\b[^.]{0,40}\b(code|coding|implement|implementing|write|writing|programming|program)\b/i,
  /\b(code|coding|implement)\b[^.]{0,20}\b(start|begin|now)\b/i,
];

function analyzeUtterance(text) {
  if (!interviewData || promptInFlight) return;
  if (!activeMode) return;

  const isQuestion = QUESTION_PATTERNS.some((r) => r.test(text));
  if (CODING_INTENT_PATTERNS.some((r) => r.test(text))) {
    codingStarted = true;
  }

  if (isQuestion) {
    triggerInterviewer('question', text);
  }
  // Otherwise: general statement, let the interview flow without interrupting.
}

async function handleSubmissionResult(status) {
  if (!interviewData) return;
  if (!activeMode) return;

  const s = status.toLowerCase();
  if (/accepted/.test(s)) {
    triggerInterviewer('accepted', status);
  } else if (/wrong answer|time limit|memory limit/.test(s)) {
    triggerInterviewer('wrong_answer', status);
  }
  // Compile errors, runtime errors, and other verdicts: no response.
}

async function triggerInterviewer(triggerType, utterance) {
  if (!interviewData || promptInFlight) return;
  if (getState() !== State.INTERVIEWING) return;

  const now = Date.now();
  let cooldown = 0;
  let lastTime = 0;
  if (triggerType === 'silence') {
    cooldown = PROMPT_COOLDOWN;
    lastTime = lastSilencePromptTime;
  } else if (triggerType === 'question') {
    cooldown = IMMEDIATE_COOLDOWN;
    lastTime = lastQuestionTime;
  } else if (triggerType === 'approach_review') {
    cooldown = APPROACH_REVIEW_COOLDOWN;
    lastTime = lastApproachReviewTime;
  }
  if (now - lastTime < cooldown) return;

  const newSpeech = transcript.slice(lastTranscriptOffset).trim();
  if (newSpeech) {
    conversationHistory.push({ role: 'user', content: newSpeech });
  }
  lastTranscriptOffset = transcript.length;

  const code = codeSnapshots.length ? codeSnapshots[codeSnapshots.length - 1].code : '';
  const silenceSeconds = Math.floor((now - lastUserSpeech) / 1000);
  const codeIdleSeconds = Math.floor((now - lastCodeChange) / 1000);

  promptInFlight = true;
  if (triggerType === 'silence') lastSilencePromptTime = now;
  else if (triggerType === 'question') lastQuestionTime = now;
  else if (triggerType === 'approach_review') {
    lastApproachReviewTime = now;
    approachReviewCount += 1;
  }
  else lastSubmissionTime = now;

  try {
    const { content } = await callApi([
      { role: 'system', content: buildActiveSystemPrompt(interviewData.problemDetail, currentLanguage) },
      ...conversationHistory.slice(-8),
      { role: 'user', content: buildActivePrompt(code, silenceSeconds, codeIdleSeconds, triggerType, utterance) },
    ]);

    if (getState() !== State.INTERVIEWING) return;

    const response = content.trim();
    const isOptimal = /\[OPTIMAL\]/.test(response);
    const isNoResponse = /\[NO_RESPONSE\]/.test(response);
    if (isNoResponse) return;

    const cleanResponse = response.replace(/\[(OPTIMAL|NOT_OPTIMAL|NO_RESPONSE)\]/gi, '').trim();
    conversationHistory.push({ role: 'assistant', content: cleanResponse });

    sendToTab(tabId, { type: MessageType.AI_MESSAGE, text: cleanResponse });
    sendToSidePanel({ type: MessageType.AI_MESSAGE, text: cleanResponse });

    if (triggerType === 'accepted' && isOptimal) {
      setTimeout(endInterviewEarly, 2000);
    }
  } catch (err) {
    console.error('Active interviewer prompt failed:', err);
    broadcastError('Interviewer error: ' + (err.message || err));
  } finally {
    promptInFlight = false;
  }
}

function stopActiveInterviewer() {
  if (activePromptInterval) {
    clearInterval(activePromptInterval);
    activePromptInterval = null;
  }
  if (utteranceTimer) {
    clearTimeout(utteranceTimer);
    utteranceTimer = null;
  }
  promptInFlight = false;
}

function endInterviewEarly() {
  if (getState() !== State.INTERVIEWING) return;
  if (!tabId) return;
  sendToTab(tabId, { type: 'FINISH_EARLY' }).catch(() => {});
}

async function handleInterviewFinished(msg) {
  setState(State.EVALUATING);
  broadcastState();
  stopTimer();
  stopActiveInterviewer();

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

    await addInterviewHistory({
      id: Date.now().toString(),
      date: new Date().toISOString(),
      problem: {
        title: interviewData.problemDetail?.title || '',
        titleSlug: interviewData.problemDetail?.titleSlug || '',
        difficulty: interviewData.problemDetail?.difficulty || interviewData.difficulty || '',
      },
      language: currentLanguage,
      duration: elapsed,
      model: usage.model,
      provider: usage.provider,
      overallScore: parsed.overallScore || 0,
      recommendation: parsed.recommendation || '',
      scores: parsed.scores || {},
      summary: parsed.summary || '',
      usage: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        calls: usage.calls,
        estimatedCost: usage.estimatedCost,
      },
      transcript,
      submissions: submissionHistory,
      finalCode: codeSnapshots.length ? codeSnapshots[codeSnapshots.length - 1].code : '',
    });

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

let lastInitialPrompt = '';

async function sendInitialPrompt() {
  const problem = interviewData.problemDetail;
  const minutes = interviewData.durationOverride > 0
    ? interviewData.durationOverride
    : ({ easy: 20, medium: 30, hard: 45 }[interviewData.difficulty] || 30);

  const prompt = `Let's begin your interview. You have been given the problem "${problem.title}" (${problem.difficulty}). Read the problem statement carefully, explain your understanding, then discuss your approach before coding. You have ${minutes} minutes. Good luck!`;

  lastInitialPrompt = prompt;

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
  stopActiveInterviewer();
  interviewData = null;
  transcript = '';
  codeSnapshots = [];
  submissionHistory = [];
  currentLanguage = '';
  lastInitialPrompt = '';
  conversationHistory = [];
  lastTranscriptOffset = 0;
  lastFinalLength = 0;
  pendingUtterance = '';
  codingStarted = false;
  lastApproachReviewTime = 0;
  lastReviewedSnapshotCount = 0;
  approachReviewCount = 0;
  pendingSession = null;
  injectRetries = 0;
}
