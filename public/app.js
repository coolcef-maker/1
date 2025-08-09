const outA = document.getElementById('outA');
const outB = document.getElementById('outB');
const outC = document.getElementById('outC');
const labelA = document.getElementById('labelA');
const labelB = document.getElementById('labelB');
const labelC = document.getElementById('labelC');
const statusA = document.getElementById('statusA');
const statusB = document.getElementById('statusB');
const statusC = document.getElementById('statusC');
const promptEl = document.getElementById('prompt');
const form = document.getElementById('chatForm');
const sendBtn = document.getElementById('sendBtn');

let history = [];

async function fetchLabels() {
  try {
    const res = await fetch('/api/admin/config');
    if (!res.ok) return; // not logged in; labels remain defaults
    const data = await res.json();
    if (data?.slots) {
      labelA.textContent = data.slots.slotA?.label || 'Slot A';
      labelB.textContent = data.slots.slotB?.label || 'Slot B';
      labelC.textContent = data.slots.slotC?.label || 'Slot C';
    }
  } catch {}
}

function addMessage(targetEl, role, text, isError = false) {
  const p = document.createElement('div');
  p.className = `message ${role} ${isError ? 'error' : ''}`;
  p.textContent = text;
  targetEl.appendChild(p);
  targetEl.scrollTop = targetEl.scrollHeight;
}

function setStatus(el, cls) {
  el.classList.remove('status-loading', 'status-ok', 'status-error');
  if (cls) el.classList.add(cls);
}

function openaiMessage(role, content) {
  return { role, content };
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = promptEl.value.trim();
  if (!text) return;

  // Append user message on all panes
  addMessage(outA, 'user', text);
  addMessage(outB, 'user', text);
  addMessage(outC, 'user', text);

  // Prepare messages payload
  history.push(openaiMessage('user', text));

  // UI state
  promptEl.value = '';
  sendBtn.disabled = true;
  setStatus(statusA, 'status-loading');
  setStatus(statusB, 'status-loading');
  setStatus(statusC, 'status-loading');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json();

    const a = data.slotA;
    const b = data.slotB;
    const c = data.slotC;

    if (a?.error) {
      addMessage(outA, 'assistant', a.error, true);
      setStatus(statusA, 'status-error');
    } else {
      addMessage(outA, 'assistant', a?.output || '');
      setStatus(statusA, 'status-ok');
      if (a?.output) history.push(openaiMessage('assistant', a.output));
    }

    if (b?.error) {
      addMessage(outB, 'assistant', b.error, true);
      setStatus(statusB, 'status-error');
    } else {
      addMessage(outB, 'assistant', b?.output || '');
      setStatus(statusB, 'status-ok');
    }

    if (c?.error) {
      addMessage(outC, 'assistant', c.error, true);
      setStatus(statusC, 'status-error');
    } else {
      addMessage(outC, 'assistant', c?.output || '');
      setStatus(statusC, 'status-ok');
    }
  } catch (err) {
    addMessage(outA, 'assistant', String(err), true);
    addMessage(outB, 'assistant', String(err), true);
    addMessage(outC, 'assistant', String(err), true);
    setStatus(statusA, 'status-error');
    setStatus(statusB, 'status-error');
    setStatus(statusC, 'status-error');
  } finally {
    sendBtn.disabled = false;
  }
});

// Support Shift+Enter for newline
promptEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.dispatchEvent(new Event('submit'));
  }
});

fetchLabels();