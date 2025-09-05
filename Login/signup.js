// signup.js (updated)
// --- Firebase imports ---
import { 
  db, 
  auth, 
  initializeFirebase,
  signInWithGoogle 
} from "../backend/firebase.js"; // <-- CORRECTED: use ../backend (important)

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

window.addEventListener('beforeunload', () => {
  localStorage.removeItem('selectedPlan');
  localStorage.removeItem('selectedPlanTimestamp');
});

// initialize firebase with defensive try/catch so we don't fail silently
try {
  await initializeFirebase();
  console.log("Firebase initialized successfully");
} catch (e) {
  console.error("initializeFirebase() failed:", e);
  // we can't call showPopup here because it's defined later, but console.error at least
}

// --- Stripe Price Map ---
const PRICE_MAP = {
  basic: {
    GBP: "price_1S2DTJDUfadEcuo7FB6ihgCE",
    EUR: "price_1S2fjGDUfadEcuo754l9lglO",
    USD: "price_1S2fiHDUfadEcuo7q8f5emBR"
  },
  pro: {
    GBP: "price_1S2DW7DUfadEcuo7yw2Gnqov",
    EUR: "price_1S2foDDUfadEcuo7FrGc3txP",
    USD: "price_1S2flEDUfadEcuo7cjHQj9QW"
  }
};
function getPriceIdForPlan(planKey) {
  const selectedCurrency = (localStorage.getItem('selectedCurrency') || 'GBP').toUpperCase();
  const mapping = PRICE_MAP[planKey] || {};
  if (mapping[selectedCurrency]) return mapping[selectedCurrency];
  if (mapping.GBP) return mapping.GBP;
  const keys = Object.keys(mapping);
  return keys.length ? mapping[keys[0]] : null;
}

async function startCheckoutWithExtension(priceId) {
  if (!auth.currentUser) {
    showPopup("You must be logged in to subscribe.", "error");
    return;
  }
  const uid = auth.currentUser.uid;
  showLoader("Preparing secure payment...");
  let fallbackTimer = setTimeout(() => {
    showLoader("Still setting up payment — this usually takes a few more seconds. Please don't close this tab.");
  }, 8000);
  try {
    const docRef = await addDoc(collection(db, "customers", uid, "checkout_sessions"), {
      price: priceId,
      success_url: window.location.origin + ".../Calendar/Calendar",
      cancel_url: window.location.origin + "/signup?canceled=true",
      mode: "subscription",
      createdAt: serverTimestamp()
    });
    const unsub = onSnapshot(docRef, snap => {
      const data = snap.data();
      if (!data) return;
      if (data.error) {
        hideLoader();
        showPopup("Payment error: " + (data.error.message || "Unknown"), "error");
        localStorage.removeItem('signupInProgress');
        unsub();
        if (fallbackTimer) clearTimeout(fallbackTimer);
        return;
      }
      if (data.url) {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        showLoader("Redirecting to secure payment...");
        unsub();
        window.location.href = data.url;
      }
    });
  } catch (err) {
    hideLoader();
    showPopup("Failed to start checkout: " + err.message, "error");
    localStorage.removeItem('signupInProgress');
    if (fallbackTimer) clearTimeout(fallbackTimer);
  }
}

