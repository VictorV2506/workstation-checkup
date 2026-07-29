---
name: sonic-deploy
description: Build, deploy, and debug internal services on JET Sonic (Launchpad / Runtime) — the platform scaffolding (CI + Vault + Istio egress), calling external APIs like Jira and Toqan through the mesh, the env-var and redeploy gotchas, and a fast debugging playbook. Use whenever working on a Sonic-hosted service, adding an integration to one, or migrating the Deno Toqan/Jira proxies onto Sonic.
---

# Sonic deploy & debug playbook

Hard-won shipping the **desk-sos** portal (self-service desk-issue → Jira) and the aborted hand-rolled `report-portal/`. Read this before touching any Sonic service — it turns a multi-hour flail into a checklist.

## The one principle

**Sonic's value is the platform integration, NOT the app code.** A from-scratch Launchpad scaffold wires JET's CI → Artifactory + Vault pipeline, the Dockerfile, and — critically — the **Istio mesh + egress**, which is platform-managed and often not even in the app repo.

→ **Always scaffold from scratch in Launchpad, then drop your logic in.** Never hand-write a service (e.g. a `server.js` + `Dockerfile`) and try to bolt the platform on afterward — that is a guaranteed 502 / egress rabbit hole.

Launchpad = **prototype / ephemeral**; the **Scaffolder** = production (gated on Backstage onboarding). Prove the pattern on Launchpad; don't hang a live app off it — port to the Scaffolder for prod.

## Setup checklist (before writing logic)

- [ ] **Declare every outbound host** the service calls, so egress is allowed. e.g. `justeattakeaway.atlassian.net` (Jira), `api.toqan.ai` (Toqan), `www.googleapis.com` (Firebase ID-token verify). If egress is a manual Istio ServiceEntry, add **all** of them up front, not after the first 502.
- [ ] **Use `https://` and let the app do its own TLS.** Do NOT use `tlsOriginationEnabled: true` + `http://` unless you have a specific reason — that combo sends plain HTTP, and Atlassian's CloudFront returns a **307 redirect** that non-redirect-following clients (httpx, fetch) surface as an error. Plain HTTPS passthrough is simpler and matches everything else.
- [ ] **CORS.** Same-origin (page and API both on Sonic) needs none. A **public** origin (e.g. `workstation-revamp.web.app`) calling an **internal** Sonic service is cross-origin → the service MUST send CORS headers (allow the origin, `POST`/`OPTIONS`, `Authorization`/`Content-Type`, handle preflight).
- [ ] **Zscaler reality.** Internal `*.jet-internal.com` services are only reachable by browsers on Zscaler/ZPA. Fine for on-VPN staff; breaks off-VPN and most phones. Public Deno/Firebase proxies work anywhere — know the tradeoff before cutting a live app over.
- [ ] **Auth.** Verify the caller's **Firebase ID token** (`Authorization: Bearer`), gate on `email_verified && email.endsWith('@justeattakeaway.com')` — NOT the `hd` claim (absent in Firebase tokens). No-login portals lean on the network (Zscaler) instead.

## Env-var gotchas (these bite every time)

- **Unset vars arrive as `""`, not `undefined`.** Destructuring defaults (`X = "default"`) do NOT apply to `""`. Coalesce empty→default explicitly: `v === undefined || v === "" ? fallback : v`. (An empty `MAX_DESC` → `Number("")` = 0 → everything "too long"; an empty office code → no match.)
- **Save ≠ deploy.** Editing an env value in the UI does NOT update the running container. Trigger a **real redeploy/restart** — push to `main` (note: `refresh-latest` only fires on `main`, not `iter/**`, so iter pushes build an image the running service never picks up). **Sleep/wake does not re-inject env.**

## Debugging playbook (front-load these — don't guess)

1. **Echo the live config in the error output.** Add a diagnostic like `[proj=… parent=… as=<email-localpart> tok=<len>/<last4>]` to error responses. It instantly answers "is the running service actually using the config I think it is?" — the #1 source of wasted rounds. The **absence** of a newly-added field also proves a deploy didn't land.
2. **`curl` the target directly from a Zscaler box**, bypassing Sonic, to split **platform/transport** problems from **creds/payload** problems in a single shot.
3. **Know the error signatures:**
   - `502` from an internal host → egress/mesh not wired (or the app isn't a real service yet).
   - `307` CloudFront redirect → you're calling `http://`; switch to `https://`.
   - `x-seraph-loginreason: AUTHENTICATED_FAILED` → **creds rejected**. The `{"errors":{"project":"…doesn't exist or no permission"}}` body is a red herring — unauthenticated requests are treated as anonymous, which can't see the project.

## Jira specifics (Cloud REST v3)

- **`project.key` = bare project key** (`EITOPSGLOB`). **`parent.key` = an issue/epic key** (`EITOPSGLOB-1234`). Do not swap them — a common env-var mix-up.
- **Issue type `5` is a Sub-task → it REQUIRES a parent.** No parent = create fails with a `parent` error; a wrong project + no auth = the `project` error above.
- **Basic auth = `email:CLASSIC-api-token`.** *Scoped* tokens fail against `{site}.atlassian.net` (they require `api.atlassian.com/ex/jira/{cloudid}`). Generate a **classic** token at `id.atlassian.com/manage-profile/security/api-tokens`.
- A proxy holds only **credentials**; the **project/parent/issue-type** come from the caller or per-office config (`JIRA_PARENT_KEY_<CODE>`, optional `JIRA_PROJECT_KEY_<CODE>`, `OFFICES=CODE:Name,…` — code must match the env suffix exactly).

## Prompting Launchpad well

Structured spec, not prose: **Goal → Config (exact env names) → UI → Backend logic → Edge cases.** Name every identifier. Spell out **fallbacks, validation, and error text** (agents skip these — it's where "half-works" comes from). Give concrete example values. **Keep the commit message plain** — no quotes / apostrophes / brackets, or `git commit -m` chokes and the push fails (`pathspec '…' did not match any file`). If it fails, tell it: "use a one-word commit message."

## Worked example — desk-sos vs report-portal

- **`report-portal/`** = app code only (no CI, no egress) → never a real service → 502 saga → hand-added a `tlsOriginationEnabled` ServiceEntry → that forced `http://` → **307 cascade**. Entirely self-inflicted.
- **`desk-sos`** = Launchpad-scaffolded → CI + platform egress for free → went straight to the config battles (auth token, project/parent) which are identical in either stack.
- **Verdict:** the Jira client code was ~identical between them. The platform scaffolding was the whole difference. Scaffold first; drop logic in.
