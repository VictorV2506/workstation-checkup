// Admin Panel Management
var isDragMode = false;
var _drag = null; // { marker, number, origX, origY, startMX, startMY, currentX, currentY, moved }
var _dragListenersReady = false;
var _dragJustFinished = false;

function toggleAdminPanel() {
  var panel = document.getElementById("adminPanel");
  if (!panel) return;

  // Get computed style, not inline style
  var currentDisplay = window.getComputedStyle(panel).display;
  var isVisible = currentDisplay !== "none";

  if (!isVisible) {
    // Reveal the superadmin-only Office Management tab when opening.
    // Cosmetic gate only — the offices write rule is the real enforcement.
    var officesTabBtn = document.getElementById("adminTabOfficesBtn");
    if (officesTabBtn) {
      officesTabBtn.style.display =
        typeof isSuperAdmin !== "undefined" && isSuperAdmin ? "" : "none";
    }
  }

  panel.style.display = isVisible ? "none" : "block";
}

function switchAdminTab(tabName) {
  // Update tab buttons
  var tabs = document.querySelectorAll(".admin-tab");
  tabs.forEach(function (tab) {
    tab.classList.remove("active");
  });
  event.target.classList.add("active");

  // Update tab panels
  var panels = document.querySelectorAll(".admin-tab-panel");
  panels.forEach(function (panel) {
    panel.classList.remove("active");
  });
  document
    .getElementById(
      "adminTab" + tabName.charAt(0).toUpperCase() + tabName.slice(1),
    )
    .classList.add("active");

  // Load users when switching to users tab
  if (tabName === "users") {
    loadUsersList();
  }
  // Render offices when switching to the Office Management tab
  if (tabName === "offices") {
    renderOfficesAdmin();
  }
}

// Placeholder functions (Phase 3)
function startAddMarker() {
  if (!isEditMode) {
    alert("Enable Edit Mode first before adding markers.");
    return;
  }
  if (!currentFloor) {
    alert("Please select a floor first!");
    return;
  }

  // Reset form
  document.getElementById("markerType").value = "Desk";
  document.getElementById("markerName").value = "";

  // Show modal
  var modal = document.getElementById("addMarkerModal");
  modal.classList.add("active");
}

function cancelAddMarker() {
  var modal = document.getElementById("addMarkerModal");
  modal.classList.remove("active");
  isAddingMarker = false;
  pendingMarker = null;
  document.body.style.cursor = "default";
}

function confirmAddMarker() {
  var type = document.getElementById("markerType").value;
  var name = document.getElementById("markerName").value.trim();

  // Validation
  if (!name) {
    alert("Please enter a marker name!");
    return;
  }

  // Store pending marker data
  pendingMarker = {
    type: type,
    name: name,
  };

  // Close modal
  var modal = document.getElementById("addMarkerModal");
  modal.classList.remove("active");

  // Enter "click to place" mode
  isAddingMarker = true;
  document.body.style.cursor = "crosshair";

  alert("Click anywhere on the floor plan to place the marker");
}

function handleMapClickForMarker(event) {
  if (isDragMode) return;
  if (!isAddingMarker || !pendingMarker) return;

  // Get click coordinates relative to floor plan
  var floorPlan = document.getElementById("floorPlan");
  var rect = floorPlan.getBoundingClientRect();

  var x = Math.round((event.clientX - rect.left) / currentZoom);
  var y = Math.round((event.clientY - rect.top) / currentZoom);

  // Validate coordinates are within bounds
  if (x < 0 || x > currentFloor.width || y < 0 || y > currentFloor.height) {
    alert("Click inside the floor plan!");
    return;
  }

  // Generate unique ID
  var newId = currentFloor.id + "_" + pendingMarker.name.replace(/\s+/g, "_");

  // Check if ID already exists
  var exists = currentFloor.desks.find(function (d) {
    return d.id === newId;
  });
  if (exists) {
    alert("A marker with this name already exists! Use a different name.");
    return;
  }

  // Create new marker object
  var newMarker = {
    id: newId,
    number: pendingMarker.name,
    type: pendingMarker.type,
    x: x,
    y: y,
  };

  // Optimistically add to local state
  currentFloor.desks.push(newMarker);

  // Persist to Firestore
  db.collection("floors")
    .doc(currentFloor.id)
    .update({
      desks: currentFloor.desks,
    })
    .then(function () {
      console.log("✓ Marker saved to Firestore:", newMarker);
      renderFloorPlan();
      isAddingMarker = false;
      pendingMarker = null;
      document.body.style.cursor = "default";
      alert("✅ Marker added and saved!");
    })
    .catch(function (error) {
      console.error("Error saving marker:", error);
      currentFloor.desks.pop(); // rollback
      alert("❌ Failed to save marker. Check console.");
    });
}

