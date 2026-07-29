// dashboard.js — interactive dashboard + equipment analysis.
// Covers ALL inspectable item types (Desk, MeetingRoom, ServerRoom, Printer),
// not just desks. Every summary tile drills into the items behind it.
// Depends on globals: floorConfigs, desksData (read-only)
// Exposes globals: updateDashboard, switchTab, switchTabTo,
//                  openDrillDown, closeDrillDown, navigateToDesk

var buildingChart = null;
var statusChart = null;

// Inspectable item types — everything that has a status and counts on the dashboard.
var INSPECTABLE_TYPES = ["Desk", "MeetingRoom", "ServerRoom", "Printer"];
var TYPE_LABELS = {
  Desk: "Desk",
  MeetingRoom: "Meeting Room",
  ServerRoom: "Server Room",
  Printer: "Printer",
};
function _isInspectable(item) {
  return INSPECTABLE_TYPES.indexOf(item.type || "Desk") !== -1;
}
function _typeLabel(type) {
  return TYPE_LABELS[type] || type || "Item";
}

// Missing Items — equipment checkboxes tracked across inspected desks
var MISSING_CHECKS = [
  { field: "checkPower", label: "Power", icon: "⚡" },
  { field: "checkLAN", label: "LAN", icon: "🔌" },
  { field: "checkMon1", label: "Mon 1", icon: "🖥" },
  { field: "checkMon2", label: "Mon 2", icon: "🖥" },
  { field: "checkTBT", label: "TBT", icon: "⚡" },
  { field: "checkKeyboard", label: "Keyboard", icon: "⌨" },
  { field: "checkDocking", label: "Docking", icon: "🔗" },
  { field: "checkMouse", label: "Mouse", icon: "🖱" },
];

// ── Top KPIs (all inspectable types) ──────────────────────────────────────────
function updateDashboard() {
  var total = 0,
    inspected = 0,
    issues = 0;
  floorConfigs.forEach(function (floor) {
    floor.desks.forEach(function (d) {
      if (!_isInspectable(d)) return;
      total++;
      var st = desksData[d.number] && desksData[d.number].status;
      if (st === "inspected") inspected++;
      else if (st === "issue") issues++;
    });
  });
  var completion =
    total > 0 ? Math.round(((inspected + issues) / total) * 100) : 0;
  document.getElementById("dashTotalDesks").textContent = total;
  document.getElementById("dashInspected").textContent = inspected;
  document.getElementById("dashIssues").textContent = issues;
  document.getElementById("dashCompletion").textContent = completion + "%";
  renderCharts();
  renderEquipmentAnalysis();
  renderMissingItems();
}

function switchTabTo(tabName) {
  document.querySelectorAll(".tab").forEach(function (t) {
    t.classList.remove("active");
  });
  document.querySelectorAll(".tab-content").forEach(function (c) {
    c.classList.remove("active");
  });
  document.querySelectorAll(".tab").forEach(function (t) {
    var oc = t.getAttribute("onclick") || "";
    if (oc.indexOf("'" + tabName + "'") !== -1) {
      t.classList.add("active");
    }
  });
  document.getElementById(tabName + "Tab").classList.add("active");
  if (tabName === "dashboard") {
    loadMissingInspections().then(function () {
      updateDashboard();
    });
  }
  if (tabName === "history") {
    loadHistory(30);
  }
}

function switchTab(tabName) {
  switchTabTo(tabName);
}

