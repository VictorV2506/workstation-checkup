// public/js/features/jira.js
// Depends on globals: currentUser, currentFloor, desksData, floorConfigs, db
// Config from Firestore: config/jira
// Proxy: https://full-platypus-4956.victorv2506.deno.net

var _jiraConfig = null;
var _JIRA_PROXY = "https://full-platypus-4956.victorv2506.deno.net";

// ── Load config ───────────────────────────────────────────────────────────────
function loadJiraConfig() {
  db.collection("config")
    .doc("jira")
    .get()
    .then(function (doc) {
      if (doc.exists) {
        _jiraConfig = doc.data();
        console.log("Jira config loaded. Parent:", _jiraConfig.parentKey);
      } else {
        console.warn("config/jira not found. Jira features disabled.");
      }
    })
    .catch(function (err) {
      console.error("loadJiraConfig error:", err);
    });
}

// ── Single-ticket modal ───────────────────────────────────────────────────────
function openJiraModal(itemId) {
  if (!_jiraConfig) {
    alert("Jira config not loaded. Please refresh.");
    return;
  }

  var itemData = desksData[itemId] || {};
  var itemInfo = _findItemInfo(itemId);
  if (!itemInfo) {
    alert("Could not find item data for " + itemId);
    return;
  }

  var modal = document.getElementById("jiraSingleModal");
  var confirmBtn = document.getElementById("jiraSingleConfirmBtn");
  if (!modal) {
    console.error("jiraSingleModal not found");
    return;
  }

  document.getElementById("jiraSingleTitle").textContent =
    "Create Jira Ticket: " + itemId;
  document.getElementById("jiraSingleSummary").value =
    "[Issue] " +
    itemId +
    " - Building " +
    itemInfo.building +
    ", Floor " +
    itemInfo.floor;
  document.getElementById("jiraSingleParent").value =
    _jiraConfig.parentKey || "";
  document.getElementById("jiraSingleComment").value = "";
  document.getElementById("jiraSingleStatus").textContent = "";
  document.getElementById("jiraSingleStatus").className = "jira-status";

  // Duplicate guard
  var existingKey = itemData.jiraTicket || null;
  var dupeEl = document.getElementById("jiraSingleDupeWarning");
  if (!dupeEl) {
    dupeEl = document.createElement("div");
    dupeEl.id = "jiraSingleDupeWarning";
    dupeEl.style.cssText =
      "background:#fffbeb;border:1px solid #fbbf24;border-radius:6px;padding:8px 12px;font-size:12px;color:#92400e;display:none;line-height:1.6;";
    modal
      .querySelector(".jira-modal")
      .insertBefore(dupeEl, modal.querySelector(".jira-modal-footer"));
  }
  if (existingKey) {
    dupeEl.innerHTML =
      '\u26a0\ufe0f Ticket already exists: <a href="https://justeattakeaway.atlassian.net/browse/' +
      existingKey +
      '" target="_blank" style="color:#b45309;font-weight:600;">' +
      existingKey +
      '</a><br><label style="cursor:pointer;"><input type="checkbox" id="jiraSingleOverride"> Create another ticket anyway</label>';
    dupeEl.style.display = "block";
    confirmBtn.disabled = true;
    setTimeout(function () {
      var cb = document.getElementById("jiraSingleOverride");
      if (cb)
        cb.onchange = function () {
          confirmBtn.disabled = !this.checked;
        };
    }, 0);
  } else {
    dupeEl.style.display = "none";
    confirmBtn.disabled = false;
  }
  confirmBtn.textContent = "Create Ticket";
  modal.style.display = "flex";
  document.getElementById("jiraSingleComment").focus();
  confirmBtn.onclick = function () {
    _submitSingleTicket(itemId, itemData, itemInfo);
  };
}

function closeJiraSingleModal() {
  var m = document.getElementById("jiraSingleModal");
  if (m) m.style.display = "none";
}

