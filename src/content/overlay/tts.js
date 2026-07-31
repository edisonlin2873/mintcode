let isSpeaking = false;
let onEnd = null;

function speak(text, callbacks) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = 'en-US';

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Google US English') || v.name.includes('Microsoft David'));
    if (preferred) utterance.voice = preferred;

    isSpeaking = true;
    utterance.onend = () => {
      isSpeaking = false;
      resolve();
    };
    utterance.onerror = () => {
      isSpeaking = false;
      resolve();
    };

    window.speechSynthesis.speak(utterance);
  });
}

function stop() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
}

function getIsSpeaking() {
  return isSpeaking;
}

export { speak, stop, getIsSpeaking };
