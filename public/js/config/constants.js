// public/js/config/constants.js
//
// Application-wide constants for Workstation Checkup.
// No dependencies. Loaded before any feature module that
// references these values (desk-modal.js, zoom.js).

// ── Equipment options (desk modal dropdowns) ──────────────────
const monitorModels = [
    "Dell P2422HE (Black)", "Dell P2422H (Black)", "Dell U2422HE (Silver)",
    "Dell U2422H (Silver)", "Dell U2717D", "T24i-10 (round)", "T24i-10 (rectangle)",
    "T24i-20/2L (Round)", "T24i-20/2L (rectangle)", "T24d-10 (bigger aspect ratio Round)",
    "T24d-10 (bigger aspect ratio Rectangle)", "Lenovo AIO (camera)",
    "Lenovo AIO (NO camera)", "No Monitor", "Not in the list"
];

const dockingStations = [
    "Dock integrated in Dell Monitor", "Thinkpad Thunderbolt 3 G2",
    "Thinkpad Thunderbolt 3 G1", "Dell Docking Station (old)",
    "Lenovo USB-C Dock (small)", "No Docking Station"
];

// ── Zoom limits (zoom.js) ─────────────────────────────────────
const MIN_ZOOM  = 0.1;
const MAX_ZOOM  = 3;
const ZOOM_STEP = 0.2;
