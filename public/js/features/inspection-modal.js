// inspection-modal.js
// Type-aware inspection modal: Desk, MeetingRoom, ServerRoom
// Replaces: desk-modal.js
// Depends on globals: desksData, currentFloor, currentUser, db, selectedDesks
// Calls: renderFloorPlan(), updateStats(), updateDashboard(), clearSelection()
// Calls: writeHistoryEntry(), writeBulkHistoryEntries() from history.js

// ─── Equipment option lists ───────────────────────────────────────────────────

const EQUIPMENT = {
  MONITORS: [
    "T24i-10 (round)",
    "T24i-10 (rectangle)",
    "T24i-20/2L (Round)",
    "T24i-20/2L (rectangle)",
    "T24d-10 (bigger aspect ratio Round)",
    "T24d-10 (bigger aspect ratio Rectangle)",
    "Dell U2422HE (Silver)",
    "Dell U2422H (Silver)",
    "Dell P2422HE (Black)",
    "Dell P2422H (Black)",
    "Lenovo AIO (camera)",
    "Lenovo AIO (NO camera)",
    "Dell U2717D",
    "No Monitor",
    "Not in the list",
  ],
  DOCKS: [
    "Dell Docking Station (old)",
    "Lenovo USB-C Dock (small)",
    "Thinkpad Thunderbolt 3 G1",
    "Thinkpad Thunderbolt 3 G2",
    "No Docking Station",
    "Dock integrated in Dell Monitor",
  ],
  PRINTER_FAMILIES: [
    "C5550iii",
    "C256iii",
    "DX C3730i",
    "C25tiii",
    "C257i",
    "Color LaserJet Pro MFP M447fmw",
    "Canon F17750",
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _buildSelectOptions(items, savedValue) {
  return items
    .map(
      (item) =>
        `<option value="${item}" ${savedValue === item ? "selected" : ""}>${item}</option>`,
    )
    .join("\n                        ");
}

function _statusOptions(saved) {
  return `
    <option value="pending"   ${!saved || saved === "pending" ? "selected" : ""}>Pending</option>
    <option value="inspected" ${saved === "inspected" ? "selected" : ""}>✅ OK - No Issues</option>
    <option value="issue"     ${saved === "issue" ? "selected" : ""}>❌ Issue Found</option>
  `;
}

// ─── Status → checklist behaviour ────────────────────────────────────────────
const MANDATORY_CHECKS = [
  "checkPower",
  "checkLAN",
  "checkMon1",
  "checkMon2",
  "checkTBT",
  "checkDocking",
];

function onStatusChange(status) {
  const isOK = status === "inspected";
  MANDATORY_CHECKS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    if (isOK) {
      el.checked = true;
      el.disabled = true;
    } else {
      el.disabled = false;
    }
  });
}

// ─── Form renderers ───────────────────────────────────────────────────────────

