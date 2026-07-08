# LESSONS — Workstation Checkup

> Accumulated gotchas. Read alongside **CLAUDE.md** + **TODO.md**.
> Reconciled 2026-06-23: some older lessons are **corrected** below, and lessons that were
> specific to a previous agent's Toqan/`code_executor` environment were **dropped** (they don't
> apply to a Claude Code agent with direct file access — see note at the bottom).

---

## Architecture / data model (still true)

**L01 — Confirm doc-ID format vs in-memory key before any read/write.**
`desks` uses UUID doc IDs; `inspections` uses `desk.number`. An early bug looked up inspections
by UUID → status always undefined. Never assume the doc ID and the in-memory key match.

**L17 — `desk.number` is the universal `inspections` doc ID for ALL item types.**
Desks `BERA_0_1`; meeting/server rooms use their plain name (`Burger`, `Americano`). `desk.id`
is a UUID internal to `floors` only. `desksData{}` is keyed by `desk.number`. Read the real
Firestore data before assuming field names.

**L08 — Append-only logs use auto-generated doc IDs**, with the meaningful identifier as a field.
(But note: the `history` *rules* currently still allow update/delete — see TODO P0 to make it truly append-only.)

**L22 — Firestore `config` collection ≠ local `js/config/` folder.** Totally different things.
When referencing a Firestore collection, always give the full path (`config/jira` = collection
`config`, doc `jira`) and say "in the Firestore console, not your local files."

**L24 (new) — Filtered Firestore queries bill per matching doc, not per collection size.**
`where('office','==','BER')` reads only the matching docs regardless of how big the collection
gets. Adding more offices does NOT inflate one office's read cost — *as long as queries filter*.
The thing that reads the whole DB is an unfiltered `.get()` (e.g. the commented-out
`loadDesksData()`). Subcollections give no read advantage over an indexed field here.

**L25 (new) — Prefer in-place field migrations over document moves.**
Adding a field (`office: "BER"`) to existing docs is safe, idempotent, reversible. *Moving/
re-keying* docs (e.g. into subcollections) is the risky kind. For multi-office, tagging the
~30 `floors` docs is enough — don't relocate inspections/history.

---

## Frontend / rendering (still true)

**L05 — Auth-gated UI must live inside the authenticated container.** Chat UI was once visible
on the login screen because it sat outside it.

**L10 — Guard render functions that depend on async data:** `if (!floorConfigs?.length) return;`

**L21 — Preserve user state (zoom, scroll, selection) across re-render.** `renderFloorPlan()`
was resetting `currentZoom=1` and snapping to top-left on every save. Capture before clearing
the DOM, restore after; use an `isFreshLoad` flag.

**L26 (new) — ALL frontend code is public, by the nature of the web.** Anyone can read your JS
(via URL or DevTools) — this is true of every site, not a Firebase leak. Therefore: never put
secrets in the frontend, and never trust it. Security lives **server-side**. Reading your code
gives an attacker *recon*, not keys — it only matters in combination with a real server-side hole.

---

## Chatbot / AI (still true)

**L11 — AI context needs every dimension the agent might be asked about**, not just totals
(per-type, per-building, per-floor, room directories, issue list). Ask: "what question would
this context fail to answer?"

**L12 — Use an IIFE when firing async ops in a `var`-scoped loop**, or all iterations close over
the last loop value: `(function(id, payload){...})(itemId, data)`.

**L13 — Validate AI-emitted identifiers before writing to Firestore.** Build a `validNumbers`
set from `floorConfigs`; block invalid writes silently with `console.warn`, never throw. Stops
the model from creating ghost docs from hallucinated IDs.

