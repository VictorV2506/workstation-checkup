// public/js/core/state.js
//
// Application state for Workstation Checkup.
//
// All global variables that hold the runtime state of the app.
// These are mutated throughout the lifecycle by various feature
// modules (auth.js sets currentUser, data-loader.js populates
// floorConfigs and desksData, bulk-edit.js toggles bulkModeActive,
// zoom.js updates currentZoom, etc.).
//
// Load order: must load BEFORE any module that reads/writes these
// variables (auth.js, data-loader.js, all feature modules).

// ── User & data state ─────────────────────────────────────────
let currentUser   = null;
let floorConfigs  = [];
let currentFloor  = null;
let desksData     = {};

// ── Bulk edit state ───────────────────────────────────────────
let bulkModeActive = false;
let selectedDesks  = new Set();
let isDragging     = false;
let bulkEditMode   = false;
let dragStartX     = 0;
let dragStartY     = 0;
let selectionStart = null;

// ── View state ────────────────────────────────────────────────
let currentFilter  = 'all';
let currentZoom    = 1;