function _renderDeskForm(itemId, d) {
  const locked = d.status === "inspected";
  return `
    <input type="hidden" id="currentItemId" value="${itemId}">
    <input type="hidden" id="currentItemType" value="Desk">

    <div class="checklist-section">
      <h3>⚡ Equipment Checklist</h3>
      <p class="checklist-hint">Mandatory items lock automatically when status is set to OK.</p>
      <div class="checkbox-grid">
        <div class="checkbox-item">
          <input type="checkbox" id="checkPower"    ${d.checkPower ? "checked" : ""} ${locked ? "disabled" : ""}><label for="checkPower">Power</label>
        </div>
        <div class="checkbox-item">
          <input type="checkbox" id="checkLAN"      ${d.checkLAN ? "checked" : ""} ${locked ? "disabled" : ""}><label for="checkLAN">LAN</label>
        </div>
        <div class="checkbox-item">
          <input type="checkbox" id="checkMon1"     ${d.checkMon1 ? "checked" : ""} ${locked ? "disabled" : ""}><label for="checkMon1">Mon 1</label>
        </div>
        <div class="checkbox-item">
          <input type="checkbox" id="checkMon2"     ${d.checkMon2 ? "checked" : ""} ${locked ? "disabled" : ""}><label for="checkMon2">Mon 2</label>
        </div>
        <div class="checkbox-item">
          <input type="checkbox" id="checkTBT"      ${d.checkTBT ? "checked" : ""} ${locked ? "disabled" : ""}><label for="checkTBT">TBT</label>
        </div>
        <div class="checkbox-item optional-item">
          <input type="checkbox" id="checkKeyboard" ${d.checkKeyboard ? "checked" : ""}><label for="checkKeyboard">Keyboard <span class="optional-tag">optional</span></label>
        </div>
        <div class="checkbox-item">
          <input type="checkbox" id="checkDocking"  ${d.checkDocking ? "checked" : ""} ${locked ? "disabled" : ""}><label for="checkDocking">Docking</label>
        </div>
        <div class="checkbox-item optional-item">
          <input type="checkbox" id="checkMouse"    ${d.checkMouse ? "checked" : ""}><label for="checkMouse">Mouse <span class="optional-tag">optional</span></label>
        </div>
      </div>
    </div>

    <div class="checklist-section">
      <h3>📋 Equipment Details</h3>
      <div class="form-group">
        <label>Left Monitor</label>
        <select id="deskLeftMonitor">
          <option value="">-- Select --</option>
          ${_buildSelectOptions(EQUIPMENT.MONITORS, d.leftMonitor || "")}
        </select>
      </div>
      <div class="form-group">
        <label>Dock</label>
        <select id="deskDock">
          <option value="">-- Select --</option>
          ${_buildSelectOptions(EQUIPMENT.DOCKS, d.dock || "")}
        </select>
      </div>
      <div class="form-group">
        <label>Right Monitor</label>
        <select id="deskRightMonitor">
          <option value="">-- Select --</option>
          ${_buildSelectOptions(EQUIPMENT.MONITORS, d.rightMonitor || "")}
        </select>
      </div>
    </div>

    <div class="checklist-section">
      <h3>📝 Status & Notes</h3>
      <div class="form-group">
        <label>Status</label>
        <select id="itemStatus" onchange="onStatusChange(this.value)">${_statusOptions(d.status)}</select>
      </div>
      <div class="form-group">
        <label>Remarks</label>
        <textarea id="itemRemarks" placeholder="Add any observations, issues, or notes...">${d.remarks || ""}</textarea>
      </div>
    </div>
  `;
}

function _renderMeetingRoomForm(itemId, d) {
  const AV_STATUS_OPTIONS = [
    "Not Working",
    "Not Present",
    "Not Needed",
    "Working",
  ];
  const CRESTRON_OPTIONS = [
    "Not Working",
    "Nothing",
    "Cable Only",
    "Bracket",
    "Mounted",
    "Working",
  ];
  const YES_NO_OPTIONS = ["Yes", "No"];

  function _avSelect(id, savedValue) {
    return AV_STATUS_OPTIONS.map(
      (opt) =>
        `<option value="${opt}" ${savedValue === opt ? "selected" : ""}>${opt}</option>`,
    ).join("");
  }

  function _crestronSelect(savedValue) {
    return CRESTRON_OPTIONS.map(
      (opt) =>
        `<option value="${opt}" ${savedValue === opt ? "selected" : ""}>${opt}</option>`,
    ).join("");
  }

  function _yesNoSelect(id, savedValue) {
    return YES_NO_OPTIONS.map(
      (opt) =>
        `<option value="${opt}" ${savedValue === opt ? "selected" : ""}>${opt}</option>`,
    ).join("");
  }

  return `
    <input type="hidden" id="currentItemId" value="${itemId}">
    <input type="hidden" id="currentItemType" value="MeetingRoom">

    <div class="checklist-section">
      <h3>📋 Room Details</h3>
      <div class="form-group">
        <label>Usable for Meetings</label>
        <select id="meetingUsable">
          <option value="">-- Select --</option>
          ${_yesNoSelect("meetingUsable", d.usable || "")}
        </select>
      </div>
      <div class="form-group">
        <label>Remote</label>
        <select id="meetingRemote">
          <option value="">-- Select --</option>
          ${_yesNoSelect("meetingRemote", d.remote || "")}
        </select>
      </div>
    </div>

    <div class="checklist-section">
      <h3>📺 AV Equipment Status</h3>
      <div class="form-group">
        <label>Google Meet Device</label>
        <select id="meetingGoogleMeet">
          <option value="">-- Select --</option>
          ${_avSelect("meetingGoogleMeet", d.googleMeetDevice || "")}
        </select>
      </div>
      <div class="form-group">
        <label>Focus Room Monitor</label>
        <select id="meetingFocusMonitor">
          <option value="">-- Select --</option>
          ${_avSelect("meetingFocusMonitor", d.focusRoomMonitor || "")}
        </select>
      </div>
      <div class="form-group">
        <label>Crestron Status (Room Booking Display)</label>
        <select id="meetingCrestron">
          <option value="">-- Select --</option>
          ${_crestronSelect(d.crestronStatus || "")}
        </select>
      </div>
    </div>

    <div class="checklist-section">
      <h3>🔧 Hardware</h3>
      <div class="form-group">
        <label>TV Size</label>
        <input type="text" id="meetingTvSize" value="${d.tvSize || ""}" placeholder="e.g., 65 inch">
      </div>
      <div class="form-group">
        <label>Extra AV Device (QSC / Sennheiser etc.)</label>
        <input type="text" id="meetingExtraAV" value="${d.extraAVDevice || ""}" placeholder="e.g., QSC amplifier">
      </div>
    </div>

    <div class="checklist-section">
      <h3>📝 Status & Notes</h3>
      <div class="form-group">
        <label>Status</label>
        <select id="itemStatus">${_statusOptions(d.status)}</select>
      </div>
      <div class="form-group">
        <label>Remarks</label>
        <textarea id="itemRemarks" placeholder="Add any observations, issues, or notes...">${d.remarks || ""}</textarea>
      </div>
    </div>
  `;
}

