// inspection-modal.js
// Type-aware inspection modal: Desk, MeetingRoom, ServerRoom
// Replaces: desk-modal.js
// Depends on globals: desksData, currentFloor, currentUser, db, selectedDesks
// Calls: renderFloorPlan(), updateStats(), updateDashboard(), clearSelection()

// ─── Equipment option lists ───────────────────────────────────────────────────

const EQUIPMENT = {
  MONITORS: [
    'T24i-10 (round)',
    'T24i-10 (rectangle)',
    'T24i-20/2L (Round)',
    'T24i-20/2L (rectangle)',
    'T24d-10 (bigger aspect ratio Round)',
    'T24d-10 (bigger aspect ratio Rectangle)',
    'Dell U2422HE (Silver)',
    'Dell U2422H (Silver)',
    'Dell P2422HE (Black)',
    'Dell P2422H (Black)',
    'Lenovo AIO (camera)',
    'Lenovo AIO (NO camera)',
    'Dell U2717D',
    'No Monitor',
    'Not in the list',
  ],
  DOCKS: [
    'Dell Docking Station (old)',
    'Lenovo USB-C Dock (small)',
    'Thinkpad Thunderbolt 3 G1',
    'Thinkpad Thunderbolt 3 G2',
    'No Docking Station',
    'Dock integrated in Dell Monitor',
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _buildSelectOptions(items, savedValue) {
  return items.map(item =>
    `<option value="${item}" ${savedValue === item ? 'selected' : ''}>${item}</option>`
  ).join('\n                        ');
}

function _statusOptions(saved) {
  return `
    <option value="pending"   ${!saved || saved === 'pending'   ? 'selected' : ''}>Pending</option>
    <option value="inspected" ${saved === 'inspected'           ? 'selected' : ''}>✅ OK - No Issues</option>
    <option value="issue"     ${saved === 'issue'               ? 'selected' : ''}>❌ Issue Found</option>
  `;
}

// ─── Form renderers (one per type) ───────────────────────────────────────────


// ─── Status → checklist behaviour ────────────────────────────────────────────
// Mandatory items are locked when status is OK; optional items (Keyboard, Mouse)
// are never locked so desks without them can still be marked OK.
const MANDATORY_CHECKS = ['checkPower', 'checkLAN', 'checkMon1', 'checkMon2', 'checkTBT', 'checkDocking'];

function onStatusChange(status) {
  const isOK = status === 'inspected';
  MANDATORY_CHECKS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) { return; }
    if (isOK) {
      el.checked  = true;   // auto-check
      el.disabled = true;   // lock — can't uncheck a mandatory item when OK
    } else {
      el.disabled = false;  // unlock — user can edit freely for pending/issue
    }
  });
}

function _renderDeskForm(itemId, d) {
  const locked = d.status === 'inspected'; // mandatory items lock when OK
  return `
    <input type="hidden" id="currentItemId" value="${itemId}">
    <input type="hidden" id="currentItemType" value="Desk">

    <!-- Equipment Checklist -->
    <div class="checklist-section">
      <h3>⚡ Equipment Checklist</h3>
      <p class="checklist-hint">Mandatory items lock automatically when status is set to OK.</p>
      <div class="checkbox-grid">
        <div class="checkbox-item">
          <input type="checkbox" id="checkPower"    ${d.checkPower    ? 'checked' : ''} ${locked ? 'disabled' : ''}><label for="checkPower">Power</label>
        </div>
        <div class="checkbox-item">
          <input type="checkbox" id="checkLAN"      ${d.checkLAN      ? 'checked' : ''} ${locked ? 'disabled' : ''}><label for="checkLAN">LAN</label>
        </div>
        <div class="checkbox-item">
          <input type="checkbox" id="checkMon1"     ${d.checkMon1     ? 'checked' : ''} ${locked ? 'disabled' : ''}><label for="checkMon1">Mon 1</label>
        </div>
        <div class="checkbox-item">
          <input type="checkbox" id="checkMon2"     ${d.checkMon2     ? 'checked' : ''} ${locked ? 'disabled' : ''}><label for="checkMon2">Mon 2</label>
        </div>
        <div class="checkbox-item">
          <input type="checkbox" id="checkTBT"      ${d.checkTBT      ? 'checked' : ''} ${locked ? 'disabled' : ''}><label for="checkTBT">TBT</label>
        </div>
        <div class="checkbox-item optional-item">
          <input type="checkbox" id="checkKeyboard" ${d.checkKeyboard ? 'checked' : ''}><label for="checkKeyboard">Keyboard <span class="optional-tag">optional</span></label>
        </div>
        <div class="checkbox-item">
          <input type="checkbox" id="checkDocking"  ${d.checkDocking  ? 'checked' : ''} ${locked ? 'disabled' : ''}><label for="checkDocking">Docking</label>
        </div>
        <div class="checkbox-item optional-item">
          <input type="checkbox" id="checkMouse"    ${d.checkMouse    ? 'checked' : ''}><label for="checkMouse">Mouse <span class="optional-tag">optional</span></label>
        </div>
      </div>
    </div>

    <!-- Equipment Details -->
    <div class="checklist-section">
      <h3>📋 Equipment Details</h3>
      <div class="form-group">
        <label>Left Monitor</label>
        <select id="deskLeftMonitor">
          <option value="">-- Select --</option>
          ${_buildSelectOptions(EQUIPMENT.MONITORS, d.leftMonitor || '')}
        </select>
      </div>
      <div class="form-group">
        <label>Dock</label>
        <select id="deskDock">
          <option value="">-- Select --</option>
          ${_buildSelectOptions(EQUIPMENT.DOCKS, d.dock || '')}
        </select>
      </div>
      <div class="form-group">
        <label>Right Monitor</label>
        <select id="deskRightMonitor">
          <option value="">-- Select --</option>
          ${_buildSelectOptions(EQUIPMENT.MONITORS, d.rightMonitor || '')}
        </select>
      </div>
    </div>

    <!-- Status & Notes -->
    <div class="checklist-section">
      <h3>📝 Status & Notes</h3>
      <div class="form-group">
        <label>Status</label>
        <select id="itemStatus" onchange="onStatusChange(this.value)">${_statusOptions(d.status)}</select>
      </div>
      <div class="form-group">
        <label>Remarks</label>
        <textarea id="itemRemarks" placeholder="Add any observations, issues, or notes...">${d.remarks || ''}</textarea>
      </div>
    </div>
  `;
}

