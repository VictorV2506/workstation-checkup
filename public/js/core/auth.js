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
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        document.getElementById('userName').textContent = user.displayName;
        document.getElementById('userPhoto').src = user.photoURL;
        loadFloorData();
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
    }
});

// ── Sign in ───────────────────────────────────────────────────
function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
        alert('Login failed: ' + error.message);
    });
}

// ── Sign out ──────────────────────────────────────────────────
function logout() {
    auth.signOut();
}
