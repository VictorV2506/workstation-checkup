// public/js/core/auth.js
//
// Authentication module for Workstation Checkup.
//
// Handles the full sign-in lifecycle using Firebase Auth compat SDK.
// Depends on: firebase-config.js (auth, firebase globals)
//             state.js           (currentUser)
// Must load after both of the above.
//
// Functions called from HTML:
//   signInWithGoogle() — onclick on the login button
//   logout()           — onclick on the logout button
//
// Phase 2 security additions (do not add during extraction):
//   - Domain restriction (@justeat.com / @justeattakeaway.com)
//   - Sign-out of non-company accounts in onAuthStateChanged

// ── Auth state listener ───────────────────────────────────────
// Runs once on page load and on every sign-in / sign-out event.
// All getElementById calls are null-guarded: onAuthStateChanged fires
// during intermediate OAuth states when elements may not exist yet.
var currentUserAdminRole = '';

auth.onAuthStateChanged(function(user) {
    var loginScreen  = document.getElementById('loginScreen');
    var appContainer = document.getElementById('appContainer');
    var userNameEl   = document.getElementById('userName');
    var userPhotoEl  = document.getElementById('userPhoto');

    if (user) {
        currentUser = user;
                // Check if user is admin
                checkAdminStatus(user.email).then(function(adminStatus) {
                    isAdmin = adminStatus;
                    console.log('Admin status:', isAdmin);
                    
                    // Show/hide admin panel based on permission
                    if (isAdmin) {
                        showAdminPanel();
                    } else {
                        hideAdminPanel();
                    }
                });
                
                // Track user login in Firestore (for user management)
                logUserLogin(user);
        
        if (loginScreen)  { loginScreen.style.display  = 'none'; }
        if (appContainer) { appContainer.style.display = 'block'; }
        if (userNameEl)   { userNameEl.textContent      = user.displayName || ''; }
        if (userPhotoEl)  { userPhotoEl.src             = user.photoURL    || ''; }
        loadFloorData();
        loadJiraConfig();
    } else {
        currentUser = null;
        if (loginScreen)  { loginScreen.style.display  = 'flex'; }
        if (appContainer) { appContainer.style.display = 'none'; }
    }
});

// ── Sign in ───────────────────────────────────────────────────
// Uses signInWithPopup. The Cross-Origin-Opener-Policy warnings in the
// console are cosmetic — they do not prevent auth from completing.
function signInWithGoogle() {
    var provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(function(error) {
        alert('Login failed: ' + error.message);
    });
}

// ── Sign out ──────────────────────────────────────────────────
function logout() {
    auth.signOut();
}
// Check if user email exists in admins collection
function checkAdminStatus(email) {
    return db.collection('admins').doc(email).get()
        .then(function(doc) {
            if (!doc.exists) {
                currentUserAdminRole = '';
                return false;
            }
            var role = (doc.data().role || '').trim();
            currentUserAdminRole = role;
            return role === 'admin' || role === 'superadmin';
        })
        .catch(function(error) {
            console.error('Error checking admin status:', error);
            currentUserAdminRole = '';
            return false;
        });
}


// Log user login to users collection
function logUserLogin(user) {
    var userRef = db.collection('users').doc(user.email);
    
    userRef.set({
        email: user.email,
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true })
    .then(function() {
        console.log('User login logged');
    })
    .catch(function(error) {
        console.error('Error logging user login:', error);
    });
}

// Show admin panel UI (will implement in Phase 2)
function showAdminPanel() {
    var adminToggleBtn = document.getElementById('adminToggleBtn');
    if (adminToggleBtn) {
        adminToggleBtn.style.display = 'block';
    }
}

// Hide admin panel UI
function hideAdminPanel() {
    var panel = document.getElementById('adminPanel');
    var btn   = document.getElementById('adminToggleBtn');
    if (panel) panel.style.display = 'none';
    if (btn)   btn.style.display   = 'none';
}


