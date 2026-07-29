// Module: Desk Filters
// Session 16: applyCurrentFilter targets all 3 marker types.
//             filterByType() with toggle added.
// Depends on: desksData, currentFilter (globals)

function filterDesks(filterType) {
  currentFilter = filterType;
  document.querySelectorAll(".stat-item").forEach(function (item) {
    item.classList.remove("active-filter");
  });
  var target = document.querySelector('[data-filter="' + filterType + '"]');
  if (target) target.classList.add("active-filter");
  applyCurrentFilter();
}

function applyCurrentFilter() {
  var markers = document.querySelectorAll(
    ".desk-marker, .meeting-marker, .server-marker, .printer-marker",
  );
  markers.forEach(function (marker) {
    marker.classList.remove("highlighted", "dimmed");
    var deskId = marker.dataset.deskId;
    var deskData = desksData[deskId];
    var shouldHighlight = false;
    switch (currentFilter) {
      case "all":
        shouldHighlight = true;
        break;
      case "inspected":
        shouldHighlight = deskData && deskData.status === "inspected";
        break;
      case "issue":
        shouldHighlight = deskData && deskData.status === "issue";
        break;
      case "pending":
        shouldHighlight =
          !deskData || !deskData.status || deskData.status === "pending";
        break;
    }
    marker.classList.add(shouldHighlight ? "highlighted" : "dimmed");
  });
}

function filterByType(type) {
  var clickedCard = document.querySelector(
    '.stat-card-main[data-type="' + type + '"]',
  );
  var isAlreadyActive =
    clickedCard && clickedCard.classList.contains("active-filter");
  var effectiveType = isAlreadyActive ? "all" : type;

  document.querySelectorAll(".stat-card-main").forEach(function (c) {
    c.classList.remove("active-filter");
  });
  if (effectiveType !== "all" && clickedCard)
    clickedCard.classList.add("active-filter");

  var allMarkers = document.querySelectorAll(
    ".desk-marker, .meeting-marker, .server-marker, .printer-marker",
  );
  allMarkers.forEach(function (marker) {
    if (effectiveType === "all") {
      marker.classList.remove("dimmed");
      return;
    }
    var isMatch =
      (effectiveType === "Desk" && marker.classList.contains("desk-marker")) ||
      (effectiveType === "MeetingRoom" &&
        marker.classList.contains("meeting-marker")) ||
      (effectiveType === "ServerRoom" &&
        marker.classList.contains("server-marker")) ||
      (effectiveType === "Printer" &&
        marker.classList.contains("printer-marker"));
    if (isMatch) {
      marker.classList.remove("dimmed");
    } else {
      marker.classList.add("dimmed");
    }
  });
}
