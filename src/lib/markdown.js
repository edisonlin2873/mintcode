function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(md) {
  if (!md) return '';

  const codeBlocks = [];
  let text = md.replace(/```[^\n]*\n?([\s\S]*?)```/g, (m, code) => {
    const placeholder = `\u0000CODE${codeBlocks.length}\u0000`;
    codeBlocks.push(`<pre class="md-code"><code>${escapeHtml(code.replace(/\n+$/, '').replace(/^\n/, ''))}</code></pre>`);
    return placeholder;
  });

  text = escapeHtml(text);

  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  const lines = text.split('\n');
  const out = [];
  let listType = null;
  let listBuffer = [];

  const flushList = () => {
    if (listType && listBuffer.length) {
      out.push(`<${listType}>${listBuffer.join('')}</${listType}>`);
    }
    listType = null;
    listBuffer = [];
  };

  for (const line of lines) {
    let m;
    if ((m = line.match(/^#{1,6}\s+(.*)/))) {
      flushList();
      const lvl = m[1].length;
      out.push(`<h${lvl}>${m[2]}</h${lvl}>`);
    } else if ((m = line.match(/^\s*[-*+]\s+(.*)/))) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listBuffer.push(`<li>${m[1]}</li>`);
    } else if ((m = line.match(/^\s*\d+\.\s+(.*)/))) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listBuffer.push(`<li>${m[1]}</li>`);
    } else if ((m = line.match(/^\s*&gt;\s?(.*)/))) {
      flushList();
      out.push(`<blockquote>${m[1]}</blockquote>`);
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      out.push(`<p>${line}</p>`);
    }
  }
  flushList();

  return out.join('\n').replace(/\u0000CODE(\d+)\u0000/g, (_, i) => codeBlocks[i]);
}

export { escapeHtml, renderMarkdown };