**L27 (new) — The bot has no DB access; the app is its eyes.** On each conversation, the app
builds a *text summary* of in-session data and sends it (+ the question + the user's email) to
Toqan via the proxy. It's a snapshot from conversation start, only of loaded data, and it goes
to an **external AI service**. Replies can carry `[ACTION:mark|...]` tags the app executes.

**L34 (new) — Toqan connections / MCP / OAuth-connectors are *agent-outbound*; they don't host the
app's backend, and an API-key agent can't hold connections.** These features let a Toqan *agent*
call an allowlisted API (secret held by Toqan) or reach an MCP server *you've already hosted*. They
do NOT serve the app's own outbound calls (app→Toqan for chatbot context, app→Jira for tickets) —
those still need a server-side secret-holder. Also: **Toqan won't mint an API key for an agent that
has any connection/integration active** (remove them all to generate a key). The app drives the
agent *via* an API key, so that same agent can't also hold a native Jira connection — mutually
exclusive. So the chatbot touches Jira through its existing `[ACTION:…]` tag pattern (bot suggests,
app executes with its own creds), not a Toqan-native connection. (The "MCP creation" screen is
*connect-to*, not *host*: it assumes you already stood up + hosted the MCP server elsewhere.)

---

## Security (the recurring themes — see TODO P0)

**L03 — API keys never in client JS.** Keys live server-side (proxy env / Secret Manager);
the client calls the proxy. (`TOQAN_API_KEY` was briefly in `constants.js` — visible in DevTools. Never again.)

**L28 (new) — Client-side guards are NOT authorization.** `if (isAdmin)` in JS only hides UI;
a user can call Firestore directly. Real enforcement = Firestore rules / Okta / a backend.
This applies to admin actions, per-office access, and the App Check/login gates alike:
identity ≠ authorization ≠ app-integrity. Enforce server-side; let the UI merely reflect.

**L29 (new) — Stored XSS via `innerHTML` + Firestore data.** Several render paths concatenate
user-writable Firestore values into `innerHTML`/inline `onclick` without escaping. Fix = escape
at output (`esc()`), or build with `textContent`/`createElement`. For inline handlers, escaping
isn't enough — use `data-*` attributes + a delegated listener. (See TODO P0.)

**L30 (new) — The org domain gate is the GCP `org_internal` consent screen, not code.** Sign-in
is restricted to the org because the OAuth consent screen is set to "Internal" — external Google
accounts get `403 org_internal`. The comment in `auth.js` claiming domain restriction is an
unimplemented TODO is **wrong/stale** — don't "add" a client-side domain check thinking it's
missing. Caveat: this is the *only* gate today; the Firestore rules themselves are still `if isAuth()`.

**L31 (new) — App Check: monitoring ≠ enforcement.** Registering a provider only *measures*
verified vs unverified traffic; nothing is blocked until you **Enforce**. Never enforce while
traffic is 100% unverified (the SDK isn't wired in yet) — it denies all requests, including the
real app. Order: register → add SDK to frontend → deploy → watch verified % rise → then enforce.

**L36 (new) — Proxy auth = verify the *Firebase ID token*, not Okta; gate on `email`, not `hd`.**
The app uses Firebase Auth (Google sign-in), so the browser holds a **Firebase ID token** (OIDC JWT,
`iss=securetoken.google.com/workstation-revamp`, `aud=workstation-revamp`) — **not** an Okta token.
Generic "validate Okta tokens" advice doesn't apply until the Okta-SSO migration (P1) lands. The
`hd` (hosted-domain) claim is a *raw Google OAuth* claim and is **NOT present in a Firebase ID token**
(verified by decoding a live one, 2026-07-02 — it carries `name/picture/iss/aud/email/email_verified/
firebase{…}` but no `hd`). Robust server-side gate: `email_verified === true &&
email.endsWith('@justeattakeaway.com')` (optionally `firebase.sign_in_provider === 'google.com'`).
Verify with `firebase-admin` `verifyIdToken()` (Node) or `jose` vs the securetoken JWKS (Deno). The
frontend must attach `Authorization: Bearer ${await user.getIdToken()}` — `chat.js`/`jira.js` send
no auth header today. (Warning: browser find-highlighting "hd" inside the base64 JWT is meaningless —
decode the payload to read real claims.)

---

## Infrastructure / platform (CORRECTED — older notes were wrong)

**L02 — ❌ SUPERSEDED: "Firebase Functions are permanently blocked."**
That was true on the **Spark** plan (no outbound calls to non-Google APIs). The project is now
on **Blaze**, so Functions **can** call external APIs (the *outbound* block is gone). The plan
was to *move* the proxies onto Firebase Functions — **but see L33**: the org still blocks
*public inbound* to Functions-v2/Cloud Run via `constraints/run.allowedIngress` (now confirmed,
not hypothetical). So Functions can *call* Toqan/Jira, but the browser can't call the Function.

**L33 (new) — Blaze unblocked *outbound*; the org still blocks *public inbound* to Functions-v2.**
A real `firebase deploy --only functions` on **2026-06-06** failed with `HTTP 400 … Constraint
constraints/run.allowedIngress violated … ingress … set to the default value all`. Firebase CLI
v7 deploys **2nd-gen** functions = **Cloud Run services**, and the `just-eat.com` org forbids
`ingress=all` (public internet). Billing was fine (`billingEnabled:true`) and permissions were
fine — it's purely the **org policy**, and the **billing migration will NOT change it** (the
project already lives in the org; billing account ≠ org policy). Allowed ingress is `internal`
(VPC-only) or `internal-and-cloud-load-balancing` (needs an external LB) — neither is a public
URL a browser can hit. Real paths: company **Cloudflare Workers**, an **LB-fronted** function,
or a **company-owned Deno** account. (1st-gen Functions use a *different* constraint and *might*
deploy public — don't: deprecated + against the org's clear intent.) Evidence was in
`functions/firebase-debug.log`, since deleted (it also held the Toqan key in plaintext).

**L04 — ⚠️ REFINED: CORS.** CORS is a **browser** rule and applies only to browser→server calls.
**Server-to-server has no CORS** — a Cloud Function calling Toqan/Jira is never CORS-blocked. The
historical "Firebase can't call the API" was really (a) Spark blocking outbound calls, plus (b) a
browser→function CORS config issue (solvable; `functions/index.js` already sets the headers).
Don't conclude "Firebase can't do this."

**L06 — ⚠️ STILL OPEN: Firestore rules expiry.** Default test rules expire **2026-06-27**. The
repo rules are proper auth rules, but **verify the deployed rules** have no expiry clause — this
is days away (see TODO P0, top item).

**L07 — Duplicate `admins` vs `Admins` collections.** Names are case-sensitive. Keep lowercase
`admins` (rules reference it); delete capital `Admins` after confirming it's empty.

**L16 — Legacy `functions/index.js` left in repo.** It's an unused Firebase Functions Toqan proxy.
Either adopt it (the Functions migration) or delete it; don't leave dead key-reading code.

**L23 — Document any proxy's request/response contract before ending a session.** The Jira proxy's
POST body schema was once undocumented and blocked a whole session. Minimum: method, path, request
body, success shape, error shape.

**L32 (new) — A company app on personal infra is debt, not a feature.** Personal Deno proxies,
personal credit card on Blaze, personal GitHub repo. Each is a bus-factor + governance risk. As
the app grows (multi-country interest), move these to company ownership — that's leverage to get
it *adopted*, not a reason to quietly carry more risk.

**L35 (new) — Sonic Portal Scaffolder is the sanctioned home for a small internal service; a public
SPA reaches it through Zscaler.** Confirmed with the Sonic team (2026-07-02): scaffold a **Type=API**
service on Sonic Runtime (it wires PMD/CPS/repo/helm boilerplate + Artifactory), secrets go in
**Vault** (sidecar injector reads at startup), and it gets internal DNS `*.{env}.jet-internal.com`
via an Istio VirtualService + internal ingress gateway. The **public** Firebase SPA can `fetch()`
this **internal** service because the user's browser is on **Zscaler/VPN** and resolves internal DNS.
Key insight: **Zscaler ZPA tunnels at the device layer, so it's `fetch`-transparent** (no login
redirect) — unlike SSO gateways (IAP / Cloudflare Access), which redirect and break a cross-origin
`fetch`. **Chosen design = Option C** (internal-only, no public exposure). Fallback = Option A (ACM
ingress + Cloudflare + auth) *only if* off-Zscaler devices ever need it — and because auth is built
in, C→A is a config flip, not a rewrite. ⚠️ Still-open unknown: Sonic Runtime **egress** — the proxy
must call out to `api.toqan.ai`, `*.atlassian.net`, and `googleapis.com`; confirm those aren't
egress-blocked (mirror of the ingress story). (Sonic **Launchpad** is prototype/ephemeral/internal-
only — right for demos, wrong for a production tool whose data lives in Firestore.)