// --- Popup & Loader (unchanged) ---
function showPopup(message, type = "success") {
  const popup = document.createElement("div");
  popup.className = "fixed top-6 right-6 z-[11000] px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-md bg-white/10 text-white max-w-xs text-center animate-fade-in-up";
  popup.style.border = type === "error"
    ? "2px solid rgba(255,50,50,0.8)"
    : "2px solid rgba(50,255,100,0.8)";
  popup.innerHTML = `
    <div class="text-2xl mb-2">${type === "error" ? "❌" : "✅"}</div>
    <div class="text-sm">${message}</div>
  `;
  document.body.appendChild(popup);
  setTimeout(() => {
    popup.classList.add('popup-fade');
    setTimeout(() => popup.remove(), 400);
  }, 2000);
}
function showLoader(message = "Please wait...") {
  const overlay = document.getElementById('loaderOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    let msg = overlay.querySelector('.loader-message');
    if (!msg) {
      msg = document.createElement('div');
      msg.className = 'loader-message';
      msg.style.cssText = 'color:#fff;margin-top:12px;font-size:14px;text-align:center;';
      overlay.appendChild(msg);
    }
    msg.textContent = message;
  }
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

// --- Main UI Logic ---

  // DOM refs
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
  const tosLink = document.getElementById('tosLink');
  const tosModal = document.getElementById('tosModal');
  const closeTosModal = document.getElementById('closeTosModal');
  const closeTosModal2 = document.getElementById('closeTosModal2');

  let isSignUp = false; // <-- SHOW "Welcome Back" (sign in) FIRST
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
        cardDescription.textContent = 'Just a few more details to complete your profile (optional)';
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
  }

  // --- Validation ---
  function validateForm() {
    let isValid = false;
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    if (isSignUp && currentStep === 1) {
      isValid = email !== '' && password !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    } else if (isSignUp && currentStep === 2) {
      isValid = true;
    } else if (!isSignUp) {
      isValid = email !== '' && password !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    primaryBtn.disabled = !isValid;
    return isValid;
  }

  // --- Auth Actions ---
  const selectedPlan = localStorage.getItem('selectedPlan') || "free";

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
          const plan = selectedPlan || "free";
          localStorage.setItem('signupInProgress', '1');
          const storedPlan = plan === "free" ? "free" : "pending_payment";
          await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            createdAt: new Date().toISOString(),
            plan: storedPlan,
            requestedPlan: plan === "free" ? null : plan
          });
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          await setDoc(doc(db, "users", user.uid, "settings", "profile"), {
            name: fullName || "",
            plan: storedPlan,
            requestedPlan: plan === "free" ? null : plan,
            planStartedAt: plan === "free" ? new Date().toISOString() : null,
            timezone,
            tutorialSeen: false
          });
          if (plan === "free") {
            hideLoader();
            showGradientTransitionAndRedirect("../Calendar/Calendar");
          } else {
            const priceId = getPriceIdForPlan(plan);
            if (!priceId) {
              showPopup("No price configured for plan: " + plan, "error");
              primaryBtn.disabled = false;
              showLoader("Sending reset email...");
              return;
            }
            await startCheckoutWithExtension(priceId);
            return;
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
        showGradientTransitionAndRedirect("../Calendar/Calendar");
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
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    document.getElementById('fullName').value = '';
    updateUI();
  };

  document.getElementById('email').oninput = validateForm;
  document.getElementById('password').oninput = validateForm;
  document.getElementById('fullName').oninput = validateForm;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !primaryBtn.disabled) {
      primaryBtn.click();
    }
  });

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    const path = window.location.pathname.toLowerCase();
    const isAuthPage = path.includes('/login') || path.includes('/signup');
    if (isAuthPage || localStorage.getItem('signupInProgress')) {
      return;
    }
    showGradientTransitionAndRedirect("../Calendar/Calendar");
  });

  googleBtn.onclick = async () => {
    try {
      googleBtn.disabled = true;
      showLoader("Connecting to Google...");
      showPopup("Connecting to Google...");
      await signInWithGoogle();
      const user = auth.currentUser;
      if (!user) throw new Error("Google sign-in failed: no user returned.");
      const plan = localStorage.getItem('selectedPlan') || "free";
      if (plan === "free") {
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
        setTimeout(() => { window.location.href = "../Calendar/Calendar"; }, 1800);
      } else {
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
      }
    } catch (error) {
      showLoader("Sending reset email...");
      showPopup(error.message || "Failed to sign in with Google", "error");
      googleBtn.disabled = false;
      localStorage.removeItem('signupInProgress');
    }
  };

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

  // --- Terms of Service Modal Logic ---
  if (tosLink && tosModal) {
    tosLink.onclick = (ev) => {
      ev.preventDefault();
      tosModal.classList.remove('hidden');
    };
    closeTosModal.onclick = () => { tosModal.classList.add('hidden'); };
    closeTosModal2.onclick = () => { tosModal.classList.add('hidden'); };
    tosModal.onclick = (e) => {
      if (e.target === tosModal) tosModal.classList.add('hidden');
    };
  }

  // Initial UI
  updateUI();


// --- Gradient Transition Helper (unchanged) ---
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
const pwaInstallBtn = document.getElementById('pwa-install-btn');
  const pwaLoadingOverlay = document.getElementById('pwa-loading-overlay');

  if (pwaInstallBtn && pwaLoadingOverlay) {
    pwaInstallBtn.addEventListener('click', () => {
      pwaLoadingOverlay.style.display = 'flex';
      pwaLoadingOverlay.style.opacity = '1';
      pwaLoadingOverlay.style.pointerEvents = 'auto';
    });

  }

