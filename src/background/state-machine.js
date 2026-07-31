const State = {
  IDLE: 'IDLE',
  SELECTING_PROBLEM: 'SELECTING_PROBLEM',
  COUNTDOWN: 'COUNTDOWN',
  INTERVIEWING: 'INTERVIEWING',
  EVALUATING: 'EVALUATING',
  COMPLETED: 'COMPLETED',
};

let currentState = State.IDLE;
let listeners = [];

function getState() {
  return currentState;
}

function setState(newState) {
  currentState = newState;
  listeners.forEach(fn => fn(newState));
}

function onChange(fn) {
  listeners.push(fn);
}

function reset() {
  currentState = State.IDLE;
}

export { State, getState, setState, onChange, reset };
