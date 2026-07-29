# TODO — Workstation Checkup

> Work queue. Read **CLAUDE.md** first for context. Status: `[ ]` open · `[~]` in progress · `[x]` done · `[!]` urgent
> Last updated: **2026-07-08**. The app functions (Session 25); these are the gaps — mostly **security hardening**.
> **Infra/proxy/git/Sonic state + go-forward plan → [`INFRA-STATE.md`](INFRA-STATE.md).** Working app = Firebase +
> **hardened** Deno (jose token-verify on both proxies). ⚠️ **Rotate the Toqan + Jira keys** (Toqan was exposed).
> Plan: build features on Firebase+Deno → push to company git → redeploy Sonic with platform-team help.

---

## 🔴 P0 — Security & blockers (none of these are done)

`[!]` **Verify deployed Firestore rules have no expiry + match the repo.**
  A previous note warned the project's default rules expire **2026-06-27** (≈now). If the
  *deployed* rules are still test-mode (`allow ... if request.time < timestamp.date(2026,6,27)`),
  the whole app locks out everyone on that date. Check Firebase Console → Firestore → Rules.
  The repo `firestore.rules` are proper auth rules, but the working copy may not be deployed.
  **Do this first — it's days away.**

`[ ]` **Fix stored XSS (the real fix is output escaping).**
  Firestore data is written into `innerHTML`/inline handlers unescaped. Add an `esc()` helper
  in `public/js/config/constants.js` and apply it:
  - `inspection-modal.js`: `${d.remarks}` (3×), `value="${d.tvSize}"`, `value="${d.extraAVDevice}"`
  - `history.js`: `_renderHistoryRow` (drop inline `onclick`, use `data-desk-id` + delegated
    listener), `_statusPill`, `_summariseChanges`, `_renderChangeLines`, `openDeskTimeline` (changedBy)
  - `jira.js`: lines ~52 & ~195 (`existingKey` / `item.ticketKey` into innerHTML)
  - `dashboard.js`: `openDrillDown` (drop inline `onclick`, use data attrs + delegation)
  Rule: untrusted value → `textContent` or escaped before `innerHTML`. Never raw.

`[ ]` **Add a Content-Security-Policy** via `firebase.json` hosting `headers` (not a meta tag).
  Note: app uses inline handlers + inline `<script>`, so a strict (no `'unsafe-inline'`) CSP
  needs those refactored first. Ship a baseline CSP now (locks object-src/base-uri/frame-ancestors,
  restricts script/connect/img origins); strict CSP is a later refactor.

`[ ]` **Harden Firestore rules.** Currently most collections are `if isAuth()` = any signed-in
  org member can read/write/delete everything. Change:
  - `history`: append-only — `allow create` only, `update/delete: if false`; validate `changedBy`.
  - `users/{email}`: self-write only (`email == request.auth.token.email`).
  - `inspections`: field/type validation (constrain `status` enum, cap `remarks` length, `hasOnly` keys).
  - `admins`: `allow read: if isAdmin()` (currently any authed user can enumerate admins).
  (Per-office walls NOT needed — all EIT see all offices.)

`[ ]` **Secure / replace the open Deno proxies.** Both are unauthenticated, no rate limit, on a
  personal account, holding company Toqan + Jira keys. Add **Firebase ID-token verification**
  (client sends `Authorization: Bearer <idToken>`, proxy verifies via JWKS), allowlist the Jira
  `action`/fields, add per-user rate limiting. Then **rotate the Toqan + Jira keys** (they've
  been behind open endpoints; the Toqan key was also found in plaintext in a local
  `firebase-debug.log`, now deleted — extra reason to rotate). The token-verify + forwarding code
  ports directly to the decided **Sonic internal API service** (see P1); hardening the Deno proxy
  is the *interim* step since it stays live until cutover.

`[ ]` **Finish App Check** (reCAPTCHA v3 already registered, monitoring only):
  add the App Check SDK to the frontend with the **site key**, deploy, watch the verified %
  climb in the console, and **only then enforce**. ⚠️ Never click "Enforce" while traffic is
  100% unverified — it denies all requests including the real app.

`[ ]` **Enable Firestore backups / PITR.** Multi-office data is coming and the current rules let
  any authed user delete data — backups are non-negotiable.

---

## 🟠 P1 — Governance (move company app off personal infra)

`[ ]` **Get the project onto company billing.** It's on Blaze via a **personal credit card**.
  Ask the GCP/billing owner to link `workstation-revamp` to a **company Cloud Billing account**
  and remove the personal card. Set GCP budget alerts ($1/$5/$20) meanwhile.
  (Entry point: EIT help → whoever owns Google Cloud.)

