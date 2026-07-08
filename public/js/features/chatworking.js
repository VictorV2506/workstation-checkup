// public/js/features/chat.js
//
// Toqan AI Chat Assistant for Workstation Checkup
//
// Embeds a floating chat panel powered by the Toqan Agent API.
// The agent is pre-loaded with live inspection context from the app
// so it can answer questions about desks, floors, and progress.
//
// API: https://api.toqan.ai
//   POST /api/create_conversation  — first message, returns conversation_id
//   POST /api/continue_conversation — follow-up messages
//
// Depends on: state.js (desksData, floorConfigs, currentFloor, currentUser)
// Config:     TOQAN_API_KEY in js/config/constants.js
// Load order: LAST — after all other feature scripts
//
// ⚠️  SETUP: Replace TOQAN_API_KEY in constants.js with your generated key.
//            Agent → Advanced → Generate API key

// ── State ────────────────────────────────────────────────────────────────────
var _chatConversationId = null;   // set after first message
var _chatOpen           = false;
var _chatWaiting        = false;  // prevents double-sends while API responds

// ── Initialise ────────────────────────────────────────────────────────────────
// Called once on DOMContentLoaded — attaches keyboard listener.
function initChat() {
    var input = document.getElementById('chatInput');
    if (input) {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }
}

// ── Toggle panel ──────────────────────────────────────────────────────────────
function toggleChat() {
    _chatOpen = !_chatOpen;
    var panel = document.getElementById('chatPanel');
    var btn   = document.getElementById('chatToggleBtn');
    if (!panel || !btn) return;

    panel.style.display = _chatOpen ? 'flex' : 'none';
    btn.classList.toggle('chat-btn--open', _chatOpen);

    // Auto-focus input when opening
    if (_chatOpen) {
        var input = document.getElementById('chatInput');
        if (input) setTimeout(function() { input.focus(); }, 50);
    }
}

