# INFRA & PROXY STATE — Workstation Checkup

> Single source of truth for **hosting, proxies, git, and Sonic** as of **2026-07-08**.
> Created because the infra story got complex (two git remotes, two Deno proxies, multiple Sonic
> deployments) — kept here to avoid bloating CLAUDE.md / TODO.md / LESSONS.md. Read all four.

## TL;DR — what's live and working
- **The working app = Firebase Hosting (`workstation-revamp.web.app`) → two personal Deno proxies.**
  Chatbot + Jira + everything works, now **secured** (Firebase ID-token verification on both proxies).
- Everything except chat/Jira talks **straight to Firestore** client-side (no proxy) — works from any origin.
- The Sonic/Launchpad deployments are **experiments in progress**, NOT the live app (see below).

## Git — TWO separate remotes on the Mac
| Remote | URL | Auth | Role |
|--------|-----|------|------|
| `origin` | `github.com/VictorV2506/workstation-checkup` | HTTPS | Personal dev repo (original) |
| `company` | `github.je-labs.com/victor-viziri/workstation-revamp` | HTTPS + **PAT** | Company repo (Private) — compliant target |

- Company GitHub handle = **`victor-viziri`** (also the handle needed for PMD/Sonic onboarding).
- je-labs pushes need a **Personal Access Token** (Settings → Developer settings → tokens, `repo` scope) — Okta/login password is rejected. Local branch = `main`.

## Proxies — two personal Deno Deploy workers (the working backend)
On a **personal `victorv2506` Deno account** (governance debt → move to company infra eventually).

| Proxy | URL / paths | Key facts |
|-------|-------------|-----------|
| Toqan (chat) | `radiant-woodpecker-65.victorv2506.deno.net` — `/create`, `/continue` | **`x-api-key` header (NOT Bearer)** + **2-step polling** (`create` → poll `get_answer`). Env: `TOQAN_KEY`. |
| Jira | `full-platypus-4956.victorv2506.deno.net` — POST `{action, issueData}` | Basic auth `base64(email:token)` → `/rest/api/3/issue`. Env: `JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_DOMAIN`. |

- **Auth (both, now hardened):** frontend attaches `Authorization: Bearer <firebase-id-token>` (via `_authedFetch` in `constants.js`); proxy verifies with **`jose`** against Google's securetoken JWKS, gates on `email_verified` + `@justeattakeaway.com`; per-user rate limit; CORS allows `Authorization`.
- ⚠️ **ROTATE KEYS:** the Toqan key was once **hardcoded** in the Deno source (and pasted in chat) → treat as exposed, rotate. Rotate the Jira token too.

## Sonic — the compliance saga (backend NOT yet live on Sonic)
Goal: move the proxy off personal Deno onto company infra. Two Sonic surfaces:

### Sonic Runtime via Scaffolder = the PROPER production path — BLOCKED on onboarding
- Scaffolder (Type=API) → real repo + pipelines + **Vault** secrets + internal `*.jet-internal.com` DNS.
- **Blocker:** Victor isn't in any **PMD** team → no Backstage user → Scaffolder "user not found".
- **Fix:** PR to `metadata/PlatformMetadata` adding `victor-viziri` to a team's `engineers` array. Closest = **`workplace-technology-engineering`** (jira project **ITOPS**, `owns_components: true`). Contacts: **brenden.rea** (WTE lead, final call), **#help-cde** / **#help-core-platform-services**. Okta: have `Sonic-dev-user`.
- Reachability once deployed: internal-only; the browser reaches it because users are on **Zscaler** (device-layer tunnel, `fetch`-transparent — unlike SSO gateways).

### Sonic Launchpad = the PROTOTYPE tier — used as interim, currently TANGLED
⚠️ Launchpad docs: **"prototypes, not production," ephemeral storage.** There are **TWO SEPARATE Launchpad builds** (source of much confusion):
1. **Static nginx** (`walk-the-store`: `public/` + `Dockerfile` + `nginx.conf`, **NO server.js**) — serves frontend only → frontend calls **Deno** → **CORS-blocked** (Deno allows only `workstation-revamp.web.app`). chat/Jira fail there; everything else works.
2. **Combined server** (`server.js`: Fastify serving **frontend + API proxy** same-origin, reads Sonic **Configuration-tab env vars**) — the compliant-ish target. Had the **wrong Toqan integration** (Bearer + no polling) → fix = `x-api-key` + polling (see Deno Toqan). `soniccodereviewer` bot flagged: missing `jose` dep, raw-error leakage, unguarded poll timeout, empty-after-`<think>`-strip — all addressable.

**KEY facts (hard-won):**
- `server.js` **only matters for chat + Jira** (the proxy). Everything else is Firestore-direct, no backend needed.
- The two Launchpad builds are **separate entities**; editing one never touches the other.
- **`server.js` has ZERO effect on the Firebase deploy** — Firebase Hosting is static (serves `public/`, can't run Node) and calls Deno. Fully isolated.
- **Env vars are server-side only** — the browser can't hold secrets, so a server-side proxy is always required.
- Deploy discipline we broke → chaos: **backend green + `curl`-tested FIRST, frontend cutover LAST.** Don't improvise the host out of order.

### GCP / Firebase Functions — ruled out
- Public Functions blocked by org policy `constraints/run.allowedIngress` (LESSONS L33), billing-independent.
- **P&T push to reduce GCP spend / build in AWS** — Sonic Runtime IS AWS (OneEKS), so Sonic aligns; expanding GCP (Functions) does not.

## Go-forward plan (Victor's chosen approach, 2026-07-08)
1. **Iterate + build the app** on the working setup (Firebase + hardened Deno) — incl. the **multi-office feature** (the real deliverable — spec in TODO P1).
2. When satisfied, **push to company git** (`workstation-revamp`).
3. **Redeploy Sonic** and work out the deployment (consolidate to ONE combined-server build, or the Scaffolder path once PMD clears) — with the **platform team's** help for the Launchpad/deploy mechanics.

## Immediate open items
- **Rotate** the Toqan + Jira keys (Toqan exposed).
- **Multi-office** feature (offices collection + picker + per-office floors) — see TODO P1.
- **Consolidate** the tangled Launchpad builds → one combined-server, or go Scaffolder.
- **Frontend hardcodes the Deno URLs** (`chat.js`/`jira.js` — e.g. `endpoint = "https://radiant-woodpecker-65.victorv2506.deno.net/create"`), so the **Sonic build calls Deno cross-origin → CORS-fails** instead of using its own `server.js`. For Sonic to use its own backend, the frontend must **runtime-detect the base**, e.g.:
  ```js
  var _sonic     = location.hostname.endsWith('.jet-internal.com');
  var TOQAN_BASE = _sonic ? '' : 'https://radiant-woodpecker-65.victorv2506.deno.net';
  var JIRA_BASE  = _sonic ? '' : 'https://full-platypus-4956.victorv2506.deno.net';
  // chat.js:  endpoint = TOQAN_BASE + (_chatConversationId ? '/toqan/continue' : '/toqan/create');
  // jira.js:  _JIRA_PROXY = JIRA_BASE + '/jira';
  ```
  → Firebase hits Deno (which matches `/toqan/create` loosely), Sonic hits same-origin `server.js`. **Test the live Firebase app still works after this change.** This is part of the deferred Sonic-deploy work, not needed for the Firebase app.
- Still-open security (TODO P0/P2): harden Firestore rules, stored-XSS (`esc()`), CSP, SRI.