**L37 (new) — The app is NOT blocked on the proxy migration; don't let infra ceremony stall features.**
Firebase Functions as a *browser-called* proxy is **100% dead in this org** — public ingress blocked by
`constraints/run.allowedIngress` (L33), and internal ingress isn't on a network the browser can reach. The
**Deno proxy works precisely because it's external** to the GCP org, so the policy can't touch it — which is
why the live app keeps functioning. Moving to the sanctioned Sonic internal service (L35) is *governance/
hardening*, NOT a feature prerequisite, and it's gated behind heavy async onboarding (Backstage user sync via
**#help-cde** + PMD team file via **team lead** + Okta `sonicdev-*` groups) that can take days–weeks if you're
first-on-team. So: fire off the onboarding, keep shipping app features on Deno, and do the ~1-afternoon
migration whenever access lands. The proxy service is already drafted in `proxy/`. Interim risk-cut that needs
none of the onboarding: harden the Deno proxy (token-check + rate-limit + rotate keys).

**L38 (new) — Multi-office build: key facts from reading the app (2026-07-02).** `loadFloorData()` loads
ALL `floors` into `floorConfigs[]` (pushes `doc.data()`); the building dropdown is derived from it. Each
floor doc has an **`id` FIELD** (floor-selector uses `floor.id` as the option value), plus `building`,
`floor`, `desks[]`, `image_path`, `width`, `height`. Marker writes go via
`db.collection('floors').doc(currentFloor.id).update(...)`. Floor PNGs follow
`public/floors/<building>-<floor>.png`. ⚠️ **Superadmin is NOT a global** — `auth.js` sets only `isAdmin`
(true for admin AND superadmin); to gate a superadmin-only action, expose the actual role. New floors:
`const ref = db.collection('floors').doc(); ref.set({ id: ref.id, ... })`. Full increment plan in TODO P1.

---

## Dropped (previous-agent environment, not applicable here)

Old lessons L14, L15, L18, L19, L20 were about a Toqan-platform agent's tools (`code_executor`,
`url_resolver`, `question_answering`, "Jira tools live in SecureDevBot2", "zip .js files before
delivering"). A Claude Code agent edits the repo directly and has none of those constraints, so
they're intentionally not carried forward. If you're that other agent, see the originals in the
old `LESSONS.md` handoff.
