// public/js/features/floor-selector.js
//
// Floor selector module for Workstation Checkup.
//
// Handles building and floor dropdown interactions.
// Called directly from HTML onchange attributes.
//
// Depends on: state.js (floorConfigs, currentFloor)
// Calls:      floor-renderer.js (renderFloorPlan)

// ── Building dropdown ─────────────────────────────────────────
// Populates the floor dropdown when a building is selected.
// Resets the floor plan view.
function onBuildingChange() {
    const building = document.getElementById('buildingSelect').value;
    const floorSelect = document.getElementById('floorSelect');
    floorSelect.innerHTML = '<option value="">Select Floor</option>';

    if (building) {
        const floors = floorConfigs
            .filter(f => f.building === building)
            .sort((a, b) => a.floor - b.floor);
        floors.forEach(floor => {
            const option = document.createElement('option');
            option.value = floor.id;
            option.textContent = `Floor ${floor.floor}`;
            floorSelect.appendChild(option);
        });
    }

    document.getElementById('floorLoading').style.display = 'flex';
    document.getElementById('floorPlan').innerHTML = '';
}

// ── Floor dropdown ────────────────────────────────────────────
// Sets currentFloor from floorConfigs and triggers render.
async function onFloorChange() {
    const floorId = document.getElementById('floorSelect').value;
    if (!floorId) {
        document.getElementById('floorLoading').style.display = 'flex';
        document.getElementById('floorPlan').innerHTML = '';
        return;
    }

    currentFloor = floorConfigs.find(f => f.id === floorId);
    if (currentFloor) {
        console.log('✅ Selected floor:', currentFloor.id);
        await loadFloorInspections(currentFloor);
        renderFloorPlan();
    }
}

