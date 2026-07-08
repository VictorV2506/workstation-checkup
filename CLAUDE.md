# CLAUDE.md — Workstation Checkup

> Master context for any agent working on this repo. Read this first, then
> **TODO.md** (work queue) and **LESSONS.md** (accumulated gotchas).
> Last reconciled: **2026-07-02**. If you change architecture, update this file.

---

## What this is (one paragraph)

Internal web app for JustEatTakeaway **BER (Berlin) offices** to inspect and track
**desks, meeting rooms, and server rooms** across Buildings A–E. Staff mark items
as pending / inspected / issue, log equipment, file Jira tickets for issues, and use
an AI chatbot ("DESKBOT 9000") to query and update inspection data in natural language.
~7 users today; there is interest from other countries (Milan/Italy) in adopting it.

- **Live:** https://workstation-revamp.web.app
- **Firebase/GCP project:** `workstation-revamp` (inside the **`just-eat.com`** GCP org, org ID 884176749073)
- **Repo:** `github.com/VictorV2506/workstation-checkup` (⚠️ personal account — see Governance)
- **Region:** Firestore in `europe-west10`

---

## Architecture / stack

- **Frontend:** vanilla JS, **no build step**, no framework. Plain `<script>` tags in
  `index.html` load modules in order; everything shares **global scope** (no modules/imports).
  Firebase **compat** SDK v10.7.1 from gstatic CDN. Chart.js from jsDelivr.
- **Hosting:** Firebase Hosting (serves `public/`). Deploy: `firebase deploy --only hosting`.
- **Database:** Cloud Firestore. Client SDK talks to it directly, gated by `firestore.rules`.
- **Auth:** Firebase Auth, Google sign-in. **Access is restricted to the org via the GCP
  OAuth consent screen set to "Internal" (`org_internal`)** — NOT in code. See Gotchas.
- **Backends (proxies):** two **personal Deno Deploy** apps hold the secrets and forward to
  external APIs (the frontend calls these, NOT the Firebase functions in `functions/`):
  - Toqan/chatbot: `https://radiant-woodpecker-65.victorv2506.deno.net` (`/create`, `/continue`)
  - Jira: `https://full-platypus-4956.victorv2506.deno.net` (POST `{action, issueData}`)
- **`functions/index.js`** is an unused Firebase Functions version of the Toqan proxy. The
  app does NOT call it. It reads `TOQAN_API_KEY` from `functions/.env` (gitignored).
  ⚠️ A deploy was attempted **2026-06-06** and **rejected by org policy**
  `constraints/run.allowedIngress` — Functions-v2 / Cloud Run can't take public ingress in this
  org, so the Deno→Functions move as a *browser-called public function* is blocked, and
  **billing tier is irrelevant** (project is already in the org; billing ≠ org policy). See LESSONS **L33**.
- **App Check:** reCAPTCHA v3 **registered in monitoring mode only** (secret key saved in
  console). The SDK is **not yet in the frontend** and enforcement is **OFF**. Do not enforce.

### Billing reality
Project is on **Blaze**, but linked to a **personal credit card** (temporary). Spark's
outbound-call block is therefore lifted — Cloud Functions *can* now call external APIs.
Getting onto **company billing** is an open task (see TODO / Governance).

---

## Firestore data model

| Collection    | Doc ID            | Purpose |
|---------------|-------------------|---------|
| `floors`      | auto UUID         | Floor layout: `building`, `floor`, `width`, `height`, `image_path`, `desks[]` (markers). **Admin-write only.** |
| `inspections` | **`desk.number`** | Primary per-item record (status, remarks, checks, equipment, `jiraTicket`). |
| `history`     | auto UUID         | Audit log of changes. |
| `admins`      | user email        | Admin registry (`role: admin` / `superadmin`). |
| `users`       | user email        | Login audit. |
| `config`      | logical name      | App config, e.g. `config/jira` (projectKey, parentKey, issueTypeId). Admin-write only. |
| `desks`       | UUID              | Legacy, superseded by `inspections`. |

**THE key fact:** `desk.number` is the universal `inspections` doc ID for **all** item types.
- Desks: `BERA_0_1`, `BERE_3_84` (office+building prefixed)
- Meeting/server rooms: their **plain name** — `Burger`, `Americano`, `Enchilada`
- `desk.id` is a UUID internal to `floors` only — **never** use it for inspections.
- In memory, `desksData{}` is keyed by `desk.number`.
- Meeting-room names are **globally unique** (Google Workspace enforces it), so there is
  **no cross-office ID collision** risk.

In-memory state (`public/js/core/state.js`, all globals):
`floorConfigs[]` (all floors), `desksData{}` (keyed by number, loaded per-floor on demand),
`currentFloor`, `currentUser`, `isAdmin`, `currentZoom`, bulk-edit flags.

---

## File map (`public/js/`)

