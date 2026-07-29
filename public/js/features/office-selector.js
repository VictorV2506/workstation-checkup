// public/js/features/office-selector.js
//
// Office selection (increment 2 — multi-office).
//
//   - Loads the `offices` collection into officesList.
//   - On login: reads users/{email}.defaultOffice.
//       * valid default  → apply it, skip the picker (returning user).
//       * none / stale    → show the picker (first-timer). Picking SAVES the default.
//   - Scopes the app: floorConfigs = allFloorConfigs for the chosen office. Everything
//     downstream (dropdown, stats, dashboard, chat, jira) reads floorConfigs, so it all
//     scopes automatically. Untagged floors fall back to BER.
//   - Header "Switch office": re-opens the picker WITHOUT changing the saved default
//     (session-only — the first pick stays the home office).
//
// Depends on: state.js (officesList, allFloorConfigs, floorConfigs, currentOffice, currentUser)
// Load order: after data-loader.js (loadFloorData calls initOfficeSelection).
// Security: office displayName is rendered via textContent / createElement (never innerHTML).

var OFFICE_FALLBACK = "BER"; // floors with no `office` field are treated as BER

// Does choosing in the picker also save it as the user's default?
// true = first-time/initial picker; false = header "Switch office".
var _officePickerSavesDefault = true;

// ── Load offices ──────────────────────────────────────────────
async function loadOffices() {
  try {
    const snap = await db.collection("offices").orderBy("order").get();
    officesList = [];
    snap.forEach(function (doc) {
      officesList.push(doc.data());
    });
    console.log(
      "✅ Loaded offices:",
      officesList.map(function (o) {
        return o.code;
      }),
    );
  } catch (error) {
    console.error("Error loading offices:", error);
    officesList = [];
  }
}

// ── User default office (users/{email}.defaultOffice) ─────────
async function getUserDefaultOffice(email) {
  if (!email) return null;
  try {
    const doc = await db.collection("users").doc(email).get();
    return doc.exists && doc.data().defaultOffice
      ? doc.data().defaultOffice
      : null;
  } catch (error) {
    console.warn("Could not read default office:", error);
    return null;
  }
}

async function saveUserDefaultOffice(email, code) {
  if (!email || !code) return;
  try {
    await db
      .collection("users")
      .doc(email)
      .set({ defaultOffice: code }, { merge: true });
    console.log("Saved default office:", code);
  } catch (error) {
    console.warn("Could not save default office:", error);
  }
}

// ── Entry point (called by loadFloorData once allFloorConfigs is loaded) ──
async function initOfficeSelection() {
  await loadOffices();

  if (!officesList.length) {
    console.warn("No offices found; defaulting to", OFFICE_FALLBACK);
    applyOffice(OFFICE_FALLBACK);
    return;
  }

  const email = currentUser ? currentUser.email : null;
  const def = await getUserDefaultOffice(email);

  if (
    def &&
    officesList.some(function (o) {
      return o.code === def;
    })
  ) {
    applyOffice(def); // returning user → straight in
  } else {
    showOfficePicker(true); // first-timer / stale default → pick saves the default
  }
}

// ── Apply an office (scope the app) ───────────────────────────
function applyOffice(code, isInitial) {
  if (isInitial === undefined) isInitial = true;

  currentOffice = officesList.find(function (o) {
    return o.code === code;
  }) || { code: code, displayName: code };

  floorConfigs = allFloorConfigs.filter(function (f) {
    return f.office === code || (!f.office && code === OFFICE_FALLBACK);
  });
  console.log(
    "🏢 Office:",
    currentOffice.code,
    "→ floors:",
    floorConfigs.length,
  );

  hideOfficePicker();
  renderBuildingOptions();
  updateOfficeIndicator();

  // Reset the floor view to the empty state.
  var buildingSelect = document.getElementById("buildingSelect");
  if (buildingSelect) buildingSelect.value = "";
  var floorSelect = document.getElementById("floorSelect");
  if (floorSelect)
    floorSelect.innerHTML = '<option value="">Select&hellip;</option>';
  var floorPlan = document.getElementById("floorPlan");
  if (floorPlan) floorPlan.innerHTML = "";
  var floorLoading = document.getElementById("floorLoading");
  if (floorLoading) {
    floorLoading.style.display = "flex";
    floorLoading.textContent = floorConfigs.length
      ? "Select a building and floor to begin"
      : "No floors in " +
        (currentOffice.displayName || currentOffice.code) +
        " yet" +
        (isAdmin ? " — add one in Admin ▸ Floor Management." : ".");
  }

  // Deep-link (jira.js) needs the building dropdown — only on initial load, not on switch.
  if (isInitial && typeof _handleDeepLink === "function") _handleDeepLink();
}

// ── Building dropdown (reads the SCOPED floorConfigs) ─────────
function renderBuildingOptions() {
  const buildingSelect = document.getElementById("buildingSelect");
  if (!buildingSelect) return;
  const buildings = [
    ...new Set(
      floorConfigs.map(function (f) {
        return f.building;
      }),
    ),
  ].sort();
  buildingSelect.innerHTML = '<option value="">Select Building</option>';
  buildings.forEach(function (building) {
    const option = document.createElement("option");
    option.value = building;
    option.textContent =
      building.length <= 2 ? "Building " + building : building;
    buildingSelect.appendChild(option);
  });
}

