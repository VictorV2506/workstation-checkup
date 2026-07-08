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