function _submitSingleTicket(itemId, itemData, itemInfo) {
  var summary = (
    document.getElementById("jiraSingleSummary").value || ""
  ).trim();
  var comment = (
    document.getElementById("jiraSingleComment").value || ""
  ).trim();
  var parentKey = (document.getElementById("jiraSingleParent").value || "")
    .trim()
    .toUpperCase();
  var statusEl = document.getElementById("jiraSingleStatus");
  var btn = document.getElementById("jiraSingleConfirmBtn");

  if (!summary) {
    _status(statusEl, "Summary is required.", true);
    return;
  }
  if (!parentKey) {
    _status(statusEl, "Parent issue key is required.", true);
    return;
  }

  btn.disabled = true;
  btn.textContent = "Creating\u2026";
  _status(statusEl, "", false);

  _createTicket(summary, itemData, itemInfo, comment, parentKey)
    .then(function (res) {
      btn.disabled = false;
      btn.textContent = "Create Ticket";
      if (res.key) {
        _recordTicketKey(itemId, res.key);
        closeJiraSingleModal();
        if (confirm("Ticket created: " + res.key + "\n\nOpen in Jira?"))
          window.open(
            "https://justeattakeaway.atlassian.net/browse/" + res.key,
            "_blank",
          );
      } else {
        _status(statusEl, "Error: " + JSON.stringify(res.errors || res), true);
      }
    })
    .catch(function (err) {
      btn.disabled = false;
      btn.textContent = "Create Ticket";
      _status(statusEl, "Error: " + err.message, true);
    });
}

// ── Bulk modal — scoped to currently selected floor ───────────────────────────
function openBulkJiraModal() {
  if (!_jiraConfig) {
    alert("Jira config not loaded. Please refresh.");
    return;
  }

  var modal = document.getElementById("jiraBulkModal");
  if (!modal) {
    console.error("jiraBulkModal not found");
    return;
  }

  // Clear stale list content immediately, before any early return
  var list = document.getElementById("jiraBulkList");
  if (list) list.innerHTML = "";

  // Must have a floor selected
  if (!currentFloor) {
    modal.style.display = "none";
    alert("Please select a building and floor first.");
    return;
  }

  var building = currentFloor.building;
  var floor = currentFloor.floor;

  // Collect issue items from THIS floor only
  var issueItems = [];
  var TYPES = { Desk: true, MeetingRoom: true, ServerRoom: true };
  (currentFloor.desks || []).forEach(function (desk) {
    if (!TYPES[desk.type || "Desk"]) return;
    var d = desksData[desk.number] || {};
    if (d.status !== "issue") return;
    issueItems.push({
      number: desk.number,
      type: desk.type || "Desk",
      building: building,
      floor: floor,
      hasTicket: !!d.jiraTicket,
      ticketKey: d.jiraTicket || null,
    });
  });

  if (issueItems.length === 0) {
    modal.style.display = "none";
    alert(
      "No items on Building " +
        building +
        ", Floor " +
        floor +
        " are marked as issue.",
    );
    return;
  }

  // Update title
  var titleEl = document.getElementById("jiraBulkTitle");
  if (titleEl)
    titleEl.textContent =
      "Create Jira Ticket \u2014 Building " + building + ", Floor " + floor;

  // Reset fields
  document.getElementById("jiraBulkParent").value = _jiraConfig.parentKey || "";
  document.getElementById("jiraBulkComment").value = "";
  document.getElementById("jiraBulkStatus").textContent = "";
  document.getElementById("jiraBulkStatus").className = "jira-status";

  // Inject summary field once
  var summaryField = document.getElementById("jiraBulkSummary");
  if (!summaryField) {
    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Summary</label><input type="text" id="jiraBulkSummary" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:inherit;" placeholder="Ticket summary">';
    var jm = modal.querySelector(".jira-modal");
    var ref = document.getElementById("jiraBulkParent").closest("div");
    if (jm && ref && ref.parentNode === jm) jm.insertBefore(wrap, ref);
    else if (jm) jm.insertBefore(wrap, jm.children[1] || null);
    summaryField = document.getElementById("jiraBulkSummary");
  }
  if (summaryField)
    summaryField.value =
      "Desks with issues on Floor " + floor + " Building " + building;

  // Render desk list
  issueItems.forEach(function (item) {
    var d = desksData[item.number] || {};
    var row = document.createElement("label");
    row.className = "jira-bulk-row";

    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !item.hasTicket; // unchecked if ticket already exists
    cb.value = item.number;
    cb.className = "jira-bulk-cb";
    cb.onchange = _updateBulkCount;

    var info = document.createElement("div");
    info.className = "jira-bulk-info";

    var top = document.createElement("div");
    top.className = "jira-bulk-id";
    top.textContent =
      item.number + (item.type !== "Desk" ? "  (" + item.type + ")" : "");

    var sub = document.createElement("div");
    sub.className = "jira-bulk-sub";
    if (item.hasTicket) {
      sub.innerHTML =
        '\u26a0\ufe0f Ticket exists: <a href="https://justeattakeaway.atlassian.net/browse/' +
        item.ticketKey +
        '" target="_blank" style="color:#b45309;font-weight:600;">' +
        item.ticketKey +
        "</a>";
      row.style.opacity = "0.6";
    } else {
      var miss = _getMissingLabels(d);
      sub.textContent = miss.length
        ? "Missing: " + miss.join(", ")
        : d.remarks
          ? d.remarks.substring(0, 70)
          : "No checklist data";
    }

    info.appendChild(top);
    info.appendChild(sub);
    row.appendChild(cb);
    row.appendChild(info);
    list.appendChild(row);
  });

  _updateBulkCount();
  modal.style.display = "flex";
}

