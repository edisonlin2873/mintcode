const MessageType = {
  // Popup → Background
  START_INTERVIEW: 'START_INTERVIEW',
  CANCEL_INTERVIEW: 'CANCEL_INTERVIEW',
  VOID_INTERVIEW: 'VOID_INTERVIEW',

  // Background → Content
  FETCH_RANDOM_PROBLEM: 'FETCH_RANDOM_PROBLEM',
  INJECT_OVERLAY: 'INJECT_OVERLAY',
  AI_MESSAGE: 'AI_MESSAGE',
  EVALUATION_RESULT: 'EVALUATION_RESULT',
  INTERVIEW_ENDED: 'INTERVIEW_ENDED',

  // Content → Background
  PROBLEM_SELECTED: 'PROBLEM_SELECTED',
  PROBLEM_FETCH_FAILED: 'PROBLEM_FETCH_FAILED',
  OVERLAY_READY: 'OVERLAY_READY',
  INTERVIEW_STARTED: 'INTERVIEW_STARTED',
  INTERVIEW_FINISHED: 'INTERVIEW_FINISHED',
  CODE_SNAPSHOT: 'CODE_SNAPSHOT',
  TRANSCRIPT_UPDATE: 'TRANSCRIPT_UPDATE',
  MIC_STATUS: 'MIC_STATUS',
  SUBMISSION_RESULT: 'SUBMISSION_RESULT',
  PROBLEM_LOADED: 'PROBLEM_LOADED',
  ERROR: 'ERROR',

  // Background → Sidepanel / general
  STATE_UPDATE: 'STATE_UPDATE',
  GET_STATE: 'GET_STATE',
};

function sendToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

function sendToBackground(message) {
  return chrome.runtime.sendMessage(message);
}

function sendToPopup(extensionId, message) {
  return chrome.runtime.sendMessage(extensionId, message);
}

export { MessageType, sendToTab, sendToBackground, sendToPopup };