// ── Charts (all inspectable types) ────────────────────────────────────────────
function renderCharts() {
  // Building bar — all types, 3-way split so it agrees with the KPI Completion %.
  var buildingData = {};
  floorConfigs.forEach(function (floor) {
    var b = floor.building;
    if (!buildingData[b]) {
      buildingData[b] = { inspected: 0, issues: 0, pending: 0 };
    }
    floor.desks.forEach(function (d) {
      if (!_isInspectable(d)) return;
      var st = desksData[d.number] && desksData[d.number].status;
      if (st === "inspected") buildingData[b].inspected++;
      else if (st === "issue") buildingData[b].issues++;
      else buildingData[b].pending++;
    });
  });
  var bKeys = Object.keys(buildingData).sort();

  var buildingCtx = document.getElementById("buildingChart");
  if (buildingChart) {
    buildingChart.destroy();
  }
  buildingChart = new Chart(buildingCtx, {
    type: "bar",
    data: {
      labels: bKeys.map(function (b) {
        return "Building " + b;
      }),
      datasets: [
        {
          label: "Inspected",
          data: bKeys.map(function (b) {
            return buildingData[b].inspected;
          }),
          backgroundColor: "#10b981",
        },
        {
          label: "Issues",
          data: bKeys.map(function (b) {
            return buildingData[b].issues;
          }),
          backgroundColor: "#f43f5e",
        },
        {
          label: "Pending",
          data: bKeys.map(function (b) {
            return buildingData[b].pending;
          }),
          backgroundColor: "#f59e0b",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true } },
    },
  });

  // Status donut — all types.
  var pending = 0,
    inspectedCount = 0,
    issuesCount = 0;
  floorConfigs.forEach(function (floor) {
    floor.desks.forEach(function (d) {
      if (!_isInspectable(d)) return;
      var st = desksData[d.number] && desksData[d.number].status;
      if (st === "inspected") inspectedCount++;
      else if (st === "issue") issuesCount++;
      else pending++;
    });
  });

  var statusCtx = document.getElementById("statusChart");
  if (statusChart) {
    statusChart.destroy();
  }
  statusChart = new Chart(statusCtx, {
    type: "doughnut",
    data: {
      labels: ["Pending", "Inspected", "Issues"],
      datasets: [
        {
          data: [pending, inspectedCount, issuesCount],
          backgroundColor: ["#f59e0b", "#10b981", "#f43f5e"],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: function (evt, elements) {
        if (!elements || elements.length === 0) {
          return;
        }
        var statusMap = ["pending", "inspected", "issue"];
        openDrillDown(statusMap[elements[0].index]);
      },
    },
  });
}

// ── Drill-down (all types; type:/status/missing: filters) ─────────────────────
// Built with createElement/textContent — no Firestore data is concatenated into
// innerHTML or inline handlers (fixes the former stored-XSS here).
function openDrillDown(filter) {
  var rows = [];
  var isMissing = filter.indexOf("missing:") === 0;
  var isType = filter.indexOf("type:") === 0;
  var missingField = isMissing ? filter.slice(8) : null;
  var typeWanted = isType ? filter.slice(5) : null;

  floorConfigs.forEach(function (floor) {
    floor.desks.forEach(function (item) {
      if (!_isInspectable(item)) return;
      var type = item.type || "Desk";
      if (isMissing && type !== "Desk") return; // missing checks are desk-only
      var data = desksData[item.number];
      var st = (data && data.status) || "pending";
      var include = false;

      if (isMissing) {
        include = !!(
          data &&
          (data.status === "inspected" || data.status === "issue") &&
          data[missingField] === false
        );
      } else if (isType) {
        include = type === typeWanted;
      } else {
        include = filter === "all" || st === filter;
      }

      if (include) {
        rows.push({
          id: item.number,
          type: type,
          building: floor.building,
          floorLabel: "Floor " + floor.floor,
          floorId: floor.id,
          status: st,
        });
      }
    });
  });

  // Title
  var title;
  if (isMissing) {
    var checkLabel = "";
    MISSING_CHECKS.forEach(function (c) {
      if (c.field === missingField) checkLabel = c.label;
    });
    title =
      "Missing: " +
      checkLabel +
      " (" +
      rows.length +
      " desk" +
      (rows.length !== 1 ? "s" : "") +
      ")";
  } else if (isType) {
    title = _typeLabel(typeWanted) + "s (" + rows.length + ")";
  } else {
    var labelMap = {
      all: "All Items",
      pending: "Pending Items",
      inspected: "Inspected Items",
      issue: "Items with Issues",
    };
    title = (labelMap[filter] || "Items") + " (" + rows.length + ")";
  }
  document.getElementById("drillDownTitle").textContent = title;

  // Body
  var bodyEl = document.getElementById("drillDownBody");
  bodyEl.innerHTML = "";

  if (rows.length === 0) {
    var empty = document.createElement("p");
    empty.className = "drill-empty";
    empty.textContent = "No items match this filter.";
    bodyEl.appendChild(empty);
    document.getElementById("drillDownModal").style.display = "flex";
    return;
  }

  if (filter === "issue" && typeof openMasterJiraModal === "function") {
    var jiraWrap = document.createElement("div");
    jiraWrap.style.cssText =
      "margin-bottom:16px;display:flex;justify-content:flex-end;";
    var jiraBtn = document.createElement("button");
    jiraBtn.textContent = "🎫 Create Jira Tickets";
    jiraBtn.style.cssText =
      "background:#667eea;color:#fff;border:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;";
    jiraBtn.onclick = openMasterJiraModal;
    jiraWrap.appendChild(jiraBtn);
    bodyEl.appendChild(jiraWrap);
  }

  var table = document.createElement("table");
  table.className = "drill-table";
  var thead = document.createElement("thead");
  thead.innerHTML =
    "<tr><th>Item</th><th>Type</th><th>Building</th><th>Floor</th><th>Status</th><th></th></tr>";
  table.appendChild(thead);

  var tbody = document.createElement("tbody");
  rows.forEach(function (r) {
    var tr = document.createElement("tr");

    var tdId = document.createElement("td");
    tdId.className = "dd-desk-id";
    tdId.textContent = r.id;

    var tdType = document.createElement("td");
    tdType.textContent = _typeLabel(r.type);

    var tdBuilding = document.createElement("td");
    tdBuilding.textContent = "Building " + r.building;

    var tdFloor = document.createElement("td");
    tdFloor.textContent = r.floorLabel;

    var tdStatus = document.createElement("td");
    var pill = document.createElement("span");
    pill.className = "status-pill status-pill--" + r.status;
    pill.textContent = r.status;
    tdStatus.appendChild(pill);

    var tdGo = document.createElement("td");
    var goBtn = document.createElement("button");
    goBtn.className = "btn-go";
    goBtn.textContent = "Go →";
    goBtn.onclick = (function (id, building, floorId) {
      return function () {
        navigateToDesk(id, building, floorId);
      };
    })(r.id, r.building, r.floorId);
    tdGo.appendChild(goBtn);

    tr.appendChild(tdId);
    tr.appendChild(tdType);
    tr.appendChild(tdBuilding);
    tr.appendChild(tdFloor);
    tr.appendChild(tdStatus);
    tr.appendChild(tdGo);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  bodyEl.appendChild(table);

  document.getElementById("drillDownModal").style.display = "flex";
}

function closeDrillDown() {
  document.getElementById("drillDownModal").style.display = "none";
}

// onBuildingChange() is fully synchronous — no setTimeout needed.
// Floor select option values are floor.id, not floor.floor (the number).
function navigateToDesk(deskId, building, floorId) {
  closeDrillDown();
  switchTabTo("inspect");
  document.getElementById("buildingSelect").value = building;
  onBuildingChange();
  document.getElementById("floorSelect").value = floorId;
  onFloorChange();
}

// ── Equipment Analysis (clickable → type drill-down) ──────────────────────────
function renderEquipmentAnalysis() {
  var typeInfo = {
    Desk: { label: "Desks", icon: "🪑" },
    MeetingRoom: { label: "Meeting Rooms", icon: "📅" },
    ServerRoom: { label: "Server Rooms", icon: "🖥️" },
    Printer: { label: "Printers", icon: "🖨️" },
  };
  var ORDER = ["Desk", "MeetingRoom", "ServerRoom", "Printer"];
  var counts = {
    Desk: { total: 0, inspected: 0, issues: 0 },
    MeetingRoom: { total: 0, inspected: 0, issues: 0 },
    ServerRoom: { total: 0, inspected: 0, issues: 0 },
    Printer: { total: 0, inspected: 0, issues: 0 },
  };

  floorConfigs.forEach(function (floor) {
    floor.desks.forEach(function (desk) {
      var t = desk.type || "Desk";
      if (!counts[t]) {
        return;
      }
      counts[t].total++;
      var st = desksData[desk.number] && desksData[desk.number].status;
      if (st === "inspected") {
        counts[t].inspected++;
      } else if (st === "issue") {
        counts[t].issues++;
      }
    });
  });

  var container = document.getElementById("equipmentGrid");
  container.innerHTML = "";
  ORDER.forEach(function (t) {
    var c = counts[t];
    var info = typeInfo[t];
    var pct = c.total > 0 ? Math.round((c.inspected / c.total) * 100) : 0;
    var card = document.createElement("div");
    card.className = "equip-card equip-card--clickable";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.title = "Click to see all " + info.label;
    card.onclick = function () {
      openDrillDown("type:" + t);
    };
    card.onkeydown = function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDrillDown("type:" + t);
      }
    };
    card.innerHTML =
      '<div class="equip-icon">' +
      info.icon +
      "</div>" +
      '<div class="equip-label">' +
      info.label +
      "</div>" +
      '<div class="equip-total">' +
      c.total +
      " total</div>" +
      '<div class="equip-stats">' +
      '<span class="equip-inspected">' +
      c.inspected +
      " inspected</span>" +
      (c.issues > 0
        ? ' <span class="equip-issues">' + c.issues + " issues</span>"
        : "") +
      "</div>" +
      '<div class="equip-bar"><div class="equip-bar-fill" style="width:' +
      pct +
      '%"></div></div>' +
      '<div class="equip-pct">' +
      pct +
      "%</div>";
    container.appendChild(card);
  });
}

// ── Missing Items ─────────────────────────────────────────────────────────
// Counts inspected desks where each checkbox field is explicitly false.
// Pending desks are excluded — unchecked on a pending desk = not yet visited.
function renderMissingItems() {
  var container = document.getElementById("missingItemsGrid");
  if (!container) {
    return;
  }
  container.innerHTML = "";

  MISSING_CHECKS.forEach(function (check) {
    var count = 0;
    floorConfigs.forEach(function (floor) {
      floor.desks
        .filter(function (d) {
          return !d.type || d.type === "Desk";
        })
        .forEach(function (desk) {
          var data = desksData[desk.number];
          if (
            data &&
            (data.status === "inspected" || data.status === "issue") &&
            data[check.field] === false
          ) {
            count++;
          }
        });
    });

    var hasAlert = count > 0;
    var card = document.createElement("div");
    card.className = "missing-card" + (hasAlert ? " missing-card--alert" : "");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.title = "Click to see desks missing " + check.label;
    card.onclick = function () {
      openDrillDown("missing:" + check.field);
    };
    card.onkeydown = function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDrillDown("missing:" + check.field);
      }
    };
    card.innerHTML =
      '<div class="missing-card-icon">' +
      check.icon +
      "</div>" +
      '<div class="missing-card-label">' +
      check.label +
      "</div>" +
      '<div class="missing-card-count' +
      (hasAlert ? " missing-card-count--alert" : "") +
      '">' +
      count +
      "</div>" +
      '<div class="missing-card-sub">' +
      (count === 1 ? "desk missing" : "desks missing") +
      "</div>";
    container.appendChild(card);
  });
}
