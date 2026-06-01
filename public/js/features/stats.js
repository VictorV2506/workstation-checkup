// Module: Stats Panel
// Depends on: currentFloor, desksData (globals)

function updateStats() {
        if (!currentFloor) return;
        
        const total = currentFloor.desks.length;
        const inspected = currentFloor.desks.filter(d => desksData[d.id]?.status === 'inspected').length;
        const issues = currentFloor.desks.filter(d => desksData[d.id]?.status === 'issue').length;
        const completion = total > 0 ? Math.round((inspected / total) * 100) : 0;
        
        document.getElementById('totalDesks').textContent = total;
        document.getElementById('inspectedDesks').textContent = inspected;
        document.getElementById('issueDesks').textContent = issues;
        document.getElementById('completionRate').textContent = completion + '%';
    }
