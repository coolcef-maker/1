import axios from 'axios';

function substituteTemplate(template, variables) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : '';
  });
}

function getByPath(obj, path) {
  if (!path) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    const match = part.match(/(\w+)(?:\[(\d+)\])?/);
    if (match) {
      const prop = match[1];
      const idx = match[2] != null ? Number(match[2]) : null;
      cur = cur[prop];
      if (idx != null) cur = Array.isArray(cur) ? cur[idx] : undefined;
    } else if (/^\d+$/.test(part)) {
      cur = Array.isArray(cur) ? cur[Number(part)] : undefined;
    } else {
      cur = cur[part];
    }
  }
  return cur;
}

function buildOpenAIChatBody(model, messages) {
  return { model, messages };
}

async function callOpenRouter(slot, messages) {
  const url = `${slot.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers = {
    Authorization: `Bearer ${slot.apiKey}`,
    'Content-Type': 'application/json',
    ...slot.headers,
  };
  const body = buildOpenAIChatBody(slot.model, messages);
  const resp = await axios.post(url, body, { headers, timeout: 60000 });
  const text = getByPath(resp.data, 'choices.0.message.content');
  return typeof text === 'string' ? text : JSON.stringify(resp.data);
}

async function callOpenAICompatible(slot, messages) {
  const url = `${slot.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers = {
    Authorization: `Bearer ${slot.apiKey}`,
    'Content-Type': 'application/json',
    ...slot.headers,
  };
  const body = buildOpenAIChatBody(slot.model, messages);
  const resp = await axios.post(url, body, { headers, timeout: 60000 });
  const text = getByPath(resp.data, 'choices.0.message.content');
  return typeof text === 'string' ? text : JSON.stringify(resp.data);
}

async function callGeneric(slot, messages) {
  const g = slot.generic || {};
  const url = g.url || slot.baseUrl;
  const method = (g.method || 'POST').toUpperCase();
  const headers = { 'Content-Type': 'application/json', ...slot.headers, ...(g.headers || {}) };
  const variables = {
    model: slot.model || '',
    messages_json: JSON.stringify(messages),
  };
  const bodyString = substituteTemplate(g.bodyTemplate || '{"messages":{{messages_json}}}', variables);
  const resp = await axios({ url, method, headers, data: bodyString, timeout: 60000 });
  const path = g.responsePath || 'choices.0.message.content';
  const text = getByPath(resp.data, path);
  return typeof text === 'string' ? text : JSON.stringify(resp.data);
}

export async function callProvider(slotKey, slot, messages) {
  try {
    if (!slot || !slot.providerType) {
      return { slotKey, label: slot?.label || slotKey, error: 'Provider not configured' };
    }
    if (!slot.apiKey && slot.providerType !== 'generic_json') {
      return { slotKey, label: slot.label, error: 'Missing API key' };
    }
    let output = '';
    switch (slot.providerType) {
      case 'openrouter':
        output = await callOpenRouter(slot, messages);
        break;
      case 'openai_compatible':
        output = await callOpenAICompatible(slot, messages);
        break;
      case 'generic_json':
        output = await callGeneric(slot, messages);
        break;
      default:
        output = await callOpenAICompatible(slot, messages);
    }
    return { slotKey, label: slot.label || slotKey, providerType: slot.providerType, output };
  } catch (err) {
    const msg = (err && err.response && err.response.data) ? JSON.stringify(err.response.data) : (err.message || 'Unknown error');
    return { slotKey, label: slot.label || slotKey, providerType: slot.providerType, error: msg };
  }
}

export async function callAllProviders(slots, messages) {
  const keys = ['slotA', 'slotB', 'slotC'];
  const tasks = keys.map((k) => callProvider(k, slots[k], messages));
  const results = await Promise.all(tasks);
  const out = {};
  for (const r of results) {
    out[r.slotKey] = r;
  }
  return out;
}