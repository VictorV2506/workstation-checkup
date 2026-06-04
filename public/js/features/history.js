// public/js/features/history.js
//
// History module for Workstation Checkup.
// Records, loads, and displays desk inspection history.
//
// Firestore collection: 'history'
// Document structure:
//   { deskId, building, floor, changedBy, changedAt, action, status, changes }
//
// Depends on: firebase-config.js (db), state.js (floorConfigs, currentUser)
// Exposes:    writeHistoryEntry(), writeBulkHistoryEntries(), loadHistory(),
//             loadMoreHistory(), openDeskTimeline(), closeTimeline()
//
// Load order: AFTER state.js, BEFORE inspection-modal.js and bulk-edit.js

// ── Desk lookup cache ─────────────────────────────────────────────────────────
// Built lazily: deskNumber → { building, floor }
var _deskLookupCache = null;

function _getDeskInfo(deskId) {
    if (!_deskLookupCache) {
        _deskLookupCache = {};
        floorConfigs.forEach(function(f) {
            f.desks.forEach(function(d) {
                if (d.number) {
                    _deskLookupCache[d.number] = {
                        building: f.building,
                        floor:    String(f.floor)
                    };
                }
            });
        });
    }
    return _deskLookupCache[deskId] || { building: '?', floor: '?' };
}

// ── Field labels (shared by table and timeline) ───────────────────────────────
var _FIELD_LABELS = {
    status:         'Status',
    leftMonitor:    'Left Monitor',
    rightMonitor:   'Right Monitor',
    dock:           'Dock',
    remarks:        'Remarks',
    checkPower:     'Power',
    checkLAN:       'LAN',
    checkMon1:      'Mon 1',
    checkMon2:      'Mon 2',
    checkTBT:       'TBT',
    checkKeyboard:  'Keyboard',
    checkDocking:   'Docking',
    checkMouse:     'Mouse',
    checkMic:       'Mic',
    checkSpeakers:  'Speakers',
    checkCamera:    'Camera',
    checkWhiteboard:'Whiteboard',
    tvSize:         'TV Size',
    capacity:       'Capacity'
};

var _TRACKED_FIELDS = Object.keys(_FIELD_LABELS);

// ── Change detection ──────────────────────────────────────────────────────────
function _computeChanges(oldData, newData) {
    var changes = {};
    _TRACKED_FIELDS.forEach(function(field) {
        var oldVal = (oldData && oldData[field] !== undefined) ? oldData[field] : null;
        var newVal = (newData && newData[field] !== undefined) ? newData[field] : null;
        if (oldVal !== newVal) {
            changes[field] = { from: oldVal, to: newVal };
        }
    });
    return changes;
}

// ── Write a single history entry ──────────────────────────────────────────────
// Fire-and-forget: does not block the UI. Called from inspection-modal.js.
function writeHistoryEntry(deskId, oldData, newData, action) {
    if (!currentUser || !deskId) return;

    var info    = _getDeskInfo(deskId);
    var changes = _computeChanges(oldData || {}, newData || {});

    // Skip if nothing changed (except resets which we always record)
    if (Object.keys(changes).length === 0 && action !== 'reset') return;

    db.collection('history').add({
        deskId:    deskId,
        building:  info.building,
        floor:     info.floor,
        changedBy: currentUser.email,
        changedAt: firebase.firestore.FieldValue.serverTimestamp(),
        action:    action,
        status:    (newData && newData.status) ? newData.status
                 : (oldData && oldData.status) ? oldData.status : 'pending',
        changes:   changes
    }).catch(function(err) {
        console.error('History write failed:', err);
    });
}

// ── Write bulk history entries ────────────────────────────────────────────────
// Batched writes. Handles Firestore's 500-op limit by chunking.
// Called from bulk-edit.js and inspection-modal.js bulk path.
// getOldData: function(deskId) → oldDataObject
function writeBulkHistoryEntries(deskIds, getOldData, newData, action) {
    if (!currentUser || !deskIds || deskIds.length === 0) return;

    var CHUNK = 490;
    for (var i = 0; i < deskIds.length; i += CHUNK) {
        var chunk = deskIds.slice(i, i + CHUNK);
        var batch = db.batch();
        var hasEntries = false;

        chunk.forEach(function(deskId) {
            var oldData = getOldData(deskId) || {};
            var info    = _getDeskInfo(deskId);
            var changes = _computeChanges(oldData, newData || {});
            if (Object.keys(changes).length === 0 && action !== 'reset') return;

            var ref = db.collection('history').doc();
            batch.set(ref, {
                deskId:    deskId,
                building:  info.building,
                floor:     info.floor,
                changedBy: currentUser.email,
                changedAt: firebase.firestore.FieldValue.serverTimestamp(),
                action:    action,
                status:    (newData && newData.status) ? newData.status
                         : (oldData && oldData.status) ? oldData.status : 'pending',
                changes:   changes
            });
            hasEntries = true;
        });

        if (hasEntries) {
            batch.commit().catch(function(err) {
                console.error('Bulk history write failed:', err);
            });
        }
    }
}