function closeJiraBulkModal() {
  var m = document.getElementById("jiraBulkModal");
  if (m) m.style.display = "none";
}

function _updateBulkCount() {
  var n = document.querySelectorAll(".jira-bulk-cb:checked").length;
  var btn = document.getElementById("jiraBulkConfirmBtn");
  if (btn) {
    btn.disabled = n === 0;
    btn.textContent =
      n === 0
        ? "No Desks Selected"
        : "Create Ticket (" + n + " desk" + (n !== 1 ? "s" : "") + ")";
  }
}

// ── Submit — ONE ticket for the whole floor batch ─────────────────────────────
function submitBulkJiraTickets() {
  var checked = document.querySelectorAll(".jira-bulk-cb:checked");
  if (!checked.length) {
    alert("Select at least one desk.");
    return;
  }

  var summaryEl = document.getElementById("jiraBulkSummary");
  var summary = (summaryEl ? summaryEl.value : "").trim();
  var comment = (document.getElementById("jiraBulkComment").value || "").trim();
  var parentKey = (document.getElementById("jiraBulkParent").value || "")
    .trim()
    .toUpperCase();
  var statusEl = document.getElementById("jiraBulkStatus");
  var btn = document.getElementById("jiraBulkConfirmBtn");

  if (!summary) {
    _status(statusEl, "Summary is required.", true);
    return;
  }
  if (!parentKey) {
    _status(statusEl, "Parent issue key is required.", true);
    return;
  }

  var ids = Array.from(checked).map(function (cb) {
    return cb.value;
  });
  var building = currentFloor ? currentFloor.building : "?";
  var floor = currentFloor ? currentFloor.floor : "?";
  var items = ids.map(function (id) {
    return (
      _findItemInfo(id) || {
        number: id,
        type: "Desk",
        building: building,
        floor: floor,
      }
    );
  });

  btn.disabled = true;
  btn.textContent = "Creating\u2026";
  _status(statusEl, "Creating ticket\u2026", false);

  var config = _jiraConfig || {};
  var issueData = {
    fields: {
      project: { key: config.projectKey || "EITOPSGLOB" },
      issuetype: { id: config.issueTypeId || "5" },
      parent: { key: parentKey },
      summary: summary,
      description: _buildBulkADF(items, building, floor, comment),
    },
  };

  _authedFetch(_JIRA_PROXY, { action: "create_issue", issueData: issueData })
    .then(function (r) {
      return r.json();
    })
    .then(function (res) {
      btn.disabled = false;
      _updateBulkCount();
      if (res.key) {
        ids.forEach(function (id) {
          _recordTicketKey(id, res.key);
        });
        closeJiraBulkModal();
        if (
          confirm(
            "Ticket " +
              res.key +
              " created for " +
              ids.length +
              " desk" +
              (ids.length !== 1 ? "s" : "") +
              ".\n\nOpen in Jira?",
          )
        )
          window.open(
            "https://justeattakeaway.atlassian.net/browse/" + res.key,
            "_blank",
          );
      } else {
        _status(statusEl, "Error: " + JSON.stringify(res.errors || res), true);
      }
    })
    .catch(function (err) {
      btn.disabled = false;
      _updateBulkCount();
      _status(statusEl, "Error: " + err.message, true);
    });
}