`[ ]` **Move the GitHub repo to the company org** and confirm it is **private**
  (currently `github.com/VictorV2506/...`, personal).

`[~]` **Move the proxies to company infra — DECIDED (2026-07-02): a Sonic Scaffolder internal API
  service (Option C).** Confirmed with the Sonic platform team. Design:
  - **Host:** Sonic Portal Scaffolder, **Type=API**, on Sonic Runtime (see LESSONS **L35**).
  - **Reachability = Option C, internal-only** — no public exposure (no ACM ingress / Cloudflare /
    SmartGateway). The public Firebase SPA reaches the internal `*.{env}.jet-internal.com` service
    because users are on **Zscaler/VPN** and the browser resolves internal DNS (Istio VirtualService).
  - **Secrets → Vault** (sidecar injector) — holds the Toqan key + a Jira **service-account** token.
  - **Auth → verify the Firebase ID token** every request (NOT Okta; gate on `email`, not `hd` — **L36**):
    `email_verified === true && email.endsWith('@justeattakeaway.com')`.
  - **CORS** → allow `https://workstation-revamp.web.app`.
  - Fallback = **Option A** (ACM public ingress + Cloudflare + auth) only if off-Zscaler devices
    (phones) ever need it; auth is built in, so C→A is a config flip, not a rewrite.
  **Build steps:** scaffold API service → wire Vault secrets → token-verify middleware + allowlisted
  forward to Toqan/Jira → CORS → point `chat.js`/`jira.js` at the internal URL + attach
  `Authorization: Bearer <idToken>` → cut over → retire Deno proxies → rotate keys.
  ⚠️ **Verify before building:** Sonic Runtime **egress** to `api.toqan.ai` / `*.atlassian.net` /
  `googleapis.com` (Firebase key fetch) — the proxy is useless if outbound is blocked.
  (Supersedes the earlier Functions/Cloudflare/LB options — those were pre-decision; see L33.)
  **STATUS 2026-07-02: blocked on Sonic ONBOARDING, not on code.** The Scaffolder throws "user not
  found" — needs (a) a Backstage user entity (Okta sync) → **#help-cde**, and (b) PMD team membership
  (`Data/teams/{team}.json`, GitHub handle in `engineers`) → **team lead**; plus Okta `sonicdev-user`
  + `sonicdev-scaffold-earlyadopter` groups. Could take days–weeks if first-on-team. **The app is NOT
  blocked** — it runs on the Deno proxy meanwhile (see L37). Service already drafted in `proxy/`.
  Interim risk-cut (needs no onboarding): harden the Deno proxy — token-check + rate-limit + rotate keys.
  ⚠️ **Likely root cause (2026-07-02):** the user has **no company (je-labs) GitHub account** and isn't on
  any registered team, so the Backstage importer never created a user entity — i.e. never onboarded to the
  dev platform at all. Referred to **#help-cde** to get set up from scratch (GitHub account → team/PMD →
  catalog). This gates the WHOLE Sonic path; expect days–weeks.

`[ ]` **Ask about sanctioned Toqan access.** There's a company `just-data-toqan-prod` GCP project
  — find out the approved internal way to consume Toqan instead of a personal key + personal proxy.

`[ ]` **Confirm data-handling approval** for sending inspection data + user emails to Toqan (the
  chatbot ships an in-memory data summary to the external AI).

---

## 🟡 P1 — Features / access

`[ ]` **Okta SSO + group-based access** (preferred way to restrict to EITOPS / Prod & Tech).
  Onboard the app to Okta (EIT creates the integration) and wire Firebase **Identity Platform**
  OIDC/SAML; access then managed by Okta group assignment. Replaces any custom department-attribute
  / custom-claim approach. `auth.js` sign-in call changes; rest of app unaffected (email-keyed).