// ── History loading state ─────────────────────────────────────────────────────
var _historyLastDoc    = null;
var _historyDaysFilter = 30;
var _historyLoading    = false;

// ── Load / reload history ─────────────────────────────────────────────────────
function loadHistory(days) {
    _historyDaysFilter = days || 30;
    _historyLastDoc    = null;
    _deskLookupCache   = null; // invalidate so it rebuilds with current floorConfigs

    // Highlight active filter button
    document.querySelectorAll('.history-filter-btn').forEach(function(btn) {
        btn.classList.toggle('active', parseInt(btn.dataset.days) === _historyDaysFilter);
    });

    var container = document.getElementById('historyTableContainer');
    if (container) container.innerHTML = '<p class="history-empty">Loading history\u2026</p>';
    var moreBtn = document.getElementById('historyLoadMore');
    if (moreBtn) moreBtn.style.display = 'none';

    _fetchHistoryPage(true);
}

function loadMoreHistory() {
    _fetchHistoryPage(false);
}

function _fetchHistoryPage(isFirstPage) {
    if (_historyLoading) return;
    _historyLoading = true;

    var since = new Date();
    since.setDate(since.getDate() - _historyDaysFilter);

    var query = db.collection('history')
        .where('changedAt', '>=', firebase.firestore.Timestamp.fromDate(since))
        .orderBy('changedAt', 'desc')
        .limit(50);

    if (!isFirstPage && _historyLastDoc) {
        query = query.startAfter(_historyLastDoc);
    }

    query.get().then(function(snapshot) {
        _historyLoading = false;
        _historyLastDoc = snapshot.docs.length > 0
            ? snapshot.docs[snapshot.docs.length - 1] : null;

        var records = snapshot.docs.map(function(doc) {
            return Object.assign({ _id: doc.id }, doc.data());
        });

        if (isFirstPage) {
            _renderHistoryTable(records);
        } else {
            _appendHistoryRows(records);
        }

        var moreBtn = document.getElementById('historyLoadMore');
        if (moreBtn) moreBtn.style.display = snapshot.docs.length >= 50 ? 'block' : 'none';

    }).catch(function(err) {
        _historyLoading = false;
        var container = document.getElementById('historyTableContainer');
        if (container) {
            container.innerHTML = '<p class="history-error">Error loading history: ' + err.message + '</p>';
        }
    });
}

// ── Render history table ──────────────────────────────────────────────────────
function _renderHistoryTable(records) {
    var container = document.getElementById('historyTableContainer');
    if (!container) return;

    if (records.length === 0) {
        container.innerHTML = '<p class="history-empty">No changes recorded in this period.</p>';
        return;
    }

    container.innerHTML =
        '<table class="history-table">' +
        '<thead><tr>' +
        '<th>Desk ID</th><th>Building</th><th>Floor</th>' +
        '<th>Changed By</th><th>When</th><th>Status</th><th>What Changed</th>' +
        '</tr></thead>' +
        '<tbody id="historyTableBody">' +
        records.map(_renderHistoryRow).join('') +
        '</tbody>' +
        '</table>';
}

function _appendHistoryRows(records) {
    var tbody = document.getElementById('historyTableBody');
    if (tbody) tbody.innerHTML += records.map(_renderHistoryRow).join('');
}

function _renderHistoryRow(record) {
    var when   = record.changedAt
        ? _formatRelative(record.changedAt.toDate ? record.changedAt.toDate() : new Date(record.changedAt))
        : '\u2014';
    var who    = record.changedBy ? record.changedBy.split('@')[0] : '\u2014';
    var full   = record.changedBy || '';
    var summ   = _summariseChanges(record.changes || {});
    var pill   = _statusPill(record.status);

    return '<tr class="history-row" onclick="openDeskTimeline(\'' + record.deskId + '\')" ' +
        'title="Click to see full history for this desk">' +
        '<td class="history-desk-id">' + (record.deskId || '\u2014') + '</td>' +
        '<td>Bldg ' + (record.building || '\u2014') + '</td>' +
        '<td>Floor ' + (record.floor    || '\u2014') + '</td>' +
        '<td class="history-user" title="' + full + '">' + who + '</td>' +
        '<td class="history-when">' + when + '</td>' +
        '<td>' + pill + '</td>' +
        '<td class="history-changes">' + summ + '</td>' +
        '</tr>';
}