// ── Record ticket key to Firestore + memory ───────────────────────────────────
function _recordTicketKey(itemId, ticketKey) {
  var payload = {
    jiraTicket: ticketKey,
    jiraTicketAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  desksData[itemId] = Object.assign({}, desksData[itemId] || {}, payload);
  db.collection("inspections")
    .doc(itemId)
    .set(payload, { merge: true })
    .then(function () {
      console.log("Jira key recorded:", itemId, "\u2192", ticketKey);
    })
    .catch(function (e) {
      console.error("Failed to record Jira key:", itemId, e);
    });
}

// ── Core fetch ────────────────────────────────────────────────────────────────
function _createTicket(summary, itemData, itemInfo, comment, parentKey) {
  var config = _jiraConfig || {};
  var issueData = {
    fields: {
      project: { key: config.projectKey || "EITOPSGLOB" },
      issuetype: { id: config.issueTypeId || "5" },
      parent: { key: parentKey },
      summary: summary,
      description: _buildADF(itemData, itemInfo, comment),
    },
  };
  return _authedFetch(_JIRA_PROXY, {
    action: "create_issue",
    issueData: issueData,
  }).then(function (r) {
    return r.json();
  });
}

// ── ADF: single desk ─────────────────────────────────────────────────────────
function _buildADF(itemData, itemInfo, comment) {
  var nodes = [
    _p("Desk: " + itemInfo.number),
    _p("Building: " + itemInfo.building + "   |   Floor: " + itemInfo.floor),
    _p("Type: " + (itemInfo.type || "Desk")),
  ];
  var miss = _getMissingLabels(itemData);
  if (miss.length) {
    nodes.push(_h("Missing Equipment", 3));
    nodes.push(_ul(miss));
  }
  var hw = [];
  if (itemData.leftMonitor) hw.push("Left monitor: " + itemData.leftMonitor);
  if (itemData.rightMonitor) hw.push("Right monitor: " + itemData.rightMonitor);
  if (itemData.dock) hw.push("Dock: " + itemData.dock);
  if (hw.length) {
    nodes.push(_h("Hardware", 3));
    nodes.push(_ul(hw));
  }
  if (itemData.remarks && itemData.remarks.trim()) {
    nodes.push(_h("Remarks", 3));
    nodes.push(_p(itemData.remarks.trim()));
  }
  if (itemInfo.type === "MeetingRoom") {
    var av = [];
    if (itemData.googleMeetDevice)
      av.push("Google Meet: " + itemData.googleMeetDevice);
    if (itemData.focusRoomMonitor)
      av.push("Focus monitor: " + itemData.focusRoomMonitor);
    if (itemData.crestronStatus)
      av.push("Crestron: " + itemData.crestronStatus);
    if (itemData.tvSize) av.push("TV size: " + itemData.tvSize);
    if (itemData.extraAVDevice) av.push("Extra AV: " + itemData.extraAVDevice);
    if (av.length) {
      nodes.push(_h("AV Equipment", 3));
      nodes.push(_ul(av));
    }
  }
  if (comment && comment.trim()) {
    nodes.push(_h("Notes", 3));
    nodes.push(_p(comment.trim()));
  }
  var deepUrl =
    "https://workstation-revamp.web.app?building=" +
    itemInfo.building +
    "&floor=" +
    itemInfo.floor +
    "&desk=" +
    itemInfo.number;
  nodes.push(_p(" "));
  nodes.push(
    _panel(
      "warning",
      "NOTE: Please do not forget to go back to the desk in the Workstation Checkup app and change the status before closing this task. Link to the desk below.",
    ),
  );
  nodes.push(_p("Logged by: " + (currentUser ? currentUser.email : "unknown")));
  nodes.push(
    _link("Open " + itemInfo.number + " in Workstation Checkup", deepUrl),
  );
  return { type: "doc", version: 1, content: nodes };
}

// ── ADF: floor batch ─────────────────────────────────────────────────────────
function _buildBulkADF(items, building, floor, comment) {
  var nodes = [
    _h("Building " + building + "  \u2014  Floor " + floor, 2),
    _p(
      items.length +
        " desk" +
        (items.length !== 1 ? "s" : "") +
        " with issues.",
    ),
  ];
  items.forEach(function (item) {
    var d = desksData[item.number] || {};
    var miss = _getMissingLabels(d);
    var hw = [];
    if (d.leftMonitor) hw.push("Left: " + d.leftMonitor);
    if (d.rightMonitor) hw.push("Right: " + d.rightMonitor);
    if (d.dock) hw.push("Dock: " + d.dock);
    nodes.push(
      _h(item.number + (item.type !== "Desk" ? " (" + item.type + ")" : ""), 3),
    );
    if (miss.length) nodes.push(_p("Missing: " + miss.join(", ")));
    if (hw.length) nodes.push(_p(hw.join(" | ")));
    if (d.remarks && d.remarks.trim())
      nodes.push(_p("Remarks: " + d.remarks.trim()));
    if (!miss.length && !hw.length && !(d.remarks && d.remarks.trim()))
      nodes.push(_p("No details recorded."));
  });
  if (comment && comment.trim()) {
    nodes.push(_h("Additional Notes", 3));
    nodes.push(_p(comment.trim()));
  }
  nodes.push(_p(" "));
  nodes.push(
    _panel(
      "warning",
      "NOTE: Please do not forget to go back to each desk in the Workstation Checkup app and change the status before closing this task. Links to the desks below.",
    ),
  );
  nodes.push(_h("Quick Access Links", 3));
  items.forEach(function (item) {
    var url =
      "https://workstation-revamp.web.app?building=" +
      building +
      "&floor=" +
      floor +
      "&desk=" +
      item.number;
    nodes.push(_link(item.number + " - Open in Workstation Checkup", url));
  });
  nodes.push(_p(" "));
  nodes.push(_p("Logged by: " + (currentUser ? currentUser.email : "unknown")));
  return { type: "doc", version: 1, content: nodes };
}

// ── Master Jira modal — all buildings, one ticket per building ────────────────

function openMasterJiraModal() {
  if (!_jiraConfig) {
    alert("Jira config not loaded. Please refresh.");
    return;
  }

  // Inject modal once
  if (!document.getElementById("jiraMasterModal")) {
    var overlay = document.createElement("div");
    overlay.id = "jiraMasterModal";
    overlay.className = "jira-modal-overlay";
    overlay.style.display = "none";
    overlay.onclick = function (e) {
      if (e.target === overlay) closeJiraMasterModal();
    };
    overlay.innerHTML =
      '<div class="jira-modal" style="max-width:640px;">' +
      "<h3>Create Jira Tickets \u2014 All Buildings</h3>" +
      '<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Parent Story</label>' +
      '<input type="text" id="jiraMasterParent" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:inherit;"></div>' +
      '<div class="jira-bulk-list" id="jiraMasterList" style="max-height:420px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px;padding:4px;"></div>' +
      '<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Comment for all tickets <span style="font-weight:400;color:#9ca3af;">(optional)</span></label>' +
      '<textarea id="jiraMasterComment" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:inherit;resize:vertical;min-height:64px;" placeholder="Applied to every ticket in this batch..."></textarea></div>' +
      '<p class="jira-status" id="jiraMasterStatus"></p>' +
      '<div class="jira-modal-footer">' +
      '<button class="jira-btn-secondary" onclick="closeJiraMasterModal()">Cancel</button>' +
      '<button class="jira-btn-primary" id="jiraMasterConfirmBtn" onclick="submitMasterJiraTickets()">Create Tickets</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(overlay);
  }

  // Group ALL issue desks by building across all floors
  var byBuilding = {};
  floorConfigs.forEach(function (floor) {
    var TYPES = { Desk: true, MeetingRoom: true, ServerRoom: true };
    (floor.desks || []).forEach(function (desk) {
      if (!TYPES[desk.type || "Desk"]) return;
      var d = desksData[desk.number] || {};
      if (d.status !== "issue") return;
      if (!byBuilding[floor.building]) byBuilding[floor.building] = [];
      byBuilding[floor.building].push({
        number: desk.number,
        type: desk.type || "Desk",
        building: floor.building,
        floor: floor.floor,
        hasTicket: !!d.jiraTicket,
        ticketKey: d.jiraTicket || null,
      });
    });
  });

  var buildings = Object.keys(byBuilding).sort();
  if (buildings.length === 0) {
    alert("No items with issues found across any floor.");
    return;
  }

  document.getElementById("jiraMasterParent").value =
    _jiraConfig.parentKey || "";
  document.getElementById("jiraMasterComment").value = "";
  document.getElementById("jiraMasterStatus").textContent = "";

  var list = document.getElementById("jiraMasterList");
  list.innerHTML = "";

  buildings.forEach(function (building) {
    var items = byBuilding[building];
    var newCount = items.filter(function (i) {
      return !i.hasTicket;
    }).length;
    var hasNew = newCount > 0;

    // Building header with master checkbox
    var header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;gap:10px;padding:10px 8px 6px;font-weight:700;font-size:13px;color:#1f2937;border-top:1px solid #e5e7eb;background:#f9fafb;border-radius:4px;margin-top:4px;";

    var masterCb = document.createElement("input");
    masterCb.type = "checkbox";
    masterCb.checked = hasNew;
    masterCb.dataset.building = building;
    masterCb.className = "jira-building-cb";
    masterCb.style.cssText =
      "width:16px;height:16px;cursor:pointer;flex-shrink:0;";
    masterCb.onchange = (function (b) {
      return function () {
        var checked = this.checked;
        document
          .querySelectorAll('.jira-desk-cb[data-building="' + b + '"]')
          .forEach(function (cb) {
            cb.checked = checked;
          });
        _updateMasterCount();
      };
    })(building);

    var lbl = document.createElement("span");
    lbl.textContent =
      "Building " +
      building +
      "  \u2014  " +
      items.length +
      " issue" +
      (items.length !== 1 ? "s" : "") +
      (newCount < items.length
        ? "  (" + (items.length - newCount) + " already ticketed)"
        : "");

    header.appendChild(masterCb);
    header.appendChild(lbl);
    list.appendChild(header);

    // Individual desks
    items.forEach(function (item) {
      var d = desksData[item.number] || {};
      var row = document.createElement("label");
      row.className = "jira-bulk-row";
      row.style.cssText =
        "padding-left:36px;display:flex;align-items:flex-start;gap:10px;padding-top:6px;padding-bottom:6px;cursor:pointer;";

      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !item.hasTicket;
      cb.value = item.number;
      cb.className = "jira-bulk-cb jira-desk-cb";
      cb.dataset.building = building;
      cb.onchange = (function (b) {
        return function () {
          _updateBuildingMasterCb(b);
          _updateMasterCount();
        };
      })(building);

      var info = document.createElement("div");
      info.className = "jira-bulk-info";

      var top = document.createElement("div");
      top.className = "jira-bulk-id";
      top.textContent =
        item.number +
        "  Fl " +
        item.floor +
        (item.type !== "Desk" ? "  (" + item.type + ")" : "");

      var sub = document.createElement("div");
      sub.className = "jira-bulk-sub";
      if (item.hasTicket) {
        sub.innerHTML =
          '\u26a0\ufe0f Ticket exists: <a href="https://justeattakeaway.atlassian.net/browse/' +
          item.ticketKey +
          '" target="_blank" style="color:#b45309;font-weight:600;">' +
          item.ticketKey +
          "</a>";
        row.style.opacity = "0.65";
      } else {
        var miss = _getMissingLabels(d);
        sub.textContent = miss.length
          ? "Missing: " + miss.join(", ")
          : d.remarks
            ? d.remarks.substring(0, 60)
            : "No checklist data";
      }

      info.appendChild(top);
      info.appendChild(sub);
      row.appendChild(cb);
      row.appendChild(info);
      list.appendChild(row);
    });
  });

  _updateMasterCount();
  document.getElementById("jiraMasterModal").style.display = "flex";
}

function closeJiraMasterModal() {
  var m = document.getElementById("jiraMasterModal");
  if (m) m.style.display = "none";
}

function _updateBuildingMasterCb(building) {
  var cbs = Array.from(
    document.querySelectorAll(
      '.jira-desk-cb[data-building="' + building + '"]',
    ),
  );
  var n = cbs.filter(function (cb) {
    return cb.checked;
  }).length;
  var masterCb = document.querySelector(
    '.jira-building-cb[data-building="' + building + '"]',
  );
  if (!masterCb) return;
  if (n === 0) {
    masterCb.checked = false;
    masterCb.indeterminate = false;
  } else if (n === cbs.length) {
    masterCb.checked = true;
    masterCb.indeterminate = false;
  } else {
    masterCb.checked = false;
    masterCb.indeterminate = true;
  }
}

function _updateMasterCount() {
  var buildings = new Set();
  document.querySelectorAll(".jira-desk-cb:checked").forEach(function (cb) {
    buildings.add(cb.dataset.building);
  });
  var n = buildings.size;
  var btn = document.getElementById("jiraMasterConfirmBtn");
  if (!btn) return;
  btn.disabled = n === 0;
  btn.textContent =
    n === 0
      ? "No Desks Selected"
      : "Create " +
        n +
        " Ticket" +
        (n !== 1 ? "s" : "") +
        " (" +
        n +
        " building" +
        (n !== 1 ? "s" : "") +
        ")";
}

async function submitMasterJiraTickets() {
  var comment = (
    document.getElementById("jiraMasterComment").value || ""
  ).trim();
  var parentKey = (document.getElementById("jiraMasterParent").value || "")
    .trim()
    .toUpperCase();
  var statusEl = document.getElementById("jiraMasterStatus");
  var btn = document.getElementById("jiraMasterConfirmBtn");

  if (!parentKey) {
    _status(statusEl, "Parent issue key is required.", true);
    return;
  }

  // Group checked desks by building
  var byBuilding = {};
  document.querySelectorAll(".jira-desk-cb:checked").forEach(function (cb) {
    var b = cb.dataset.building;
    if (!byBuilding[b]) byBuilding[b] = [];
    byBuilding[b].push(cb.value);
  });
  var buildings = Object.keys(byBuilding).sort();
  if (buildings.length === 0) {
    alert("Select at least one desk.");
    return;
  }

  btn.disabled = true;
  var created = [],
    failed = [];

  for (var bi = 0; bi < buildings.length; bi++) {
    var building = buildings[bi];
    var ids = byBuilding[building];
    _status(
      statusEl,
      "Creating ticket " +
        (bi + 1) +
        " of " +
        buildings.length +
        " \u2014 Building " +
        building +
        "\u2026",
      false,
    );

    var items = ids.map(function (id) {
      return (
        _findItemInfo(id) || {
          number: id,
          type: "Desk",
          building: building,
          floor: "?",
        }
      );
    });
    var floors = Array.from(
      new Set(
        items.map(function (i) {
          return i.floor;
        }),
      ),
    )
      .sort()
      .join(", ");
    var summary =
      "Desks with issues in Building " +
      building +
      " \u2014 Floor" +
      (floors.indexOf(",") !== -1 ? "s " : " ") +
      floors;

    var config = _jiraConfig || {};
    var issueData = {
      fields: {
        project: { key: config.projectKey || "EITOPSGLOB" },
        issuetype: { id: config.issueTypeId || "5" },
        parent: { key: parentKey },
        summary: summary,
        description: _buildBulkADF(items, building, floors, comment),
      },
    };

    try {
      var res = await _authedFetch(_JIRA_PROXY, {
        action: "create_issue",
        issueData: issueData,
      }).then(function (r) {
        return r.json();
      });

      if (res.key) {
        created.push(res.key);
        ids.forEach(function (id) {
          _recordTicketKey(id, res.key);
        });
      } else {
        failed.push("Bldg " + building);
        console.error("Failed Building", building, res);
      }
    } catch (err) {
      failed.push("Bldg " + building);
      console.error("Error Building", building, err);
    }
  }

  btn.disabled = false;
  _updateMasterCount();
  var msg =
    created.length +
    " ticket" +
    (created.length !== 1 ? "s" : "") +
    " created.";
  if (failed.length) msg += " Failed: " + failed.join(", ") + ".";
  _status(statusEl, msg, failed.length > 0 && created.length === 0);

  if (created.length > 0) {
    closeJiraMasterModal();
    if (confirm(msg + "\n\nOpen parent story in Jira?"))
      window.open(
        "https://justeattakeaway.atlassian.net/browse/" + parentKey,
        "_blank",
      );
  }
}

// -- Deep link handler
// Called from data-loader.js after floorConfigs is populated.
// URL format: ?building=C&floor=2&desk=BERC_2_33
async function _handleDeepLink() {
  var params = new URLSearchParams(window.location.search);
  var building = params.get("building");
  var floor = params.get("floor");
  var desk = params.get("desk");
  if (!building || !floor) return;

  if (typeof switchTab === "function") switchTab("inspect");

  var bSel = document.getElementById("buildingSelect");
  if (!bSel) return;
  bSel.value = building;
  onBuildingChange();

  var target = (floorConfigs || []).find(function (f) {
    return f.building === building && String(f.floor) === String(floor);
  });
  if (!target) {
    console.warn("Deep link: floor not found", building, floor);
    return;
  }

  var fSel = document.getElementById("floorSelect");
  if (!fSel) return;
  fSel.value = target.id;
  await onFloorChange();

  window.history.replaceState({}, document.title, window.location.pathname);

  if (desk) {
    setTimeout(function () {
      if (typeof openInspectionModal === "function") openInspectionModal(desk);
    }, 500);
  }
}

// ── ADF primitives

// ── ADF primitives ────────────────────────────────────────────────────────────
function _p(text) {
  return {
    type: "paragraph",
    content: [{ type: "text", text: String(text || "") }],
  };
}
function _h(text, level) {
  return {
    type: "heading",
    attrs: { level: level },
    content: [{ type: "text", text: String(text) }],
  };
}
function _ul(items) {
  return {
    type: "bulletList",
    content: items.map(function (i) {
      return { type: "listItem", content: [_p(i)] };
    }),
  };
}
function _link(text, href) {
  return {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: text,
        marks: [{ type: "link", attrs: { href: href } }],
      },
    ],
  };
}
function _panel(panelType, text) {
  return {
    type: "panel",
    attrs: { panelType: panelType },
    content: [_p(text)],
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function _getMissingLabels(d) {
  var L = {
    checkPower: "Power",
    checkLAN: "LAN",
    checkMon1: "Monitor 1",
    checkMon2: "Monitor 2",
    checkTBT: "TBT",
    checkKeyboard: "Keyboard",
    checkDocking: "Docking",
    checkMouse: "Mouse",
    checkMic: "Mic",
    checkSpeakers: "Speakers",
    checkCamera: "Camera",
    checkWhiteboard: "Whiteboard",
  };
  return Object.keys(L)
    .filter(function (k) {
      return d[k] === false;
    })
    .map(function (k) {
      return L[k];
    });
}

function _findItemInfo(number) {
  if (!Array.isArray(floorConfigs)) return null;
  for (var fi = 0; fi < floorConfigs.length; fi++) {
    var fc = floorConfigs[fi];
    for (var di = 0; di < fc.desks.length; di++) {
      if (fc.desks[di].number === number)
        return {
          number: number,
          type: fc.desks[di].type || "Desk",
          building: fc.building,
          floor: fc.floor,
        };
    }
  }
  return null;
}

function _status(el, msg, isError) {
  if (!el) return;
  el.textContent = msg;
  el.className = "jira-status" + (isError ? " jira-status-err" : "");
}

// ── Styles (injected once) ────────────────────────────────────────────────────
(function () {
  if (document.getElementById("jira-styles")) return;
  var s = document.createElement("style");
  s.id = "jira-styles";
  s.textContent = [
    ".jira-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;}",
    ".jira-modal{background:#fff;border-radius:12px;padding:24px;width:90%;max-width:520px;max-height:85vh;display:flex;flex-direction:column;gap:14px;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow-y:auto;}",
    ".jira-modal h3{margin:0;font-size:16px;color:#1f2937;}",
    ".jira-modal label{font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px;}",
    ".jira-modal input[type=text],.jira-modal textarea{width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:inherit;}",
    ".jira-modal textarea{resize:vertical;min-height:72px;}",
    ".jira-modal-footer{display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;}",
    ".jira-modal-footer button{padding:8px 16px;border-radius:6px;border:none;font-size:13px;font-weight:600;cursor:pointer;}",
    ".jira-btn-primary{background:#667eea;color:#fff;}",
    ".jira-btn-primary:hover{background:#5a67d8;}",
    ".jira-btn-primary:disabled{background:#9ca3af;cursor:not-allowed;}",
    ".jira-btn-secondary{background:#f3f4f6;color:#374151;}",
    ".jira-status{font-size:12px;color:#10b981;min-height:16px;}",
    ".jira-status-err{color:#f43f5e;}",
    ".jira-bulk-list{overflow-y:auto;max-height:280px;border:1px solid #e5e7eb;border-radius:6px;padding:4px;flex-shrink:0;}",
    ".jira-bulk-row{display:flex;align-items:flex-start;gap:10px;padding:8px;border-radius:6px;cursor:pointer;}",
    ".jira-bulk-row:hover{background:#f9fafb;}",
    ".jira-bulk-cb{margin-top:2px;flex-shrink:0;}",
    ".jira-bulk-id{font-size:13px;font-weight:600;color:#1f2937;}",
    ".jira-bulk-sub{font-size:11px;color:#9ca3af;margin-top:2px;}",
  ].join("");
  document.head.appendChild(s);
})();