**Loaded & live** (order set in `index.html`):
`config/firebase-config.js`, `config/constants.js` → `core/state.js`, `core/auth.js` →
`data/data-loader.js` → features: `floor-selector`, `zoom`, `stats`, `filters`, `history`,
`inspection-modal`, `desk-interactions`, `dashboard`, `map-interactions`, `bulk-edit`,
`chat`, `floor-renderer`, `admin-panel`, `jira`.

**Dead / duplicate — NOT loaded, delete when convenient:**
`admin-panel2.js`, `chatworking.js`, `bulk-edit2.js`, `floor-renderer2.js`,
`map-interactions.js` (abandoned, conflicting), and CSS `styless.css`, `stylesoptionB.css`.
Verify against `index.html` `<script>` tags before deleting.

---

## Security posture (READ THIS)

The app **works** but is **not hardened**. The known holes are documented in TODO.md (P0).
Do not assume the current state is safe. Headline issues, none yet fixed as of 2026-06-23:

1. **Firestore rules are wide-open for authed users.** Most collections are `allow read,
   write: if isAuth()` — i.e. any signed-in org member can read/write/delete all
   inspections, history, and user docs. The only real gate is `org_internal` at sign-in.
2. **Stored XSS** in `inspection-modal.js`, `history.js`, `jira.js`, `dashboard.js` —
   Firestore data is concatenated into `innerHTML`/inline `onclick` without escaping.
3. **No CSP.** `index.html` has no Content-Security-Policy.
4. **Open proxies.** Both Deno proxies are unauthenticated, no rate limiting, on a personal
   account, holding company Toqan + Jira credentials. Anyone with the URL can abuse them.
5. **App Check** is registered but not enforced (and SDK not wired into the frontend yet).

**Golden rule for this codebase:** the frontend is fully public; never trust it or put
secrets in it. Security must be enforced server-side (Firestore rules, proxy auth, App Check).
Client-side `if (isAdmin)` checks are cosmetic — the rules are the real gate.

---

## Governance debt (company app on personal infra)

Recurring theme — these should move to company ownership (open tasks in TODO):
- **Billing** on a personal credit card → company Cloud Billing account.
- **Deno proxies** on a personal `victorv2506` account → **DECIDED 2026-07-02: a Sonic Portal
  Scaffolder internal API service** (Type=API, secrets in **Vault**, **Firebase-ID-token** auth,
  internal-only via **Zscaler** = "Option C"). Confirmed with the Sonic team; details in TODO P1 +
  LESSONS L35/L36. (Public Firebase Functions ruled out — org policy `constraints/run.allowedIngress`,
  L33; Cloudflare/LB were interim candidates, now superseded.)
- **GitHub repo** on a personal account → company GitHub org (and confirm it's **private**).
- **Toqan** — there is a company `just-data-toqan-prod` GCP project; ask its owners for the
  sanctioned internal way to consume Toqan instead of a personal key + personal proxy.

---

## Conventions / how to work here

- **No build step.** Edit `public/` files directly; deploy with `firebase deploy --only hosting`.
- **Vanilla JS, global functions**, called from inline `onclick=` in `index.html`. Match that style.
- Collections `admins`/`users` are keyed by **email** (not UID) — this makes a future Okta/IdP
  switch much smoother; don't introduce UID-keyed data.
- When rendering Firestore data into the DOM, **escape it** (or use `textContent`) — see TODO XSS task.
- Read the actual Firestore data / the real file before assuming field names (see LESSONS L01/L17).
- `firestore.rules` is in the repo and edited locally; **verify it's actually deployed** before
  trusting it (working copy can differ from deployed).
- **Superadmin is not a global** — `auth.js` sets `isAdmin` (true for both admin & superadmin). For a
  superadmin-only action (e.g. "Manage Offices"), expose the actual role in state, AND gate the write in
  `firestore.rules` (add an `isSuperAdmin()` helper) — never just the UI. New collections / Storage paths
  need matching rules: present the COMPLETE block, then verify it deployed.

## Deploy
```bash
firebase deploy --only hosting          # frontend
firebase deploy --only firestore:rules  # rules
# Deno proxies: deployed via Deno Deploy dashboard (personal account) — being migrated
```

## Planned directions (not yet built — see TODO)
- **Multi-office (self-service, chosen 2026-07-02):** office-picker landing page → load only the
  selected office's floors. New **`offices`** collection (superadmin-write) + `office` field on
  `floors`. Adding an office is a **UI task**: superadmin "Manage Offices" screen, then per-office
  admin creates floors (upload floor-plan → Storage) + markers (existing admin panel). Rules gate
  office/floor/Storage writes server-side (UI is cosmetic). Access stays global (all EIT see all
  offices). Full spec + build breakdown in TODO. (Old manual "hand-tag + drop PNGs" approach = fallback.)
- **Okta SSO** via Firebase Identity Platform (OIDC/SAML); access managed by Okta group
  assignment — the preferred way to restrict the app to EITOPS / Prod & Tech.