function _renderServerRoomForm(itemId, d) {
  return `
    <input type="hidden" id="currentItemId" value="${itemId}">
    <input type="hidden" id="currentItemType" value="ServerRoom">

    <div class="checklist-section">
      <h3>📝 Notes</h3>
      <div class="form-group">
        <label>Status</label>
        <select id="itemStatus">${_statusOptions(d.status)}</select>
      </div>
      <div class="form-group">
        <label>Remarks</label>
        <textarea id="itemRemarks" placeholder="Add observations, temperature, any issues...">${d.remarks || ""}</textarea>
      </div>
    </div>
  `;
}
// XSS-safe interpolation for values rendered into innerHTML.
// (The Desk/MeetingRoom forms above still interpolate raw — that's the P0
//  stored-XSS debt; this new form does NOT add to it. Promote to a shared
//  esc() in constants.js when P0 is tackled.)
function _esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}

// Model (Family): a dropdown with an "Other…" escape hatch for unlisted models.
function _familyInList(v) {
  return EQUIPMENT.PRINTER_FAMILIES.indexOf(v) !== -1;
}
function onPrinterFamilyChange(val) {
  var other = document.getElementById("printerModelFamilyOther");
  if (!other) return;
  var show = val === "__other__";
  other.style.display = show ? "block" : "none";
  if (show) other.focus();
}
function _resolvePrinterFamily() {
  var sel = document.getElementById("printerModelFamily").value;
  if (sel !== "__other__") return sel;
  var other = document.getElementById("printerModelFamilyOther");
  return other ? other.value.trim() : "";
}

function _renderPrinterForm(itemId, d) {
  var YES_NO = ["Yes", "No"];
  function _yesNo(saved) {
    return (
      '<option value="">-- Select --</option>' +
      YES_NO.map(function (o) {
        return (
          '<option value="' +
          o +
          '"' +
          (saved === o ? " selected" : "") +
          ">" +
          o +
          "</option>"
        );
      }).join("")
    );
  }
  var lastTouched = d.updatedBy
    ? "Last touched by " +
      _esc(d.updatedBy) +
      (d.updatedAt && d.updatedAt.toDate
        ? " on " + _esc(d.updatedAt.toDate().toLocaleString())
        : "")
    : "Not yet inspected";

  return `
    <input type="hidden" id="currentItemId" value="${_esc(itemId)}">
    <input type="hidden" id="currentItemType" value="Printer">

    <div class="checklist-section">
      <h3>🖨️ Printer Details</h3>
      <div class="form-group">
        <label>Model (Family)</label>
        <select id="printerModelFamily" onchange="onPrinterFamilyChange(this.value)">
          <option value="">-- Select --</option>
          ${_buildSelectOptions(EQUIPMENT.PRINTER_FAMILIES, _familyInList(d.modelFamily) ? d.modelFamily : "")}
          <option value="__other__" ${d.modelFamily && !_familyInList(d.modelFamily) ? "selected" : ""}>Other (type below)…</option>
        </select>
        <input type="text" id="printerModelFamilyOther"
               value="${_esc(d.modelFamily && !_familyInList(d.modelFamily) ? d.modelFamily : "")}"
               placeholder="Enter model name"
               style="margin-top:6px; display:${d.modelFamily && !_familyInList(d.modelFamily) ? "block" : "none"};">
      </div>
      <div class="form-group">
        <label>Model (Specific)</label>
        <input type="text" id="printerModelSpecific" value="${_esc(d.modelSpecific)}" placeholder="e.g., M480f">
      </div>
      <div class="form-group">
        <label>Serial Number </label>
        <input type="text" id="printerSerial" value="${_esc(d.serialNumber)}" placeholder="Serial on the device">
      </div>
      <div class="form-group">
        <label>IP (on the machine)</label>
        <input type="text" id="printerIP" value="${_esc(d.ipAddress)}" placeholder="e.g., 10.20.30.40">
      </div>
      <div class="form-group">
        <label>MAC address</label>
        <input type="text" id="printerMAC" value="${_esc(d.macAddress)}" placeholder="e.g., 00:1A:2B:3C:4D:5E">
      </div>
      <div class="form-group">
        <label>Printer name (remote)</label>
        <input type="text" id="printerNameRemote" value="${_esc(d.printerNameRemote)}" placeholder="Name in Printix / remote">
      </div>
    </div>

    <div class="checklist-section">
      <h3>✅ Checks</h3>
      <div class="form-group">
        <label>Reachable? (Web Interface)</label>
        <select id="printerReachable">${_yesNo(d.reachable || "")}</select>
      </div>
      <div class="form-group">
        <label>Print possible? (Printix)</label>
        <select id="printerPrintPossible">${_yesNo(d.printPossible || "")}</select>
      </div>
      <div class="form-group">
        <label>Location correct? (Web Interface)</label>
        <select id="printerLocationCorrect">${_yesNo(d.locationCorrect || "")}</select>
      </div>
    </div>

    <div class="checklist-section">
      <h3>📝 Status & Notes</h3>
      <div class="form-group">
        <label>Status</label>
        <select id="itemStatus">${_statusOptions(d.status)}</select>
      </div>
      <div class="form-group">
        <label>Remarks</label>
        <textarea id="itemRemarks" placeholder="Add any observations, issues, or notes...">${_esc(d.remarks)}</textarea>
      </div>
      <p style="margin-top:8px;font-size:12px;color:#6b7280;">${lastTouched}</p>
    </div>
  `;
}

