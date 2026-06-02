// dashboard.js
// Dashboard tab: totals, charts, floor breakdown, tab switching
// Depends on globals: floorConfigs, desksData
// Calls: renderCharts(), renderFloorBreakdown() (internal)

        // Charts
        let buildingChart = null;
        let statusChart = null;

        function updateDashboard() {
            let total = 0, inspected = 0, issues = 0;
            
            floorConfigs.forEach(floor => {
                total += floor.desks.length;
                inspected += floor.desks.filter(d => desksData[d.id]?.status === 'inspected').length;
                issues += floor.desks.filter(d => desksData[d.id]?.status === 'issue').length;
            });
            
            const completion = total > 0 ? Math.round((inspected / total) * 100) : 0;
            
            document.getElementById('dashTotalDesks').textContent = total;
            document.getElementById('dashInspected').textContent = inspected;
            document.getElementById('dashIssues').textContent = issues;
            document.getElementById('dashCompletion').textContent = completion + '%';
            
            renderCharts();
            renderFloorBreakdown();
        }

        function renderCharts() {
            const buildingData = {};
            floorConfigs.forEach(floor => {
                if (!buildingData[floor.building]) {
                    buildingData[floor.building] = { total: 0, inspected: 0 };
                }
                floor.desks.forEach(desk => {
                    buildingData[floor.building].total++;
                    if (desksData[desk.id]?.status === 'inspected') {
                        buildingData[floor.building].inspected++;
                    }
                });
            });
            
            const buildingLabels = Object.keys(buildingData).sort().map(b => `Building ${b}`);
            const buildingInspected = Object.keys(buildingData).sort().map(b => buildingData[b].inspected);
            const buildingTotal = Object.keys(buildingData).sort().map(b => buildingData[b].total);
            
            const buildingCtx = document.getElementById('buildingChart');
            if (buildingChart) buildingChart.destroy();
            buildingChart = new Chart(buildingCtx, {
                type: 'bar',
                data: {
                    labels: buildingLabels,
                    datasets: [{
                        label: 'Inspected',
                        data: buildingInspected,
                        backgroundColor: '#667eea'
                    }, {
                        label: 'Remaining',
                        data: buildingTotal.map((total, i) => total - buildingInspected[i]),
                        backgroundColor: '#e5e7eb'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { stacked: true },
                        y: { stacked: true }
                    }
                }
            });
            
            let totalDesks = 0, pending = 0, inspectedCount = 0, issuesCount = 0;
            
            floorConfigs.forEach(floor => {
                floor.desks.forEach(desk => {
                    totalDesks++;
                    const status = desksData[desk.id]?.status;
                    if (status === 'inspected') inspectedCount++;
                    else if (status === 'issue') issuesCount++;
                    else pending++;
                });
            });
            
            const statusCtx = document.getElementById('statusChart');
            if (statusChart) statusChart.destroy();
            statusChart = new Chart(statusCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Pending', 'Inspected', 'Issues'],
                    datasets: [{
                        data: [pending, inspectedCount, issuesCount],
                        backgroundColor: ['#f59e0b', '#10b981', '#f43f5e']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        function renderFloorBreakdown() {
            const container = document.getElementById('floorBreakdown');
            container.innerHTML = '';
            
            floorConfigs.forEach(floor => {
                const floorDesks = floor.desks.length;
                const floorInspected = floor.desks.filter(d => desksData[d.id]?.status === 'inspected').length;
                const percentage = floorDesks > 0 ? Math.round((floorInspected / floorDesks) * 100) : 0;
                
                const box = document.createElement('div');
                box.className = 'stat-box';
                box.innerHTML = `
                    <div class="stat-box-value">${percentage}%</div>
                    <div class="stat-box-label">Building ${floor.building} - Floor ${floor.floor}</div>
                `;
                container.appendChild(box);
            });
        }

        // Tab Switching
        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            event.target.classList.add('active');
            document.getElementById(tabName + 'Tab').classList.add('active');
            
            if (tabName === 'dashboard') {
                updateDashboard();
            }
        }

