const GET_CODE_EVENT = 'mintcode:get-code';
const CODE_EVENT = 'mintcode:code';
let lastCode = '';

function getMonacoEditor() {
  return window.monaco && window.monaco.editor;
}

function getMainCode() {
  try {
    const editor = getMonacoEditor();
    if (!editor || typeof editor.getModels !== 'function') return '';
    const models = editor.getModels() || [];
    if (!models.length) return '';

    let best = models[0];
    for (let i = 1; i < models.length; i++) {
      if (models[i].getValue().length > best.getValue().length) best = models[i];
    }
    return best.getValue() || '';
  } catch (e) {
    return '';
  }
}

function broadcastCode() {
  const code = getMainCode();
  if (code === lastCode) return;
  lastCode = code;
  try {
    document.dispatchEvent(new CustomEvent(CODE_EVENT, { detail: code }));
  } catch (e) {}
}

function debounce(fn, wait) {
  let t = null;
  return function () {
    clearTimeout(t);
    t = setTimeout(fn, wait);
  };
}

function attachWatchers() {
  try {
    const editor = getMonacoEditor();
    if (!editor) return;

    const models = typeof editor.getModels === 'function' ? editor.getModels() : [];
    models.forEach((m) => {
      if (m && typeof m.onDidChangeContent === 'function') {
        m.onDidChangeContent(debounce(broadcastCode, 400));
      }
    });

    if (typeof editor.onDidCreateModel === 'function') {
      editor.onDidCreateModel((m) => {
        if (m && typeof m.onDidChangeContent === 'function') {
          m.onDidChangeContent(debounce(broadcastCode, 400));
        }
      });
    }
  } catch (e) {}
}

document.addEventListener(GET_CODE_EVENT, () => {
  lastCode = '';
  broadcastCode();
});

attachWatchers();
window.addEventListener('load', attachWatchers);
setTimeout(attachWatchers, 1000);
setTimeout(attachWatchers, 3000);