// ─── Main public functions ────────────────────────────────────────────────────

function openInspectionModal(itemId) {
  const modal = document.getElementById("deskModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");

  const itemData = desksData[itemId] || {};
  const item = currentFloor.desks.find((d) => d.number === itemId);
  const itemType = item?.type || "Desk";

  if (itemType === "MeetingRoom") {
    modalTitle.textContent = `Inspecting Meeting Room: ${item?.number || itemId}`;
  } else if (itemType === "ServerRoom") {
    modalTitle.textContent = `Inspecting Server Room: ${item?.number || itemId}`;
  } else if (itemType === "Printer") {
    modalTitle.textContent = `Inspecting Printer: ${item?.number || itemId}`;
  } else {
    modalTitle.textContent = `Inspecting: ${item?.number || itemId}`;
  }

  if (itemType === "MeetingRoom") {
    modalBody.innerHTML = _renderMeetingRoomForm(itemId, itemData);
  } else if (itemType === "ServerRoom") {
    modalBody.innerHTML = _renderServerRoomForm(itemId, itemData);
  } else if (itemType === "Printer") {
    modalBody.innerHTML = _renderPrinterForm(itemId, itemData);
  } else {
    modalBody.innerHTML = _renderDeskForm(itemId, itemData);
  }

  modal.style.display = "block";

  var jiraBtn = document.getElementById("modalJiraBtn");
  if (jiraBtn) {
    jiraBtn.onclick = function () {
      openJiraModal(itemId);
    };
  }
}

function closeModal() {
  document.getElementById("deskModal").style.display = "none";
}

