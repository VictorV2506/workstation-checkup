// public/js/features/zoom.js
//
// Zoom controls for the floor plan viewer.
//
// Bug fix: CSS transform:scale() is visual-only — scroll container
// only knows layout size. With transform-origin:center center the
// left overflow was in negative scroll space (unreachable).
// Fix: transform-origin:0 0 in CSS + applyZoom() expands
// marginRight/Bottom so scroll container sees the full scaled area.
//
// Depends on: constants.js (MIN_ZOOM, MAX_ZOOM, ZOOM_STEP)
//             state.js     (currentZoom)

function zoomIn() {
    if (currentZoom < MAX_ZOOM) {
        currentZoom = Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM);
        applyZoom();
    }
}

function zoomOut() {
    if (currentZoom > MIN_ZOOM) {
        currentZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
        applyZoom();
    }
}

function zoomReset() {
    currentZoom = 1;
    applyZoom();

    var viewer = document.getElementById('floorViewer');
    var plan   = document.getElementById('floorPlan');
    if (!viewer || !plan) return;

    viewer.scrollLeft = Math.max(0, (plan.offsetWidth  * currentZoom - viewer.offsetWidth)  / 2);
    viewer.scrollTop  = Math.max(0, (plan.offsetHeight * currentZoom - viewer.offsetHeight) / 2);
}

function applyZoom() {
    var plan   = document.getElementById('floorPlan');
    var viewer = document.getElementById('floorViewer');
    if (!plan) return;

    plan.style.transform = 'scale(' + currentZoom + ')';

    var scaledW = Math.round(plan.offsetWidth  * currentZoom);
    var scaledH = Math.round(plan.offsetHeight * currentZoom);

    // Expand right + bottom margins so scroll container sees the
    // full scaled visual size (transform does not affect layout).
    plan.style.marginRight  = Math.max(0, scaledW - plan.offsetWidth)  + 'px';
    plan.style.marginBottom = Math.max(0, scaledH - plan.offsetHeight) + 'px';

    // Centre horizontally when content fits within the viewer.
    // Zero out when zoomed in so the user can scroll freely left.
    if (viewer) {
        var leftSpace = viewer.offsetWidth - scaledW;
        plan.style.marginLeft = leftSpace > 0 ? Math.round(leftSpace / 2) + 'px' : '0px';
    }
}
