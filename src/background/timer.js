const DURATION_BY_DIFFICULTY = {
  easy: 20 * 60,
  medium: 30 * 60,
  hard: 45 * 60,
};

let remaining = 0;
let total = 0;
let intervalId = null;
let onTick = null;
let onExpired = null;

function start(difficulty, overrideMinutes, callbacks) {
  total = overrideMinutes > 0
    ? overrideMinutes * 60
    : (DURATION_BY_DIFFICULTY[difficulty] || 30 * 60);

  remaining = total;
  onTick = callbacks.onTick || (() => {});
  onExpired = callbacks.onExpired || (() => {});

  intervalId = setInterval(() => {
    remaining--;
    onTick(remaining, total);
    if (remaining <= 0) {
      stop();
      onExpired();
    }
  }, 1000);
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function getRemaining() {
  return remaining;
}

function getElapsed() {
  return total - remaining;
}

export { start, stop, getRemaining, getElapsed };