// ========== DELETE MARKER ==========

function deleteMarker(markerId) {
  if (
    !confirm(
      "Delete this marker? This cannot be undone until you refresh the page.",
    )
  ) {
    return;
  }

  // Find and remove from current floor data
  var index = currentFloor.desks.findIndex(function (d) {
    return d.id === markerId;
  });

  if (index !== -1) {
    var deleted = currentFloor.desks.splice(index, 1)[0];

    db.collection("floors")
      .doc(currentFloor.id)
      .update({
        desks: currentFloor.desks,
      })
      .then(function () {
        console.log("✓ Marker deleted from Firestore:", deleted);
        renderFloorPlan();
        alert("✅ Marker deleted and saved!");
      })
      .catch(function (error) {
        console.error("Error deleting marker:", error);
        currentFloor.desks.splice(index, 0, deleted); // rollback
        alert("❌ Failed to delete marker. Check console.");
      });
  }
}

// ── Edit Mode Toggle ──────────────────────────────────────────
function toggleEditMode() {
  isEditMode = !isEditMode;

  var btn = document.getElementById("editModeBtn");
  var floorPlan = document.getElementById("floorPlan");

  if (isEditMode) {
    btn.innerHTML = "🔓 Disable Edit Mode";
    btn.style.background = "#ef4444";
    if (floorPlan) floorPlan.classList.add("edit-mode");
    console.log("✓ Edit mode enabled");
  } else {
    btn.innerHTML = "🔒 Enable Edit Mode";
    btn.style.background = "";
    if (floorPlan) floorPlan.classList.remove("edit-mode");
    // Cancel any in-progress marker placement
    if (isAddingMarker) {
      isAddingMarker = false;
      pendingMarker = null;
      document.body.style.cursor = "default";
    }

    if (isDragMode) {
      isDragMode = false;
      var dragBtn = document.getElementById("dragModeBtn");
      if (dragBtn) {
        dragBtn.textContent = "🖐️ Drag Markers";
        dragBtn.classList.remove("drag-active");
      }
      if (floorPlan) floorPlan.classList.remove("drag-mode-active");
      if (_drag) _cancelDrag();
    }

    console.log("✓ Edit mode disabled");
  }
}

// ── Drag Mode ──────────────────────────────────────────────
function toggleDragMode() {
  if (!isEditMode) {
    alert("Enable Edit Mode first before dragging markers.");
    return;
  }
  // Lazy-init: attach listeners once, the first time drag mode is used
  if (!_dragListenersReady) {
    _initDragListeners();
    _dragListenersReady = true;
  }

  isDragMode = !isDragMode;

  var btn = document.getElementById("dragModeBtn");
  var fp = document.getElementById("floorPlan");

  if (isDragMode) {
    btn.textContent = "🖐️ Stop Dragging";
    btn.classList.add("drag-active");
    if (fp) fp.classList.add("drag-mode-active");
  } else {
    btn.textContent = "🖐️ Drag Markers";
    btn.classList.remove("drag-active");
    if (fp) fp.classList.remove("drag-mode-active");
    if (_drag) _cancelDrag();
  }
}

