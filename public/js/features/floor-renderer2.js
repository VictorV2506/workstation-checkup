// public/js/features/floor-renderer.js
//
// Session 16: type-aware CSS classes for all marker types.
//
// CSS class strategy:
//   Desks       -> .desk-marker    (blue)
//   MeetingRoom -> .meeting-marker (purple)
//   ServerRoom  -> .server-marker  (amber)
//   Other       -> .amenity-marker (grey, pointer-events:none)
//   .inspected / .issue added on top of type class.
//
// Hard dependencies: state.js (currentFloor, desksData, currentZoom)
//                   zoom.js  (applyZoom)
// Soft dependencies: bulk-edit.js (setupDragSelection, handleDeskClick)
//                   filters.js   (applyCurrentFilter)
//                   stats.js     (updateStats)

const ROOM_SCALE_FACTOR = 0.05;
const ROOM_SIZE_MIN     = 35;
const ROOM_SIZE_MAX     = 150;

function calculateRoomSize(item) {
    if (!item.coordinates || !item.coordinates[0]) return 35;
    var ring = item.coordinates[0];
    var area = 0;
    for (var i = 0; i < ring.length; i++) {
        var j = (i + 1) % ring.length;
        area += ring[i][0] * ring[j][1];
        area -= ring[j][0] * ring[i][1];
    }
    area = Math.abs(area) / 2;
    var size = Math.sqrt(area) * ROOM_SCALE_FACTOR;
    return Math.max(ROOM_SIZE_MIN, Math.min(ROOM_SIZE_MAX, Math.round(size)));
}

function renderFloorPlan() {
    document.getElementById('floorLoading').style.display = 'none';
    var floorPlan = document.getElementById('floorPlan');
    floorPlan.innerHTML = '';

    currentZoom = 1;
    var container      = document.getElementById('floorViewer');
    var containerWidth = container.offsetWidth;
    var scale          = containerWidth / currentFloor.width;

    floorPlan.style.width           = currentFloor.width  + 'px';
    floorPlan.style.height          = currentFloor.height + 'px';
    floorPlan.style.backgroundImage = "url('" + currentFloor.image_path + "')";

    currentZoom = scale * 0.9;
    applyZoom();

    currentFloor.desks.forEach(function(item) {
        if (item.type === 'Bathroom') return;

        var itemType = item.type || 'Desk';
        var markerClass =
            itemType === 'Desk'        ? 'desk-marker'    :
            itemType === 'MeetingRoom' ? 'meeting-marker' :
            itemType === 'ServerRoom'  ? 'server-marker'  :
                                         'amenity-marker';

        var marker = document.createElement('div');
        marker.className      = markerClass;
        marker.style.left     = item.x + 'px';
        marker.style.top      = item.y + 'px';
        marker.dataset.deskId = item.id;
        marker.dataset.type   = itemType;

        if (itemType === 'MeetingRoom' || itemType === 'ServerRoom') {
            var size = calculateRoomSize(item);
            marker.style.width    = size + 'px';
            marker.style.height   = size + 'px';
            marker.style.fontSize = Math.round(size * 0.29) + 'px';
        }

        var itemData = desksData[item.id];
        if (itemData) {
            if (itemData.status === 'inspected') marker.classList.add('inspected');
            if (itemData.status === 'issue')     marker.classList.add('issue');
        }

        var label       = document.createElement('div');
        label.className   = 'desk-label';
        label.textContent = item.number || item.id;
        marker.appendChild(label);

        if (markerClass !== 'amenity-marker') {
            marker.addEventListener('click', (function(id) {
                return function(e) { handleDeskClick(e, id); };
            })(item.id));
        }

        floorPlan.appendChild(marker);
    });

    setupDragSelection();
    applyCurrentFilter();
    updateStats();
}