// ── Send message ──────────────────────────────────────────────────────────────
function sendChatMessage() {
    if (_chatWaiting) return;

    var input = document.getElementById('chatInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    input.value = '';
    _appendMessage('user', text);
    _setLoading(true);

    _callToqanAPI(text)
        .then(function(reply) {
            _setLoading(false);
            _appendMessage('assistant', reply);
        })
        .catch(function(err) {
            _setLoading(false);
            _appendMessage('error',
                'Sorry, I could not reach the assistant. ' + (err.message || 'Please try again.'));
        });
}

// ── Toqan API call ────────────────────────────────────────────────────────────
async function _callToqanAPI(userText) {

    _chatWaiting = true;

    var endpoint, body;

    if (!_chatConversationId) {
        // First message — create a new conversation with context prefix
        endpoint = 'https://radiant-woodpecker-65.victorv2506.deno.net/create';
        body = {
            user_message: _buildContextPrefix() + '\n\nQuestion: ' + userText
        };
    } else {
        // Follow-up message — continue existing conversation
        endpoint = 'https://radiant-woodpecker-65.victorv2506.deno.net/continue';
        body = {
            conversation_id: _chatConversationId,
            user_message:    userText
        };
    }

    const response = await fetch(endpoint, {
        method:  'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    _chatWaiting = false;

    if (!response.ok) {
        var statusMessages = {
            401: 'Invalid API key. Check TOQAN_API_KEY in constants.js.',
            403: 'Access denied.',
            429: 'Rate limit reached. Please wait a moment.',
            500: 'Toqan server error. Please try again.'
        };
        throw new Error(statusMessages[response.status] || 'API error ' + response.status);
    }

    const data = await response.json();

    // Save conversation_id from first response so we can continue the thread
    // Adapt field name once you see the actual response shape:
    _chatConversationId =
        data.conversation_id ||
        data.id              ||
        data.conversationId  ||
        _chatConversationId;  // keep existing if not returned again

    // Extract the assistant reply text — adapt field name if needed
    var reply =
        data.message         ||
        data.response        ||
        data.content         ||
        data.answer          ||
        data.text            ||
        (data.messages && data.messages[data.messages.length - 1] && data.messages[data.messages.length - 1].content) ||
        'I received your message but could not parse the response. Raw: ' + JSON.stringify(data);

    return reply;
}

// ── Context builder ───────────────────────────────────────────────────────────
// Summarises live app data into a compact text block.
// Sent once with the first message so the agent understands the data.
function _buildContextPrefix() {
    var lines = [
        'You are a workstation inspection assistant for JustEatTakeaway BER offices.',
        'You have access to real-time inspection data from the Workstation Checkup app.',
        'Answer questions concisely and helpfully. Format lists clearly.',
        '',
        '=== CURRENT INSPECTION DATA ==='
    ];

    // Overall totals
    var total = 0, inspected = 0, issues = 0, pending = 0;
    var buildingStats = {};

    floorConfigs.forEach(function(floor) {
        floor.desks.forEach(function(desk) {
            var type = desk.type || 'Desk';
            if (type === 'Bathroom' || type === 'Collaboration') return;
            total++;
            var d  = desksData[desk.number];
            var st = d ? d.status : 'pending';
            if (st === 'inspected') inspected++;
            else if (st === 'issue') issues++;
            else pending++;

            if (!buildingStats[floor.building]) {
                buildingStats[floor.building] = { total:0, inspected:0, issues:0, pending:0 };
            }
            buildingStats[floor.building].total++;
            buildingStats[floor.building][st === 'inspected' ? 'inspected'
                                        : st === 'issue'     ? 'issues'
                                        :                      'pending']++;
        });
    });

    var completion = total > 0 ? Math.round(((inspected + issues) / total) * 100) : 0;
    lines.push('Total items: ' + total +
        ' | Inspected: ' + inspected +
        ' | Issues: ' + issues +
        ' | Pending: ' + pending +
        ' | Completion: ' + completion + '%');

    // Per-building summary
    lines.push('');
    lines.push('Building breakdown:');
    Object.keys(buildingStats).sort().forEach(function(b) {
        var s = buildingStats[b];
        var pct = s.total > 0 ? Math.round(((s.inspected + s.issues) / s.total) * 100) : 0;
        lines.push('  Building ' + b + ': ' + s.total + ' total, ' +
            s.inspected + ' inspected, ' + s.issues + ' issues, ' +
            s.pending + ' pending (' + pct + '% visited)');
    });

    // Desks with issues — list them with missing equipment
    var issueDesks = [];
    floorConfigs.forEach(function(floor) {
        floor.desks.forEach(function(desk) {
            var d = desksData[desk.number];
            if (!d || d.status !== 'issue') return;
            var missing = [];
            var checks = {
                checkPower:'Power', checkLAN:'LAN', checkMon1:'Mon 1', checkMon2:'Mon 2',
                checkTBT:'TBT', checkKeyboard:'Keyboard', checkDocking:'Docking', checkMouse:'Mouse',
                checkMic:'Mic', checkSpeakers:'Speakers', checkCamera:'Camera', checkWhiteboard:'Whiteboard'
            };
            Object.keys(checks).forEach(function(k) {
                if (d[k] === false) missing.push(checks[k]);
            });
            issueDesks.push({
                id:       desk.number,
                building: floor.building,
                floor:    floor.floor,
                missing:  missing,
                remarks:  d.remarks || ''
            });
        });
    });

    if (issueDesks.length > 0) {
        lines.push('');
        lines.push('Desks/rooms with issues (' + issueDesks.length + ' total):');
        // Limit to 50 to keep context manageable
        issueDesks.slice(0, 50).forEach(function(desk) {
            var row = '  ' + desk.id + ' (Bldg ' + desk.building + ' Floor ' + desk.floor + ')';
            if (desk.missing.length) row += ' — missing: ' + desk.missing.join(', ');
            if (desk.remarks) row += ' — note: "' + desk.remarks.substring(0, 80) + '"';
            lines.push(row);
        });
        if (issueDesks.length > 50) {
            lines.push('  ... and ' + (issueDesks.length - 50) + ' more');
        }
    }

    // Currently selected floor
    if (currentFloor) {
        lines.push('');
        lines.push('Currently viewing: Building ' + currentFloor.building +
            ', Floor ' + currentFloor.floor +
            ' (' + (currentFloor.desks ? currentFloor.desks.length : 0) + ' items on this floor)');
    }

    // Logged-in user
    if (currentUser) {
        lines.push('User: ' + currentUser.email);
    }

    lines.push('=== END OF DATA ===');
    return lines.join('\n');
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function _appendMessage(role, content) {
    var body = document.getElementById('chatMessages');
    if (!body) return;

    var div = document.createElement('div');
    div.className = 'chat-message chat-message--' + role;

    // Convert newlines to <br> for readability
    var safe = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

    div.innerHTML = '<div class="chat-bubble">' + safe + '</div>';
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
}

function _setLoading(on) {
    _chatWaiting = on;
    var loading = document.getElementById('chatLoading');
    var sendBtn = document.getElementById('chatSendBtn');
    if (loading) loading.style.display = on ? 'flex' : 'none';
    if (sendBtn) sendBtn.disabled = on;
}

function clearChat() {
    var body = document.getElementById('chatMessages');
    if (body) body.innerHTML = '';
    _chatConversationId = null;
    _chatWaiting        = false;
    // Show welcome message again
    _appendMessage('assistant',
        'Hi! I\'m your workstation inspection assistant. ' +
        'Ask me anything about the current inspection data.\n\n' +
        'Examples:\n' +
        '• "Which desks have issues in Building E?"\n' +
        '• "How many desks are pending on Floor 4?"\n' +
        '• "Which meeting rooms are missing cameras?"'
    );
}

// ── Auto-init on DOM ready ────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChat);
} else {
    initChat();
}