function _renderMeetingRoomForm(itemId, d) {
  return `
    <input type="hidden" id="currentItemId" value="${itemId}">
    <input type="hidden" id="currentItemType" value="MeetingRoom">

    <!-- AV Equipment Checklist -->
    <div class="checklist-section">
      <h3>📺 AV Equipment</h3>
      <div class="checkbox-grid">
        <div class="checkbox-item">
          <input type="checkbox" id="checkMic"        ${d.checkMic        ? 'checked' : ''}><label for="checkMic">Mic</label>
        </div>
        <div class="checkbox-item">
          <input type="checkbox" id="checkSpeakers"   ${d.checkSpeakers   ? 'checked' : ''}><label for="checkSpeakers">Speakers</label>
        </div>
        <div class="checkbox-item">
          <input type="checkbox" id="checkCamera"     ${d.checkCamera     ? 'checked' : ''}><label for="checkCamera">Camera</label>
        </div>
        <div class="checkbox-item">
          <input type="checkbox" id="checkWhiteboard" ${d.checkWhiteboard ? 'checked' : ''}><label for="checkWhiteboard">Whiteboard</label>
        </div>
      </div>
    </div>

    <!-- Room Details -->
    <div class="checklist-section">
      <h3>📋 Room Details</h3>
      <div class="form-group">
        <label>TV Size</label>
        <input type="text" id="meetingTvSize" value="${d.tvSize || ''}" placeholder="e.g., 65 inch">
      </div>
      <div class="form-group">
        <label>Capacity</label>
        <input type="number" id="meetingCapacity" value="${d.capacity || ''}" placeholder="e.g., 8" min="1" max="100">
      </div>
    </div>

    <!-- Status & Notes -->
    <div class="checklist-section">
      <h3>📝 Status & Notes</h3>
      <div class="form-group">
        <label>Status</label>
        <select id="itemStatus">${_statusOptions(d.status)}</select>
      </div>
      <div class="form-group">
        <label>Remarks</label>
        <textarea id="itemRemarks" placeholder="Add any observations, issues, or notes...">${d.remarks || ''}</textarea>
      </div>
    </div>
  `;
}

function _renderServerRoomForm(itemId, d) {
  return `
    <input type="hidden" id="currentItemId" value="${itemId}">
    <input type="hidden" id="currentItemType" value="ServerRoom">

    <!-- Status & Notes -->
    <div class="checklist-section">
      <h3>📝 Notes</h3>
      <div class="form-group">
        <label>Status</label>
        <select id="itemStatus">${_statusOptions(d.status)}</select>
      </div>
      <div class="form-group">
        <label>Remarks</label>
        <textarea id="itemRemarks" placeholder="Add observations, temperature, any issues...">${d.remarks || ''}</textarea>
      </div>
    </div>
  `;
}

// ─── Main public functions ────────────────────────────────────────────────────

