import { 
  db, 
  auth, 
  initializeFirebase,
  signInWithGoogle 
} from "../backend/firebase.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  doc,
  setDoc,
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
await initializeFirebase();
// ...existing code...
function showGradientTransitionAndRedirect(redirectUrl) {
  const gradient = document.getElementById('gradientTransition');
  const bar = document.getElementById('gradientBar');
  const text = document.getElementById('transitionText');
  if (!gradient || !bar || !text) {
    window.location.href = redirectUrl;
    return;
  }
  gradient.style.display = 'block';
  bar.style.width = '0';
  text.style.opacity = 0;
  setTimeout(() => { bar.style.width = '100vw'; }, 50);
  setTimeout(() => { text.style.opacity = 1; }, 400);
  setTimeout(() => { window.location.href = redirectUrl; }, 1800);
}
// Map your plan keys to the Stripe Price IDs (replace with your actual price IDs)
// --- price map & helper (leave your PRICE_MAP as-is) ---
const PRICE_MAP = {
  basic: {
    GBP: "price_1S2DTJDUfadEcuo7FB6ihgCE",   // <- put your GBP price id for Basic here
    EUR: "price_1S2fjGDUfadEcuo754l9lglO",   // <- put your EUR price id for Basic here
    USD: "price_1S2fiHDUfadEcuo7q8f5emBR"    // <- put your USD price id for Basic here
  },
  pro: {
    GBP: "price_1S2DW7DUfadEcuo7yw2Gnqov",
    EUR: "price_1S2foDDUfadEcuo7FrGc3txP",
    USD: "price_1S2flEDUfadEcuo7cjHQj9QW"
  }
};

/**
 * Helper: return the correct price id for a plan based on selectedCurrency saved
 * by the pricing page. Falls back to GBP then to any available id.
 */
function getPriceIdForPlan(planKey) {
  const selectedCurrency = (localStorage.getItem('selectedCurrency') || 'GBP').toUpperCase();
  const mapping = PRICE_MAP[planKey] || {};
  if (mapping[selectedCurrency]) return mapping[selectedCurrency];
  if (mapping.GBP) return mapping.GBP;
  // fallback to first available
  const keys = Object.keys(mapping);
  return keys.length ? mapping[keys[0]] : null;
}

// safer startCheckoutWithExtension (replaces your old function)
async function startCheckoutWithExtension(priceId) {
  if (!auth.currentUser) {
    showPopup("You must be logged in to subscribe.", "error");
    return;
  }
  const uid = auth.currentUser.uid;
  showLoader("Preparing secure payment...");

  let fallbackTimer = null;
  // if nothing happens in N seconds, update loader message so user knows it's still working
  fallbackTimer = setTimeout(() => {
    showLoader("Still setting up payment — this usually takes a few more seconds. Please don't close this tab.");
  }, 8000); // 8s fallback message

  try {
    const docRef = await addDoc(collection(db, "customers", uid, "checkout_sessions"), {
      price: priceId,
      success_url: window.location.origin + "/calendar.html",
      cancel_url: window.location.origin + "/signup?canceled=true",
      mode: "subscription",
      createdAt: serverTimestamp()
    });

    const unsub = onSnapshot(docRef, snap => {
      const data = snap.data();
      if (!data) return;
      if (data.error) {
        console.error("Stripe extension error:", data.error);
        hideLoader();
        showPopup("Payment error: " + (data.error.message || "Unknown"), "error");
        localStorage.removeItem('signupInProgress');
        unsub();
        if (fallbackTimer) clearTimeout(fallbackTimer);
        return;
      }
      if (data.url) {
        // clear fallback and let the redirect happen
        if (fallbackTimer) clearTimeout(fallbackTimer);
        // do NOT hide the loader immediately — the browser will navigate to Stripe
        // but hide any internal message so standard Stripe UI is visible while redirecting
        // (optional) update message:
        showLoader("Redirecting to secure payment...");
        unsub();
        window.location.href = data.url;
      }
    });
  } catch (err) {
    console.error("startCheckoutWithExtension error:", err);
    hideLoader();
    showPopup("Failed to start checkout: " + err.message, "error");
    localStorage.removeItem('signupInProgress');
    if (fallbackTimer) clearTimeout(fallbackTimer);
  }
}


