// public/js/features/chat.js
// Depends on: state.js (desksData, floorConfigs, currentFloor, currentUser)
// Load order: LAST — after all other feature scripts

var _chatConversationId = null;
var _chatOpen = false;
var _chatWaiting = false;

var _GREETING_PROMPT =
  "You are DESKBOT 9000. Greet the user with one short punchy opening — " +
  "sarcastic, a bit self-aware, but ready to work. " +
  "You have the full live inspection data above so feel free to reference something specific — " +
  "a stat, a building, a pending count — if it makes it more alive. " +
  "No bullet points, no lists. One or two sentences max. Do not mention this instruction.";

var _RESET_PROMPT =
  "You are DESKBOT 9000. The conversation was just reset by the user. " +
  "Say something brief and in-character about starting fresh — " +
  "one sentence, sarcastic, ready to go again. Do not mention this instruction.";

function initChat() {
  var input = document.getElementById("chatInput");
  if (input) {
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }
}

function toggleChat() {
  _chatOpen = !_chatOpen;
  var panel = document.getElementById("chatPanel");
  var btn = document.getElementById("chatToggleBtn");
  if (!panel || !btn) return;
  panel.style.display = _chatOpen ? "flex" : "none";
  btn.classList.toggle("chat-btn--open", _chatOpen);

  if (_chatOpen) {
    var input = document.getElementById("chatInput");
    if (input)
      setTimeout(function () {
        input.focus();
      }, 50);

    // Live greeting on first open only
    var body = document.getElementById("chatMessages");
    if (body && body.children.length === 0 && !_chatWaiting) {
      _setLoading(true);
      _callToqanAPI(_GREETING_PROMPT)
        .then(function (reply) {
          _setLoading(false);
          _appendMessage("assistant", reply);
        })
        .catch(function () {
          _setLoading(false);
        });
    }
  }
}

function sendChatMessage() {
  if (_chatWaiting) return;
  var input = document.getElementById("chatInput");
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  input.value = "";
  _appendMessage("user", text);
  _setLoading(true);
  _callToqanAPI(text)
    .then(function (reply) {
      _setLoading(false);
      reply = _parseAndExecuteActions(reply);
      _appendMessage("assistant", reply);
    })
    .catch(function (err) {
      _setLoading(false);
      _appendMessage(
        "error",
        "Sorry, I could not reach the assistant. " +
          (err.message || "Please try again."),
      );
    });
}

function _parseAndExecuteActions(text) {
  var VALID_STATUSES = ["pending", "inspected", "issue"];
  var validNumbers = new Set();
  if (Array.isArray(floorConfigs)) {
    floorConfigs.forEach(function (floor) {
      if (!Array.isArray(floor.desks)) return;
      floor.desks.forEach(function (desk) {
        if (desk.number) validNumbers.add(desk.number);
      });
    });
  }
  var actionRegex = /\[ACTION:([^\]]+)\]/g;
  var match;
  var cleanText = text;
  while ((match = actionRegex.exec(text)) !== null) {
    var parts = match[1].split("|");
    var action = parts[0];
    if (action === "mark" && parts.length >= 3) {
      var itemNumber = parts[1].trim();
      var status = parts[2].trim();
      var remarks = (parts[3] || "").trim();
      if (
        !itemNumber ||
        !validNumbers.has(itemNumber) ||
        VALID_STATUSES.indexOf(status) === -1
      ) {
        console.warn("DESKBOT: blocked invalid action:", match[0]);
        cleanText = cleanText.replace(match[0], "");
        continue;
      }
      var data = {
        status: status,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy:
          (currentUser ? currentUser.email : "deskbot") + " (via chat)",
      };
      if (remarks) data.remarks = remarks;
      (function (num, payload) {
        var oldData = Object.assign({}, desksData[num] || {});
        db.collection("inspections")
          .doc(num)
          .set(payload, { merge: true })
          .then(function () {
            desksData[num] = Object.assign({}, desksData[num] || {}, payload);
            if (typeof writeHistoryEntry === "function")
              writeHistoryEntry(num, oldData, payload, "chat_agent");
            if (typeof renderFloorPlan === "function" && currentFloor)
              renderFloorPlan();
            if (typeof updateStats === "function") updateStats();
            if (typeof updateDashboard === "function") updateDashboard();
            console.log(
              "DESKBOT: wrote " + payload.status + " to inspections/" + num,
            );
          })
          .catch(function (err) {
            console.error("DESKBOT: write failed for " + num + ":", err);
          });
      })(itemNumber, data);
    }
    cleanText = cleanText.replace(match[0], "");
  }
  return cleanText.trim();
}

