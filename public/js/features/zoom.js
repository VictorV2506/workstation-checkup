// public/js/features/zoom.js
//
// Fixes:
//   1. Layout thrashing: reads batched before writes (4 reflows -> 1)
//   2. JS-controlled transition: floor load is instant, zoom buttons animate
//   3. transform-origin:0 0 + marginRight/Bottom keeps left side scrollable
//
// Depends on: constants.js (MIN_ZOOM, MAX_ZOOM, ZOOM_STEP)
//             state.js     (currentZoom)

var _isZoomGesture = false;

function zoomIn() {
    if (currentZoom < MAX_ZOOM) {
        _isZoomGesture = true;
        currentZoom = Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM);
        applyZoom();
        _isZoomGesture = false;
    }
}

function zoomOut() {
    if (currentZoom > MIN_ZOOM) {
        _isZoomGesture = true;
        currentZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
        applyZoom();
        _isZoomGesture = false;
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

    // Animate ONLY on zoom button press — floor load is instant.
    plan.style.transition = _isZoomGesture ? 'transform 0.2s ease-out' : 'none';

    // ALL reads first (1 reflow total)
    var planW   = plan.offsetWidth;
    var planH   = plan.offsetHeight;
    var viewerW = viewer ? viewer.offsetWidth : 0;

    // ALL writes after (0 additional reflows)
    var scaledW   = Math.round(planW * currentZoom);
    var scaledH   = Math.round(planH * currentZoom);
    var leftSpace = viewerW - scaledW;

    plan.style.transform    = 'scale(' + currentZoom + ')';
    plan.style.marginRight  = Math.max(0, scaledW - planW) + 'px';
    plan.style.marginBottom = Math.max(0, scaledH - planH) + 'px';
    plan.style.marginLeft   = leftSpace > 0 ? Math.round(leftSpace / 2) + 'px' : '0px';
}
