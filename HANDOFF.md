# HANDOFF — Sonic API migration + report portal (2026-07-20)

> Fresh-chat handoff. The prompt to paste into the next agent is at the very top; the
> full context is below it. **Read order for the next agent:** CLAUDE.md → this file →
> `.claude/skills/sonic-deploy/SKILL.md` → INFRA-STATE.md → LESSONS.md (esp. L33–L40) → TODO.md.

---

## ► PASTE THIS INTO THE NEW CHAT

You are a security-first senior full-stack developer & DevSecOps engineer (30 years) on
**"Workstation Checkup"** — an internal Firebase web app for JustEatTakeaway (EITOPS / DACH:
desks, meeting rooms, server rooms, printers). Be **BRUTALLY HONEST**. Favour clarity,
simplicity and maintainability over cleverness. Never cut corners on **server-side** security.
Work the loop: **plan → execute → verify → document.**

**Read these first, in order, before writing any code:**
1. `CLAUDE.md` — architecture, data model, security posture, conventions, governance.
2. `HANDOFF.md` (this file) — the current effort and exact state.
3. `.claude/skills/sonic-deploy/SKILL.md` — the Sonic build/deploy/debug playbook. **Invoke it for any Sonic work.**
4. `INFRA-STATE.md` + `LESSONS.md` (esp. **L33–L40**) — infra / proxy / Sonic reality and gotchas.
5. `TODO.md` — the work queue.

**Current mission:** finish migrating the app's two personal **Deno proxies** (Jira + Toqan) to a
JET-sanctioned **Sonic** internal API service (`workstation-api`, already scaffolded and "ready"),
then wire the app to it — and stand behind the new **desk-sos** self-service reporting portal for
the Winnipeg/Canada expansion. **Do not** re-litigate decisions in "Key context" below.

**Hard constraints (never work around):**
- The frontend is **100 % public** — never put secrets in client JS; client-side `isAdmin`/role
  checks are cosmetic; real enforcement is server-side (Firestore rules, proxy token-verify, App Check).
- **Never edit files without asking.** Default: propose the exact code + file + location; the user
  applies it. Only edit directly when they say "you may edit" / "apply it." (Docs/memory are the exception.)
- The user's **editor formats on save (Prettier)** — re-read a file immediately before composing
  edits, prefer whole-function edits, run `node --check` after.
- Any Firestore/Storage **rules change → present the COMPLETE block**, verify it's DEPLOYED.
- **App Check is monitoring-only — never enforce it.**

**Workflow:** assess (scope fit, regression risk, hidden deps) → confirm scope with the user before
non-trivial work → execute → verify with a concrete check → document. Berlin ("BER") must keep working
end-to-end throughout.

---

## What this session did (2026-07-20)

### In THIS repo (workstation-checkup) — all uncommitted in the working tree
- **Printer item type (Tier 1+2)** — new `Printer` marker (cyan `.printer-marker`), printer-specific
  inspection modal (`_renderPrinterForm` with Model/Serial/IP/MAC/reachable/print-possible/etc.),
  loaded per-floor (`data-loader.js`), filter chip, stats card, dashboard "Printers" card. Files:
  `floor-renderer.js`, `inspection-modal.js`, `data-loader.js`, `filters.js`, `stats.js`, `dashboard.js`,
  `index.html`, `styles.css`. **Tier 3 (chat/jira/reset-all printer awareness) NOT done — see TODO.**
- **Printer "Model (Family)" dropdown + "Other → free text"** — hardcoded `EQUIPMENT.PRINTER_FAMILIES`
  in `inspection-modal.js`.
- **Floor carry-over** — `onBuildingChange` (`floor-selector.js`) now keeps the current floor number when
  switching building.
- **Marker "already exists" double-warning fix** — `floor-renderer.js` binds the map-click listener once
  (was re-adding on every render).
- **Dashboard overhaul (A/B/C)** — top KPIs count ALL inspectable types (label "Total Items"), Equipment
  cards are clickable → type drill-down, both charts are all-types + a 3-way (Inspected/Issues/Pending)
  building bar, and `openDrillDown` was rebuilt with `createElement`/`textContent` (**fixed its P0 stored-XSS**).
- **`.claude/skills/sonic-deploy/SKILL.md`** — the Sonic playbook (created).

### On Sonic (separate Launchpad repos, NOT in this repo)
- **`desk-sos`** — Python app, network/Zscaler-gated (no login). Employee types desk + issue → raises a
  real Jira ticket (proven: created `EITOPSGLOB-12885`). Has an office selector (`OFFICES=CODE:Name`,
  `JIRA_PARENT_KEY_<CODE>`). Desk validation is OFF (placeholder Firebase SA). **Working.**