function _summariseChanges(changes) {
    var parts = [];
    Object.keys(changes).forEach(function(field) {
        var label = _FIELD_LABELS[field] || field;
        var c     = changes[field];
        if (field === 'status') {
            parts.push(label + ': ' + (c.from || 'pending') + ' \u2192 ' + (c.to || 'pending'));
        } else if (typeof c.to === 'boolean') {
            parts.push(label + ': ' + (c.to ? '\u2713' : '\u2717'));
        } else if (c.to !== null && c.to !== '' && c.to !== undefined) {
            parts.push(label + ' updated');
        }
    });
    return parts.length ? parts.join(' \u00b7 ') : '\u2014';
}

// ── Per-desk timeline modal ───────────────────────────────────────────────────
function openDeskTimeline(deskId) {
    var modal = document.getElementById('timelineModal');
    var title = document.getElementById('timelineTitle');
    var body  = document.getElementById('timelineBody');
    if (!modal) return;

    title.textContent = 'History: ' + deskId;
    body.innerHTML    = '<p class="history-empty">Loading\u2026</p>';
    modal.style.display = 'flex';

    // Load all records for this desk, sort in JS (avoids needing a composite index)
    db.collection('history')
        .where('deskId', '==', deskId)
        .get()
        .then(function(snapshot) {
            if (snapshot.empty) {
                body.innerHTML = '<p class="history-empty">No history recorded for this desk yet.</p>';
                return;
            }

            var records = snapshot.docs.map(function(doc) { return doc.data(); });
            // Sort newest first in JS
            records.sort(function(a, b) {
                var at = a.changedAt && a.changedAt.seconds ? a.changedAt.seconds : 0;
                var bt = b.changedAt && b.changedAt.seconds ? b.changedAt.seconds : 0;
                return bt - at;
            });

            body.innerHTML = '<div class="timeline">' +
                records.map(function(r) {
                    var when = r.changedAt
                        ? _formatFull(r.changedAt.toDate ? r.changedAt.toDate() : new Date(r.changedAt))
                        : '\u2014';
                    var changeLines = _renderChangeLines(r.changes || {});
                    return '<div class="timeline-entry">' +
                        '<div class="timeline-dot timeline-dot--' + (r.status || 'pending') + '"></div>' +
                        '<div class="timeline-content">' +
                            '<div class="timeline-meta">' +
                                '<span class="timeline-when">' + when + '</span>' +
                                _statusPill(r.status) +
                            '</div>' +
                            '<div class="timeline-who">' + (r.changedBy || '\u2014') + '</div>' +
                            (changeLines ? '<div class="timeline-changes">' + changeLines + '</div>' : '') +
                        '</div>' +
                        '</div>';
                }).join('') +
                '</div>';
        })
        .catch(function(err) {
            body.innerHTML = '<p class="history-error">Error: ' + err.message + '</p>';
        });
}

function closeTimeline() {
    var modal = document.getElementById('timelineModal');
    if (modal) modal.style.display = 'none';
}

function _renderChangeLines(changes) {
    var lines = [];
    Object.keys(changes).forEach(function(field) {
        var label = _FIELD_LABELS[field] || field;
        var c     = changes[field];
        if (typeof c.to === 'boolean') {
            lines.push('<span class="change-item change-item--' + (c.to ? 'added' : 'removed') + '">' +
                label + ': ' + (c.to ? '\u2713 Present' : '\u2717 Missing') + '</span>');
        } else if (field === 'status') {
            lines.push('<span class="change-item">' + label + ': <strong>' +
                (c.from || 'pending') + '</strong> \u2192 <strong>' + (c.to || 'pending') + '</strong></span>');
        } else {
            var fromStr = (c.from && c.from !== '') ? ('"' + c.from + '"') : 'none';
            var toStr   = (c.to   && c.to   !== '') ? ('"' + c.to   + '"') : 'none';
            lines.push('<span class="change-item">' + label + ': ' + fromStr + ' \u2192 ' + toStr + '</span>');
        }
    });
    return lines.join('');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _statusPill(status) {
    var cls = status === 'inspected' ? 'status-pill--inspected'
            : status === 'issue'     ? 'status-pill--issue'
            :                          'status-pill--pending';
    return '<span class="status-pill ' + cls + '">' + (status || 'pending') + '</span>';
}

function _formatRelative(date) {
    if (!date) return '\u2014';
    var diff = Date.now() - date.getTime();
    var m = Math.floor(diff / 60000);
    var h = Math.floor(diff / 3600000);
    var d = Math.floor(diff / 86400000);
    if (m < 1)  return 'just now';
    if (m < 60) return m + 'm ago';
    if (h < 24) return h + 'h ago';
    if (d <  7) return d + 'd ago';
    return date.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function _formatFull(date) {
    if (!date) return '\u2014';
    return date.toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}
