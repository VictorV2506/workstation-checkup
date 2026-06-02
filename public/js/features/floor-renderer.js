// public/js/features/floor-renderer.js
//
// Floor plan renderer for Workstation Checkup.
//
// Renders a marker for every item on the current floor.
// Skips Bathroom types. Applies proportional sizing for
// non-desk types using the polygon area from coordinates.
//
// CSS class strategy:
//   All markers get .desk-marker (base styles — position, border,
//   border-radius, cursor, flex, shadow, transition).
//   Non-desk types additionally get .room-marker--{type} which
//   overrides only the background colour.
//   Size for rooms is set inline via JS from polygon area.
//
// Hard JS dependencies (must load before this file):
//   state.js  — currentFloor, desksData, currentZoom
//   zoom.js   — applyZoom()
//
// Soft JS dependencies (global at call time):
//   bulk-edit.js — setupDragSelection(), handleDeskClick()
//   filters.js   — applyCurrentFilter()
//   stats.js     — updateStats()

// ── Marker size from polygon area (Shoelace formula) ──────────
// Coordinates expected in GeoJSON Polygon format:
//   item.coordinates[0] = outer ring array of [x, y] pairs
//
// SCALE_FACTOR converts sqrt(area) in floor-plan units to px.
// Default 0.05 is a starting point — tune up/down if markers
// appear too large or too small after first deploy.
const ROOM_SCALE_FACTOR = 0.05;
const ROOM_SIZE_MIN     = 35;   // never smaller than a desk marker
const ROOM_SIZE_MAX     = 150;   // cap for very large rooms

function calculateRoomSize(item) {
    if (!item.coordinates || !item.coordinates[0]) return 35;

    const ring = item.coordinates[0];
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        area += ring[i][0] * ring[j][1];
        area -= ring[j][0] * ring[i][1];
    }
    area = Math.abs(area) / 2;

    const size = Math.sqrt(area) * ROOM_SCALE_FACTOR;
    return Math.max(ROOM_SIZE_MIN, Math.min(ROOM_SIZE_MAX, Math.round(size)));
}

// ── Main render function ──────────────────────────────────────
function renderFloorPlan() {
    document.getElementById('floorLoading').style.display = 'none';
    const floorPlan = document.getElementById('floorPlan');
    floorPlan.innerHTML = '';

    // Reset zoom and fit to container width
    currentZoom = 1;
    const container      = document.getElementById('floorViewer');
    const containerWidth = container.offsetWidth;
    const scale          = containerWidth / currentFloor.width;

    floorPlan.style.width           = currentFloor.width  + 'px';
    floorPlan.style.height          = currentFloor.height + 'px';
    floorPlan.style.backgroundImage = `url('${currentFloor.image_path}')`;

    currentZoom = scale * 0.9;
    applyZoom();

    currentFloor.desks.forEach(item => {
        // Bathrooms are not rendered on the map
        if (item.type === 'Bathroom') return;

        const isDesk = !item.type || item.type === 'desk';

        const marker = document.createElement('div');
        marker.className      = 'desk-marker';
        marker.style.left     = item.x + 'px';
        marker.style.top      = item.y + 'px';
        marker.dataset.deskId = item.id;
        marker.dataset.type   = item.type || 'desk';

        // Non-desk rooms: type colour + proportional size
        if (!isDesk) {
            marker.classList.add(`room-marker--${item.type}`);
            const size = calculateRoomSize(item);
            marker.style.width    = size + 'px';
            marker.style.height   = size + 'px';
            marker.style.fontSize = Math.round(size * 0.29) + 'px';
        }

        // Apply saved inspection status from Firestore
        const itemData = desksData[item.id];
        if (itemData) {
            if (itemData.status === 'inspected') marker.classList.add('inspected');
            if (itemData.status === 'issue')     marker.classList.add('issue');
        }

        const label       = document.createElement('div');
        label.className   = 'desk-label';
        label.textContent = item.number || item.id;
        marker.appendChild(label);

        marker.addEventListener('click', (e) => handleDeskClick(e, item.id));
        floorPlan.appendChild(marker);
    });

    setupDragSelection();
    applyCurrentFilter();
    updateStats();
}
