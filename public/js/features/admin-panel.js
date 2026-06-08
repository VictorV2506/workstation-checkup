// Admin Panel Management

function toggleAdminPanel() {
    var panel = document.getElementById('adminPanel');
    if (!panel) return;
    
    // Get computed style, not inline style
    var currentDisplay = window.getComputedStyle(panel).display;
    var isVisible = currentDisplay !== 'none';
    
    panel.style.display = isVisible ? 'none' : 'block';
}

function switchAdminTab(tabName) {
    // Update tab buttons
    var tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(function(tab) {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update tab panels
    var panels = document.querySelectorAll('.admin-tab-panel');
    panels.forEach(function(panel) {
        panel.classList.remove('active');
    });
    document.getElementById('adminTab' + tabName.charAt(0).toUpperCase() + tabName.slice(1)).classList.add('active');
    
    // Load users when switching to users tab
    if (tabName === 'users') {
        loadUsersList();
    }
}

// Placeholder functions (Phase 3)
function startAddMarker() {
    if (!currentFloor) {
        alert('Please select a floor first!');
        return;
    }
    
    // Reset form
    document.getElementById('markerType').value = 'Desk';
    document.getElementById('markerName').value = '';
    
    // Show modal
    var modal = document.getElementById('addMarkerModal');
    modal.classList.add('active');
}

function cancelAddMarker() {
    var modal = document.getElementById('addMarkerModal');
    modal.classList.remove('active');
    isAddingMarker = false;
    pendingMarker = null;
    document.body.style.cursor = 'default';
}

function confirmAddMarker() {
    var type = document.getElementById('markerType').value;
    var name = document.getElementById('markerName').value.trim();
    
    // Validation
    if (!name) {
        alert('Please enter a marker name!');
        return;
    }
    
    // Store pending marker data
    pendingMarker = {
        type: type,
        name: name
    };
    
    // Close modal
    var modal = document.getElementById('addMarkerModal');
    modal.classList.remove('active');
    
    // Enter "click to place" mode
    isAddingMarker = true;
    document.body.style.cursor = 'crosshair';
    
    alert('Click anywhere on the floor plan to place the marker');
}

function handleMapClickForMarker(event) {
    if (!isAddingMarker || !pendingMarker) return;
    
    // Get click coordinates relative to floor plan
    var floorPlan = document.getElementById('floorPlan');
    var rect = floorPlan.getBoundingClientRect();
    
    var x = Math.round((event.clientX - rect.left) / currentZoom);
    var y = Math.round((event.clientY - rect.top) / currentZoom);
    
    // Validate coordinates are within bounds
    if (x < 0 || x > currentFloor.width || y < 0 || y > currentFloor.height) {
        alert('Click inside the floor plan!');
        return;
    }
    
    // Generate unique ID
    var newId = currentFloor.id + '_' + pendingMarker.name.replace(/\s+/g, '_');
    
    // Check if ID already exists
    var exists = currentFloor.desks.find(function(d) { return d.id === newId; });
    if (exists) {
        alert('A marker with this name already exists! Use a different name.');
        return;
    }
    
    // Create new marker object
    var newMarker = {
        id: newId,
        number: pendingMarker.name,
        type: pendingMarker.type,
        x: x,
        y: y
    };
    
    // Add to current floor data
    currentFloor.desks.push(newMarker);
    
    // Re-render floor plan
    renderFloorPlan();
    
    // Reset state
    isAddingMarker = false;
    pendingMarker = null;
    document.body.style.cursor = 'default';
    
    console.log('✓ Marker added:', newMarker);
    alert('Marker added! Remember to export JSON to save changes.');
}



// ========== DELETE MARKER ==========

function deleteMarker(markerId) {
    if (!confirm('Delete this marker? This cannot be undone until you refresh the page.')) {
        return;
    }
    
    // Find and remove from current floor data
    var index = currentFloor.desks.findIndex(function(d) { return d.id === markerId; });
    
    if (index !== -1) {
        var deleted = currentFloor.desks.splice(index, 1)[0];
        console.log('✓ Marker deleted:', deleted);
        
        // Re-render floor plan
        renderFloorPlan();
        
        alert('Marker deleted! Remember to export JSON to save changes.');
    }
}











// ========== EXPORT JSON ==========

function exportFloorsData() {
    // Create JSON string with proper formatting
    var jsonString = JSON.stringify(floorConfigs, null, 2);
    
    // Create blob
    var blob = new Blob([jsonString], { type: 'application/json' });
    
    // Create download link
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'floors_data_modified.json';
    
    // Trigger download
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('✓ JSON exported');
    alert('JSON file downloaded! Replace the old floors_data.json with this file.');
}


function importFloorsData() {
    alert('Import functionality coming in Phase 3!');
}

function loadUsersList() {
    document.getElementById('userList').innerHTML = '<li style="text-align:center; color:#999; padding:20px;">User management coming in Phase 4!</li>';
}