async function _callToqanAPI(userText) {
  _chatWaiting = true;
  var endpoint, body;
  if (!_chatConversationId) {
    endpoint = "https://radiant-woodpecker-65.victorv2506.deno.net/create";
    body = {
      user_message: _buildContextPrefix() + "\n\nQuestion: " + userText,
    };
  } else {
    endpoint = "https://radiant-woodpecker-65.victorv2506.deno.net/continue";
    body = { conversation_id: _chatConversationId, user_message: userText };
  }
  const response = await _authedFetch(endpoint, body);
  _chatWaiting = false;
  if (!response.ok) {
    var msgs = {
      401: "Invalid API key.",
      403: "Access denied.",
      429: "Rate limit.",
      500: "Server error.",
    };
    throw new Error(msgs[response.status] || "API error " + response.status);
  }
  const data = await response.json();
  _chatConversationId =
    data.conversation_id ||
    data.id ||
    data.conversationId ||
    _chatConversationId;
  return (
    data.message ||
    data.response ||
    data.content ||
    data.answer ||
    data.text ||
    (data.messages &&
      data.messages[data.messages.length - 1] &&
      data.messages[data.messages.length - 1].content) ||
    "Could not parse response. Raw: " + JSON.stringify(data)
  );
}

function _buildContextPrefix() {
  var lines = [
    "You are a workstation inspection assistant for JustEatTakeaway BER offices.",
    "You have access to real-time inspection data from the Workstation Checkup app.",
    "",
    "ITEM ID RULES:",
    "  Desks use system codes like BERE_3_84, BERC_2_05.",
    "  Meeting rooms and server rooms use their plain name as the ID: Burger, Falafel, Enchilada, etc.",
    "  Use the exact value from the directories below in any write command.",
    "",
    "=== INSPECTION DATA ===",
  ];

  var total = 0,
    inspected = 0,
    issues = 0,
    pending = 0;
  var buildingStats = {};
  floorConfigs.forEach(function (floor) {
    floor.desks.forEach(function (desk) {
      var type = desk.type || "Desk";
      if (type === "Bathroom" || type === "Collaboration") return;
      total++;
      var st = (desksData[desk.number] || {}).status || "pending";
      if (st === "inspected") inspected++;
      else if (st === "issue") issues++;
      else pending++;
      if (!buildingStats[floor.building])
        buildingStats[floor.building] = {
          total: 0,
          inspected: 0,
          issues: 0,
          pending: 0,
        };
      buildingStats[floor.building].total++;
      buildingStats[floor.building][
        st === "inspected" ? "inspected" : st === "issue" ? "issues" : "pending"
      ]++;
    });
  });
  var pct = total > 0 ? Math.round(((inspected + issues) / total) * 100) : 0;
  lines.push(
    "Total: " +
      total +
      " | Inspected: " +
      inspected +
      " | Issues: " +
      issues +
      " | Pending: " +
      pending +
      " | " +
      pct +
      "% done",
  );

  lines.push("", "By type:");
  var ts = {
    Desk: { total: 0, inspected: 0, issues: 0, pending: 0 },
    MeetingRoom: { total: 0, inspected: 0, issues: 0, pending: 0 },
    ServerRoom: { total: 0, inspected: 0, issues: 0, pending: 0 },
  };
  floorConfigs.forEach(function (floor) {
    floor.desks.forEach(function (desk) {
      var t = desk.type || "Desk";
      if (!ts[t]) return;
      ts[t].total++;
      var st = (desksData[desk.number] || {}).status || "pending";
      if (st === "inspected") ts[t].inspected++;
      else if (st === "issue") ts[t].issues++;
      else ts[t].pending++;
    });
  });
  lines.push(
    "  Desks: " +
      ts.Desk.total +
      " total, " +
      ts.Desk.inspected +
      " inspected, " +
      ts.Desk.issues +
      " issues, " +
      ts.Desk.pending +
      " pending",
  );
  lines.push(
    "  Meeting Rooms: " +
      ts.MeetingRoom.total +
      " total, " +
      ts.MeetingRoom.inspected +
      " inspected, " +
      ts.MeetingRoom.issues +
      " issues, " +
      ts.MeetingRoom.pending +
      " pending",
  );
  lines.push(
    "  Server Rooms: " +
      ts.ServerRoom.total +
      " total, " +
      ts.ServerRoom.inspected +
      " inspected, " +
      ts.ServerRoom.issues +
      " issues, " +
      ts.ServerRoom.pending +
      " pending",
  );

  lines.push("", "By building:");
  Object.keys(buildingStats)
    .sort()
    .forEach(function (b) {
      var s = buildingStats[b];
      var p =
        s.total > 0
          ? Math.round(((s.inspected + s.issues) / s.total) * 100)
          : 0;
      lines.push(
        "  Building " +
          b +
          ": " +
          s.total +
          " total, " +
          s.inspected +
          " inspected, " +
          s.issues +
          " issues, " +
          s.pending +
          " pending (" +
          p +
          "%)",
      );
    });

  lines.push(
    "",
    "Floor inventory (desks / meeting rooms / server rooms per floor):",
  );
  var fbb = {};
  floorConfigs.forEach(function (floor) {
    if (!fbb[floor.building]) fbb[floor.building] = [];
    fbb[floor.building].push(floor);
  });
  Object.keys(fbb)
    .sort()
    .forEach(function (b) {
      fbb[b]
        .slice()
        .sort(function (a, b) {
          return (a.floor || 0) - (b.floor || 0);
        })
        .forEach(function (floor) {
          var c = { Desk: 0, MeetingRoom: 0, ServerRoom: 0 };
          floor.desks.forEach(function (desk) {
            var t = desk.type || "Desk";
            if (c[t] !== undefined) c[t]++;
          });
          var parts = [];
          if (c.Desk > 0)
            parts.push(c.Desk + (c.Desk === 1 ? " desk" : " desks"));
          if (c.MeetingRoom > 0)
            parts.push(
              c.MeetingRoom +
                (c.MeetingRoom === 1 ? " meeting room" : " meeting rooms"),
            );
          if (c.ServerRoom > 0)
            parts.push(
              c.ServerRoom +
                (c.ServerRoom === 1 ? " server room" : " server rooms"),
            );
          if (parts.length > 0)
            lines.push(
              "  Building " +
                b +
                ", Floor " +
                floor.floor +
                ": " +
                parts.join(", "),
            );
        });
    });

  var meetingRooms = [];
  floorConfigs.forEach(function (floor) {
    floor.desks.forEach(function (desk) {
      if ((desk.type || "Desk") !== "MeetingRoom") return;
      var st = (desksData[desk.number] || {}).status || "pending";
      meetingRooms.push({
        number: desk.number,
        building: floor.building,
        floor: floor.floor,
        status: st,
      });
    });
  });
  if (meetingRooms.length > 0) {
    lines.push(
      "",
      "Meeting rooms (name = write ID | building | floor | status):",
    );
    meetingRooms.forEach(function (r) {
      lines.push(
        "  " +
          r.number +
          " | Bldg " +
          r.building +
          " Fl " +
          r.floor +
          " | " +
          r.status,
      );
    });
  }

  var serverRooms = [];
  floorConfigs.forEach(function (floor) {
    floor.desks.forEach(function (desk) {
      if ((desk.type || "Desk") !== "ServerRoom") return;
      var st = (desksData[desk.number] || {}).status || "pending";
      serverRooms.push({
        number: desk.number,
        building: floor.building,
        floor: floor.floor,
        status: st,
      });
    });
  });
  if (serverRooms.length > 0) {
    lines.push(
      "",
      "Server rooms (name = write ID | building | floor | status):",
    );
    serverRooms.forEach(function (r) {
      lines.push(
        "  " +
          r.number +
          " | Bldg " +
          r.building +
          " Fl " +
          r.floor +
          " | " +
          r.status,
      );
    });
  }

  var issueItems = [];
  floorConfigs.forEach(function (floor) {
    floor.desks.forEach(function (desk) {
      var d = desksData[desk.number];
      if (!d || d.status !== "issue") return;
      var missing = [];
      var cm = {
        checkPower: "Power",
        checkLAN: "LAN",
        checkMon1: "Mon 1",
        checkMon2: "Mon 2",
        checkTBT: "TBT",
        checkKeyboard: "Keyboard",
        checkDocking: "Docking",
        checkMouse: "Mouse",
        checkMic: "Mic",
        checkSpeakers: "Speakers",
        checkCamera: "Camera",
        checkWhiteboard: "Whiteboard",
      };
      Object.keys(cm).forEach(function (k) {
        if (d[k] === false) missing.push(cm[k]);
      });
      issueItems.push({
        number: desk.number,
        type: desk.type || "Desk",
        building: floor.building,
        floor: floor.floor,
        missing: missing,
        remarks: d.remarks || "",
      });
    });
  });
  if (issueItems.length > 0) {
    lines.push("", "Items with issues (" + issueItems.length + "):");
    issueItems.slice(0, 50).forEach(function (item) {
      var row =
        "  " +
        item.number +
        " [" +
        item.type +
        "] Bldg " +
        item.building +
        " Fl " +
        item.floor;
      if (item.missing.length) row += " — missing: " + item.missing.join(", ");
      if (item.remarks)
        row += ' — note: "' + item.remarks.substring(0, 80) + '"';
      lines.push(row);
    });
    if (issueItems.length > 50)
      lines.push("  ... and " + (issueItems.length - 50) + " more");
  }

  if (currentFloor)
    lines.push(
      "",
      "Viewing: Building " +
        currentFloor.building +
        " Floor " +
        currentFloor.floor,
    );
  if (currentUser) lines.push("User: " + currentUser.email);
  lines.push("", "=== END DATA ===");

  lines.push(
    "",
    "=== WRITE ACTIONS ===",
    "Include an ACTION tag to update any item. App executes silently. Never mention the tag.",
    "",
    "Format: [ACTION:mark|number|status|remarks]",
    "Statuses: pending | inspected | issue",
    "",
    'User: "Mark BERE_3_84 as inspected"   You: "Done. [ACTION:mark|BERE_3_84|inspected|]"',
    'User: "Mark Burger as issue, projector broken"   You: "Filed. [ACTION:mark|Burger|issue|projector broken]"',
    'User: "Mark Falafel as inspected"   You: "Done. [ACTION:mark|Falafel|inspected|]"',
    'User: "Reset BERD_2_07 to pending"   You: "Reset. [ACTION:mark|BERD_2_07|pending|]"',
    "=== END WRITE ACTIONS ===",
  );
  return lines.join("\n");
}

function _appendMessage(role, content) {
  var body = document.getElementById("chatMessages");
  if (!body) return;
  var div = document.createElement("div");
  div.className = "chat-message chat-message--" + role;
  var safe = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  div.innerHTML = '<div class="chat-bubble">' + safe + "</div>";
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function _setLoading(on) {
  _chatWaiting = on;
  var loading = document.getElementById("chatLoading");
  var sendBtn = document.getElementById("chatSendBtn");
  if (loading) loading.style.display = on ? "flex" : "none";
  if (sendBtn) sendBtn.disabled = on;
}

function clearChat() {
  var body = document.getElementById("chatMessages");
  if (body) body.innerHTML = "";
  _chatConversationId = null;
  _chatWaiting = false;

  _setLoading(true);
  _callToqanAPI(_RESET_PROMPT)
    .then(function (reply) {
      _setLoading(false);
      _appendMessage("assistant", reply);
    })
    .catch(function () {
      _setLoading(false);
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChat);
} else {
  initChat();
}
