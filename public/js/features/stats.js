// Module: Stats Panel
// Session 16: per-type counts. Completion % cross-floor all 3 types.
// Depends on: currentFloor, desksData, floorConfigs (globals)

function updateStats() {
    if (!currentFloor) return;

    var items    = currentFloor.desks;
    var desks    = items.filter(function(d) { return !d.type || d.type === 'Desk'; });
    var meetings = items.filter(function(d) { return d.type === 'MeetingRoom'; });
    var servers  = items.filter(function(d) { return d.type === 'ServerRoom'; });

    function counts(group) {
        var total     = group.length;
        var inspected = group.filter(function(d) { return desksData[d.id] && desksData[d.id].status === 'inspected'; }).length;
        var issues    = group.filter(function(d) { return desksData[d.id] && desksData[d.id].status === 'issue'; }).length;
        var progress  = total > 0 ? Math.round((inspected / total) * 100) : 0;
        return { total: total, inspected: inspected, issues: issues, progress: progress };
    }

    var d = counts(desks);
    var m = counts(meetings);
    var s = counts(servers);

    document.getElementById('deskTotal').textContent    = d.total;
    document.getElementById('deskIssues').textContent   = d.issues;
    document.getElementById('deskProgress').textContent = d.progress + '%';

    document.getElementById('meetingTotal').textContent    = m.total;
    document.getElementById('meetingIssues').textContent   = m.issues;
    document.getElementById('meetingProgress').textContent = m.progress + '%';

    document.getElementById('serverTotal').textContent    = s.total;
    document.getElementById('serverIssues').textContent   = s.issues;
    document.getElementById('serverProgress').textContent = s.progress + '%';

    var allInspectable = 0, allInspected = 0;
    var inspectableTypes = ['Desk', 'MeetingRoom', 'ServerRoom'];
    floorConfigs.forEach(function(floor) {
        floor.desks
            .filter(function(d) { return !d.type || inspectableTypes.indexOf(d.type) !== -1; })
            .forEach(function(d) {
                allInspectable++;
                if (desksData[d.id] && desksData[d.id].status === 'inspected') allInspected++;
            });
    });
    var completion = allInspectable > 0 ? Math.round((allInspected / allInspectable) * 100) : 0;
    document.getElementById('completionRate').textContent = completion + '%';
}