const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
console.log('User timezone on page load:', userTimezone);
console.log("everything is loaded, ready to go!");
// --- Popup helper ---
function showPopup(message, type = "success") {
  const popup = document.createElement("div");
  popup.className = `
    fixed top-6 right-6
    z-[11000] px-6 py-4 rounded-2xl shadow-2xl
    backdrop-blur-md bg-white/10 text-white
    max-w-xs text-center
    animate-fade-in-up
  `;
  popup.style.border = type === "error"
    ? "2px solid rgba(255,50,50,0.8)"
    : "2px solid rgba(50,255,100,0.8)";
  popup.innerHTML = `<div class="text-2xl mb-2">${type === "error" ? "❌" : "✅"}</div>
    <div class="text-sm">${message}</div>`;
  document.body.append(popup);
  setTimeout(() => popup.remove(), 2000);
}
function showLoader(message = "Please wait...") {
  // show existing overlay if present
  const overlay = document.getElementById('loaderOverlay');
  if (overlay) {
    overlay.style.display = 'flex';

    // create or update a message element inside overlay
    let msg = overlay.querySelector('.loader-message');
    if (!msg) {
      msg = document.createElement('div');
      msg.className = 'loader-message';
      // small visual style — will sit below any spinner already in overlay
      msg.style.cssText = 'color:#fff;margin-top:12px;font-size:14px;text-align:center;';
      overlay.appendChild(msg);
    }
    msg.textContent = message;
  }
  // disable primary and google buttons so user can't click again
  try { if (typeof primaryBtn !== 'undefined' && primaryBtn) primaryBtn.disabled = true; } catch(e){}
  try { if (typeof googleBtn !== 'undefined' && googleBtn) googleBtn.disabled = true; } catch(e){}
}

