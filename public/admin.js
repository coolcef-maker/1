const loginSection = document.getElementById('loginSection');
const configSection = document.getElementById('configSection');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const saveBtn = document.getElementById('saveBtn');
const saveState = document.getElementById('saveState');

const slotA = document.getElementById('slotA');
const slotB = document.getElementById('slotB');
const slotC = document.getElementById('slotC');

let conf = null;

const PROVIDERS = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai_compatible', label: 'OpenAI-Compatible' },
  { value: 'generic_json', label: 'Generic JSON (Custom)' },
  { value: 'abacus', label: 'Abacus (use OpenAI-Compatible settings)' },
  { value: 'genspark', label: 'Genspark (use OpenAI-Compatible settings)' },
];

function coerceProviderType(type) {
  if (type === 'abacus' || type === 'genspark') return 'openai_compatible';
  return type;
}

async function getMe() {
  const r = await fetch('/api/me');
  return r.json();
}

async function getConfig() {
  const r = await fetch('/api/admin/config');
  return r.json();
}

function input(id, label, value = '', type = 'text', placeholder = '') {
  return `
    <label class="text-xs text-slate-300">${label}</label>
    <input id="${id}" type="${type}" placeholder="${placeholder}" value="${value || ''}"
      class="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 mb-3" />
  `;
}

function textarea(id, label, value = '', placeholder = '') {
  return `
    <label class="text-xs text-slate-300">${label}</label>
    <textarea id="${id}" placeholder="${placeholder}" rows="4"
      class="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 mb-3">${value || ''}</textarea>
  `;
}

function select(id, label, value, options) {
  const opts = options.map(o => `<option value="${o.value}" ${o.value===value?'selected':''}>${o.label}</option>`).join('');
  return `
    <label class="text-xs text-slate-300">${label}</label>
    <select id="${id}" class="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 mb-3">${opts}</select>
  `;
}

function renderSlotForm(container, slotKey) {
  const s = conf.slots[slotKey];
  const providerValue = ['abacus','genspark'].includes(s.providerType) ? s.providerType : s.providerType;

  container.innerHTML = `
    ${input(`${slotKey}-label`, 'Label', s.label)}
    ${select(`${slotKey}-provider`, 'Provider', providerValue, PROVIDERS)}
    ${input(`${slotKey}-apiKey`, 'API Key', s.apiKey, 'password', 'sk-...')}
    ${input(`${slotKey}-baseUrl`, 'Base URL', s.baseUrl || '', 'text', 'https://...')}
    ${input(`${slotKey}-model`, 'Model', s.model || '')}
    ${textarea(`${slotKey}-headers`, 'Extra Headers (JSON)', JSON.stringify(s.headers || {}), '{"Header-Name":"value"}')}
    <details class="mb-2">
      <summary class="text-sm text-slate-300 cursor-pointer">Generic JSON (advanced)</summary>
      <div class="mt-2">
        ${input(`${slotKey}-g-url`, 'URL', s.generic?.url || '')}
        ${input(`${slotKey}-g-method`, 'Method', s.generic?.method || 'POST')}
        ${textarea(`${slotKey}-g-headers`, 'Headers (JSON)', JSON.stringify(s.generic?.headers || {}))}
        ${textarea(`${slotKey}-g-bodyTemplate`, 'Body Template', s.generic?.bodyTemplate || '{"model":"{{model}}","messages":{{messages_json}}}')}
        ${input(`${slotKey}-g-responsePath`, 'Response JSON Path', s.generic?.responsePath || 'choices.0.message.content')}
        <p class="text-xs text-slate-400">Template variables: {{model}}, {{messages_json}}</p>
      </div>
    </details>
  `;
}

function collectSlot(container, slotKey) {
  const get = (id) => container.querySelector(`#${slotKey}-${id}`).value.trim();
  const getJSON = (id, fallback) => {
    try { return JSON.parse(container.querySelector(`#${slotKey}-${id}`).value || '{}'); } catch { return fallback; }
  };
  let providerType = container.querySelector(`#${slotKey}-provider`).value;
  providerType = coerceProviderType(providerType);

  return {
    label: get('label'),
    providerType,
    apiKey: container.querySelector(`#${slotKey}-apiKey`).value,
    baseUrl: get('baseUrl'),
    model: get('model'),
    headers: getJSON('headers', {}),
    generic: {
      url: get('g-url'),
      method: get('g-method') || 'POST',
      headers: getJSON('g-headers', {}),
      bodyTemplate: container.querySelector(`#${slotKey}-g-bodyTemplate`).value || '{"messages":{{messages_json}}}',
      responsePath: get('g-responsePath') || 'choices.0.message.content',
    }
  };
}

async function render() {
  const me = await getMe();
  if (me.isAdmin) {
    loginSection.classList.add('hidden');
    configSection.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    conf = await getConfig();
    renderSlotForm(slotA, 'slotA');
    renderSlotForm(slotB, 'slotB');
    renderSlotForm(slotC, 'slotC');
  } else {
    loginSection.classList.remove('hidden');
    configSection.classList.add('hidden');
    logoutBtn.classList.add('hidden');
  }
}

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (r.ok) {
    await render();
  } else {
    alert('Invalid credentials');
  }
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  await render();
});

saveBtn.addEventListener('click', async () => {
  const newConf = { slots: {
    slotA: collectSlot(slotA, 'slotA'),
    slotB: collectSlot(slotB, 'slotB'),
    slotC: collectSlot(slotC, 'slotC'),
  }};

  saveBtn.disabled = true;
  saveState.textContent = 'Saving...';
  const r = await fetch('/api/admin/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newConf) });
  if (r.ok) {
    saveState.textContent = 'Saved';
    conf = newConf;
    setTimeout(() => saveState.textContent = '', 1500);
  } else {
    saveState.textContent = 'Error saving';
  }
  saveBtn.disabled = false;
});

render();