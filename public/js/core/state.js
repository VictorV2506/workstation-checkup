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
let currentUser = null;
let isAdmin = false;
let isSuperAdmin = false; // true ONLY for role 'superadmin'; gates office mgmt. Set in auth.js (L38). Real gate = Firestore rules.
let adminUsers = []; // Cache of users for admin panel
let isAddingMarker = false;
let pendingMarker = null;
let isEditMode = false;
let floorConfigs = [];
let allFloorConfigs = []; // master: ALL offices' floors (increment 2). floorConfigs = current office's subset.
let currentFloor = null;
let currentOffice = null; // selected office { code, displayName }; set by the picker in increment 2. null = not yet chosen.
let officesList = []; // all docs from the offices collection (increment 2), for the pick
let desksData = {};

// ── Bulk edit state ───────────────────────────────────────────
let bulkModeActive = false;
let selectedDesks = new Set();
let isDragging = false;
let bulkEditMode = false;
let dragStartX = 0;
let dragStartY = 0;
let selectionStart = null;

// ── View state ────────────────────────────────────────────────
let currentFilter = "all";
let currentZoom = 1;
