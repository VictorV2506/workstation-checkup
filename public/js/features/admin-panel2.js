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
    if (!isEditMode) {
        alert('Enable Edit Mode first before adding markers.');
        return;
    }
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
    
// Optimistically add to local state
currentFloor.desks.push(newMarker);

// Persist to Firestore
db.collection('floors').doc(currentFloor.id).update({
    desks: currentFloor.desks
})
.then(function() {
    console.log('✓ Marker saved to Firestore:', newMarker);
    renderFloorPlan();
    isAddingMarker = false;
    pendingMarker = null;
    document.body.style.cursor = 'default';
    alert('✅ Marker added and saved!');
})
.catch(function(error) {
    console.error('Error saving marker:', error);
    currentFloor.desks.pop(); // rollback
    alert('❌ Failed to save marker. Check console.');
});

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

        db.collection('floors').doc(currentFloor.id).update({
            desks: currentFloor.desks
        })
        .then(function() {
            console.log('✓ Marker deleted from Firestore:', deleted);
            renderFloorPlan();
            alert('✅ Marker deleted and saved!');
        })
        .catch(function(error) {
            console.error('Error deleting marker:', error);
            currentFloor.desks.splice(index, 0, deleted); // rollback
            alert('❌ Failed to delete marker. Check console.');
        });
        
    }
}