// ── Header office indicator + switch control ──────────────────
function updateOfficeIndicator() {
  var indicator = document.getElementById("officeIndicator");
  if (indicator) {
    indicator.textContent = currentOffice
      ? "🏢 " + (currentOffice.displayName || currentOffice.code)
      : "";
    indicator.style.display = currentOffice ? "inline-flex" : "none";
  }
  var switchBtn = document.getElementById("officeSwitchBtn");
  if (switchBtn) {
    // Switch appears only with 2+ offices. Creating/managing offices lives in
    // the Admin Panel → Office Management tab (superadmin), not in the header.
    switchBtn.style.display =
      currentOffice && officesList.length > 1 ? "inline-flex" : "none";
    switchBtn.textContent = "⇄ Switch";
  }
}

// ── Office picker overlay (select / switch only) ──────────────
function showOfficePicker(savesDefault) {
  _officePickerSavesDefault = savesDefault !== false;
  renderOfficePicker();

  // Close button only when there's already an office to fall back to
  // (i.e. NOT the mandatory first-time pick).
  var closeBtn = document.getElementById("officePickerClose");
  if (closeBtn) closeBtn.style.display = currentOffice ? "block" : "none";

  var overlay = document.getElementById("officePickerOverlay");
  if (overlay) overlay.style.display = "flex";
}

function hideOfficePicker() {
  var overlay = document.getElementById("officePickerOverlay");
  if (overlay) overlay.style.display = "none";
}

function renderOfficePicker() {
  var list = document.getElementById("officePickerList");
  if (!list) return;
  list.innerHTML = "";
  officesList.forEach(function (office) {
    var btn = document.createElement("button");
    btn.className = "office-picker-btn";
    btn.type = "button";
    btn.textContent = office.displayName || office.code; // textContent → XSS-safe
    btn.onclick = function () {
      selectOffice(office.code);
    };
    list.appendChild(btn);
  });
}

// Choosing from the picker.
function selectOffice(code) {
  if (_officePickerSavesDefault && currentUser) {
    saveUserDefaultOffice(currentUser.email, code); // first-time pick → becomes home
  }
  applyOffice(code, _officePickerSavesDefault); // initial iff it was the saving picker
}

// Header "Switch office" → re-open picker WITHOUT changing the saved default.
function switchOffice() {
  if (officesList.length <= 1) return;
  showOfficePicker(false);
}

// ── Office Management (Admin Panel → Office Management tab; superadmin only) ──
// Renders the list of existing offices. The real write gate is the offices rule.
function renderOfficesAdmin() {
  var list = document.getElementById("officeAdminList");
  if (!list) return;
  list.innerHTML = "";
  if (!officesList.length) {
    var empty = document.createElement("li");
    empty.className = "office-admin-empty";
    empty.textContent = "No offices yet.";
    list.appendChild(empty);
    return;
  }
  officesList
    .slice()
    .sort(function (a, b) {
      return (
        (a.order || 0) - (b.order || 0) ||
        String(a.code).localeCompare(String(b.code))
      );
    })
    .forEach(function (office) {
      var li = document.createElement("li");
      li.className = "office-admin-item";
      // textContent throughout → XSS-safe even if a displayName is hostile.
      var name = document.createElement("span");
      name.className = "office-admin-name";
      name.textContent = "🏢 " + (office.displayName || office.code);
      var codeTag = document.createElement("span");
      codeTag.className = "office-admin-code";
      codeTag.textContent = office.code;
      li.appendChild(name);
      li.appendChild(codeTag);
      list.appendChild(li);
    });
}

async function createOffice() {
  var codeEl = document.getElementById("officeAddCode");
  var nameEl = document.getElementById("officeAddName");
  var statusEl = document.getElementById("officeAddStatus");
  var setStatus = function (msg, ok) {
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.style.color = ok ? "#059669" : "#b91c1c";
    }
  };

  var code = (codeEl ? codeEl.value : "").trim().toUpperCase();
  var name = (nameEl ? nameEl.value : "").trim();

  // Client validation = UX only; the offices write rule is the real gate.
  if (!/^[A-Z0-9]{2,5}$/.test(code)) {
    setStatus("Code must be 2–5 letters/digits (e.g. MIL).");
    return;
  }
  if (!name) {
    setStatus("Display name is required.");
    return;
  }
  if (
    officesList.some(function (o) {
      return o.code === code;
    })
  ) {
    setStatus('Office "' + code + '" already exists.');
    return;
  }

  var order =
    officesList.reduce(function (max, o) {
      return Math.max(max, o.order || 0);
    }, 0) + 1;

  setStatus("Creating…");
  try {
    // Doc ID = code, so offices/{code} is unique and trivial to look up.
    await db.collection("offices").doc(code).set({
      code: code,
      displayName: name,
      order: order,
    });
    await loadOffices(); // refresh officesList from Firestore
    renderOfficesAdmin(); // new office shows in the admin list
    updateOfficeIndicator(); // Switch button reflects the new office count
    if (codeEl) codeEl.value = "";
    if (nameEl) nameEl.value = "";
    setStatus("✅ Added " + name + " (" + code + ")", true);
    console.log("✅ Created office:", code, name);
  } catch (error) {
    console.error("Error creating office:", error);
    setStatus("Could not create office (permission denied?). See console.");
  }
}
// ── Reload floors after an admin change (e.g. Add Floor) ──────
// Re-reads all floors and re-scopes to the current office (no re-pick, no deep-link),
// so a newly created floor appears in the dropdowns immediately.
async function reloadFloors() {
  try {
    const snapshot = await db.collection("floors").orderBy("floor").get();
    allFloorConfigs = [];
    snapshot.forEach(function (doc) {
      allFloorConfigs.push(doc.data());
    });
    if (currentOffice) applyOffice(currentOffice.code, false);
  } catch (error) {
    console.error("reloadFloors error:", error);
  }
}