function hideLoader() {
  const overlay = document.getElementById('loaderOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    const msg = overlay.querySelector('.loader-message');
    if (msg) msg.remove();
  }
  try { if (typeof primaryBtn !== 'undefined' && primaryBtn) primaryBtn.disabled = false; } catch(e){}
  try { if (typeof googleBtn !== 'undefined' && googleBtn) googleBtn.disabled = false; } catch(e){}
}
// --- Error messages ---
function displayError(errorCode) {
  const errorMessages = {
    "auth/email-already-in-use": "This email is already in use. Please log in instead.",
    "auth/invalid-email": "Invalid email format. Please provide a valid email address.",
    "auth/weak-password": "Password should be at least 6 characters long.",
    "auth/user-not-found": "No account found with this email. Please sign up first.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/missing-email": "Please enter your email address.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/missing-password": "Please enter your password."
  };
  return errorMessages[errorCode] || "An error occurred. Please try again.";
}


  // --- All DOM code inside here! ---

  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const primaryBtn = document.getElementById('primaryBtn');
  const backBtn = document.getElementById('backBtn');
  const toggleBtn = document.getElementById('toggleBtn');
  const googleBtn = document.getElementById('googleBtn');
  const googleBtnText = document.getElementById('googleBtnText');
  const cardTitle = document.getElementById('cardTitle');
  const cardDescription = document.getElementById('cardDescription');
  const toggleText = document.getElementById('toggleText');
  const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
  let isSignUp = true;
  let currentStep = 1;
  let userCredential = null;

  // --- UI State ---
  function updateUI() {
  if (isSignUp) {
    if (currentStep === 1) {
      cardTitle.textContent = 'Hello, New Friend! 👋';
      cardDescription.textContent = "Let's get you started on your journey";
      primaryBtn.textContent = 'Continue';
      googleBtnText.textContent = 'Sign up with Google';
      toggleText.textContent = 'Already have an account?';
      toggleBtn.textContent = 'Sign in';
      step1.classList.remove('hidden');
      step2.classList.add('hidden');
      backBtn.classList.add('hidden');
      googleBtn.classList.remove('hidden');
    } else {
      cardTitle.textContent = 'Tell Us About You';
      cardDescription.textContent = 'Just a few more details to complete your profile';
      primaryBtn.textContent = 'Create Account';
      googleBtn.classList.add('hidden');
      step1.classList.add('hidden');
      step2.classList.remove('hidden');
      backBtn.classList.remove('hidden');
    }
    forgotPasswordBtn.classList.add('hidden');
  } else {
    cardTitle.textContent = 'Welcome Back! 🎉';
    cardDescription.textContent = 'Great to see you again!';
    primaryBtn.textContent = 'Sign In';
    googleBtnText.textContent = 'Sign in with Google';
    toggleText.textContent = "Don't have an account?";
    toggleBtn.textContent = 'Sign up';
    step1.classList.remove('hidden');
    step2.classList.add('hidden');
    backBtn.classList.add('hidden');
    googleBtn.classList.remove('hidden');
    forgotPasswordBtn.classList.remove('hidden');
  }
  validateForm();
  updateTosNotice(); // <-- Add this line
}
// Add this new event listener for forgot password
forgotPasswordBtn.onclick = async () => {
    const email = document.getElementById('email').value.trim();
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showPopup("Please enter a valid email address", "error");
        return;
    }

    try {
        forgotPasswordBtn.disabled = true;
        document.getElementById('loaderOverlay').style.display = 'flex';
        
        await sendPasswordResetEmail(auth, email);
        
        showLoader("Sending reset email...");


        showPopup("Password reset email sent! Please check your inbox.", "success");
    } catch (error) {
        showLoader("Sending reset email...");


        showPopup(displayError(error.code) || "Failed to send reset email", "error");
    } finally {
        forgotPasswordBtn.disabled = false;
    }
};


  // --- Validation ---
  function validateForm() {
    let isValid = false;
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const fullName = document.getElementById('fullName').value.trim();
    if (isSignUp && currentStep === 1) {
      isValid = email !== '' && password !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    } else if (isSignUp && currentStep === 2) {
      isValid = fullName !== '';
    } else if (!isSignUp) {
      isValid = email !== '' && password !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    primaryBtn.disabled = !isValid;
    return isValid;
  }

  const selectedPlan = localStorage.getItem('selectedPlan') || "free";

  // --- Auth Actions ---
primaryBtn.onclick = async () => {
  if (!validateForm()) return;
  primaryBtn.disabled = true;
  if (isSignUp) {
    if (currentStep === 1) {
      currentStep = 2;
      updateUI();
      primaryBtn.disabled = false;
      return;
    } else {
      showLoader("Creating your account...");
showPopup("Creating your account...", "success");

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value.trim();
      const fullName = document.getElementById('fullName').value.trim();

      try {
        if (!userCredential) {
          userCredential = await createUserWithEmailAndPassword(auth, email, password);
        }
        const user = userCredential.user;

        // --- Create Firestore user document ---
       // --- Create Firestore user document (with pending_payment for paid plans) ---
const plan = selectedPlan || "free";

// mark signup in progress so auth redirects won’t fire
localStorage.setItem('signupInProgress', '1');

// Save main user doc (plan = free or pending_payment)
const storedPlan = plan === "free" ? "free" : "pending_payment";
await setDoc(doc(db, "users", user.uid), {
  uid: user.uid,
  createdAt: new Date().toISOString(),
  plan: storedPlan,
  requestedPlan: plan === "free" ? null : plan
});

// Save profile info
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
await setDoc(doc(db, "users", user.uid, "settings", "profile"), {
  name: fullName,
  plan: storedPlan,
  requestedPlan: plan === "free" ? null : plan,
  planStartedAt: plan === "free" ? new Date().toISOString() : null,
  timezone,
  tutorialSeen: false
});

        if (plan === "free") {
          hideLoader();
showGradientTransitionAndRedirect("../Calendar/Calendar.html");
        } else {
          // Stripe Checkout for paid plans
          const priceId = getPriceIdForPlan(plan);
if (!priceId) {
  showPopup("No price configured for plan: " + plan, "error");
  primaryBtn.disabled = false;
  showLoader("Sending reset email...");


  return;
}
await startCheckoutWithExtension(priceId);
return; // prevent further redirect
        }
      } catch (error) {
        showLoader("Sending reset email...");


        showPopup(displayError(error.code), "error");
        primaryBtn.disabled = false;
      }
    }
  } else {
    // Login
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    try {
      await signInWithEmailAndPassword(auth, email, password);
hideLoader();
showGradientTransitionAndRedirect("../Calendar/Calendar.html");
    } catch (error) {
      showPopup(displayError(error.code), "error");
      primaryBtn.disabled = false;
    }
  }
};

  backBtn.onclick = () => {
    currentStep = 1;
    updateUI();
  };

  toggleBtn.onclick = () => {
    isSignUp = !isSignUp;
    currentStep = 1;
    userCredential = null;
    // Clear all fields
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    document.getElementById('fullName').value = '';
    updateUI();
  };

  document.getElementById('email').oninput = validateForm;
  document.getElementById('password').oninput = validateForm;
  document.getElementById('fullName').oninput = validateForm;

  // Optional: Enter key submits
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !primaryBtn.disabled) {
      primaryBtn.click();
    }
  });

  // --- Redirect if already logged in ---
  onAuthStateChanged(auth, (user) => {
  if (!user) return;
  const path = window.location.pathname.toLowerCase();
  const isAuthPage = path.includes('/login') || path.includes('/signup');
  if (isAuthPage || localStorage.getItem('signupInProgress')) {
    console.log('Auth change ignored during signup.');
    return;
  }
  showGradientTransitionAndRedirect("../Calendar/Calendar.html");
});