// ── Edit Mode Toggle ──────────────────────────────────────────
function toggleEditMode() {
    isEditMode = !isEditMode;

    var btn = document.getElementById('editModeBtn');
    var floorPlan = document.getElementById('floorPlan');

    if (isEditMode) {
        btn.innerHTML = '🔓 Disable Edit Mode';
        btn.style.background = '#ef4444';
        if (floorPlan) floorPlan.classList.add('edit-mode');
        console.log('✓ Edit mode enabled');
    } else {
        btn.innerHTML = '🔒 Enable Edit Mode';
        btn.style.background = '';
        if (floorPlan) floorPlan.classList.remove('edit-mode');
        // Cancel any in-progress marker placement
        if (isAddingMarker) {
            isAddingMarker = false;
            pendingMarker = null;
            document.body.style.cursor = 'default';
        }
        console.log('✓ Edit mode disabled');
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

// Load all users (from 'users' collection) and cross-reference with
// 'admins' to determine roles. Renders sorted list: superadmin > admin > user.
function loadUsersList() {
    var userList = document.getElementById('userList');
    if (!userList) return;

    _injectUserMgmtStyles();
    userList.innerHTML = '<li class="uml-state">Loading users...</li>';

    Promise.all([
        db.collection('users').get(),
        db.collection('admins').get()
    ]).then(function(results) {
        var usersSnap  = results[0];
        var adminsSnap = results[1];

        // Build role map: email -> role string
        var roleMap = {};
        adminsSnap.forEach(function(doc) {
            roleMap[doc.id] = (doc.data().role || 'admin').trim();
        });

        // Build user data map: email -> Firestore data
        var userData = {};
        usersSnap.forEach(function(doc) { userData[doc.id] = doc.data(); });

        // Merge both sets so admins who haven't logged in yet still appear
        var allEmails = new Set(
            Object.keys(userData).concat(Object.keys(roleMap))
        );

        if (allEmails.size === 0) {
            userList.innerHTML = '<li class="uml-state">No users found.</li>';
            return;
        }

        var ORDER = { superadmin: 0, admin: 1, user: 2 };
        var users = [];
        allEmails.forEach(function(email) {
            var data = userData[email] || {};
            users.push({
                email:       email,
                displayName: data.displayName || email,
                photoURL:    data.photoURL    || '',
                role:        roleMap[email]   || 'user'
            });
        });

        users.sort(function(a, b) {
            var ro = (ORDER[a.role] !== undefined ? ORDER[a.role] : 2)
                   - (ORDER[b.role] !== undefined ? ORDER[b.role] : 2);
            if (ro !== 0) return ro;
            return a.displayName.localeCompare(b.displayName);
        });

        userList.innerHTML = '';
        users.forEach(function(u) { userList.appendChild(_buildUserRow(u)); });

    }).catch(function(err) {
        console.error('loadUsersList error:', err);
        userList.innerHTML =
            '<li class="uml-state uml-state--error">Error loading users: ' +
            err.message + '</li>';
    });
}

function _buildUserRow(user) {
    var isSelf       = currentUser && currentUser.email === user.email;
    var isSuperAdmin = user.role === 'superadmin';
    var isAdminRole  = user.role === 'admin';

    var li = document.createElement('li');
    li.className = 'uml-row' + (isSelf ? ' uml-row--self' : '');

    // Avatar
    var avatar = document.createElement('div');
    avatar.className = 'uml-avatar';
    if (user.photoURL) {
        var img = document.createElement('img');
        img.src = user.photoURL;
        img.alt = user.displayName;
        img.onerror = function() {
            this.style.display = 'none';
            avatar.textContent = (user.displayName || '?')[0].toUpperCase();
        };
        avatar.appendChild(img);
    } else {
        avatar.textContent = (user.displayName || '?')[0].toUpperCase();
    }
    li.appendChild(avatar);

    // Name + email
    var info = document.createElement('div');
    info.className = 'uml-info';
    var name = document.createElement('div');
    name.className   = 'uml-name';
    name.textContent = user.displayName + (isSelf ? ' (you)' : '');
    var emailEl = document.createElement('div');
    emailEl.className   = 'uml-email';
    emailEl.textContent = user.email;
    info.appendChild(name);
    info.appendChild(emailEl);
    li.appendChild(info);

    // Role badge
    var badge = document.createElement('span');
    if (isSuperAdmin) {
        badge.className   = 'uml-badge uml-badge--superadmin';
        badge.textContent = 'Owner';
    } else if (isAdminRole) {
        badge.className   = 'uml-badge uml-badge--admin';
        badge.textContent = 'Admin';
    } else {
        badge.className   = 'uml-badge uml-badge--user';
        badge.textContent = 'User';
    }
    li.appendChild(badge);

    // Action button — superadmin gets a spacer only (no button, ever)
    if (isSuperAdmin) {
        var spacer = document.createElement('div');
        spacer.className = 'uml-btn-spacer';
        li.appendChild(spacer);
    } else {
        var btn = document.createElement('button');
        if (isAdminRole) {
            btn.className   = 'uml-btn uml-btn--remove';
            btn.textContent = 'Remove Admin';
            btn.onclick = (function(e, d) {
                return function() { removeAdmin(e, d); };
            })(user.email, user.displayName);
        } else {
            btn.className   = 'uml-btn uml-btn--make';
            btn.textContent = 'Make Admin';
            btn.onclick = (function(e, d) {
                return function() { makeAdmin(e, d); };
            })(user.email, user.displayName);
        }
        li.appendChild(btn);
    }

    return li;
}

// Grant admin access — creates admins/{email} with role: 'admin'.
// Firestore rule blocks setting role: 'superadmin' from the client.
function makeAdmin(email, displayName) {
    if (!isAdmin) return;
    if (!confirm(
        'Grant admin access to ' + displayName + '?\n\n' +
        'They will be able to manage floor maps and other users.')
    ) return;

    db.collection('admins').doc(email).set({ role: 'admin' })
        .then(function() {
            console.log('Admin granted to', email);
            loadUsersList();
        })
        .catch(function(err) {
            console.error('makeAdmin error:', err);
            alert('Could not grant admin access: ' + err.message);
        });
}

// Revoke admin access — deletes admins/{email}.
// Firestore rule blocks deletion if resource.data.role == 'superadmin'.
function removeAdmin(email, displayName) {
    if (!isAdmin) return;

    var isSelf = currentUser && currentUser.email === email;
    var msg = 'Remove admin access from ' + displayName + '?';
    if (isSelf) {
        msg += '\n\nWarning: you are removing your own admin access.\n' +
               'The Admin Panel will close immediately.';
    }
    if (!confirm(msg)) return;

    db.collection('admins').doc(email).delete()
        .then(function() {
            console.log('Admin removed for', email);
            if (isSelf) {
                isAdmin              = false;
                currentUserAdminRole = '';
                hideAdminPanel();
            }
            loadUsersList();
        })
        .catch(function(err) {
            console.error('removeAdmin error:', err);
            if (err.code === 'permission-denied') {
                alert('Cannot remove this user — they are a protected Owner.');
            } else {
                alert('Could not remove admin access: ' + err.message);
            }
        });
}

// Injects user management CSS into <head> once on first tab open.
// Load all users (from 'users' collection) and cross-reference with
// 'admins' to determine roles. Renders sorted list: superadmin > admin > user.
function loadUsersList() {
    var userList = document.getElementById('userList');
    if (!userList) return;

    _injectUserMgmtStyles();
    userList.innerHTML = '<li class="uml-state">Loading users...</li>';

    Promise.all([
        db.collection('users').get(),
        db.collection('admins').get()
    ]).then(function(results) {
        var usersSnap  = results[0];
        var adminsSnap = results[1];

        // Build role map: email -> role string
        var roleMap = {};
        adminsSnap.forEach(function(doc) {
            roleMap[doc.id] = (doc.data().role || 'admin').trim();
        });

        // Build user data map: email -> Firestore data
        var userData = {};
        usersSnap.forEach(function(doc) { userData[doc.id] = doc.data(); });

        // Merge both sets so admins who haven't logged in yet still appear
        var allEmails = new Set(
            Object.keys(userData).concat(Object.keys(roleMap))
        );

        if (allEmails.size === 0) {
            userList.innerHTML = '<li class="uml-state">No users found.</li>';
            return;
        }

        var ORDER = { superadmin: 0, admin: 1, user: 2 };
        var users = [];
        allEmails.forEach(function(email) {
            var data = userData[email] || {};
            users.push({
                email:       email,
                displayName: data.displayName || email,
                photoURL:    data.photoURL    || '',
                role:        roleMap[email]   || 'user'
            });
        });

        users.sort(function(a, b) {
            var ro = (ORDER[a.role] !== undefined ? ORDER[a.role] : 2)
                   - (ORDER[b.role] !== undefined ? ORDER[b.role] : 2);
            if (ro !== 0) return ro;
            return a.displayName.localeCompare(b.displayName);
        });

        userList.innerHTML = '';
        users.forEach(function(u) { userList.appendChild(_buildUserRow(u)); });

    }).catch(function(err) {
        console.error('loadUsersList error:', err);
        userList.innerHTML =
            '<li class="uml-state uml-state--error">Error loading users: ' +
            err.message + '</li>';
    });
}

function _buildUserRow(user) {
    var isSelf       = currentUser && currentUser.email === user.email;
    var isSuperAdmin = user.role === 'superadmin';
    var isAdminRole  = user.role === 'admin';

    var li = document.createElement('li');
    li.className = 'uml-row' + (isSelf ? ' uml-row--self' : '');

    // Avatar
    var avatar = document.createElement('div');
    avatar.className = 'uml-avatar';
    if (user.photoURL) {
        var img = document.createElement('img');
        img.src = user.photoURL;
        img.alt = user.displayName;
        img.onerror = function() {
            this.style.display = 'none';
            avatar.textContent = (user.displayName || '?')[0].toUpperCase();
        };
        avatar.appendChild(img);
    } else {
        avatar.textContent = (user.displayName || '?')[0].toUpperCase();
    }
    li.appendChild(avatar);

    // Name + email
    var info = document.createElement('div');
    info.className = 'uml-info';
    var name = document.createElement('div');
    name.className   = 'uml-name';
    name.textContent = user.displayName + (isSelf ? ' (you)' : '');
    var emailEl = document.createElement('div');
    emailEl.className   = 'uml-email';
    emailEl.textContent = user.email;
    info.appendChild(name);
    info.appendChild(emailEl);
    li.appendChild(info);

    // Role badge
    var badge = document.createElement('span');
    if (isSuperAdmin) {
        badge.className   = 'uml-badge uml-badge--superadmin';
        badge.textContent = 'Owner';
    } else if (isAdminRole) {
        badge.className   = 'uml-badge uml-badge--admin';
        badge.textContent = 'Admin';
    } else {
        badge.className   = 'uml-badge uml-badge--user';
        badge.textContent = 'User';
    }
    li.appendChild(badge);

    // Action button — superadmin gets a spacer only (no button, ever)
    if (isSuperAdmin) {
        var spacer = document.createElement('div');
        spacer.className = 'uml-btn-spacer';
        li.appendChild(spacer);
    } else {
        var btn = document.createElement('button');
        if (isAdminRole) {
            btn.className   = 'uml-btn uml-btn--remove';
            btn.textContent = 'Remove Admin';
            btn.onclick = (function(e, d) {
                return function() { removeAdmin(e, d); };
            })(user.email, user.displayName);
        } else {
            btn.className   = 'uml-btn uml-btn--make';
            btn.textContent = 'Make Admin';
            btn.onclick = (function(e, d) {
                return function() { makeAdmin(e, d); };
            })(user.email, user.displayName);
        }
        li.appendChild(btn);
    }

    return li;
}

// Grant admin access — creates admins/{email} with role: 'admin'.
// Firestore rule blocks setting role: 'superadmin' from the client.
function makeAdmin(email, displayName) {
    if (!isAdmin) return;
    if (!confirm(
        'Grant admin access to ' + displayName + '?\n\n' +
        'They will be able to manage floor maps and other users.')
    ) return;

    db.collection('admins').doc(email).set({ role: 'admin' })
        .then(function() {
            console.log('Admin granted to', email);
            loadUsersList();
        })
        .catch(function(err) {
            console.error('makeAdmin error:', err);
            alert('Could not grant admin access: ' + err.message);
        });
}

// Revoke admin access — deletes admins/{email}.
// Firestore rule blocks deletion if resource.data.role == 'superadmin'.
function removeAdmin(email, displayName) {
    if (!isAdmin) return;

    var isSelf = currentUser && currentUser.email === email;
    var msg = 'Remove admin access from ' + displayName + '?';
    if (isSelf) {
        msg += '\n\nWarning: you are removing your own admin access.\n' +
               'The Admin Panel will close immediately.';
    }
    if (!confirm(msg)) return;

    db.collection('admins').doc(email).delete()
        .then(function() {
            console.log('Admin removed for', email);
            if (isSelf) {
                isAdmin              = false;
                currentUserAdminRole = '';
                hideAdminPanel();
            }
            loadUsersList();
        })
        .catch(function(err) {
            console.error('removeAdmin error:', err);
            if (err.code === 'permission-denied') {
                alert('Cannot remove this user — they are a protected Owner.');
            } else {
                alert('Could not remove admin access: ' + err.message);
            }
        });
}

// Injects user management CSS into <head> once on first tab open.
function _injectUserMgmtStyles() {
    if (document.getElementById('uml-styles')) return;
    var style = document.createElement('style');
    style.id  = 'uml-styles';
    style.textContent = [
        '.user-list { list-style:none; margin:0; padding:0; }',
        '.uml-state { text-align:center; color:#9ca3af; padding:24px 16px; font-size:13px; }',
        '.uml-state--error { color:#f43f5e; }',
        '.uml-row { display:flex; align-items:center; gap:10px; padding:10px 16px; border-bottom:1px solid #f3f4f6; }',
        '.uml-row:last-child { border-bottom:none; }',
        '.uml-row--self { background:#fafafa; }',
        '.uml-avatar { width:36px; height:36px; border-radius:50%; background:#667eea; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px; overflow:hidden; flex-shrink:0; }',
        '.uml-avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; }',
        '.uml-info { flex:1; min-width:0; }',
        '.uml-name  { font-size:13px; font-weight:600; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',
        '.uml-email { font-size:11px; color:#9ca3af; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',
        '.uml-badge { font-size:11px; font-weight:600; padding:3px 9px; border-radius:12px; white-space:nowrap; flex-shrink:0; }',
        '.uml-badge--superadmin { background:#f3e8ff; color:#7c3aed; }',
        '.uml-badge--admin      { background:#dbeafe; color:#1d4ed8; }',
        '.uml-badge--user       { background:#f3f4f6; color:#6b7280; }',
        '.uml-btn { font-size:11px; font-weight:600; padding:5px 10px; border-radius:6px; border:none; cursor:pointer; white-space:nowrap; flex-shrink:0; transition:background 0.15s; }',
        '.uml-btn--make         { background:#667eea; color:#fff; }',
        '.uml-btn--make:hover   { background:#5a67d8; }',
        '.uml-btn--remove       { background:#fee2e2; color:#dc2626; }',
        '.uml-btn--remove:hover { background:#fecaca; }',
        '.uml-btn-spacer { width:90px; flex-shrink:0; }'
    ].join('\n');
    document.head.appendChild(style);
}



