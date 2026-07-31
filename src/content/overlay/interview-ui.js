let container = null;
let timerEl = null;
let micEl = null;
let aiMessageEl = null;
let aiMessageContent = null;
let startButton = null;
let finishButton = null;
let onStart = null;
let onFinish = null;

function create(callbacks) {
  onStart = callbacks.onStart || (() => {});
  onFinish = callbacks.onFinish || (() => {});
  const autoStart = !!callbacks.autoStart;

  container = document.createElement('div');
  container.id = 'ai-interview-ui';
  container.style.display = 'none';
  container.innerHTML = `
    <div class="interview-top-bar">
      <div class="interview-timer" id="ai-interview-timer">--:--</div>
      <div class="interview-mic" id="ai-interview-mic">
        <span class="mic-icon">🎤</span>
        <span class="mic-status">Ready</span>
      </div>
      <div class="interview-controls">
        <button class="ai-btn ai-btn-start" id="ai-interview-start-btn">Start Interview</button>
        <button class="ai-btn ai-btn-finish" id="ai-interview-finish-btn" style="display:none">Finish Early</button>
      </div>
    </div>
    <div class="interview-ai-message" id="ai-interview-message">
      <div class="ai-message-label">MintCode</div>
      <div class="ai-message-content" id="ai-interview-message-content">Ready to begin?</div>
    </div>
  `;
  document.body.appendChild(container);

  timerEl = container.querySelector('#ai-interview-timer');
  micEl = container.querySelector('#ai-interview-mic');
  aiMessageEl = container.querySelector('#ai-interview-message');
  aiMessageContent = container.querySelector('#ai-interview-message-content');
  startButton = container.querySelector('#ai-interview-start-btn');
  finishButton = container.querySelector('#ai-interview-finish-btn');

  const begin = () => {
    startButton.style.display = 'none';
    finishButton.style.display = 'inline-block';
    micEl.querySelector('.mic-status').textContent = 'Listening';
    micEl.querySelector('.mic-icon').textContent = '🎙️';
    onStart();
  };

  startButton.addEventListener('click', begin);

  finishButton.addEventListener('click', () => {
    if (confirm('Finish interview early and get your evaluation?')) {
      onFinish();
    }
  });

  container.style.display = 'block';

  if (autoStart) {
    begin();
  }
}

function updateTimer(remaining, total) {
  if (!timerEl) return;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  if (remaining < 300) {
    timerEl.style.color = '#ff4444';
  } else if (remaining < 600) {
    timerEl.style.color = '#ffaa00';
  }
}

function showAIMessage(text) {
  if (!aiMessageContent) return;
  aiMessageContent.textContent = text;
  aiMessageEl.style.display = 'block';
}

function updateMicStatus(isListening) {
  if (!micEl) return;
  const status = micEl.querySelector('.mic-status');
  const icon = micEl.querySelector('.mic-icon');
  if (isListening) {
    status.textContent = 'Listening';
    icon.textContent = '🎙️';
  } else {
    status.textContent = 'Ready';
    icon.textContent = '🎤';
  }
}

function destroy() {
  if (container) {
    container.remove();
    container = null;
  }
  timerEl = null;
  micEl = null;
  aiMessageEl = null;
  aiMessageContent = null;
  startButton = null;
  finishButton = null;
}

export { create, updateTimer, showAIMessage, updateMicStatus, destroy };
