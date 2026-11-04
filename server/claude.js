// Calls the Claude Messages API with streaming, passing each piece of text to onText as it arrives.
'use strict';

function createClaude({ apiKey, model, baseUrl = 'https://api.anthropic.com', fetchImpl = fetch }) {
  return async function ask({ guide, context, messages, maxTokens, onText }) {
    if (!apiKey) throw Object.assign(new Error('The coach is not connected yet: add ANTHROPIC_API_KEY in Render → Environment.'), { status: 503 });
    const res = await fetchImpl(baseUrl.replace(/\/+$/, '') + '/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        stream: true,
        system: [
          { type: 'text', text: guide, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: context }
        ],
        messages
      })
    });
    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = (j.error && j.error.message) || ''; } catch (e) { /* not JSON */ }
      if (res.status === 429 || res.status === 529) throw Object.assign(new Error('The coach is busy right now. Try again in a minute.'), { status: 503 });
      if (res.status === 401) throw Object.assign(new Error('The coach could not sign in to Claude: check ANTHROPIC_API_KEY in Render → Environment.'), { status: 503 });
      throw Object.assign(new Error('The coach could not answer' + (detail ? ': ' + detail : '.')), { status: 502 });
    }

    let text = '';
    let buf = '';
    const decoder = new TextDecoder();
    const handle = (block) => {
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!data) return;
      let ev;
      try { ev = JSON.parse(data); } catch (e) { return; }
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
        text += ev.delta.text;
        if (onText) onText(ev.delta.text, text);
      } else if (ev.type === 'error') {
        const overloaded = ev.error && /overloaded/i.test(ev.error.type || '');
        throw Object.assign(new Error(overloaded ? 'The coach is busy right now. Try again in a minute.' : 'The coach stopped partway. Try again.'), { status: 503, partial: text });
      }
    };
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 2); }
    }
    if (buf.trim()) handle(buf);
    return text.trim();
  };
}

module.exports = { createClaude };
