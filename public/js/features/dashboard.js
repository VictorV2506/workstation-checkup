//var completion = total > 0 ? Math.round((inspected / total) * 100) : 0;// dashboard.js — Session 17 (fix): interactive dashboard + equipment analysis.
// Depends on globals: floorConfigs, desksData (read-only)
// Exposes globals: updateDashboard, switchTab, switchTabTo,
//                  openDrillDown, closeDrillDown, navigateToDesk

        var buildingChart = null;
        var statusChart   = null;

        // Missing Items — equipment checkboxes tracked across inspected desks
        var MISSING_CHECKS = [
            { field: 'checkPower',    label: 'Power',    icon: '\u26a1' },
            { field: 'checkLAN',      label: 'LAN',      icon: '\uD83D\uDD0C' },
            { field: 'checkMon1',     label: 'Mon 1',    icon: '\uD83D\uDDA5' },
            { field: 'checkMon2',     label: 'Mon 2',    icon: '\uD83D\uDDA5' },
            { field: 'checkTBT',      label: 'TBT',      icon: '\u26a1' },
            { field: 'checkKeyboard', label: 'Keyboard', icon: '\u2328' },
            { field: 'checkDocking',  label: 'Docking',  icon: '\uD83D\uDD17' },
            { field: 'checkMouse',    label: 'Mouse',    icon: '\uD83D\uDDB1' },
        ];

        function updateDashboard() {
            var total = 0, inspected = 0, issues = 0;
            floorConfigs.forEach(function(floor) {
                var di = floor.desks.filter(function(d) { return !d.type || d.type === 'Desk'; });
                total     += di.length;
                inspected += di.filter(function(d) { return desksData[d.number] && desksData[d.number].status === 'inspected'; }).length;
                issues    += di.filter(function(d) { return desksData[d.number] && desksData[d.number].status === 'issue'; }).length;
            });
            var completion = total > 0 ? Math.round(((inspected + issues) / total) * 100) : 0;
            document.getElementById('dashTotalDesks').textContent = total;
            document.getElementById('dashInspected').textContent  = inspected;
            document.getElementById('dashIssues').textContent     = issues;
            document.getElementById('dashCompletion').textContent = completion + '%';
            renderCharts();
            renderEquipmentAnalysis();
            renderMissingItems();
        }

        function switchTabTo(tabName) {
            document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
            document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
            document.querySelectorAll('.tab').forEach(function(t) {
                var oc = t.getAttribute('onclick') || '';
                if (oc.indexOf("'" + tabName + "'") !== -1) { t.classList.add('active'); }
            });
            document.getElementById(tabName + 'Tab').classList.add('active');
            if (tabName === 'dashboard') {
                loadMissingInspections().then(function() { updateDashboard(); });
            }
            if (tabName === 'history')   { loadHistory(30); }
        }

        function switchTab(tabName) {
            switchTabTo(tabName);
        }

        function renderCharts() {
            var buildingData = {};
            floorConfigs.forEach(function(floor) {
                if (!buildingData[floor.building]) { buildingData[floor.building] = { total: 0, inspected: 0 }; }
                floor.desks.filter(function(d) { return !d.type || d.type === 'Desk'; }).forEach(function(desk) {
                    buildingData[floor.building].total++;
                    if (desksData[desk.number] && desksData[desk.number].status === 'inspected') { buildingData[floor.building].inspected++; }
                });
            });
            var bKeys  = Object.keys(buildingData).sort();
            var bInsp  = bKeys.map(function(b) { return buildingData[b].inspected; });
            var bTotal = bKeys.map(function(b) { return buildingData[b].total; });

            var buildingCtx = document.getElementById('buildingChart');
            if (buildingChart) { buildingChart.destroy(); }
            buildingChart = new Chart(buildingCtx, {
                type: 'bar',
                data: {
                    labels: bKeys.map(function(b) { return 'Building ' + b; }),
                    datasets: [
                        { label: 'Inspected', data: bInsp,  backgroundColor: '#667eea' },
                        { label: 'Remaining', data: bTotal.map(function(t, i) { return t - bInsp[i]; }), backgroundColor: '#e5e7eb' }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
            });

            var pending = 0, inspectedCount = 0, issuesCount = 0;
            floorConfigs.forEach(function(floor) {
                floor.desks.filter(function(d) { return !d.type || d.type === 'Desk'; }).forEach(function(desk) {
                    var st = desksData[desk.number] && desksData[desk.number].status;
                    if (st === 'inspected') { inspectedCount++; }
                    else if (st === 'issue') { issuesCount++; }
                    else { pending++; }
                });
            });

            var statusCtx = document.getElementById('statusChart');
            if (statusChart) { statusChart.destroy(); }
            statusChart = new Chart(statusCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Pending', 'Inspected', 'Issues'],
                    datasets: [{ data: [pending, inspectedCount, issuesCount], backgroundColor: ['#f59e0b', '#10b981', '#f43f5e'] }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: function(evt, elements) {
                        if (!elements || elements.length === 0) { return; }
                        var statusMap = ['pending', 'inspected', 'issue'];
                        openDrillDown(statusMap[elements[0].index]);
                    }
                }
            });
        }

        function openDrillDown(filter) {
            var rows = [];
            var isMissing    = (filter.indexOf('missing:') === 0);
            var missingField = isMissing ? filter.slice(8) : null;

            floorConfigs.forEach(function(floor) {
                floor.desks.filter(function(d) { return !d.type || d.type === 'Desk'; }).forEach(function(desk) {
                    var data    = desksData[desk.number];
                    var st      = (data && data.status) || 'pending';
                    var include = false;

                    if (isMissing) {
                        // Only inspected desks where the checkbox field is explicitly false
                        include = !!(data && (data.status === 'inspected' || data.status === 'issue') && data[missingField] === false);
                    } else {
                        include = (filter === 'all' || st === filter);
                    }

                    if (include) {
                        rows.push({
                            id:         desk.number,
                            building:   floor.building,
                            floorLabel: 'Floor ' + floor.floor,
                            floorId:    floor.id,
                            status:     st
                        });
                    }
                });
            });

            var labelMap = { all: 'All Desks', pending: 'Pending Desks', inspected: 'Inspected Desks', issue: 'Desks with Issues' };
            var title;
            if (isMissing) {
                var checkLabel = '';
                MISSING_CHECKS.forEach(function(c) { if (c.field === missingField) { checkLabel = c.label; } });
                title = 'Missing: ' + checkLabel + ' (' + rows.length + ' desk' + (rows.length !== 1 ? 's' : '') + ')';
            } else {
                title = (labelMap[filter] || 'Desks') + ' (' + rows.length + ')';
            }
            document.getElementById('drillDownTitle').textContent = title;

            var bodyEl = document.getElementById('drillDownBody');
            if (rows.length === 0) {
                bodyEl.innerHTML = '<p class="drill-empty">No desks match this filter.</p>';
            } else {
                var jiraBtn = '';
                if (filter === 'issue' && typeof openMasterJiraModal === 'function') {
                    jiraBtn = '<div style="margin-bottom:16px;display:flex;justify-content:flex-end;">' +
                        '<button onclick="openMasterJiraModal()" style="background:#667eea;color:#fff;border:none;' +
                        'padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">' +
                        '\uD83C\uDFAB Create Jira Tickets</button></div>';
                }
    
                var rowsHtml = rows.map(function(r) {
    
                    var goClick = 'navigateToDesk(\'' + r.id + '\',\'' + r.building + '\',\'' + r.floorId + '\')';
                    return '<tr>' +
                        '<td class="dd-desk-id">' + r.id + '</td>' +
                        '<td>Building ' + r.building + '</td>' +
                        '<td>' + r.floorLabel + '</td>' +
                        '<td><span class="status-pill status-pill--' + r.status + '">' + r.status + '</span></td>' +
                        '<td><button class="btn-go" onclick="' + goClick + '">Go &#8594;</button></td>' +
                        '</tr>';
                }).join('');



                bodyEl.innerHTML = jiraBtn +
                    '<table class="drill-table">' +

                    '<thead><tr><th>Desk ID</th><th>Building</th><th>Floor</th><th>Status</th><th></th></tr></thead>' +
                    '<tbody>' + rowsHtml + '</tbody>' +
                    '</table>';
            }
            document.getElementById('drillDownModal').style.display = 'flex';
        }

        function closeDrillDown() {
            document.getElementById('drillDownModal').style.display = 'none';
        }

        // onBuildingChange() is fully synchronous — no setTimeout needed.
        // Floor select option values are floor.id, not floor.floor (the number).
        function navigateToDesk(deskId, building, floorId) {
            closeDrillDown();
            switchTabTo('inspect');
            document.getElementById('buildingSelect').value = building;
            onBuildingChange();
            document.getElementById('floorSelect').value = floorId;
            onFloorChange();
        }

        // WHITELIST: only Desk, MeetingRoom, ServerRoom are shown.
        // All other types in the floor data are silently ignored.
        function renderEquipmentAnalysis() {
            var WHITELIST = { 'Desk': true, 'MeetingRoom': true, 'ServerRoom': true };
            var typeInfo  = {
                'Desk':        { label: 'Desks',        icon: '\uD83E\uDE91' },
                'MeetingRoom': { label: 'Meeting Rooms', icon: '\uD83D\uDCC5' },
                'ServerRoom':  { label: 'Server Rooms',  icon: '\uD83D\uDDA5\uFE0F' }
            };
            var ORDER  = ['Desk', 'MeetingRoom', 'ServerRoom'];
            var counts = {
                'Desk':        { total: 0, inspected: 0, issues: 0 },
                'MeetingRoom': { total: 0, inspected: 0, issues: 0 },
                'ServerRoom':  { total: 0, inspected: 0, issues: 0 }
            };

            floorConfigs.forEach(function(floor) {
                floor.desks.forEach(function(desk) {
                    var t = desk.type || 'Desk';
                    if (!WHITELIST[t]) { return; }
                    counts[t].total++;
                    var st = desksData[desk.number] && desksData[desk.number].status;
                    if (st === 'inspected') { counts[t].inspected++; }
                    else if (st === 'issue') { counts[t].issues++; }
                });
            });

            var container = document.getElementById('equipmentGrid');
            container.innerHTML = '';
            ORDER.forEach(function(t) {
                var c    = counts[t];
                var info = typeInfo[t];
                var pct  = c.total > 0 ? Math.round((c.inspected / c.total) * 100) : 0;
                var card = document.createElement('div');
                card.className = 'equip-card';
                card.innerHTML =
                    '<div class="equip-icon">' + info.icon + '</div>' +
                    '<div class="equip-label">' + info.label + '</div>' +
                    '<div class="equip-total">' + c.total + ' total</div>' +
                    '<div class="equip-stats">' +
                        '<span class="equip-inspected">' + c.inspected + ' inspected</span>' +
                        (c.issues > 0 ? ' <span class="equip-issues">' + c.issues + ' issues</span>' : '') +
                    '</div>' +
                    '<div class="equip-bar"><div class="equip-bar-fill" style="width:' + pct + '%"></div></div>' +
                    '<div class="equip-pct">' + pct + '%</div>';
                container.appendChild(card);
            });
        }

        // ── Missing Items ─────────────────────────────────────────────────────────
        // Counts inspected desks where each checkbox field is explicitly false.
        // Pending desks are excluded — unchecked on a pending desk = not yet visited.
        function renderMissingItems() {
            var container = document.getElementById('missingItemsGrid');
            if (!container) { return; }
            container.innerHTML = '';

            MISSING_CHECKS.forEach(function(check) {
                var count = 0;
                floorConfigs.forEach(function(floor) {
                    floor.desks
                        .filter(function(d) { return !d.type || d.type === 'Desk'; })
                        .forEach(function(desk) {
                            var data = desksData[desk.number];
                            if (data && (data.status === 'inspected' || data.status === 'issue') && data[check.field] === false) {
                                count++;
                            }
                        });
                });

                var hasAlert = count > 0;
                var card     = document.createElement('div');
                card.className = 'missing-card' + (hasAlert ? ' missing-card--alert' : '');
                card.setAttribute('role', 'button');
                card.setAttribute('tabindex', '0');
                card.title = 'Click to see desks missing ' + check.label;
                card.onclick  = function() { openDrillDown('missing:' + check.field); };
                card.onkeydown = function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openDrillDown('missing:' + check.field);
                    }
                };
                card.innerHTML =
                    '<div class="missing-card-icon">' + check.icon + '</div>'  +
                    '<div class="missing-card-label">' + check.label + '</div>' +
                    '<div class="missing-card-count' + (hasAlert ? ' missing-card-count--alert' : '') + '">' + count + '</div>' +
                    '<div class="missing-card-sub">' + (count === 1 ? 'desk missing' : 'desks missing') + '</div>';
                container.appendChild(card);
            });
        }