`[ ]` **Multi-office support — self-service via superadmin UI (chosen direction, 2026-07-02).**
  Goal: onboarding a new office (Milan, then more) is a **UI task, not a Firebase-editing task**.
  **Runtime flow:** landing page → **office picker** (first thing after login) → app loads only the
  selected office's floors → stats/dashboard/chat/Jira all scope to that office automatically.
  **Data model:**
  - New **`offices`** collection (doc per office: `code` e.g. "BER"/"MIL", `displayName`, optional
    `country`/`order`). **Superadmin-write only.**
  - Add an **`office`** field to `floors` docs (e.g. `office:"BER"`). Backfill existing ~30 floors to
    `"BER"` once (safe, idempotent — L25). Inspections/history do NOT need it (reached via their
    floor; meeting-room names are globally unique — L17).
  **Management UI (two layers):**
  1. **Superadmin → "Manage Offices":** add / edit / (soft-)remove offices. Superadmin-only.
  2. **Admin → per-office content:** inside a selected office, create **floors** (name, building,
     floor number, **upload floor-plan image → Firebase Storage → `image_path`**, set width/height),
     then place **areas/markers** (desks / meeting rooms / server rooms) — extends the existing
     admin-panel marker add/delete/drag.
  **Security (server-side, not just UI — L28):** Firestore rules gate `offices` writes to
  **superadmin** and `floors` writes to **admin/superadmin**; the picker + admin buttons are cosmetic.
  Add Firebase **Storage** rules for floor-plan uploads (admin-only, size/type limits).
  **Trade-off:** more to build than manual tagging (offices CRUD + floor-creation UI + image upload),
  but reliable and dev-free for future offices — the right call for multi-country. (Old manual approach
  — hand-tag floors + drop PNGs under `public/floors/MIL/` + deploy — is the fallback if the UI slips.)

  **Build breakdown (handover — verified against the code 2026-07-02):**
  - Load path: `loadFloorData()` (data-loader.js) loads ALL `floors`, pushes `doc.data()` into
    `floorConfigs[]`, derives the building dropdown. Each floor doc has an **`id` FIELD** (floor-selector
    uses `floor.id` as the option value), plus `building`, `floor`, `desks[]`, `image_path`, `width`,
    `height`. Marker writes: `db.collection('floors').doc(currentFloor.id).update(...)`.
  - Image convention: existing PNGs are `public/floors/<building>-<floor>.png` (e.g. `A-0.png`).
    **Berlin stays untouched** (keeps its stored `image_path`); only NEW floors get a new path.
  - ⚠️ **Superadmin is NOT a global** — `auth.js` sets only `isAdmin` (true for admin+superadmin). Add a
    `currentUserRole`/`isSuperAdmin` global (state.js) + set it in auth.js to gate "Add Office".
  - New floor doc: `const ref = db.collection('floors').doc(); ref.set({ id: ref.id, office, building,
    floor, desks: [], image_path, width, height })` — matches the existing shape.
  - **Increments (build in order; BER must keep working throughout):**
    1. Groundwork — `currentOffice` + role globals; one-time backfill script (user runs it) tagging
       floors `office:"BER"` + creating `offices/BER`.
    2. Office picker after login + scope floors to `currentOffice` (client-side filter of `floorConfigs`
       is fine at this scale — server-side `where()` + composite index is a later optimisation, L24) +
       Switch-Office control.
    3. Add Office (superadmin) form + the `offices` Firestore rule (needs an `isSuperAdmin()` helper).
    4. Empty-state canvas + Add Floor: **Firebase Storage upload** (project is on Blaze) → store the
       returned URL as `image_path`, auto-read the image's naturalWidth/Height for `width`/`height`; then markers.
  - **Rules (present COMPLETE blocks before deploying):** Firestore `offices` (read isAuth, write
    isSuperAdmin) + new **Storage** rules (`storage.rules`, register in firebase.json; admin-only write
    via `firestore.exists(/databases/(default)/documents/admins/{email})`, `contentType.matches('image/.*')`, size cap).
  - **PENDING DECISION (ask the user):** Milan floor naming → (a) has buildings `floors/MIL/<b>-<f>.png`,
    (b) floors-only `floors/MIL/<f>.png`, (c) freeform filename. Drives the Add-Floor form + Storage path.
  - **Image mechanism:** Storage upload (self-service, zero terminal steps) is the leaning choice (user
    wants full self-service). Manual static-hosting deploy is the simpler fallback. Confirm before #4.

---

## 🟢 P2 — Cleanup & nice-to-have

`[ ]` Delete dead/duplicate files: `admin-panel2.js`, `chatworking.js`, `bulk-edit2.js`,
  `floor-renderer2.js`, `map-interactions.js`, `styless.css`, `stylesoptionB.css`
  (verify none are referenced in `index.html` first).
`[ ]` Delete the unused `functions/index.js` (Toqan proxy) + `functions/.env` — the Functions
  migration is ruled out (Sonic Scaffolder is the decided path; see P1 + L33), so it's dead
  key-reading code. Its logic still informs the new proxy (token-verify + forward), so keep a copy
  of the pattern, not the deployed function.
`[ ]` Resolve duplicate `Admins` vs `admins` Firestore collections — keep lowercase `admins`,
  delete capital `Admins` (confirm empty first).
