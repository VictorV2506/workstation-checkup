// public/js/config/firebase-config.js
//
// Firebase project configuration for Workstation Checkup.
//
// SECURITY NOTE: These keys identify the Firebase project and are
// intentionally client-facing (the Firebase compat SDK requires them
// in the browser). They are NOT secret credentials. Security is
// enforced server-side via:
//   - Firestore security rules  (firestore.rules)    <- TODO Step 1.4
//   - Firebase authorized domains (Firebase Console) <- TODO Step 1.4
//   - Firebase App Check / ReCaptchaV3               <- TODO future
//
// Do NOT add service account keys, admin SDK credentials, or any
// server-side secret here. This file is served publicly.

const firebaseConfig = {
    apiKey: "AIzaSyC_BfcMFyVyFrsiwL6yXO12ItFtOF562yU",
    authDomain: "workstation-revamp.firebaseapp.com",
    projectId: "workstation-revamp",
    storageBucket: "workstation-revamp.firebasestorage.app",
    messagingSenderId: "773621835970",
    appId: "1:773621835970:web:5dcc188a633de8d1f8f35b",
    measurementId: "G-9E72E96X1G"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