function _initDragListeners() {
  // mousedown — event delegation: works even after renderFloorPlan() re-creates markers
  document.addEventListener("mousedown", function (e) {
    if (!isDragMode) return;
    var marker = e.target.closest(
      ".desk-marker, .meeting-marker, .server-marker",
    );
    if (!marker) return;

    e.preventDefault();
    e.stopPropagation();

    _drag = {
      marker: marker,
      number: marker.dataset.deskId, // item.number — the human-readable ID
      origX: parseFloat(marker.style.left),
      origY: parseFloat(marker.style.top),
      startMX: e.clientX,
      startMY: e.clientY,
      moved: false,
    };

    marker.classList.add("marker-dragging");
  });

  // mousemove — update marker position live while dragging
  document.addEventListener("mousemove", function (e) {
    if (!_drag) return;

    var dx = (e.clientX - _drag.startMX) / currentZoom;
    var dy = (e.clientY - _drag.startMY) / currentZoom;

    _drag.currentX = Math.round(_drag.origX + dx);
    _drag.currentY = Math.round(_drag.origY + dy);

    _drag.marker.style.left = _drag.currentX + "px";
    _drag.marker.style.top = _drag.currentY + "px";
    _drag.moved = true;
  });

  // mouseup — save to Firestore if position changed
  document.addEventListener("mouseup", function (e) {
    if (!_drag) return;

    _drag.marker.classList.remove("marker-dragging");

    // No movement — was a click, not a drag; do nothing
    if (!_drag.moved) {
      _drag = null;
      return;
    }
    _dragJustFinished = true;

    var marker = _drag.marker;
    var number = _drag.number;
    var newX = _drag.currentX;
    var newY = _drag.currentY;
    var savedX = _drag.origX;
    var savedY = _drag.origY;
    _drag = null;

    // Find desk by number (not UUID) — per app convention
    var desk = currentFloor.desks.find(function (d) {
      return d.number === number;
    });
    if (!desk) {
      console.error("Drag: desk not found:", number);
      return;
    }

    // Optimistic update in memory
    desk.x = newX;
    desk.y = newY;

    // Persist — same pattern as handleMapClickForMarker and deleteMarker
    db.collection("floors")
      .doc(currentFloor.id)
      .update({
        desks: currentFloor.desks,
      })
      .then(function () {
        console.log("✓ Position saved:", number, newX, newY);
      })
      .catch(function (error) {
        console.error("Drag save failed:", error);
        // Rollback memory + visual
        desk.x = savedX;
        desk.y = savedY;
        marker.style.left = savedX + "px";
        marker.style.top = savedY + "px";
        alert("❌ Failed to save position. Try again.");
      });
  });

  // Escape — cancel active drag and snap back
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && _drag) _cancelDrag();
  });

  document.addEventListener(
    "click",
    function (e) {
      if (!_dragJustFinished) return;
      _dragJustFinished = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
}

function _cancelDrag() {
  if (!_drag) return;
  _drag.marker.style.left = _drag.origX + "px";
  _drag.marker.style.top = _drag.origY + "px";
  _drag.marker.classList.remove("marker-dragging");
  _drag = null;
}

// ========== EXPORT JSON ==========

function exportFloorsData() {
  // Create JSON string with proper formatting
  var jsonString = JSON.stringify(floorConfigs, null, 2);

  // Create blob
  var blob = new Blob([jsonString], { type: "application/json" });

  // Create download link
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "floors_data_modified.json";

  // Trigger download
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log("✓ JSON exported");
  alert(
    "JSON file downloaded! Replace the old floors_data.json with this file.",
  );
}

function importFloorsData() {
  alert("Import functionality coming in Phase 3!");
}

// Load all users (from 'users' collection) and cross-reference with
// 'admins' to determine roles. Renders sorted: superadmin > admin > user.
function loadUsersList() {
  var userList = document.getElementById("userList");
  if (!userList) return;

  _injectUserMgmtStyles();
  userList.innerHTML = '<li class="uml-state">Loading users...</li>';

  Promise.all([db.collection("users").get(), db.collection("admins").get()])
    .then(function (results) {
      var usersSnap = results[0];
      var adminsSnap = results[1];

      // role map: email -> role string
      var roleMap = {};
      adminsSnap.forEach(function (doc) {
        roleMap[doc.id] = (doc.data().role || "admin").trim();
      });

      // user data map: email -> Firestore data
      var userData = {};
      usersSnap.forEach(function (doc) {
        userData[doc.id] = doc.data();
      });

      // merge both sets so admins who have not logged in yet still appear
      var allEmails = new Set(
        Object.keys(userData).concat(Object.keys(roleMap)),
      );

      if (allEmails.size === 0) {
        userList.innerHTML = '<li class="uml-state">No users found.</li>';
        return;
      }

      var ORDER = { superadmin: 0, admin: 1, user: 2 };
      var users = [];
      allEmails.forEach(function (email) {
        var data = userData[email] || {};
        users.push({
          email: email,
          displayName: data.displayName || email,
          photoURL: data.photoURL || "",
          role: roleMap[email] || "user",
        });
      });

      // sort: superadmin first, then admin, then user; alpha within each group
      users.sort(function (a, b) {
        var ro =
          (ORDER[a.role] !== undefined ? ORDER[a.role] : 2) -
          (ORDER[b.role] !== undefined ? ORDER[b.role] : 2);
        if (ro !== 0) return ro;
        return a.displayName.localeCompare(b.displayName);
      });

      userList.innerHTML = "";
      users.forEach(function (u) {
        userList.appendChild(_buildUserRow(u));
      });
    })
    .catch(function (err) {
      console.error("loadUsersList error:", err);
      userList.innerHTML =
        '<li class="uml-state uml-state--error">Error loading users: ' +
        err.message +
        "</li>";
    });
}

function _buildUserRow(user) {
  var isSelf = currentUser && currentUser.email === user.email;
  var isSuperAdmin = user.role === "superadmin";
  var isAdminRole = user.role === "admin";

  var li = document.createElement("li");
  li.className = "uml-row" + (isSelf ? " uml-row--self" : "");

  // Avatar
  var avatar = document.createElement("div");
  avatar.className = "uml-avatar";
  if (user.photoURL) {
    var img = document.createElement("img");
    img.src = user.photoURL;
    img.alt = user.displayName;
    img.onerror = function () {
      this.style.display = "none";
      avatar.textContent = (user.displayName || "?")[0].toUpperCase();
    };
    avatar.appendChild(img);
  } else {
    avatar.textContent = (user.displayName || "?")[0].toUpperCase();
  }
  li.appendChild(avatar);

  // Name + email
  var info = document.createElement("div");
  info.className = "uml-info";
  var name = document.createElement("div");
  name.className = "uml-name";
  name.textContent = user.displayName + (isSelf ? " (you)" : "");
  var emailEl = document.createElement("div");
  emailEl.className = "uml-email";
  emailEl.textContent = user.email;
  info.appendChild(name);
  info.appendChild(emailEl);
  li.appendChild(info);

  // Role badge
  var badge = document.createElement("span");
  if (isSuperAdmin) {
    badge.className = "uml-badge uml-badge--superadmin";
    badge.textContent = "Owner";
  } else if (isAdminRole) {
    badge.className = "uml-badge uml-badge--admin";
    badge.textContent = "Admin";
  } else {
    badge.className = "uml-badge uml-badge--user";
    badge.textContent = "User";
  }
  li.appendChild(badge);

  // Action button
  // superadmin: spacer only — no button, ever
  // admin:      Remove Admin (red)
  // user:       Make Admin   (blue)
  if (isSuperAdmin) {
    var spacer = document.createElement("div");
    spacer.className = "uml-btn-spacer";
    li.appendChild(spacer);
  } else {
    var btn = document.createElement("button");
    if (isAdminRole) {
      btn.className = "uml-btn uml-btn--remove";
      btn.textContent = "Remove Admin";
      btn.onclick = (function (e, d) {
        return function () {
          removeAdmin(e, d);
        };
      })(user.email, user.displayName);
    } else {
      btn.className = "uml-btn uml-btn--make";
      btn.textContent = "Make Admin";
      btn.onclick = (function (e, d) {
        return function () {
          makeAdmin(e, d);
        };
      })(user.email, user.displayName);
    }
    li.appendChild(btn);
  }

  return li;
}

// Grant admin access — creates admins/{email} with role: 'admin'.
// Firestore rule blocks setting role: 'superadmin' from the client.
function makeAdmin(email, displayName) {
  if (!isAdmin) return;
  if (
    !confirm(
      "Grant admin access to " +
        displayName +
        "?\n\n" +
        "They will be able to manage floor maps and other users.",
    )
  )
    return;

  db.collection("admins")
    .doc(email)
    .set({ role: "admin" })
    .then(function () {
      console.log("Admin granted to", email);
      loadUsersList();
    })
    .catch(function (err) {
      console.error("makeAdmin error:", err);
      alert("Could not grant admin access: " + err.message);
    });
}

// Revoke admin access — deletes admins/{email}.
// Firestore rule blocks deletion if resource.data.role == 'superadmin'.
function removeAdmin(email, displayName) {
  if (!isAdmin) return;

  var isSelf = currentUser && currentUser.email === email;
  var msg = "Remove admin access from " + displayName + "?";
  if (isSelf) {
    msg +=
      "\n\nWarning: you are removing your own admin access.\n" +
      "The Admin Panel will close immediately.";
  }
  if (!confirm(msg)) return;

  db.collection("admins")
    .doc(email)
    .delete()
    .then(function () {
      console.log("Admin removed for", email);
      if (isSelf) {
        isAdmin = false;
        currentUserAdminRole = "";
        hideAdminPanel();
      }
      loadUsersList();
    })
    .catch(function (err) {
      console.error("removeAdmin error:", err);
      if (err.code === "permission-denied") {
        alert("Cannot remove this user — they are a protected Owner.");
      } else {
        alert("Could not remove admin access: " + err.message);
      }
    });
}

// Injects user management CSS into <head> once on first tab open.
function _injectUserMgmtStyles() {
  if (document.getElementById("uml-styles")) return;
  var style = document.createElement("style");
  style.id = "uml-styles";
  style.textContent = [
    ".user-list { list-style:none; margin:0; padding:0; }",
    ".uml-state { text-align:center; color:#9ca3af; padding:24px 16px; font-size:13px; }",
    ".uml-state--error { color:#f43f5e; }",
    ".uml-row { display:flex; align-items:center; gap:10px; padding:10px 16px; border-bottom:1px solid #f3f4f6; }",
    ".uml-row:last-child { border-bottom:none; }",
    ".uml-row--self { background:#fafafa; }",
    ".uml-avatar { width:36px; height:36px; border-radius:50%; background:#667eea; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px; overflow:hidden; flex-shrink:0; }",
    ".uml-avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; }",
    ".uml-info { flex:1; min-width:0; }",
    ".uml-name  { font-size:13px; font-weight:600; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }",
    ".uml-email { font-size:11px; color:#9ca3af; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }",
    ".uml-badge { font-size:11px; font-weight:600; padding:3px 9px; border-radius:12px; white-space:nowrap; flex-shrink:0; }",
    ".uml-badge--superadmin { background:#f3e8ff; color:#7c3aed; }",
    ".uml-badge--admin      { background:#dbeafe; color:#1d4ed8; }",
    ".uml-badge--user       { background:#f3f4f6; color:#6b7280; }",
    ".uml-btn { font-size:11px; font-weight:600; padding:5px 10px; border-radius:6px; border:none; cursor:pointer; white-space:nowrap; flex-shrink:0; transition:background 0.15s; }",
    ".uml-btn--make         { background:#667eea; color:#fff; }",
    ".uml-btn--make:hover   { background:#5a67d8; }",
    ".uml-btn--remove       { background:#fee2e2; color:#dc2626; }",
    ".uml-btn--remove:hover { background:#fecaca; }",
    ".uml-btn-spacer { width:90px; flex-shrink:0; }",
  ].join("\n");
  document.head.appendChild(style);
}

// =============================================================================
// RESET ALL TO PENDING
// =============================================================================
//
// Resets every inspectable item (Desk, MeetingRoom, ServerRoom) to pending.
//
// KEPT:    leftMonitor, rightMonitor, dock (physical hardware, does not change)
// CLEARED: status, remarks, all check fields, all AV fields
//
// Uses set(..., { merge: true }) so hardware fields are untouched in Firestore.
// Logs ONE summary entry to history (not one per desk).
// Chunks into batches of 490 to stay under Firestore's 500-op limit.

function resetAllToPending() {
  if (!isAdmin) return;

  // Build full list of inspectable items from floorConfigs (all floors)
  if (!Array.isArray(floorConfigs) || floorConfigs.length === 0) {
    alert("No floor data loaded. Please wait for data to load and try again.");
    return;
  }

  var allItems = [];
  var counts = { Desk: 0, MeetingRoom: 0, ServerRoom: 0 };
  var TYPES = { Desk: true, MeetingRoom: true, ServerRoom: true };

  floorConfigs.forEach(function (floor) {
    floor.desks.forEach(function (desk) {
      var type = desk.type || "Desk";
      if (!TYPES[type] || !desk.number) return;
      allItems.push({ number: desk.number, type: type });
      counts[type]++;
    });
  });

  var total = allItems.length;
  if (total === 0) {
    alert("No inspectable items found.");
    return;
  }

  // Two-line confirm -- clear about what is preserved
  if (
    !confirm(
      "RESET ALL " +
        total +
        " ITEMS TO PENDING?\n\n" +
        "  Desks:         " +
        counts.Desk +
        "\n" +
        "  Meeting Rooms: " +
        counts.MeetingRoom +
        "\n" +
        "  Server Rooms:  " +
        counts.ServerRoom +
        "\n\n" +
        "CLEARED: status, checkboxes, remarks, AV fields\n" +
        "KEPT:    monitor and dock hardware records\n\n" +
        "This cannot be undone.",
    )
  )
    return;

  var updatedBy = (currentUser ? currentUser.email : "admin") + " (full reset)";
  var now = firebase.firestore.FieldValue.serverTimestamp();

  // Return the reset payload for a given item type.
  // Hardware fields are intentionally absent -- merge leaves them untouched.
  function _payload(type) {
    var base = {
      status: "pending",
      remarks: "",
      updatedAt: now,
      updatedBy: updatedBy,
    };

    if (type === "Desk") {
      return Object.assign({}, base, {
        checkPower: false,
        checkLAN: false,
        checkMon1: false,
        checkMon2: false,
        checkTBT: false,
        checkKeyboard: false,
        checkDocking: false,
        checkMouse: false,
      });
    }

    if (type === "MeetingRoom") {
      return Object.assign({}, base, {
        usable: "",
        remote: "",
        googleMeetDevice: "",
        focusRoomMonitor: "",
        crestronStatus: "",
        tvSize: "",
        extraAVDevice: "",
      });
    }

    // ServerRoom -- status + remarks only
    return base;
  }

  // Batch writes in chunks of 490 (Firestore limit = 500 ops per batch)
  var CHUNK = 490;
  var batches = [];
  var memUpdates = [];

  for (var i = 0; i < allItems.length; i += CHUNK) {
    var chunk = allItems.slice(i, i + CHUNK);
    var batch = db.batch();
    chunk.forEach(function (item) {
      var p = _payload(item.type);
      batch.set(db.collection("inspections").doc(item.number), p, {
        merge: true,
      });
      memUpdates.push({ number: item.number, payload: p });
    });
    batches.push(batch.commit());
  }

  Promise.all(batches)
    .then(function () {
      // Update desksData in memory.
      // Object.assign order: existing data first, then reset payload.
      // This preserves hardware fields (leftMonitor etc.) that are not
      // in the reset payload.
      var memNow = new Date();
      memUpdates.forEach(function (u) {
        desksData[u.number] = Object.assign(
          {},
          desksData[u.number] || {},
          u.payload,
          { updatedAt: memNow }, // replace sentinel with real date for memory
        );
      });

      // ONE summary history entry -- not one per desk.
      // deskId: 'FULL_RESET' lets clicking the history row show all past resets.
      db.collection("history")
        .add({
          deskId: "FULL_RESET",
          action: "full_reset",
          changedBy: currentUser ? currentUser.email : "admin",
          changedAt: firebase.firestore.FieldValue.serverTimestamp(),
          building: "ALL",
          floor: "ALL",
          status: "pending",
          changes: {},
          summary: {
            totalReset: total,
            desks: counts.Desk,
            meetingRooms: counts.MeetingRoom,
            serverRooms: counts.ServerRoom,
          },
        })
        .catch(function (err) {
          console.error("Reset history write failed:", err);
        });

      // Refresh UI
      if (typeof renderFloorPlan === "function" && currentFloor)
        renderFloorPlan();
      if (typeof updateStats === "function") updateStats();
      if (typeof updateDashboard === "function") updateDashboard();

      alert("Done. " + total + " items reset to pending.");
    })
    .catch(function (err) {
      console.error("resetAllToPending failed:", err);
      alert(
        "Reset failed: " +
          err.message +
          "\n\n" +
          "Some items may have been updated. Refresh the page to see the current state.",
      );
    });
}
// ── Add Floor (increment 4 — multi-office) ────────────────────
// Manual-image flow: read the PNG's pixel size locally (no upload), create the
// office-scoped floor doc, then tell the admin where to drop the file + deploy.
// (Storage-based self-service can replace the manual step once billing greenlights it.)
var _pendingFloorImage = null; // { width, height, ext } from the picked PNG

function openAddFloorModal() {
  if (!isAdmin) return; // cosmetic gate; the floors write rule is the real one
  if (typeof currentOffice === "undefined" || !currentOffice) {
    alert("Select an office first.");
    return;
  }
  _pendingFloorImage = null;

  var nameEl = document.getElementById("addFloorOfficeName");
  if (nameEl)
    nameEl.textContent = currentOffice.displayName || currentOffice.code;
  var b = document.getElementById("floorBuilding");
  if (b) b.value = currentOffice.displayName || currentOffice.code;
  var f = document.getElementById("floorNumber");
  if (f) f.value = "";
  var file = document.getElementById("floorImageFile");
  if (file) file.value = "";
  var status = document.getElementById("floorAddStatus");
  if (status) {
    status.textContent = "";
    status.style.color = "#b91c1c";
  }
  var result = document.getElementById("floorAddResult");
  if (result) {
    result.style.display = "none";
    result.textContent = "";
  }

  var modal = document.getElementById("addFloorModal");
  if (modal) modal.classList.add("active");
}

function closeAddFloorModal() {
  var modal = document.getElementById("addFloorModal");
  if (modal) modal.classList.remove("active");
}

// Read the picked image's natural pixel size locally (no upload).
function onFloorImagePick() {
  var status = document.getElementById("floorAddStatus");
  var setStatus = function (msg, ok) {
    if (status) {
      status.textContent = msg;
      status.style.color = ok ? "#059669" : "#b91c1c";
    }
  };
  var fileEl = document.getElementById("floorImageFile");
  var file = fileEl && fileEl.files ? fileEl.files[0] : null;
  _pendingFloorImage = null;
  if (!file) {
    setStatus("");
    return;
  }
  if (!/^image\//.test(file.type)) {
    setStatus("Please pick an image file.");
    return;
  }

  var ext = (file.name.split(".").pop() || "png")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  var url = URL.createObjectURL(file);
  var img = new Image();
  img.onload = function () {
    // Normalize to a Berlin-style ~2048-wide coordinate box so the canvas isn't huge.
    // The image auto-scales to fit via CSS (.floor-plan { background-size: contain }),
    // so width/height are just the coordinate space that marker x/y live in.
    var MAX_W = 2048;
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    if (w > MAX_W) {
      h = Math.round(h * (MAX_W / w));
      w = MAX_W;
    }
    _pendingFloorImage = { width: w, height: h, ext: ext || "png" };
    setStatus(
      "Image " +
        img.naturalWidth +
        "×" +
        img.naturalHeight +
        " → canvas " +
        w +
        "×" +
        h +
        " ✓",
      true,
    );
    URL.revokeObjectURL(url);
  };
  img.onerror = function () {
    setStatus("Could not read that image.");
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

async function createFloor() {
  var status = document.getElementById("floorAddStatus");
  var setStatus = function (msg, ok) {
    if (status) {
      status.textContent = msg;
      status.style.color = ok ? "#059669" : "#b91c1c";
    }
  };

  if (!isAdmin) {
    setStatus("Admins only.");
    return;
  }
  if (typeof currentOffice === "undefined" || !currentOffice) {
    setStatus("No office selected.");
    return;
  }

  var building = (document.getElementById("floorBuilding").value || "").trim();
  var floorRaw = (document.getElementById("floorNumber").value || "").trim();

  if (!building) {
    setStatus("Building is required.");
    return;
  }
  if (floorRaw === "" || isNaN(Number(floorRaw))) {
    setStatus("Floor must be a number.");
    return;
  }
  if (!_pendingFloorImage) {
    setStatus("Pick the floor-plan image (needed to read its size).");
    return;
  }

  var floor = Number(floorRaw);
  var office = currentOffice.code;
  var safeBuilding = building.replace(/[^A-Za-z0-9]+/g, "-");
  var image_path =
    "floors/" +
    office +
    "/" +
    safeBuilding +
    "-" +
    floor +
    "." +
    _pendingFloorImage.ext;

  // Duplicate guard: same office + building + floor already exists?
  var dup = allFloorConfigs.some(function (fl) {
    return (
      fl.office === office &&
      fl.building === building &&
      Number(fl.floor) === floor
    );
  });
  if (dup) {
    setStatus("That building + floor already exists in " + office + ".");
    return;
  }

  setStatus("Creating…", true);
  try {
    // Readable, office-namespaced ID (e.g. MIL_Milan_9) — not a random string.
    var docId = office + "_" + safeBuilding + "_" + floor;
    var ref = db.collection("floors").doc(docId);
    await ref.set({
      id: ref.id,
      office: office,
      building: building,
      floor: floor,
      image_path: image_path,
      width: _pendingFloorImage.width,
      height: _pendingFloorImage.height,
      desks: [],
    });

    await reloadFloors(); // refresh + re-scope so the floor shows in the dropdowns

    var result = document.getElementById("floorAddResult");
    if (result) {
      result.style.display = "block";
      result.textContent =
        "✅ Floor created (" +
        _pendingFloorImage.width +
        "×" +
        _pendingFloorImage.height +
        ").\n\n" +
        "To make its plan image appear:\n" +
        "1. Save your image as:  public/" +
        image_path +
        "\n" +
        "2. Deploy:  firebase deploy --only hosting\n\n" +
        "The floor is already in the Building/Floor dropdowns. Add areas with Add Marker once the image is deployed.";
    }
    setStatus("", true);
    console.log(
      "✅ Created floor",
      ref.id,
      image_path,
      _pendingFloorImage.width + "x" + _pendingFloorImage.height,
    );

    _pendingFloorImage = null;
    var fileEl = document.getElementById("floorImageFile");
    if (fileEl) fileEl.value = "";
  } catch (error) {
    console.error("createFloor error:", error);
    setStatus("Could not create floor (permission?). See console.");
  }
}
