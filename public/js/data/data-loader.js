// public/js/data/data-loader.js
//
// Data loading module for Workstation Checkup.
//
// Fetches all data needed at startup:
//   - Floor layout from floors_data.json (static file)
//   - Desk inspection records from Firestore desks collection
//
// Depends on: firebase-config.js (db)
//             state.js           (floorConfigs, desksData)
// Calls:      stats.js           (updateStats)
//             dashboard.js       (updateDashboard)
//
// Called by: auth.js → onAuthStateChanged → loadFloorData()
// Load order: after auth.js, before feature modules.

// ── Floor layout ──────────────────────────────────────────────
// Loads ALL floors (every office) into allFloorConfigs, then hands off to the
// office flow (office-selector.js), which sets the SCOPED floorConfigs, builds
// the building dropdown, and runs the deep-link. (increment 2 — multi-office)
async function loadFloorData() {
  try {
    console.log("Loading floors from Firestore...");

    const snapshot = await db.collection("floors").orderBy("floor").get();

    if (snapshot.empty) {
      throw new Error(
        "No floors found in Firestore. Has the migration been run?",
      );
    }

    allFloorConfigs = [];
    snapshot.forEach(function (doc) {
      allFloorConfigs.push(doc.data());
    });

    console.log("✅ Loaded floors (all offices):", allFloorConfigs.length);

    // Scope to the user's office: loads offices, applies the saved default,
    // or shows the picker. This sets floorConfigs, builds the dropdown, deep-links.
    await initOfficeSelection();
  } catch (error) {
    console.error("Error loading floors:", error);
    alert("Error loading floor data: " + error.message);
  }
}

// ── Desk inspection records ───────────────────────────────────
async function loadDesksData() {
  try {
    const snapshot = await db.collection("inspections").get();
    desksData = {};
    snapshot.docs.forEach((doc) => {
      desksData[doc.id] = doc.data();
    });
    console.log("\u2705 Loaded desk data:", Object.keys(desksData).length);
    updateStats();
    updateDashboard();
  } catch (error) {
    console.error("Error loading desks:", error);
  }
}

// ── Per-floor inspection loader ───────────────────────────
// Called when a floor is selected. Reads only the inspection
// records for desks on that floor. Skips any already in memory.
async function loadFloorInspections(floor) {
  const deskNumbers = floor.desks
    .filter(
      (d) =>
        d.type === "Desk" ||
        d.type === "MeetingRoom" ||
        d.type === "ServerRoom" ||
        d.type === "Printer",
    )
    .map((d) => d.number);

  const missing = deskNumbers.filter((n) => !(n in desksData));

  if (missing.length === 0) {
    console.log("✓ Already cached:", floor.id);
    return;
  }

  const CHUNK = 30;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    const snap = await db
      .collection("inspections")
      .where("__name__", "in", chunk)
      .get();
    snap.forEach((doc) => {
      desksData[doc.id] = doc.data();
    });
  }

  console.log("✓ Loaded", missing.length, "records for", floor.id);
  updateStats();
  updateDashboard();
}
// Loads inspections for any desk not yet in desksData.
// Called when dashboard tab opens. Subsequent calls are instant (no-ops).
async function loadMissingInspections() {
  var missing = [];
  floorConfigs.forEach(function (floor) {
    floor.desks.forEach(function (desk) {
      if (!(desk.number in desksData)) missing.push(desk.number);
    });
  });

  if (missing.length === 0) return;

  console.log("Dashboard: loading", missing.length, "missing inspections...");
  var CHUNK = 30;
  for (var i = 0; i < missing.length; i += CHUNK) {
    var chunk = missing.slice(i, i + CHUNK);
    var snap = await db
      .collection("inspections")
      .where("__name__", "in", chunk)
      .get();
    snap.forEach(function (doc) {
      desksData[doc.id] = doc.data();
    });
  }
  console.log("Dashboard: inspections fully loaded.");
}
