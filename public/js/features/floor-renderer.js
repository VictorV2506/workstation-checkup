// public/js/features/floor-renderer.js
// Session 16: type-aware CSS classes.
// Session 17 fix: preload floor image before revealing markers.
// Markers are built in a DocumentFragment (off-DOM). The loading spinner
// stays visible until the floor plan image is fetched. Image + markers
// are revealed simultaneously, eliminating the markers-before-map race.
// Graceful degradation: if image fails, markers are shown anyway.
// Desks -> .desk-marker | MeetingRoom -> .meeting-marker
// ServerRoom -> .server-marker | Printer -> .printer-marker | Other -> .amenity-marker (no click)
// Hard deps: state.js, zoom.js
// Soft deps: bulk-edit.js, filters.js, stats.js

const ROOM_SCALE_FACTOR = 0.05;
const ROOM_SIZE_MIN = 35;
const ROOM_SIZE_MAX = 150;

function calculateRoomSize(item) {
  if (!item.coordinates || !item.coordinates[0]) {
    if (item.type === "MeetingRoom") return 60;
    if (item.type === "ServerRoom") return 50;
    if (item.type === "Collaboration") return 50;
    return 35;
  }

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
  var floorPlan = document.getElementById("floorPlan");
  var loadingEl = document.getElementById("floorLoading");
  var container = document.getElementById("floorViewer");

  // Preserve zoom and scroll position if this is a re-render (not a fresh floor load).
  // A fresh load is detected by the absence of a background image on the floor plan.
  var isFreshLoad =
    !floorPlan.style.backgroundImage || floorPlan.style.backgroundImage === "";
  var savedZoom = currentZoom;
  var savedScrollLeft = container ? container.scrollLeft : 0;
  var savedScrollTop = container ? container.scrollTop : 0;

  // Loading spinner stays visible until image + markers are ready
  floorPlan.innerHTML = "";
  currentZoom = 1;

  var containerWidth = container.offsetWidth;
  var scale = containerWidth / currentFloor.width;
  currentZoom = isFreshLoad ? scale * 1.2 : savedZoom;

  // Set dimensions now (needed for absolute marker positioning)
  floorPlan.style.width = currentFloor.width + "px";
  floorPlan.style.height = currentFloor.height + "px";

  // Build all markers off-DOM in a DocumentFragment (single reflow on insert)
  var fragment = document.createDocumentFragment();

  currentFloor.desks.forEach(function (item) {
    if (item.type === "Bathroom") return;

    var itemType = item.type || "Desk";

    var markerClass =
      itemType === "Desk"
        ? "desk-marker"
        : itemType === "MeetingRoom"
          ? "meeting-marker"
          : itemType === "ServerRoom"
            ? "server-marker"
            : itemType === "Printer"
              ? "printer-marker"
              : "amenity-marker";
    var marker = document.createElement("div");
    marker.className = markerClass;
    marker.style.left = item.x + "px";
    marker.style.top = item.y + "px";
    marker.dataset.deskId = item.number;
    marker.dataset.type = itemType;

    if (itemType === "MeetingRoom" || itemType === "ServerRoom") {
      var size = calculateRoomSize(item);
      marker.style.width = size + "px";
      marker.style.height = size + "px";
      marker.style.fontSize = Math.round(size * 0.29) + "px";
    }

    var itemData = desksData[item.number];
    if (itemData) {
      if (itemData.status === "inspected") marker.classList.add("inspected");
      if (itemData.status === "issue") marker.classList.add("issue");
    }

    var label = document.createElement("div");
    label.className = "desk-label";
    label.textContent = item.number || item.id;
    marker.appendChild(label);

    if (isAdmin) {
      var deleteBtn = document.createElement("button");
      deleteBtn.className = "marker-delete-btn";
      deleteBtn.innerHTML = "×";
      deleteBtn.onclick = function (e) {
        e.stopPropagation();
        deleteMarker(item.id);
      };
      marker.appendChild(deleteBtn);
    }

    if (markerClass !== "amenity-marker") {
      marker.addEventListener(
        "click",
        (function (id) {
          return function (e) {
            handleDeskClick(e, id);
          };
        })(item.number),
      );
    }

    fragment.appendChild(marker);
  });

  // Reveal: set background, insert all markers, hide spinner — atomically
  function reveal() {
    floorPlan.style.backgroundImage = "url('" + currentFloor.image_path + "')";
    floorPlan.appendChild(fragment);
    loadingEl.style.display = "none";
    applyZoom();
    // Restore scroll position on re-render; centre on fresh load
    if (isFreshLoad) {
      container.scrollLeft = Math.max(
        0,
        (floorPlan.offsetWidth * currentZoom - container.offsetWidth) / 2,
      );
      container.scrollTop = Math.max(
        0,
        (floorPlan.offsetHeight * currentZoom - container.offsetHeight) / 2,
      );
    } else {
      container.scrollLeft = savedScrollLeft;
      container.scrollTop = savedScrollTop;
    }
    setupDragSelection();
    applyCurrentFilter();
    updateStats();
  }

  // Preload image — calls reveal() on success OR failure (graceful degradation)
  var img = new Image();
  img.onload = reveal;
  img.onerror = reveal;
  img.src = currentFloor.image_path;

  // Handle clicks for adding markers (admin feature) — bind ONCE.
  // renderFloorPlan() runs on every save/re-render; without this guard a fresh
  // listener stacked up each time, firing handleMapClickForMarker N times per
  // click (hence the repeated "already exists" alert).
  if (!floorPlan._markerClickBound) {
    floorPlan._markerClickBound = true;
    floorPlan.addEventListener("click", function (event) {
      if (typeof handleMapClickForMarker === "function") {
        handleMapClickForMarker(event);
      }
    });
  }
}
