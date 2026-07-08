// server.js — Workstation Checkup internal API proxy
// Verifies Firebase ID tokens, then forwards to Toqan + Jira using SERVER-HELD secrets.
// Runs on Sonic Runtime, internal-only ("Option C"). Secrets come from Vault via the sidecar.
// See README.md for the request/response contract, env vars, and deploy/cutover notes.

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { jwtVerify, createRemoteJWKSet } from 'jose';

const {
  TOQAN_API_KEY,
  JIRA_BASE_URL = 'https://justeattakeaway.atlassian.net',
  JIRA_EMAIL,                 // Jira service-account email (Basic auth) — see README ⚠️
  JIRA_TOKEN,                 // Jira service-account API token
  ALLOWED_ORIGIN = 'https://workstation-revamp.web.app',
  ALLOWED_DOMAIN = '@justeattakeaway.com',
  FIREBASE_PROJECT_ID = 'workstation-revamp',
  PORT = '8080',
} = process.env;

// Firebase Admin, init for ID-token verification ONLY. No service-account key needed:
// verifyIdToken fetches Google's public keys over HTTPS and checks aud/iss against the projectId.
// (If your runtime rejects credential-less init, swap to `jose` against the securetoken JWKS — see README.)
const FB_JWKS = createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
));

const TOQAN_BASE = 'https://api.toqan.ai/api';
const app = Fastify({ logger: true, trustProxy: true });

// CORS is ours to own — the internal Istio gateway is transparent (doesn't inject/strip/short-circuit).
await app.register(cors, {
  origin: ALLOWED_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  maxAge: 3600,
});

// Per-user, per-pod sliding-window rate limit (in-memory). Fine for a ~7-user internal tool;
// swap to Redis if you ever need limits shared across the prod bulkhead pods.
const RATE_MAX = 60;              // requests
const RATE_WINDOW_MS = 60_000;    // per minute
const hits = new Map();
function rateLimited(key) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > RATE_MAX;
}

// Auth: verify the Firebase ID token on every request (health check excepted).
// The token is the SAME one the signed-in SPA already holds — no new auth system.
app.addHook('preHandler', async (req, reply) => {
  if (req.url === '/healthz') return;

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return reply.code(401).send({ error: 'missing bearer token' });

  let decoded;
  try {
    const { payload } = await jwtVerify(token, FB_JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    });
    decoded = payload;
  } catch {
    return reply.code(401).send({ error: 'invalid token' });
  }

  // Gate on email (NOT `hd` — it isn't present in a Firebase ID token; see LESSONS L36).
  const email = (decoded.email || '').toLowerCase();
  if (decoded.email_verified !== true || !email.endsWith(ALLOWED_DOMAIN)) {
    return reply.code(403).send({ error: 'forbidden' });
  }

  if (rateLimited(decoded.uid || email)) {
    return reply.code(429).send({ error: 'rate limit exceeded' });
  }
  req.authEmail = email;
});

// Health (no auth) for liveness/readiness probes.
app.get('/healthz', async () => ({ ok: true }));

// ── Toqan ────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollForAnswer(conversationId, requestId) {
  const url = `${TOQAN_BASE}/get_answer?conversation_id=${conversationId}&request_id=${requestId}`;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const r = await fetch(url, { headers: { 'x-api-key': TOQAN_API_KEY } });
    if (r.status === 200) {
      const d = await r.json();
      const last = Array.isArray(d.messages) && d.messages.length ? d.messages[d.messages.length - 1] : null;
      const text = d.answer || d.message || d.content || d.text || d.response ||
        (last ? (last.content || last.text || last.answer) : null);
      if (text) return { conversation_id: conversationId, message: text.replace(/<think>[\s\S]*?<\/think>/g, '').trim() };
    }
  }
  throw new Error('Response timed out');
}

async function callToqan(reply, path, body) {
  let r;
  try {
    r = await fetch(TOQAN_BASE + path, {
      method: 'POST',
      headers: { 'x-api-key': TOQAN_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch { return reply.code(502).send({ error: 'upstream unreachable' }); }
  if (!r.ok) return reply.code(r.status).send({ error: 'Toqan API error: ' + r.status });
  const initial = await r.json();
  if (!initial.conversation_id || !initial.request_id) {
    return reply.code(500).send({ error: 'Unexpected response', raw: initial });
  }
  try { return reply.send(await pollForAnswer(initial.conversation_id, initial.request_id)); }
  catch (e) { return reply.code(500).send({ error: e.message }); }
}

app.post('/toqan/create', async (req, reply) =>
  callToqan(reply, '/create_conversation', { user_message: req.body?.user_message }));

app.post('/toqan/continue', async (req, reply) =>
  callToqan(reply, '/continue_conversation', {
    conversation_id: req.body?.conversation_id,
    user_message: req.body?.user_message,
  }));

// ── Jira ─────────────────────────────────────────────────────────────────
// Contract (matches the current Deno proxy the frontend calls):
//   body = { action: 'create_issue', issueData: { fields: {...} } }
// Jira Cloud REST v3: POST /rest/api/3/issue with Basic auth (service-account email : API token).
// ⚠️ CONFIRM the current Deno proxy uses Basic email:token (Jira Cloud standard) + this endpoint.
const jiraAuth = 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');

app.post('/jira', async (req, reply) => {
  const { action, issueData } = req.body || {};
  if (action !== 'create_issue') {
    return reply.code(400).send({ error: `unsupported action: ${action}` });
  }
  if (!issueData || typeof issueData !== 'object' || !issueData.fields) {
    return reply.code(400).send({ error: 'missing issueData.fields' });
  }
  // TODO (hardening, TODO P0): allowlist fields / pin the project key server-side.
  return forward(reply, `${JIRA_BASE_URL}/rest/api/3/issue`, {
    headers: { Authorization: jiraAuth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(issueData),
  });
});

// Upstream forwarder: pass status + body through verbatim; never echo the secret.
async function forward(reply, url, opts) {
  let upstream;
  try {
    upstream = await fetch(url, { method: 'POST', ...opts });
  } catch (err) {
    reply.log.error({ err: String(err), url }, 'upstream fetch failed');
    return reply.code(502).send({ error: 'upstream unreachable' });
  }
  const body = await upstream.text();
  return reply
    .code(upstream.status)
    .type(upstream.headers.get('content-type') || 'application/json')
    .send(body);
}

// Warn (don't crash) if a secret is missing — its route will 5xx until Vault is wired.
for (const [k, v] of Object.entries({ TOQAN_API_KEY, JIRA_EMAIL, JIRA_TOKEN })) {
  if (!v) app.log.warn(`env ${k} is not set — its route will fail until Vault injects it`);
}

app.listen({ port: Number(PORT), host: '0.0.0.0' })
  .catch((err) => { app.log.error(err); process.exit(1); });
