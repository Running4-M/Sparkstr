import { auth } from './firebase.js'; // Import auth from firebase.js
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js"; // Import onAuthStateChanged to track auth state
import { initializeFirebase } from "../backend/firebase.js"; // Import the initializeFirebase function
await initializeFirebase(); // Make sure Firebase is initialized first
let userId = null; // Shared userId variable

/**
 * Initialize the userId by listening to Firebase Authentication state.
 * Resolves when the user is authenticated and their ID is available.
 * Rejects if the user is not logged in, and redirects to login page.
 */
export async function initializeAuthState() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        userId = user.uid; // Set the shared userId
        resolve(user.uid); // Resolve with the user ID
      } else {
        console.warn("No user logged in.");
        userId = null;
        reject("User not logged in.");
        // Redirect to login page if no user is authenticated
        window.location.href = "../Login/login.html";
      }
    });
  });
}

/**
 * Get the current userId.
 * Throws an error if userId is not initialized.
 */
export function getUserId() {
  if (!userId) {
    throw new Error("User ID is not initialized. Call initializeAuthState first.");
  }
  return userId;
}

/**
 * Check if the user is logged in. This can be used for conditional redirects.
 */
export function isUserLoggedIn() {
  return userId !== null;
}

export { auth }; // Export auth from sharedAuthHelper.js
