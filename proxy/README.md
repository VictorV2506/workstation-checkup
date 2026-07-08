# Workstation Checkup — internal API proxy

Small stateless service that holds the **Toqan** and **Jira** credentials server-side and forwards
requests from the app, so no secret ever touches the public frontend.

- **Hosting:** Sonic Portal Scaffolder, service type **API**, on Sonic Runtime.
- **Reachability:** internal-only (**Option C**) — `*.{env}.jet-internal.com`, reached by the public
  Firebase SPA because users are on **Zscaler/VPN** (browser resolves internal DNS). No public ingress.
- **Auth:** verifies the caller's **Firebase ID token** on every request; gate = `email_verified === true
  && email endsWith @justeattakeaway.com`. (NOT Okta; `hd` is not present in a Firebase token — see LESSONS L36.)
- **Staging note:** this `proxy/` dir lives in the app repo for now as source-of-truth. When you run the
  Scaffolder, drop these files into the generated repo and reconcile the Dockerfile/helmfile with its boilerplate.

## Request/response contract (satisfies LESSONS L23)

| Method | Path | Body | Forwards to |
|--------|------|------|-------------|
| GET  | `/healthz` | — | (local) `{ ok: true }`, no auth |
| POST | `/toqan/create` | `{ user_message }` | `POST api.toqan.ai/api/create_conversation` |
| POST | `/toqan/continue` | `{ conversation_id, user_message }` | `POST api.toqan.ai/api/continue_conversation` |
| POST | `/jira` | `{ action: "create_issue", issueData: { fields: {...} } }` | `POST {JIRA_BASE_URL}/rest/api/3/issue` |

All authed routes require `Authorization: Bearer <firebase-id-token>`. Responses pass the upstream
status + JSON body through verbatim. Errors: `401` (no/invalid token), `403` (wrong domain), `429`
(rate limit), `400` (bad Jira action/body), `502` (upstream unreachable).

## ⚠️ Two things to confirm before deploy

1. **Jira auth scheme.** This implements the Jira **Cloud** standard: `Authorization: Basic base64(email:token)`
   against `/rest/api/3/issue`. Confirm your current Deno proxy does the same, and provide the Jira
   **service-account email** (stored as `JIRA_EMAIL`). If it instead uses a Bearer PAT, adjust `jiraAuth`.
2. **Framework.** Built with Fastify (the Sonic bot's recommendation for a small proxy). Swap to Express if preferred.

## Vault (self-service)

Write the secrets (Vault UI/CLI, Okta SSO), path `secret/oneeks/<namespace>/...`:

```
vault kv put secret/oneeks/<namespace>/toqan api-key="sk-..."
vault kv put secret/oneeks/<namespace>/jira  email="svc-...@justeattakeaway.com" token="<api-token>"
```

Inject via helmfile state values (maps Vault → env vars the app reads):

```yaml
vault:
  enabled: true
  environmentSecrets:
    secrets:
      - { secretPath: "oneeks/<namespace>/toqan", secretKey: "api-key", envVarName: "TOQAN_API_KEY" }
      - { secretPath: "oneeks/<namespace>/jira",  secretKey: "email",   envVarName: "JIRA_EMAIL" }
      - { secretPath: "oneeks/<namespace>/jira",  secretKey: "token",   envVarName: "JIRA_TOKEN" }
```

(The Google public-key fetch for token verification needs **no** secret — it's a runtime HTTPS call.)

## Deploy sequence

1. Scaffold the service (Type: API); drop these files in; reconcile Dockerfile/helmfile.
2. Write the Vault secrets (above).
3. Deploy to **QA** → `https://<service>.<namespace>.qa.jet-internal.com`.
4. Smoke test with a real token (on VPN):
   ```
   TOKEN=$(…getIdToken from the app console…)
   curl -s https://<service>.<ns>.qa.jet-internal.com/healthz
   curl -s -X POST https://<service>.<ns>.qa.jet-internal.com/toqan/create \
        -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
        -d '{"user_message":"ping"}'
   ```
5. Only then do the frontend cutover.

## Frontend cutover (do LAST — deferred; would break the live app until the service is up)

Add a base-URL constant (e.g. in `config/constants.js`), defaulting to the current Deno URL until cutover:

```js
var PROXY_BASE = 'https://<service>.<namespace>.production.jet-internal.com';
```

Then:
- **`chat.js`** `_callToqanAPI`: point at `PROXY_BASE + '/toqan/create'` / `'/toqan/continue'`, and add
  `headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (await firebase.auth().currentUser.getIdToken()) }`.
- **`jira.js`**: set `_JIRA_PROXY = PROXY_BASE + '/jira'`; wrap the 3 `fetch(_JIRA_PROXY, …)` calls in a
  helper that attaches the same `Authorization` header (all 3 send `{ action, issueData }` today).
- Then retire the Deno proxies and **rotate** the Toqan + Jira keys.
