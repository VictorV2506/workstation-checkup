// dashboard.js — Session 16: desk-only counts throughout.
// Depends on globals: floorConfigs, desksData

        var buildingChart = null;
        var statusChart   = null;

        function updateDashboard() {
            var total = 0, inspected = 0, issues = 0;
            floorConfigs.forEach(function(floor) {
                var di = floor.desks.filter(function(d) { return !d.type || d.type === 'Desk'; });
                total     += di.length;
                inspected += di.filter(function(d) { return desksData[d.id] && desksData[d.id].status === 'inspected'; }).length;
                issues    += di.filter(function(d) { return desksData[d.id] && desksData[d.id].status === 'issue'; }).length;
            });
            var completion = total > 0 ? Math.round((inspected / total) * 100) : 0;
            document.getElementById('dashTotalDesks').textContent = total;
            document.getElementById('dashInspected').textContent  = inspected;
            document.getElementById('dashIssues').textContent     = issues;
            document.getElementById('dashCompletion').textContent = completion + '%';
            renderCharts();
            renderFloorBreakdown();
        }

        function renderCharts() {
            var buildingData = {};
            floorConfigs.forEach(function(floor) {
                if (!buildingData[floor.building]) buildingData[floor.building] = { total: 0, inspected: 0 };
                floor.desks.filter(function(d) { return !d.type || d.type === 'Desk'; }).forEach(function(desk) {
                    buildingData[floor.building].total++;
                    if (desksData[desk.id] && desksData[desk.id].status === 'inspected') buildingData[floor.building].inspected++;
                });
            });
            var bKeys  = Object.keys(buildingData).sort();
            var bInsp  = bKeys.map(function(b) { return buildingData[b].inspected; });
            var bTotal = bKeys.map(function(b) { return buildingData[b].total; });

            var buildingCtx = document.getElementById('buildingChart');
            if (buildingChart) buildingChart.destroy();
            buildingChart = new Chart(buildingCtx, {
                type: 'bar',
                data: {
                    labels: bKeys.map(function(b) { return 'Building ' + b; }),
                    datasets: [
                        { label: 'Inspected', data: bInsp,  backgroundColor: '#667eea' },
                        { label: 'Remaining', data: bTotal.map(function(t,i) { return t - bInsp[i]; }), backgroundColor: '#e5e7eb' }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
            });

            var pending = 0, inspectedCount = 0, issuesCount = 0;
            floorConfigs.forEach(function(floor) {
                floor.desks.filter(function(d) { return !d.type || d.type === 'Desk'; }).forEach(function(desk) {
                    var st = desksData[desk.id] && desksData[desk.id].status;
                    if (st === 'inspected') inspectedCount++;
                    else if (st === 'issue') issuesCount++;
                    else pending++;
                });
            });
            var statusCtx = document.getElementById('statusChart');
            if (statusChart) statusChart.destroy();
            statusChart = new Chart(statusCtx, {
                type: 'doughnut',
                data: { labels: ['Pending','Inspected','Issues'], datasets: [{ data: [pending, inspectedCount, issuesCount], backgroundColor: ['#f59e0b','#10b981','#f43f5e'] }] },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        function renderFloorBreakdown() {
            var container = document.getElementById('floorBreakdown');
            container.innerHTML = '';
            floorConfigs.forEach(function(floor) {
                var di  = floor.desks.filter(function(d) { return !d.type || d.type === 'Desk'; });
                var pct = di.length > 0 ? Math.round(di.filter(function(d) { return desksData[d.id] && desksData[d.id].status === 'inspected'; }).length / di.length * 100) : 0;
                var box = document.createElement('div');
                box.className = 'stat-box';
                box.innerHTML = '<div class="stat-box-value">' + pct + '%</div><div class="stat-box-label">Building ' + floor.building + ' - Floor ' + floor.floor + '</div>';
                container.appendChild(box);
            });
        }

        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
            document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
            event.target.classList.add('active');
            document.getElementById(tabName + 'Tab').classList.add('active');
            if (tabName === 'dashboard') updateDashboard();
        }