function openInspectionModal(itemId) {
  const modal     = document.getElementById('deskModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody  = document.getElementById('modalBody');

  const itemData = desksData[itemId] || {};
  const item     = currentFloor.desks.find(d => d.id === itemId);
  const itemType = item?.type || 'Desk';

  // Set title by type
  if (itemType === 'MeetingRoom') {
    modalTitle.textContent = `Inspecting Meeting Room: ${item?.number || itemId}`;
  } else if (itemType === 'ServerRoom') {
    modalTitle.textContent = `Inspecting Server Room: ${item?.number || itemId}`;
  } else {
    modalTitle.textContent = `Inspecting: ${item?.number || itemId}`;
  }

  // Render form by type
  if (itemType === 'MeetingRoom') {
    modalBody.innerHTML = _renderMeetingRoomForm(itemId, itemData);
  } else if (itemType === 'ServerRoom') {
    modalBody.innerHTML = _renderServerRoomForm(itemId, itemData);
  } else {
    modalBody.innerHTML = _renderDeskForm(itemId, itemData);
  }

  modal.style.display = 'block';
}

function closeModal() {
  document.getElementById('deskModal').style.display = 'none';
}

function saveInspectionData() {
  const itemId   = document.getElementById('currentItemId')?.value;
  const itemType = document.getElementById('currentItemType')?.value;

  if (!itemId) {
    // Bulk edit mode (saveDeskData legacy path — bulk modal has no currentItemId)
    const bulkData = {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.email,
    };

    const leftScreen  = document.getElementById('bulkLeftScreen')?.value;
    const dock        = document.getElementById('bulkDock')?.value;
    const rightScreen = document.getElementById('bulkRightScreen')?.value;
    const remarks     = document.getElementById('bulkRemarks')?.value;

    const bulkStatus = document.getElementById('bulkStatus')?.value;

    if (bulkStatus)  bulkData.status      = bulkStatus;
    if (leftScreen)  bulkData.leftScreen  = leftScreen;
    if (dock)        bulkData.dock        = dock;
    if (rightScreen) bulkData.rightScreen = rightScreen;
    if (remarks)     bulkData.remarks     = remarks;

    // Only write checkbox states if user explicitly enabled the checklist toggle
    const applyChecks = document.getElementById('bulkApplyChecks')?.checked;
    if (applyChecks) {
      bulkData.checkPower    = document.getElementById('bulkCheckPower')?.checked    ?? false;
      bulkData.checkLAN      = document.getElementById('bulkCheckLAN')?.checked      ?? false;
      bulkData.checkMon1     = document.getElementById('bulkCheckMon1')?.checked     ?? false;
      bulkData.checkMon2     = document.getElementById('bulkCheckMon2')?.checked     ?? false;
      bulkData.checkTBT      = document.getElementById('bulkCheckTBT')?.checked      ?? false;
      bulkData.checkKeyboard = document.getElementById('bulkCheckKeyboard')?.checked ?? false;
      bulkData.checkDocking  = document.getElementById('bulkCheckDocking')?.checked  ?? false;
      bulkData.checkMouse    = document.getElementById('bulkCheckMouse')?.checked    ?? false;
    }

    const batch = db.batch();
    selectedDesks.forEach(id => {
      const ref = db.collection('desks').doc(id);
      batch.set(ref, bulkData, { merge: true });
      desksData[id] = { ...desksData[id], ...bulkData };
    });

    batch.commit()
      .then(() => {
        console.log('✅ Bulk updated');
        closeModal();
        renderFloorPlan();
        updateStats();
        clearSelection();
      })
      .catch(error => { alert('Error: ' + error.message); });

    return;
  }

  // Single item save — branch by type
  let data = {
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser.email,
    status:    document.getElementById('itemStatus').value,
    remarks:   document.getElementById('itemRemarks').value,
  };

  if (itemType === 'Desk') {
    data = {
      ...data,
      leftMonitor:   document.getElementById('deskLeftMonitor').value,
      dock:          document.getElementById('deskDock').value,
      rightMonitor:  document.getElementById('deskRightMonitor').value,
      checkPower:    document.getElementById('checkPower').checked,
      checkLAN:      document.getElementById('checkLAN').checked,
      checkMon1:     document.getElementById('checkMon1').checked,
      checkMon2:     document.getElementById('checkMon2').checked,
      checkTBT:      document.getElementById('checkTBT').checked,
      checkKeyboard: document.getElementById('checkKeyboard').checked,
      checkDocking:  document.getElementById('checkDocking').checked,
      checkMouse:    document.getElementById('checkMouse').checked,
    };
  } else if (itemType === 'MeetingRoom') {
    data = {
      ...data,
      tvSize:         document.getElementById('meetingTvSize').value,
      capacity:       document.getElementById('meetingCapacity').value,
      checkMic:        document.getElementById('checkMic').checked,
      checkSpeakers:   document.getElementById('checkSpeakers').checked,
      checkCamera:     document.getElementById('checkCamera').checked,
      checkWhiteboard: document.getElementById('checkWhiteboard').checked,
    };
  }
  // ServerRoom: just status + remarks (already in data)

  db.collection('desks').doc(itemId).set(data, { merge: true })
    .then(() => {
      desksData[itemId] = data;
      console.log('✅ Saved:', itemType, itemId);
      closeModal();
      renderFloorPlan();
      updateStats();
      updateDashboard();
    })
    .catch(error => { alert('Error: ' + error.message); });
}

// Backdrop close
window.onclick = function(event) {
  const modal = document.getElementById('deskModal');
  if (event.target === modal) {
    closeModal();
  }
};
