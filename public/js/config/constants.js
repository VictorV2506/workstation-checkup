// public/js/config/constants.js
//
// Application-wide constants for Workstation Checkup.
// No dependencies. Loaded before any feature module that
// references these values (desk-modal.js, zoom.js).

// ── Equipment options (desk modal dropdowns) ──────────────────
//
// // Authenticated POST to a proxy — attaches the signed-in user's Firebase ID token.
// The proxy verifies this token server-side. Returns a Promise<Response>, like fetch().
async function _authedFetch(url, bodyObj) {
  var user = firebase.auth().currentUser;
  if (!user) throw new Error("Not signed in");
  var token = await user.getIdToken();
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(bodyObj),
  });
}

// ── Backend base (per-deployment) ─────────────────────────────
// The chat + Jira proxies live at DIFFERENT hosts depending on where the app is served:
//   • Firebase Hosting (public)                 → the live personal Deno proxies.
//   • Sonic internal build (*.jet-internal.com) → same-origin server.js (no CORS).
// Everything else (Firestore) is client-direct and needs none of this.
// IMPORTANT: the Firebase (non-Sonic) URLs below are byte-for-byte the originals, so the
// live app's requests are UNCHANGED. Only a Sonic-hosted build takes the same-origin branch.
// See INFRA-STATE.md ("frontend hardcodes Deno URLs") and proxy/server.js for the routes.
var _ON_SONIC = location.hostname.endsWith('.jet-internal.com');
var TOQAN_CREATE_URL   = _ON_SONIC ? '/toqan/create'   : 'https://radiant-woodpecker-65.victorv2506.deno.net/create';
var TOQAN_CONTINUE_URL = _ON_SONIC ? '/toqan/continue' : 'https://radiant-woodpecker-65.victorv2506.deno.net/continue';
var JIRA_PROXY_URL     = _ON_SONIC ? '/jira'           : 'https://full-platypus-4956.victorv2506.deno.net';

const monitorModels = [
  "Dell P2422HE (Black)",
  "Dell P2422H (Black)",
  "Dell U2422HE (Silver)",
  "Dell U2422H (Silver)",
  "Dell U2717D",
  "T24i-10 (round)",
  "T24i-10 (rectangle)",
  "T24i-20/2L (Round)",
  "T24i-20/2L (rectangle)",
  "T24d-10 (bigger aspect ratio Round)",
  "T24d-10 (bigger aspect ratio Rectangle)",
  "Lenovo AIO (camera)",
  "Lenovo AIO (NO camera)",
  "No Monitor",
  "Not in the list",
];

const dockingStations = [
  "Dock integrated in Dell Monitor",
  "Thinkpad Thunderbolt 3 G2",
  "Thinkpad Thunderbolt 3 G1",
  "Dell Docking Station (old)",
  "Lenovo USB-C Dock (small)",
  "No Docking Station",
];

// ── Zoom limits (zoom.js) ─────────────────────────────────────
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.2;
window.TOQAN_API_KEY = "using-deno-proxy";
