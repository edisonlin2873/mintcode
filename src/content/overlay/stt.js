let recognition = null;
let isListening = false;
let onResult = null;
let onError = null;
let restartTimeout = null;

function start(callbacks) {
  if (isListening) return;
  onResult = callbacks.onResult || (() => {});
  onError = callbacks.onError || (() => {});

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    onError('Speech recognition not supported');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  let finalTranscript = '';

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript + ' ';
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    onResult(finalTranscript, interim);
  };

  recognition.onerror = (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    onError(event.error);
    restartWithDelay();
  };

  recognition.onend = () => {
    if (isListening) restartWithDelay();
  };

  isListening = true;
  recognition.start();
}

function restartWithDelay() {
  if (restartTimeout) clearTimeout(restartTimeout);
  restartTimeout = setTimeout(() => {
    if (isListening && recognition) {
      try {
        recognition.start();
      } catch (e) {
        // already started
      }
    }
  }, 300);
}

function stop() {
  isListening = false;
  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {}
    recognition = null;
  }
}

function getIsListening() {
  return isListening;
}

export { start, stop, getIsListening };
