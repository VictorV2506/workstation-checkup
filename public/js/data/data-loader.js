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
async function loadFloorData() {
    try {
        const response = await fetch('floors_data.json');
        if (!response.ok) {
            throw new Error('Failed to load floors_data.json');
        }
        floorConfigs = await response.json();

        console.log('\u2705 Loaded floors:', floorConfigs.length);

        const buildings = [...new Set(floorConfigs.map(f => f.building))].sort();
        const buildingSelect = document.getElementById('buildingSelect');
        buildingSelect.innerHTML = '<option value="">Select Building</option>';
        buildings.forEach(building => {
            const option = document.createElement('option');
            option.value = building;
            option.textContent = `Building ${building}`;
            buildingSelect.appendChild(option);
        });

        loadDesksData();
    } catch (error) {
        console.error('Error loading floors:', error);
        alert('Error: ' + error.message + '\n\nMake sure floors_data.json is in the same directory');
    }
}

// ── Desk inspection records ───────────────────────────────────
async function loadDesksData() {
    try {
        const snapshot = await db.collection('desks').get();
        desksData = {};
        snapshot.docs.forEach(doc => {
            desksData[doc.id] = doc.data();
        });
        console.log('\u2705 Loaded desk data:', Object.keys(desksData).length);
        updateStats();
        updateDashboard();
    } catch (error) {
        console.error('Error loading desks:', error);
    }
}
