let container = null;

function create(problem, onComplete) {
  container = document.createElement('div');
  container.id = 'ai-interview-countdown';
  container.innerHTML = `
    <div class="countdown-backdrop">
      <div class="countdown-content">
        <div class="countdown-label">Interview Starting</div>
        <div class="countdown-problem">${problem.title}</div>
        <div class="countdown-difficulty ${problem.difficulty.toLowerCase()}">${problem.difficulty}</div>
        <div class="countdown-number">5</div>
        <div class="countdown-sub">Get ready...</div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  let count = 5;
  const numberEl = container.querySelector('.countdown-number');

  const interval = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(interval);
      fadeOut(() => {
        destroy();
        if (onComplete) onComplete();
      });
    } else {
      numberEl.textContent = count;
    }
  }, 1000);
}

function fadeOut(callback) {
  if (container) {
    container.style.transition = 'opacity 0.5s ease';
    container.style.opacity = '0';
    setTimeout(callback, 500);
  } else {
    callback();
  }
}

function destroy() {
  if (container) {
    container.remove();
    container = null;
  }
}

export { create, destroy };
