// public/js/features/zoom.js
//
// Zoom controls for the floor plan viewer.
//
// Depends on: constants.js (MIN_ZOOM, MAX_ZOOM, ZOOM_STEP)
//             state.js     (currentZoom)
// Called by:  HTML onclick attributes on zoom buttons
//             floor-renderer.js (applyZoom, currentZoom)

// ── Zoom in ───────────────────────────────────────────────────
function zoomIn() {
    if (currentZoom < MAX_ZOOM) {
        currentZoom = Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM);
        applyZoom();
    }
}

// ── Zoom out ──────────────────────────────────────────────────
function zoomOut() {
    if (currentZoom > MIN_ZOOM) {
        currentZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
        applyZoom();
    }
}

// ── Reset zoom and centre the floor plan ──────────────────────
function zoomReset() {
    currentZoom = 1;
    applyZoom();

    const viewer = document.getElementById('floorViewer');
    const plan   = document.getElementById('floorPlan');
    viewer.scrollLeft = (plan.offsetWidth  - viewer.offsetWidth)  / 2;
    viewer.scrollTop  = (plan.offsetHeight - viewer.offsetHeight) / 2;
}

// ── Apply current zoom to the DOM ────────────────────────────
function applyZoom() {
    const plan = document.getElementById('floorPlan');
    plan.style.transform = `scale(${currentZoom})`;
}