`[ ]` Add SRI hashes to the CDN `<script>` tags (Firebase, Chart.js) in `index.html`.
`[ ]` Remove unused deps in `functions/package.json` (`firebase-admin`, `node-fetch`) — moot if the
  whole `functions/` dir is deleted (above). Note: the new Sonic **Node** service *will* use
  `firebase-admin` for `verifyIdToken()`.
`[ ]` Update the stale comment in `auth.js` claiming domain restriction is unimplemented — it IS,
  via the GCP `org_internal` consent screen (see LESSONS).
`[ ]` Strip `console.log` debug noise (esp. `auth.js` admin-status log).
`[ ]` Export inspection data (CSV/PDF). Mobile layout polish. CI/CD (GitHub Actions deploy).

---

## ✅ Recently done (Session ≤25)

Full app, floor maps + type-aware markers, type-aware inspection modal, bulk edit + drag-select,
dashboard (charts, drill-down, missing items), history logging, admin panel (marker add/delete/
drag, user management, reset-all-to-pending), **DESKBOT chatbot with validated write actions**,
**Jira integration** (single + bulk ticket creation, wired in `jira.js`), App Check reCAPTCHA v3
registered (monitoring).

**Session 26 (2026-06-23):** Investigated migrating the Toqan/Jira proxies from personal Deno
Deploy → Firebase Functions (feasibility spike). **Verdict: blocked** by org policy
`constraints/run.allowedIngress` (public ingress to Functions-v2/Cloud Run denied; billing tier
irrelevant — see LESSONS L33). No code change. Deleted local `functions/firebase-debug.log`
(it held the Toqan key in plaintext; gitignored, never committed).

**Session 27 (2026-07-02):** Chose the proxy's new home. Ruled out Firebase Functions (L33), Apps
Script (lateral, weak auth), Toqan connections/MCP (agent-outbound, L34) and Launchpad (prototype-
only), and — after confirming with the Sonic team — **decided on a Sonic Scaffolder internal API
service, Option C** (internal-only via Zscaler, Vault secrets, Firebase-ID-token auth). Nailed the
auth details: verify the Firebase ID token, gate on `email` not `hd` (L36). Design + build steps in
P1; gotchas in L34–L36. No code yet — build starts once the service is scaffolded.

**Session 28 (2026-07-02):** Ruled out every alternative proxy-hosting path (Firebase Functions — dead by
org policy; Toqan connections/MCP — agent-outbound, L34; Launchpad — prototype-only; App Integrations —
just a Launchpad automation token) and confirmed the Sonic Scaffolder path — but hit the **onboarding wall**
("user not found": no Backstage user, likely no company GitHub account, not on a team). Proxy now **parked +
async**; app runs on Deno. Pivoted to the **multi-office feature** (the real next build): agreed the
self-service superadmin-UI design, read the app to produce the build breakdown (P1), and chose **Firebase
Storage** for self-service floor-plan upload (already on Blaze). Handed off to a fresh agent to build it.
Drafted proxy still in `proxy/`.

**Session 29 (2026-07-20):** De-risked and largely BUILT the Sonic path — via **Launchpad** (which the user
CAN use; the S28 onboarding wall was the *production Scaffolder*, Launchpad is the prototype tier). Shipped
two Sonic apps (separate Launchpad repos, not in this repo): **desk-sos** = working self-service desk→Jira
reporting portal for Winnipeg (office selector, Zscaler-gated, no login; created real `EITOPSGLOB-12885`);
**workstation-api** = the Deno-proxy replacement (`/jira` create-only + `/toqan/create|continue` server-polled
+ `/health`, Firebase-ID-token auth, CORS-locked, sanitised errors, egress ServiceEntry) — status **"ready",
pending an end-to-end real-token test + app cutover**. Proved a Sonic service CAN reach Jira/Toqan (egress via
ServiceEntry + https — resolves L35's open unknown). In THIS repo (all uncommitted): **printer item type**
(Tier 1+2) + family "Other" dropdown, **floor carry-over** on building switch, **marker double-warning fix**,
**dashboard A/B/C** (all-types KPIs/charts, clickable equipment cards, drill-down stored-XSS fixed). Created
`.claude/skills/sonic-deploy/SKILL.md` + **`HANDOFF.md`**. **Open next:** (1) test `workstation-api` with a
real Firebase token → wire `constants.js` → retire Deno + **rotate keys**; (2) clean workstation-api env cruft
+ verify auth uses Google public keys (the stray `JWT_SECRET`); (3) printer **Tier 3** (chat/jira/reset-all
awareness); (4) desk-sos → tech-app **"reported flag"** wiring (needs a Firestore SA for desk-sos). Full state
+ next-agent prompt in **`HANDOFF.md`**.