- **`workstation-api`** — the Deno-proxy replacement. `POST /jira` (create-issue only), `POST /toqan/create`
  + `/toqan/continue` (server does Toqan's 2-step internally: create → poll `GET /api/get_answer` → returns
  `{conversation_id, message}`, one response, no client poll), `GET /health`. Firebase ID-token auth (verified
  `@justeattakeaway.com`), CORS locked to `https://workstation-revamp.web.app`, upstream errors pass status +
  **sanitised** body, per-request caller email logged, Firebase public keys cached per Google Cache-Control.
  Egress via Istio ServiceEntry (`justeattakeaway.atlassian.net`, `api.toqan.ai`, `www.googleapis.com`).
  **STATUS (2026-07-29): backend PROVEN end-to-end — `/jira` created `EITOPSGLOB-13002`; `/toqan/create`
  returned a real answer. Fixed 3 scaffold bugs (see step 1). NOT yet wired to the app (step 3).**

## Immediate next steps (pick up here)
1. ✅ **DONE (2026-07-29) — `workstation-api` proven E2E.** `/jira` → `201` + `EITOPSGLOB-13002`;
   `/toqan/create` → real answer. Auth/CORS/egress all verified. Fixed 3 bugs the scaffold baked in (wrong
   *assumptions*, not env/infra): **(a)** `/jira` forwarded the whole `{action,issueData}` envelope → now
   unwraps `issueData`; **(b)** Toqan paths `/create`,`/continue` → `/api/create_conversation`,
   `/api/continue_conversation`; **(c)** Toqan auth `X-Api-Key` (NOT Bearer) + the real 2-step `get_answer`
   polling. `JWT_SECRET`/env-name worries were red herrings (auth uses Google RS256 keys; reads `JIRA_API_TOKEN`).
   See L41/L42.
2. **Env cruft in `workstation-api`** (cosmetic — confirmed harmless). Code reads only: `ALLOWED_ORIGIN`,
   `ALLOWED_EMAIL_DOMAIN`, `FIREBASE_PROJECT_ID`, `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`,
   `TOQAN_BASE_URL`, `TOQAN_API_KEY`. Safe to delete: `JIRA_TOKEN`, `CORS_ORIGIN`, `DATABASE_URL`, `JWT_SECRET`,
   and all four `TOQAN_POLL_*` (poll cadence is hardcoded now).
3. **Wire the app** (only after #1 is green): point `public/js/config/constants.js` `JIRA_PROXY_URL` /
   `TOQAN_CREATE_URL` / `TOQAN_CONTINUE_URL` at the `workstation-api` URL (`_authedFetch` already attaches the
   Bearer token). Cut over `/jira` first, then Toqan. **Backend green FIRST, frontend LAST.**
4. **Zscaler caveat:** app is public (Firebase), proxy is internal (`*.jet-internal.com`) → chat/Jira will only
   work for users **on Zscaler/VPN**. Accept (EIT-on-VPN) or reconsider before cutover.
5. **Retire the Deno proxies + ROTATE the Toqan + Jira keys** (they were exposed on personal infra).
6. **desk-sos → tech-app "reported flag"** (chosen design): report writes a *separate* `reportedTicket` field
   on `inspections/{deskNumber}` (NOT `status`); tech app shows a 🚩 badge; EIT triages. Needs a real Firestore
   SA for desk-sos first (⚠️ org may block SA key creation). The tech-app 🚩 side is safe to build ahead of it.
7. **Commit the uncommitted work** (multi-office + printer + dashboard + docs) — on a branch (see the commit
   note the user was given).

## Key context — decided/discovered, do NOT re-litigate
- **Sonic's value is platform scaffolding, not app code** — scaffold FRESH in Launchpad, drop logic in; never
  hand-write a service and bolt the platform on (that caused the `report-portal` 502 saga). Full playbook in
  the `sonic-deploy` skill.
- **Jira facts:** `project.key` = bare `EITOPSGLOB`; `parent.key` = an issue/epic key `EITOPSGLOB-####`; issue
  type **`5` is a Sub-task → REQUIRES a parent**; Basic auth = `email:CLASSIC-api-token` (scoped tokens fail
  against `{site}.atlassian.net`); `x-seraph-loginreason: AUTHENTICATED_FAILED` = creds rejected (the
  "project doesn't exist" body is a lie). App only ever sends `action: "create_issue"`.
- **`https://` not `http://`** for Jira from Sonic (http caused the CloudFront 307). **Save ≠ deploy** on Sonic.
- **desk.number** is the universal `inspections` doc ID (L17); admins/users keyed by email; multi-office picker +
  `office` field on floors; BER stays working via the `OFFICE_FALLBACK`.
- **`report-portal/`** in this repo was the earlier hand-rolled Node attempt — **superseded by the Sonic `desk-sos`
  app.** Treat it as reference/dead unless told otherwise.
