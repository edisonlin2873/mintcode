let container = null;

function create() {
  container = document.createElement('div');
  container.id = 'ai-interview-results';
  container.style.display = 'none';
  container.innerHTML = `
    <div class="results-backdrop">
      <div class="results-card">
        <div class="results-header">Interview Complete</div>
        <div class="results-overall">
          <div class="results-score-ring">
            <svg viewBox="0 0 120 120" class="score-ring-svg">
              <circle cx="60" cy="60" r="50" class="ring-bg" />
              <circle cx="60" cy="60" r="50" class="ring-fill" id="results-ring-fill" />
            </svg>
            <div class="score-number" id="results-score-number">0</div>
          </div>
        </div>
        <div class="results-details" id="results-details"></div>
        <div class="results-summary" id="results-summary">
          <h3>Summary</h3>
          <p id="results-summary-text"></p>
        </div>
        <div class="results-recommendation" id="results-recommendation"></div>
        <button class="ai-btn ai-btn-close" id="results-close-btn">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  container.querySelector('#results-close-btn').addEventListener('click', () => {
    destroy();
  });
}

function show(result) {
  if (!container) create();
  container.style.display = 'block';

  const overall = result.overallScore || 0;
  const scoreEl = container.querySelector('#results-score-number');
  const ringEl = container.querySelector('#results-ring-fill');

  animateScore(scoreEl, ringEl, overall);

  const detailsEl = container.querySelector('#results-details');
  const scores = result.scores || {};
  detailsEl.innerHTML = Object.entries(scores).map(([key, val]) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    const score = val.score || 0;
    const reason = val.reason || '';
    const barColor = score >= 7 ? '#4caf50' : score >= 4 ? '#ff9800' : '#f44336';
    return `
      <div class="result-dimension">
        <div class="dimension-header">
          <span>${label}</span>
          <span class="dimension-score">${score}/10</span>
        </div>
        <div class="dimension-bar">
          <div class="dimension-fill" style="width:${score * 10}%;background:${barColor}"></div>
        </div>
        <div class="dimension-reason">${reason}</div>
      </div>
    `;
  }).join('');

  const summaryEl = container.querySelector('#results-summary-text');
  summaryEl.textContent = result.summary || '';

  const recEl = container.querySelector('#results-recommendation');
  const rec = result.recommendation || '';
  recEl.textContent = rec;
  recEl.className = 'results-recommendation';
  if (rec.includes('Hire')) recEl.classList.add('rec-hire');
  else if (rec.includes('No')) recEl.classList.add('rec-no');
  else recEl.classList.add('rec-maybe');
}

function animateScore(scoreEl, ringEl, target) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  let current = 0;

  ringEl.style.strokeDasharray = circumference;

  const interval = setInterval(() => {
    current += 0.5;
    if (current >= target) {
      current = target;
      clearInterval(interval);
    }
    scoreEl.textContent = Math.round(current);
    const offset = circumference - (current / 10) * circumference;
    ringEl.style.strokeDashoffset = offset;
  }, 30);
}

function destroy() {
  if (container) {
    container.remove();
    container = null;
  }
}

export { create, show, destroy };