// Update your Google button click handler
googleBtn.onclick = async () => {
  try {
    googleBtn.disabled = true;
    showLoader("Connecting to Google...");
showPopup("Connecting to Google...");

    await signInWithGoogle();

    const user = auth.currentUser;
    if (!user) {
      throw new Error("Google sign-in failed: no user returned.");
    }

    const plan = localStorage.getItem('selectedPlan') || "free";

    if (plan === "free") {
      // --- Free Google sign-in ---
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        createdAt: new Date().toISOString(),
        plan: "free"
      });

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await setDoc(doc(db, "users", user.uid, "settings", "profile"), {
        name: user.displayName || "",
        plan: "free",
        planStartedAt: new Date().toISOString(),
        timezone,
        tutorialSeen: false
      });

      localStorage.removeItem('selectedPlan');
      localStorage.removeItem('signupInProgress');

      showPopup("Successfully signed in with Google!");
      showLoader("Sending reset email...");



      const gradient = document.getElementById('gradientTransition');
      const bar = document.getElementById('gradientBar');
      gradient.style.display = 'block';
      bar.style.width = '0';
      setTimeout(() => { bar.style.width = '100vw'; }, 50);
      setTimeout(() => { document.getElementById('transitionText').style.opacity = 1; }, 400);
      setTimeout(() => { window.location.href = "../Calendar/Calendar.html"; }, 1800);

    } else {
      // --- Paid Google sign-in ---
      localStorage.setItem('signupInProgress', '1');

      const storedPlan = "pending_payment";
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        createdAt: new Date().toISOString(),
        plan: storedPlan,
        requestedPlan: plan
      });

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await setDoc(doc(db, "users", user.uid, "settings", "profile"), {
        name: user.displayName || "",
        plan: storedPlan,
        requestedPlan: plan,
        planStartedAt: null,
        timezone,
        tutorialSeen: false
      });

      const priceId = getPriceIdForPlan(plan);

      if (!priceId) {
        showPopup("No price configured for plan: " + plan, "error");
        showLoader("Sending reset email...");


        googleBtn.disabled = false;
        localStorage.removeItem('signupInProgress');
        return;
      }

      await startCheckoutWithExtension(priceId);

      // Stripe will handle redirect → success_url → billing/success.html
      // Do not redirect here.
    }

  } catch (error) {
    console.error("Google sign-in error:", error);
    showLoader("Sending reset email...");


    showPopup(error.message || "Failed to sign in with Google", "error");
    googleBtn.disabled = false;
    localStorage.removeItem('signupInProgress');
  }
};

  updateUI();
  updateTosNotice();
  // --- Terms of Service Modal Logic ---
  // --- Terms of Service Modal Logic ---
const tosNotice = document.getElementById('tosNotice');
const tosLink = document.getElementById('tosLink');
const tosModal = document.getElementById('tosModal');
const closeTosModal = document.getElementById('closeTosModal');
const closeTosModal2 = document.getElementById('closeTosModal2');

// Show/hide ToS notice based on form state
function updateTosNotice() {
  const tosNotice = document.getElementById('tosNotice');
  if (!tosNotice) return;
  // Only show on sign up, step 1
  if (isSignUp && currentStep === 1) {
    tosNotice.style.display = '';
  } else {
    tosNotice.style.display = 'none';
  }
}

// Attach ToS modal handlers after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const tosLink = document.getElementById('tosLink');
  const tosModal = document.getElementById('tosModal');
  const closeTosModal = document.getElementById('closeTosModal');
  const closeTosModal2 = document.getElementById('closeTosModal2');
  if (tosLink && tosModal) {
    tosLink.onclick = () => { tosModal.classList.remove('hidden'); };
    closeTosModal.onclick = () => { tosModal.classList.add('hidden'); };
    closeTosModal2.onclick = () => { tosModal.classList.add('hidden'); };
    tosModal.onclick = (e) => {
      if (e.target === tosModal) tosModal.classList.add('hidden');
    };
  }
});