function saveInspectionData() {
  const itemId = document.getElementById("currentItemId")?.value;
  const itemType = document.getElementById("currentItemType")?.value;

  if (!itemId) {
    // ── Bulk edit path ────────────────────────────────────────────────────────
    const bulkData = {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.email,
    };

    const leftScreen = document.getElementById("bulkLeftScreen")?.value;
    const dock = document.getElementById("bulkDock")?.value;
    const rightScreen = document.getElementById("bulkRightScreen")?.value;
    const remarks = document.getElementById("bulkRemarks")?.value;
    const bulkStatus = document.getElementById("bulkStatus")?.value;

    if (bulkStatus) bulkData.status = bulkStatus;
    if (leftScreen) bulkData.leftScreen = leftScreen;
    if (dock) bulkData.dock = dock;
    if (rightScreen) bulkData.rightScreen = rightScreen;
    if (remarks) bulkData.remarks = remarks;

    const applyChecks = document.getElementById("bulkApplyChecks")?.checked;
    if (applyChecks) {
      bulkData.checkPower =
        document.getElementById("bulkCheckPower")?.checked ?? false;
      bulkData.checkLAN =
        document.getElementById("bulkCheckLAN")?.checked ?? false;
      bulkData.checkMon1 =
        document.getElementById("bulkCheckMon1")?.checked ?? false;
      bulkData.checkMon2 =
        document.getElementById("bulkCheckMon2")?.checked ?? false;
      bulkData.checkTBT =
        document.getElementById("bulkCheckTBT")?.checked ?? false;
      bulkData.checkKeyboard =
        document.getElementById("bulkCheckKeyboard")?.checked ?? false;
      bulkData.checkDocking =
        document.getElementById("bulkCheckDocking")?.checked ?? false;
      bulkData.checkMouse =
        document.getElementById("bulkCheckMouse")?.checked ?? false;
    }

    // Capture old data before modifying desksData
    const oldDataMap = {};
    selectedDesks.forEach((id) => {
      oldDataMap[id] = Object.assign({}, desksData[id] || {});
    });

    const batch = db.batch();
    selectedDesks.forEach((id) => {
      const ref = db.collection("inspections").doc(id);
      batch.set(ref, bulkData, { merge: true });
      desksData[id] = { ...desksData[id], ...bulkData };
    });

    batch
      .commit()
      .then(() => {
        // Write history for all affected desks
        const deskArray = Array.from(selectedDesks);
        writeBulkHistoryEntries(
          deskArray,
          function (id) {
            return oldDataMap[id];
          },
          bulkData,
          "bulk_detail",
        );

        closeModal();
        renderFloorPlan();
        updateStats();
        clearSelection();
      })
      .catch((error) => {
        alert("Error: " + error.message);
      });

    return;
  }

  // ── Single item save ──────────────────────────────────────────────────────
  // Capture state before overwriting
  const oldData = Object.assign({}, desksData[itemId] || {});

  let data = {
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser.email,
    status: document.getElementById("itemStatus").value,
    remarks: document.getElementById("itemRemarks").value,
  };

  if (itemType === "Desk") {
    data = {
      ...data,
      leftMonitor: document.getElementById("deskLeftMonitor").value,
      dock: document.getElementById("deskDock").value,
      rightMonitor: document.getElementById("deskRightMonitor").value,
      checkPower: document.getElementById("checkPower").checked,
      checkLAN: document.getElementById("checkLAN").checked,
      checkMon1: document.getElementById("checkMon1").checked,
      checkMon2: document.getElementById("checkMon2").checked,
      checkTBT: document.getElementById("checkTBT").checked,
      checkKeyboard: document.getElementById("checkKeyboard").checked,
      checkDocking: document.getElementById("checkDocking").checked,
      checkMouse: document.getElementById("checkMouse").checked,
    };
  } else if (itemType === "MeetingRoom") {
    data = {
      ...data,
      usable: document.getElementById("meetingUsable").value,
      remote: document.getElementById("meetingRemote").value,
      googleMeetDevice: document.getElementById("meetingGoogleMeet").value,
      focusRoomMonitor: document.getElementById("meetingFocusMonitor").value,
      crestronStatus: document.getElementById("meetingCrestron").value,
      tvSize: document.getElementById("meetingTvSize").value,
      extraAVDevice: document.getElementById("meetingExtraAV").value,
    };
  } else if (itemType === "Printer") {
    data = {
      ...data,
      modelFamily: _resolvePrinterFamily(),
      modelSpecific: document.getElementById("printerModelSpecific").value,
      serialNumber: document.getElementById("printerSerial").value,
      ipAddress: document.getElementById("printerIP").value,
      macAddress: document.getElementById("printerMAC").value,
      printerNameRemote: document.getElementById("printerNameRemote").value,
      reachable: document.getElementById("printerReachable").value,
      printPossible: document.getElementById("printerPrintPossible").value,
      locationCorrect: document.getElementById("printerLocationCorrect").value,
    };
  }

  // Clear stored Jira ticket when desk is marked inspected — clean slate
  if (data.status === "inspected") {
    data.jiraTicket = firebase.firestore.FieldValue.delete();
    data.jiraTicketAt = firebase.firestore.FieldValue.delete();
  }

  db.collection("inspections")
    .doc(itemId)
    .set(data, { merge: true })
    .then(() => {
      desksData[itemId] = data;
      delete desksData[itemId].jiraTicket;
      delete desksData[itemId].jiraTicketAt;

      // Write history entry (fire-and-forget)
      writeHistoryEntry(itemId, oldData, data, "save");

      closeModal();
      renderFloorPlan();
      updateStats();
      updateDashboard();
    })
    .catch((error) => {
      alert("Error: " + error.message);
    });
}

// Backdrop close
window.onclick = function (event) {
  const modal = document.getElementById("deskModal");
  if (event.target === modal) {
    closeModal();
  }
};
