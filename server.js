import express from 'express';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import { callAllProviders } from './src/lib/providers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG_PATH = path.join(__dirname, 'config', 'providers.json');

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'super-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 12,
    },
  })
);

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

function ensureConfigFile() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    const defaultConfig = {
      slots: {
        slotA: {
          label: 'OpenRouter',
          providerType: 'openrouter',
          apiKey: '',
          baseUrl: 'https://openrouter.ai/api/v1',
          model: 'openrouter/auto',
          headers: { 'HTTP-Referer': '', 'X-Title': 'Tri LLM Chat' },
          generic: {
            url: '',
            method: 'POST',
            headers: {},
            bodyTemplate: '{"model":"{{model}}","messages":{{messages_json}}}',
            responsePath: 'choices.0.message.content'
          }
        },
        slotB: {
          label: 'Abacus',
          providerType: 'openai_compatible',
          apiKey: '',
          baseUrl: 'https://YOUR-ABACUS-ENDPOINT/api/v1',
          model: 'gpt-4o-mini',
          headers: {},
          generic: {
            url: '',
            method: 'POST',
            headers: {},
            bodyTemplate: '{"model":"{{model}}","messages":{{messages_json}}}',
            responsePath: 'choices.0.message.content'
          }
        },
        slotC: {
          label: 'Genspark',
          providerType: 'openai_compatible',
          apiKey: '',
          baseUrl: 'https://YOUR-GENSPARK-ENDPOINT/api/v1',
          model: 'gpt-4o-mini',
          headers: {},
          generic: {
            url: '',
            method: 'POST',
            headers: {},
            bodyTemplate: '{"model":"{{model}}","messages":{{messages_json}}}',
            responsePath: 'choices.0.message.content'
          }
        }
      }
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
  }
}

function readConfig() {
  ensureConfigFile();
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeConfig(conf) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(conf, null, 2));
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Auth
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === 'admin' && password === 'pass') {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// Admin config endpoints
app.get('/api/admin/config', requireAdmin, (req, res) => {
  const conf = readConfig();
  res.json(conf);
});

app.post('/api/admin/config', requireAdmin, (req, res) => {
  const conf = req.body;
  if (!conf || !conf.slots) {
    return res.status(400).json({ error: 'Invalid config payload' });
  }
  writeConfig(conf);
  res.json({ ok: true });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages must be a non-empty array' });
    }
    const conf = readConfig();
    const result = await callAllProviders(conf.slots, messages);
    res.json(result);
  } catch (err) {
    console.error('Chat error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Fallback to index.html for any unmatched route (SPA-like)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});