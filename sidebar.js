import { saveUserSettings, loadUserSettings } from './backend/firebase.js';
import {
  doc,
  setDoc,
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  getDoc,
  updateDoc,
  getDocs,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getToken } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging.js";

import { PLAN_LIMITS } from './backend/planLimits.js';
import { auth } from './backend/firebase.js';
import { getMessagingInstance} from './backend/firebase.js';
import { submitFeedback, db } from './backend/firebase.js';

function showPopup(message, type = "info") {
  // Simple toast for demonstration
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
    background: ${type === "error" ? "#ef4444" : "#2563eb"};
    color: white; padding: 12px 24px; border-radius: 8px; z-index: 9999;
    font-weight: 600; font-size: 15px; box-shadow: 0 2px 12px rgba(0,0,0,0.15);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ---------- Proration helper functions (call from changePlanFlow) ----------
async function getActiveSubscriptionId(uid) {
  // Find the active subscription doc under customers/{uid}/subscriptions (extension writes these)
  const subsCol = collection(db, 'customers', uid, 'subscriptions');
  const subsSnap = await getDocs(subsCol);
  let foundId = null;
  subsSnap.forEach(snap => {
    const data = snap.data();
    if (!data) return;
    // prefer active or trialing
    if (data.status === 'active' || data.status === 'trialing') {
      // subscription document id is usually the Stripe subscription id
      foundId = snap.id;
    }
  });
  return foundId;
}

async function previewProration(subscriptionId, newPriceId) {
  const resp = await fetch('/api/preview-upgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscriptionId, newPriceId })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(()=>({error: 'Preview failed'}));
    throw new Error(err.error || 'Failed to preview proration');
  }
  return resp.json();
}

async function performProratedUpgrade(subscriptionId, newPriceId) {
  const resp = await fetch('/api/perform-upgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscriptionId, newPriceId })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(()=>({error: 'Upgrade failed'}));
    throw new Error(err.error || 'Failed to perform upgrade');
  }
  return resp.json();
}


// Map your plan keys to the Stripe Price IDs (replace with your actual price IDs)
const PRICE_MAP = {
  basic: {
    GBP: { id: "price_1S2DTJDUfadEcuo7FB6ihgCE", amount: "£2.49" },
    EUR: { id: "price_1S2fjGDUfadEcuo754l9lglO", amount: "€2.89" },
    USD: { id: "price_1S2fiHDUfadEcuo7q8f5emBR", amount: "$3.29" }
  },
  pro: {
    GBP: { id: "price_1S2DW7DUfadEcuo7yw2Gnqov", amount: "£4.99" },
    EUR: { id: "price_1S2foDDUfadEcuo7FrGc3txP", amount: "€5.49" },
    USD: { id: "price_1S2flEDUfadEcuo7cjHQj9QW", amount: "$6.79" }
  }
};

function getPriceInfo(planKey, currency) {
  if (planKey === 'free') return { amount: 'Free', id: null };
  try {
    return PRICE_MAP[planKey]?.[currency] || { amount: 'Price not available', id: null };
  } catch {
    return { amount: 'Price not available', id: null };
  }
}

// Then modify the getPriceLabel function to use it:
function getPriceLabel(planKey) {
  return getPriceInfo(planKey, currentCurrency).amount;
}

// And modify the getPriceId function:
function getPriceId(planKey) {
  return getPriceInfo(planKey, currentCurrency).id;
}
/* ============================
   Currency detection & helpers
   ============================ */

// Detect by browser locale: UK => GBP, Eurozone => EUR, else USD
function detectCurrency() {
  try {
    // Try getting from navigator.language first
    const locale = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    const lower = locale.toLowerCase();

    // UK and Ireland
    if (lower.startsWith("en-gb") || lower.includes("uk") || lower === "gb" || lower.includes("ie")) {
      return "GBP";
    }

    // Expanded Euro zone countries
    const euroCountries = [
      "de", "fr", "es", "it", "nl", "be", "pt", "ie", "gr", "at", 
      "fi", "se", "dk", "pl", "cz", "ro", "hu", "bg", "hr", "lv", 
      "lt", "ee", "sk", "si", "mt", "cy", "lu", "mc", "sm", "va"
    ];
    
    for (const country of euroCountries) {
      if (lower.startsWith(country)) return "EUR";
    }

    // Fallback to trying to get user's timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) {
      // European timezones
      if (timezone.startsWith("Europe/London")) return "GBP";
      if (timezone.startsWith("Europe/")) return "EUR";
    }

    // Default to USD for all other cases
    return "USD";
  } catch {
    return "USD"; // Safe fallback
  }
}

// Current chosen currency (auto-detect unless manually set in dropdown)
let currentCurrency = detectCurrency();

let renderCardsFunction = null; // Will hold reference to renderCards function
// Attach currency selector dropdown in settings modal
function initCurrencySelector(containerRoot = document) {
  const select = containerRoot.querySelector("#currency-selector-select");
  if (!select) return;
  
  // Ensure valid currency
  currentCurrency = PRICE_MAP.basic[currentCurrency] ? currentCurrency : 'USD';
  select.value = currentCurrency;
  
  select.addEventListener("change", (e) => {
    const newCurrency = e.target.value;
    // Validate currency exists in price map
    if (PRICE_MAP.basic[newCurrency]) {
      currentCurrency = newCurrency;
      // Re-render the plan cards if they're visible
      const chooserContainer = containerRoot.querySelector('#planChooserContainer');
      if (chooserContainer && chooserContainer.style.display !== 'none' && renderCardsFunction) {
        renderCardsFunction();
      }
    } else {
      console.warn('Invalid currency selected:', newCurrency);
      select.value = currentCurrency; // Reset to current valid currency
    }
  });
}




// Helper: change plan (handles free downgrade immediately; paid plans go through Stripe and mark pending)
// Modify changePlanFlow to be more secure
async function changePlanFlow(planKey, settings = null) {
  if (!auth.currentUser) {
    showPopup("Please sign in to change your plan.", "error");
    return;
  }
  const uid = auth.currentUser.uid;

  // Only handle free plan downgrades immediately
  if (planKey === 'free') {
    try {
      // Get current subscription first
      const subsCol = collection(db, 'customers', uid, 'subscriptions');
      const subsSnapshot = await getDocs(subsCol);
      
      // Cancel any active subscriptions in Stripe first
      const batch = writeBatch(db);
      subsSnapshot.forEach(doc => {
        if (doc.data().status === 'active') {
          batch.update(doc.ref, { cancel_at_period_end: true });
        }
      });
      
      // Update user doc
      batch.update(doc(db, "users", uid), {
        plan: "free",
        requestedPlan: null
      });
      
      // Update settings
            // Update settings
      batch.set(doc(db, "users", uid, "settings", "profile"), {
        ...(settings || {}),
        plan: "free", 
        requestedPlan: null,
        planStartedAt: new Date().toISOString()
      }, { merge: true });


      await batch.commit();
      
      showPopup("Successfully downgraded to Free plan");
      window.dispatchEvent(new CustomEvent('openSettingsModal'));
      return;
    } catch (err) {
      console.error("Downgrade error:", err);
      showPopup("Failed to downgrade plan", "error");
      return;
    }
  }

  // For paid plans:
  try {
    // Store current page/section for redirect after payment
    const currentSection = window.sidebar?.getActiveSection() || '';
    const currentPath = window.location.pathname;
    
    // 1. Mark as pending first
    await updateDoc(doc(db, "users", uid), {
  plan: "pending_payment",
  requestedPlan: planKey,
  preUpgradePage: currentPath,
  preUpgradeSection: currentSection,
  prevPlan: settings?.plan || "free",
  pendingAt: serverTimestamp()
});

    // 2. Update profile
    await setDoc(doc(db, "users", uid, "settings", "profile"), {
  ...(settings || {}),
  plan: "pending_payment",
  requestedPlan: planKey,
  planStartedAt: null,
  preUpgradePage: currentPath,
  preUpgradeSection: currentSection,
  prevPlan: settings?.plan || "free",
  pendingAt: serverTimestamp()
}, { merge: true });

// 3. PRORATION-aware flow (for upgrades)
    // Try to find an active subscription for this user
    const currentSubscriptionId = await getActiveSubscriptionId(uid);

    if (currentSubscriptionId) {
      // We have an active subscription -> preview prorated charge
      try {
        const newPriceId = getPriceId(planKey);
        const preview = await previewProration(currentSubscriptionId, newPriceId);

        if (!preview || !preview.invoicePreview) {
          throw new Error('No preview received');
        }

        const humanAmount = preview.invoicePreview.human_amount_due || (preview.invoicePreview.amount_due != null ? (preview.invoicePreview.amount_due/100).toFixed(2) : null);

        // Show the user what they'd be charged now. Use your existing showPopup or confirm UI.
        // Example using window.confirm for simplicity (replace with nicer modal if you have one)
        const confirmMsg = `Upgrade to ${planKey} — you will be charged ${humanAmount} now (prorated). Proceed?`;
        const ok = window.confirm(confirmMsg);
        if (!ok) {
          // user canceled — revert pending status
          await updateDoc(doc(db, "users", uid), {
            plan: settings?.plan || "free",
            requestedPlan: null
          });
          return;
        }

        // User confirmed -> perform upgrade
        const result = await performProratedUpgrade(currentSubscriptionId, newPriceId);

        // Optional: refresh Firestore / UI state. The Stripe extension should write updated subscription docs
        showPopup("Plan upgraded successfully. Proration applied.");
        // navigate / refresh as needed
        window.location.href = window.location.origin + "/Calendar/Calendar";
        return;
      } catch (err) {
        console.error("Prorated upgrade failed:", err);
        showPopup("Prorated upgrade failed: " + (err.message || err), "error");
        // Fallback: attempt the original checkout flow as a safe fallback
      }
    }

    // Fallback: if no active subscription or preview failed, fall back to creating a Checkout session via the extension:
    const docRef = await addDoc(collection(db, "customers", uid, "checkout_sessions"), {
  price: getPriceId(planKey),
  success_url: window.location.origin + "/Calendar/Calendar",
  cancel_url: window.location.origin + "/Calendar/Calendar", // <-- updated
  mode: "subscription",
  metadata: {
    requestedPlan: planKey,
    originalPath: currentPath,
    originalSection: currentSection,
    currency: currentCurrency
  },
  createdAt: serverTimestamp()
});


    // 4. Listen and redirect
    const unsub = onSnapshot(docRef, snap => {
      const data = snap.data();
      if (!data) return;
      
      if (data.error) {
        console.error("Stripe extension error:", data.error);
        showPopup("Payment error: " + (data.error.message || "Unknown"), "error");
        unsub();
        return;
      }
      
      if (data.url) {
        unsub();
        window.location.href = data.url;
      }
    });

  } catch (error) {
    console.error("Plan change error:", error);
    showPopup("Failed to change plan: " + error.message, "error");
    
    // Revert changes on error
    await updateDoc(doc(db, "users", uid), {
      plan: settings?.plan || "free",
      requestedPlan: null
    });
  }
}

// Revert pending payments that are stale (client-side cleanup when user opens settings)
async function cleanupStalePending(uid, maxAgeMinutes = 15) {
  if (!uid) return;
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    const u = userSnap.data();
    if (u.plan !== "pending_payment") return;

    // If pendingAt is missing, don't revert immediately (safety)
    const pendingAt = u.pendingAt;
    if (!pendingAt) return;

    // Convert Firestore Timestamp to JS Date
    let pendingDate;
    if (pendingAt.toDate && typeof pendingAt.toDate === 'function') {
      pendingDate = pendingAt.toDate();
    } else if (pendingAt.seconds) {
      pendingDate = new Date(pendingAt.seconds * 1000);
    } else {
      // unknown format — bail
      return;
    }

    const ageMs = Date.now() - pendingDate.getTime();
    if (ageMs < maxAgeMinutes * 60 * 1000) {
      // still within grace period — do nothing
      return;
    }

    // Check if Stripe (extension) created an active subscription
    const subsCol = collection(db, "customers", uid, "subscriptions");
    const subsSnap = await getDocs(subsCol);
    let hasActive = false;
    subsSnap.forEach(s => {
      const d = s.data();
      if (d && (d.status === "active" || d.status === "trialing")) hasActive = true;
    });

    if (hasActive) return; // subscription exists — do nothing

    // No active subscription and stale -> revert user's plan to prevPlan or free
    const revertTo = (u.prevPlan && typeof u.prevPlan === 'string') ? u.prevPlan : 'free';

    await updateDoc(userRef, {
      plan: revertTo,
      requestedPlan: null,
      pendingAt: null,
      prevPlan: null
    });

    // Update profile too
    await updateDoc(doc(db, "users", uid, "settings", "profile"), {
      plan: revertTo,
      requestedPlan: null,
      planStartedAt: new Date().toISOString(),
      pendingAt: null,
      prevPlan: null
    }).catch(()=>{ /* ignore if profile missing; it's optional */ });

    console.log('Reverted stale pending_payment for user', uid, '->', revertTo);
  } catch (err) {
    console.error('cleanupStalePending error', err);
  }
}
console.log("fetchBillingInfoOnce called")
// -------------------- Added: one-off billing fetch for Settings modal --------------------
async function fetchBillingInfoOnce() {
  try {
    console.log("fetchBillingInfoOnce called");
    if (!auth.currentUser) {
      console.warn("No currentUser");
      return;
    }
    const uid = auth.currentUser.uid;

    const nextBillingEl = document.getElementById("nextBillingText");
    const planCardContainer = document.getElementById("planCardContainer");
    console.log("nextBillingEl:", !!nextBillingEl, "planCardContainer:", !!planCardContainer);
    if (!nextBillingEl || !planCardContainer) {
      console.warn("Missing DOM elements for billing info");
      return;
    }
    // Reset displays
    nextBillingEl.textContent = "";
    let lastPaymentEl = document.getElementById("lastPaymentText");
    if (!lastPaymentEl) {
      lastPaymentEl = document.createElement("p");
      lastPaymentEl.id = "lastPaymentText";
      lastPaymentEl.style.color = "#9fb0db";
      lastPaymentEl.style.fontSize = "13px";
      lastPaymentEl.style.marginTop = "6px";
      nextBillingEl.insertAdjacentElement("afterend", lastPaymentEl);
    }
    lastPaymentEl.textContent = "";

    // ------------------------------
    // 1) Subscriptions
    // ------------------------------
    const subsCol = collection(db, "customers", uid, "subscriptions");
    const subsSnap = await getDocs(subsCol);

    let activeSub = null;
    subsSnap.forEach((snap) => {
      const data = snap.data();
      console.log("Subscription doc:", snap.id, data); // 👈 debug log
      if (data && (data.status === "active" || data.status === "trialing")) {
        activeSub = data;
      }
    });

    let planKey = "free";
    let friendlyPlan = "Free";
    let planStartedAt = null;
    let planEndsAt = null;

    if (activeSub) {
      // Next billing date
      let nextBillingText = "";
      if (activeSub.current_period_end) {
        const ts =
          activeSub.current_period_end.seconds != null
            ? activeSub.current_period_end.seconds * 1000
            : activeSub.current_period_end * 1000;
        nextBillingText = "Next billing date: " + new Date(ts).toLocaleDateString();
        planEndsAt = new Date(ts).toISOString();
      }
      nextBillingEl.textContent = nextBillingText;

      // Extract priceId safely
      let priceId = null;
      const item = activeSub.items?.[0];
      if (item) {
        if (typeof item.price === "string") {
          priceId = item.price;
        } else if (item.price?.id) {
          priceId = item.price.id;
        } else if (item.plan?.id) {
          priceId = item.plan.id;
        }
      } else if (typeof activeSub.price === "string") {
        priceId = activeSub.price;
      } else if (activeSub.price?.id) {
        priceId = activeSub.price.id;
      }

      console.log("Resolved priceId:", priceId); // 👈 debug log

      // Map to your plan keys
      if (priceId === "price_1S2DTJDUfadEcuo7FB6ihgCE") planKey = "basic";
      if (priceId === "price_1S2DW7DUfadEcuo7yw2Gnqov") planKey = "pro";

      // Friendly name fallback
      friendlyPlan = planKey
        ? planKey.charAt(0).toUpperCase() + planKey.slice(1)
        : item?.plan?.nickname || "Paid";

      // StartedAt
      if (activeSub.current_period_start) {
        const ts =
          activeSub.current_period_start.seconds != null
            ? activeSub.current_period_start.seconds * 1000
            : activeSub.current_period_start * 1000;
        planStartedAt = new Date(ts).toISOString();
      }

      // Update plan card UI
      const planName =
        PLAN_LIMITS[friendlyPlan?.toLowerCase()]?.planName || friendlyPlan;
      const statusLine = `<div id="billingStatusLine" style="color:#cbd5e1;margin-top:6px;font-size:13px;">${planName} • ${activeSub.status}</div>`;
      const existing = planCardContainer.querySelector("#billingStatusLine");
      if (existing) {
        existing.outerHTML = statusLine;
      } else {
        planCardContainer.insertAdjacentHTML("beforeend", statusLine);
      }
    } else {
      // No active subscription
      const existing = planCardContainer.querySelector("#billingStatusLine");
      if (existing) existing.remove();
    }

    // ------------------------------
    // 2) Update Firestore user profile
    // ------------------------------
    const updates = {
      plan: planKey,
      requestedPlan: null,
      planStartedAt,
      planEndsAt,
      updatedAt: new Date().toISOString(),
    };
    console.log("Updating user docs with:", updates); // 👈 debug log

    await updateDoc(doc(db, "users", uid), updates).catch((err) =>
      console.warn("Failed to update users doc", err)
    );
    await updateDoc(doc(db, "users", uid, "settings", "profile"), updates).catch(
      (err) => console.warn("Failed to update profile doc", err)
    );

    // ------------------------------
    // 3) Payments
    // ------------------------------
    const paymentsCol = collection(db, "customers", uid, "payments");
    const paymentsSnap = await getDocs(paymentsCol);
    let latestPayment = null;
    paymentsSnap.forEach((snap) => {
      const d = snap.data();
      console.log("Payment doc:", snap.id, d); // 👈 debug log
      if (!d) return;
      if (d.status === "succeeded" || d.amount_received > 0) {
        if (!latestPayment) latestPayment = d;
        else {
          const curCreated =
            d.created?.seconds != null ? d.created.seconds : d.created || 0;
          const bestCreated =
            latestPayment.created?.seconds != null
              ? latestPayment.created.seconds
              : latestPayment.created || 0;
          if (curCreated > bestCreated) latestPayment = d;
        }
      }
    });

    if (latestPayment) {
      const amount =
        latestPayment.amount_received != null
          ? (latestPayment.amount_received / 100).toFixed(2)
          : latestPayment.amount || "";
      const currency = latestPayment.currency
        ? latestPayment.currency.toUpperCase()
        : "";
      let dateText = "";
      if (latestPayment.created?.seconds != null) {
        dateText = new Date(latestPayment.created.seconds * 1000).toLocaleDateString();
      } else if (latestPayment.created) {
        dateText = new Date(latestPayment.created).toLocaleDateString();
      }
      lastPaymentEl.textContent = `Last payment: ${
        currency ? currency + " " : ""
      }${amount} — ${dateText}`;
    } else {
      lastPaymentEl.textContent = "";
    }
  } catch (err) {
    console.error("fetchBillingInfoOnce error", err);
  }
}


// ----------------------------------------------------------------------------------------

// --- VAPID PUBLIC KEY (replace with your actual key) ---
const VAPID_PUBLIC_KEY = 'BPpogVifRNIEOqgN3z4T3kqG_JUbS2-Ui9TiJDu84VtzvabIC2XI_XQHy0Yh3BueZ-LnSINZ9wEDT5Bdm0LvqyI';

async function requestPushPermissionAndSaveToken() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      // No alert, just return
      return;
    }
    const messaging = getMessagingInstance();
    const token = await getToken(messaging, { vapidKey: VAPID_PUBLIC_KEY });
    const settings = await loadUserSettings();
    await saveUserSettings({ ...settings, pushToken: token, pushNotifications: true });
    // No alert here either
  } catch (err) {
    // No alert, just fail silently
  }
}
// Add this CSS at the top of createSettingsModal
const toggleStyles = document.createElement('style');
toggleStyles.textContent = `
  .toggle-dot {
    width: 20px !important;
    height: 20px !important;
    background: white !important;
    border-radius: 50% !important;
    position: absolute !important;
    top: 2px !important;
    left: 2px !important;
    transition: transform 0.2s !important;
  }
  .toggle-bg, .toggle-wrapper {
    width: 44px !important;
    height: 24px !important;
    border-radius: 12px !important;
    position: relative !important;
    transition: background-color 0.2s !important;
  }
`;
document.head.appendChild(toggleStyles);
// Attach to settings modal toggle

if (!document.getElementById('plan-modal-styles')) {
  const style = document.createElement('style');
  style.id = 'plan-modal-styles';
  style.textContent = `
@keyframes gradient-wave-blue {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes gradient-wave-purple {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes gradient-wave-gold {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.pm-plan-card {
  border-radius: 16px;
  box-shadow: 0 8px 32px 0 rgba(30,41,59,0.18);
  padding: 22px 20px 18px 20px;
  margin-bottom: 18px;
  color: #fff;
  position: relative;
  overflow: hidden;
  transition: box-shadow 0.2s, transform 0.2s;
  cursor: pointer;
  border: none;
  background-size: 400% 400%;
  background-position: 0% 50%; /* Add this line */
}
.pm-plan-card.free {
  background: linear-gradient(120deg, #2563eb 0%, #38bdf8 40%, #60a5fa 80%, #2563eb 100%);
  animation: gradient-wave-blue 8s ease-in-out infinite;
}
.pm-plan-card.basic {
  background: linear-gradient(120deg, #a855f7 0%, #6366f1 40%, #7c3aed 80%, #a855f7 100%);
  animation: gradient-wave-purple 8s ease-in-out infinite;
}
.pm-plan-card.pro {
  background: linear-gradient(120deg, #fbbf24 0%, #f59e42 40%, #fcd34d 80%, #fbbf24 100%);
  animation: gradient-wave-gold 8s ease-in-out infinite;
  color: #2d1600;
}
.pm-plan-card:hover {
  box-shadow: 0 16px 48px 0 rgba(30,41,59,0.28);
  transform: translateY(-4px) scale(1.02);
}
.pm-plan-card .pm-plan-title {
  font-size: 20px;
  font-weight: 800;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.pm-plan-card .pm-plan-badge {
  padding: 6px 12px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 13px;
  background: rgba(255,255,255,0.85);
  color: #2563eb;
  margin-left: 10px;
}
.pm-plan-card.pro .pm-plan-badge { color: #b45309; }
.pm-plan-card .pm-plan-desc {
  font-size: 14px;
  color: rgba(255,255,255,0.92);
  margin-bottom: 10px;
}
.pm-plan-card .pm-plan-usage {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.pm-plan-card .pm-usage-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  align-items: center;
  background: rgba(255,255,255,0.08);
  border-radius: 7px;
  padding: 5px 10px;
}
.pm-plan-card .pm-usage-row .pm-usage-label {
  color: #e0e7ef;
}
.pm-plan-card .pm-usage-row .pm-usage-val {
  font-weight: 700;
  color: #fff;
}
.pm-plan-card .pm-usage-row .pm-usage-exceeded {
  color: #ffb4b4;
  font-weight: 800;
  margin-left: 8px;
}
.pm-plan-card .pm-plan-btn {
  margin-top: 16px;
  width: 100%;
  padding: 12px;
  border-radius: 10px;
  border: none;
  font-weight: 700;
  font-size: 15px;
  background: linear-gradient(90deg,#38bdf8, #7c3aed);
  color: #071033;
  cursor: pointer;
  transition: none;
}
.pm-plan-card .pm-plan-btn:hover {
  /* No background change on hover */
  background: linear-gradient(90deg,#38bdf8, #7c3aed);
  color: #071033;
}
  `;
  document.head.appendChild(style);
}

// Add at the top of both files (once)
if (!document.getElementById('feedback-dropdown-style')) {
  const style = document.createElement('style');
  style.id = 'feedback-dropdown-style';
  style.textContent = `
.sidebar-feedback-select,
#sidebarFeedbackType {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  padding: 8px 36px 8px 12px;
  border-radius: 7px;
  border: 1px solid #64748b;
  font-weight: 600;
  font-size: 15px;
  color: #fff;
  background: linear-gradient(90deg, #2563eb 0%, #a855f7 100%);
  transition: border 0.2s, box-shadow 0.2s;
  outline: none;
  box-shadow: 0 2px 8px 0 rgba(30,41,59,0.08);
  cursor: pointer;
  position: relative;
}
.sidebar-feedback-select:focus,
#sidebarFeedbackType:focus {
  border: 1.5px solid #7dd3fc;
  box-shadow: 0 0 0 2px #a5b4fc44;
}
.sidebar-feedback-select option,
#sidebarFeedbackType option {
  color: #fff;
  background: #2563eb;
}
.sidebar-feedback-select option[value="bug"],
#sidebarFeedbackType option[value="bug"] {
  background: #ef4444;
}
.sidebar-feedback-select option[value="feedback"],
#sidebarFeedbackType option[value="feedback"] {
  background: #2563eb;
}
.sidebar-feedback-select option[value="feature"],
#sidebarFeedbackType option[value="feature"] {
  background: #a855f7;
}
/* Hover effect for dropdown options (only works in some browsers) */
 `;
  document.head.appendChild(style);
}

function createSidebar() {
  // State variables
  let sidebarOpen = false;
  let settingsOpen = false;

  let activeSection = '';


const navigationItems = [
  { name: 'Calendar', path: '/Calendar/Calendar', icon: 'calendar' },
  { name: 'Just Chat', path: '/Just_Chat/Just_Chat', icon: 'message-circle' },
  { name: 'Responses', path: '/responses_centre/Responses', icon: 'responses' },
  { name: 'Doc Live', path: '/DocLive/documentHub', icon: 'doclive' },
  { name: 'Help', path: './help', icon: 'help' },
  { name: 'Feedback', path: '#', icon: 'message-square' }
];

// Automatically set activeSection based on current URL
const currentPath = window.location.pathname;
for (const item of navigationItems) {
  if (item.path && currentPath.endsWith(item.path.replace('./', ''))) {
    activeSection = item.name;
    break;
  }
}

  // Create SVG icons
  function createIcon(iconName, size = 20) {
    const icons = {
      'responses': `
  <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M8 8l-4 0 0-4M16 16l4 0 0 4" />
`,
  'doclive': `<rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/><polyline points="4 7 4 3 20 3 20 21 4 21 4 17"/>`, // written document
  'help': `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 1 1 5.82 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r="1.2"/>`,
'message-square': `<rect x="3" y="7" width="18" height="14" rx="2"/><polyline points="8 10 12 14 16 10"/>`,
      'file': `<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3,7 12,13 21,7"/>`, // document icon
  'activity': `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`, // activity/ai
      'calendar': `<path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>`,
      'message-circle': `<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>`,
      'file-text': `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/>`,
      'video': `<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>`,
      'help-circle': `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><point cx="12" cy="17"/>`,
      'user': `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
      'menu': `<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>`,
      'x': `<path d="m18 6-12 12"/><path d="m6 6 12 12"/>`,
      'chevron-right': `<path d="m9 18 6-6-6-6"/>`,
      'bell': `<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>`,
      'credit-card': `<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>`,
      'settings': `<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.39a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>`
    };
    
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[iconName] || ''}</svg>`;
  }

  // Create mobile overlay
  function createMobileOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 40;
      display: ${sidebarOpen ? 'block' : 'none'};
    `;
    
    overlay.addEventListener('click', () => {
      sidebarOpen = false;
      render();
    });

    // Hide on desktop
    if (window.innerWidth >= 768) {
      overlay.style.display = 'none';
    }

    return overlay;
  }

window.addEventListener('openSettingsModal', () => {
  settingsOpen = true;
  render();
});


// Replace your createSidebarElement function with this:
function createSidebarElement() {
  // Keep this variable inside the closure so it resets on each render
  let feedbackFormOpen = false;
  if (typeof createSidebarElement._feedbackFormOpen === "undefined") {
    createSidebarElement._feedbackFormOpen = false;
  }
  feedbackFormOpen = createSidebarElement._feedbackFormOpen;

  const sidebar = document.createElement('div');
  sidebar.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    height: 100%;
    background: rgba(30, 41, 59, 0.95);
    backdrop-filter: blur(8px);
    border-right: 1px solid rgba(71, 85, 105, 0.5);
    transition: all 0.3s ease-in-out;
    z-index: 50;
    width: ${sidebarOpen ? '320px' : window.innerWidth < 768 ? '0' : '80px'};
    transform: ${sidebarOpen || window.innerWidth >= 768 ? 'translateX(0)' : 'translateX(-100%)'};
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 16px;
    border-bottom: 1px solid rgba(71, 85, 105, 0.5);
  `;

  const headerContent = document.createElement('div');
  headerContent.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;

  if (sidebarOpen) {
    const title = document.createElement('h2');
    title.textContent = 'Navigator';
    title.style.cssText = `
      font-size: 18px;
      font-weight: 600;
      background: linear-gradient(to right, rgb(96 165 250), rgb(168 85 247));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 0;
    `;
    headerContent.appendChild(title);
  }

  const menuButton = document.createElement('button');
  menuButton.innerHTML = sidebarOpen ? createIcon('x', 20) : createIcon('menu', 24);
  menuButton.style.cssText = `
    padding: 8px;
    border-radius: 8px;
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    transition: background-color 0.2s;
  `;
  menuButton.id = 'sidebarMenuButton';
  menuButton.addEventListener('mouseenter', () => {
    menuButton.style.background = 'rgba(71, 85, 105, 0.5)';
  });
  menuButton.addEventListener('mouseleave', () => {
    menuButton.style.background = 'none';
  });
  menuButton.addEventListener('click', () => {
    // Toggle sidebar open/close
    sidebarOpen = !sidebarOpen;
    render();
  });

  headerContent.appendChild(menuButton);
  header.appendChild(headerContent);
  sidebar.appendChild(header);

  // Navigation
  const nav = document.createElement('nav');
nav.style.cssText = `
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  min-height: 0;
`;

navigationItems.forEach(item => {
  if (item.name === 'Feedback') return; // We'll handle Feedback separately
  // Only ONE button per item!
  const button = document.createElement('button');
  if (item.name === 'Responses') {
    button.id = 'sidebarResponsesBtn'; // <-- Set the id here
  }
  const isActive = activeSection === item.name;
    button.style.cssText = `
      width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 8px;
      transition: all 0.2s;
      border: none;
      cursor: pointer;
      background: ${isActive ? 'linear-gradient(to right, rgba(37, 99, 235, 0.2), rgba(147, 51, 234, 0.2))' : 'none'};
      border: ${isActive ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent'};
      color: ${isActive ? 'rgb(147 197 253)' : 'rgb(148 163 184)'};
      justify-content: center;
    `;

    const iconSize = !sidebarOpen && window.innerWidth >= 768 ? 28 : 20;
    button.innerHTML = createIcon(item.icon, iconSize);

    // Only show text if sidebar is open
    if (sidebarOpen) {
      button.innerHTML += `
        <span style="font-weight: 500; font-size: 14px;">${item.name}</span>
        <span style="margin-left: auto; opacity: 0.5;">${createIcon('chevron-right', 16)}</span>
      `;
      button.style.justifyContent = 'flex-start';
    }

    button.addEventListener('mouseenter', () => {
      if (!isActive) {
        button.style.background = 'rgba(71, 85, 105, 0.5)';
        button.style.color = 'white';
      }
    });

    button.addEventListener('mouseleave', () => {
      if (!isActive) {
        button.style.background = 'none';
        button.style.color = 'rgb(148 163 184)';
      }
    });

button.addEventListener('click', () => {
  activeSection = item.name;
  if (window.innerWidth < 768) {
    sidebarOpen = false;
  }
  render();
  // Actually navigate if path is an HTML file
  if (item.path && item.path.endsWith('')) {
    // Use window.location to go to the correct relative path
    window.location.href = item.path;
  } else {
    window.dispatchEvent(new CustomEvent('sidebarNavigation', { 
      detail: { section: item.name, path: item.path } 
    }));
  }
});

    nav.appendChild(button);
  });

  // --- Feedback Button (special styling) ---
  const feedbackBtn = document.createElement('button');
  feedbackBtn.style.cssText = `
    width: 100%;
    border-radius: 8px;
    padding: 12px;
    margin-top: 16px;
    background: ${feedbackFormOpen ? 'linear-gradient(90deg, #2563eb 0%, #a855f7 100%)' : 'rgba(30, 41, 59, 0.7)'};
    border: 2px dashed rgba(59, 130, 246, 0.7);
    color: ${feedbackFormOpen ? 'white' : 'rgb(168 85 247)'};
    cursor: pointer;
    font-weight: 600;
    font-size: 15px;
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: flex-start;
    box-shadow: ${feedbackFormOpen ? '0 4px 24px 0 rgba(59,130,246,0.15)' : 'none'};
    transition: all 0.2s;
    position: relative;
    overflow: hidden;
  `;
  feedbackBtn.innerHTML = `${createIcon('message-square', 20)} <span${sidebarOpen ? '' : ' style="display:none"'}>Feedback</span>`;

  feedbackBtn.addEventListener('click', () => {
    createSidebarElement._feedbackFormOpen = !createSidebarElement._feedbackFormOpen;
    render();
  });

  nav.appendChild(feedbackBtn);

  // --- Feedback Form (inline in sidebar, styled like message.js) ---
if (feedbackFormOpen && sidebarOpen) {
  nav.appendChild(createSidebarFeedbackForm());
}

  sidebar.appendChild(nav);

  // User Profile
  const userSection = document.createElement('div');
  userSection.style.cssText = `
    padding: 16px;
    border-top: 1px solid rgba(71, 85, 105, 0.5);
  `;

  const userButton = document.createElement('button');
  userButton.style.cssText = `
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    transition: all 0.2s;
    border: none;
    cursor: pointer;
    background: none;
    color: rgb(148 163 184);
    justify-content: ${!sidebarOpen && window.innerWidth >= 768 ? 'center' : 'flex-start'};
  `;

const avatarSize = !sidebarOpen && window.innerWidth >= 768 ? '40px' : '32px';
const avatar = document.createElement('div');
avatar.style.cssText = `
  width: ${avatarSize};
  height: ${avatarSize};
  min-width: ${avatarSize};
  min-height: ${avatarSize};
  max-width: ${avatarSize};
  max-height: ${avatarSize};
  border-radius: 50%;
  background: linear-gradient(to right, rgb(59 130 246), rgb(147 51 234));
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  overflow: hidden;
`;
avatar.innerHTML = createIcon('user', !sidebarOpen && window.innerWidth >= 768 ? 20 : 16);

  userButton.appendChild(avatar);

  if (sidebarOpen) {
  const userInfo = document.createElement('div');
  userInfo.style.cssText = `
    flex: 1;
    text-align: left;
  `;
  // Async load user info
  loadUserSettings().then(settings => {
    const userName = settings?.name || '';
    const userPlan = PLAN_LIMITS[settings?.plan]?.planName || '';
    userInfo.innerHTML = `
      <p style="font-weight: 500; margin: 0; font-size: 14px;">${userName}</p>
      <p style="font-size: 12px; color: rgb(148 163 184); margin: 0;">${userPlan}</p>
    `;
  }).catch(() => {
    userInfo.innerHTML = `
      <p style="font-weight: 500; margin: 0; font-size: 14px;"></p>
      <p style="font-size: 12px; color: rgb(148 163 184); margin: 0;"></p>
    `;
  });
  userButton.appendChild(userInfo);
}

  userButton.addEventListener('mouseenter', () => {
    userButton.style.background = 'rgba(71, 85, 105, 0.5)';
    userButton.style.color = 'white';
  });

  userButton.addEventListener('mouseleave', () => {
    userButton.style.background = 'none';
    userButton.style.color = 'rgb(148 163 184)';
  });

userButton.addEventListener('click', () => {
  if (window.sidebar && typeof window.sidebar.openSettings === 'function') {
    window.sidebar.openSettings();
  }
});
  userSection.appendChild(userButton);
  sidebar.appendChild(userSection);

  return sidebar;
}

function createSidebarFeedbackForm() {
  const formContainer = document.createElement('div');
  formContainer.style.cssText = `
    background: #1e293b;
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 12px;
    padding: 16px;
    margin-top: 8px;
    margin-bottom: 8px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: fadeIn 0.2s;
  `;

  formContainer.innerHTML = `
    <label style="color: white; font-weight: 500; font-size: 14px;">Type</label>
    <select id="sidebarFeedbackType" class="sidebar-feedback-select">
  <option value="bug">Report Bug</option>
  <option value="feedback">General Feedback</option>
  <option value="feature">Suggest Feature</option>
</select>
    <label style="color: white; font-weight: 500; font-size: 14px;">Message</label>
    <textarea id="sidebarFeedbackText" rows="3" style="padding: 8px; border-radius: 6px; border: 1px solid #64748b; background: #1e293b; color: white; resize: vertical;"></textarea>
    <button id="sidebarFeedbackSend" style="background: rgb(37 99 235); color: white; border: none; border-radius: 8px; padding: 10px; font-weight: 600; cursor: pointer; margin-top: 4px;">
      Send Feedback
    </button>
    <div id="sidebarFeedbackMsg" style="color: rgb(34 197 94); font-size: 13px; margin-top: 4px; display: none;"></div>
  `;



formContainer.querySelector('#sidebarFeedbackSend').onclick = async () => {
  const type = formContainer.querySelector('#sidebarFeedbackType').value;
  const text = formContainer.querySelector('#sidebarFeedbackText').value.trim();
  const msgDiv = formContainer.querySelector('#sidebarFeedbackMsg');
  if (!text) {
    msgDiv.style.display = 'block';
    msgDiv.style.color = 'rgb(239 68 68)';
    msgDiv.textContent = 'Please enter your feedback.';
    return;
  }
  try {
    await submitFeedback({
      type,
      title: type.charAt(0).toUpperCase() + type.slice(1),
      body: text
    });
    msgDiv.style.display = 'block';
    msgDiv.style.color = 'rgb(34 197 94)';
    msgDiv.textContent = 'Thank you for your feedback!';
    formContainer.querySelector('#sidebarFeedbackText').value = '';
    setTimeout(() => {
      msgDiv.style.display = 'none';
    }, 2000);
  } catch (err) {
    msgDiv.style.display = 'block';
    msgDiv.style.color = 'rgb(239 68 68)';
    msgDiv.textContent = 'Failed to send feedback.';
  }
};

  return formContainer;
}

function renderPlanCard(modalContent, settings) {
  const s = settings || {};
  const planKey = s.plan || 'free';
  const plan = PLAN_LIMITS[planKey] || PLAN_LIMITS.free;
  const planName = plan.planName || 'Free';
  const planCardContainer = modalContent.querySelector('#planCardContainer');
  const planClass = planKey === 'pro' ? 'pro' : planKey === 'basic' ? 'basic' : 'free';
  const keys = Object.keys(plan).filter(k => typeof plan[k] === 'number' && plan[k] > 0);
  const usageHtml = keys.map(k => {
    const used = (s.usage && s.usage[k]) || 0;
    const max = plan[k];
    return `
      <div class="pm-usage-row">
        <span class="pm-usage-label">${k.replace(/([A-Z])/g, ' $1').replace(/PerDay/g, ' / day').replace(/^./, s => s.toUpperCase())}</span>
        <span class="pm-usage-val">${used} / ${max}${used > max ? '<span class="pm-usage-exceeded">• Exceeded</span>' : ''}</span>
      </div>
    `;
  }).join('');

  if (planCardContainer) {
    planCardContainer.innerHTML = `
      <div class="pm-plan-card ${planClass}">
        <div class="pm-plan-title">${planName}${planKey !== 'free' ? `<span class="pm-plan-badge">Current</span>` : ''}</div>
        <div class="pm-plan-desc">Plan: ${planKey} • Click below to change</div>
        <div class="pm-plan-usage">${usageHtml}</div>
        <button id="changePlanBtn" class="pm-plan-btn" type="button">Upgrade / Change Plan</button>
      </div>
    `;
    const cp = planCardContainer.querySelector('#changePlanBtn');
    if (cp) cp.onclick = () => {
      planCardContainer.style.display = 'none';
      const chooserContainer = modalContent.querySelector('#planChooserContainer');
      chooserContainer.style.display = '';
      renderPlanChooserInModal(s, chooserContainer, planCardContainer);
    };
  }
}

  // Create settings modal
function createSettingsModal() {
  if (!settingsOpen) return null;

  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 16px;
  `;

  const modalContent = document.createElement('div');
   modalContent.classList.add('modal-content');
  modalContent.style.cssText = `
    background: rgb(30 41 59);
    border-radius: 12px;
    border: 1px solid rgba(71, 85, 105, 0.5);
    width: 100%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
    padding: 0;
  `;

  modalContent.innerHTML = `
    <div style="padding: 24px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
        <h2 style="font-size: 20px; font-weight: 600; margin: 0; color: white;">Settings</h2>
        <button id="closeSettings" style="padding: 8px; border-radius: 8px; background: none; border: none; color: white; cursor: pointer; transition: background-color 0.2s;">
          ${createIcon('x', 20)}
        </button>
      </div>

      <form id="settingsForm" style="display: flex; flex-direction: column; gap: 24px;">
        <!-- Profile -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <h3 style="font-size: 18px; font-weight: 500; display: flex; align-items: center; gap: 8px; margin: 0; color: white;">
            ${createIcon('user', 20)} Profile
          </h3>
          <div>
            <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 4px; color: white;">Name</label>
            <input id="settingsName" type="text" value="" style="width: 100%; padding: 12px; background: rgba(71, 85, 105, 0.5); border: 1px solid rgba(100, 116, 139, 0.5); border-radius: 8px; color: white; font-size: 14px; box-sizing: border-box;">
            <!-- Billing currency selector -->
<div style="margin-top:10px;">
  <label style="display:block;font-size:13px;color:#cbd5e1;margin-bottom:6px;font-weight:600;">
    Billing currency
  </label>
  <select id="currency-selector-select" style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(100,116,139,0.5);background:#0f1724;color:white;font-weight:600;">
    <option value="GBP">GBP — British Pound</option>
    <option value="EUR">EUR — Euro</option>
    <option value="USD">USD — US Dollar</option>
  </select>
</div>

          </div>
        </div>

        <!-- Plan container placeholder -->
          <!-- Plan container placeholder -->
  <div id="planCardContainer"></div>
  <div id="planChooserContainer" style="display:none;"></div>
  <p id="nextBillingText" style="color:#9fb0db;font-size:13px;margin-top:8px;"></p>

        <!-- Notifications -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <h3 style="font-size: 18px; font-weight: 500; display: flex; align-items: center; gap: 8px; margin: 0; color: white;">
            ${createIcon('bell', 20)} Notifications
          </h3>

          <div style="display:flex;flex-direction:column;gap:12px;">
            

            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="color:white;">Notification Permission</span>
              <label id="labelPushNotif" class="toggle-label" style="position: relative; display: inline-flex; align-items: center; cursor: pointer;">
                <input id="settingsPushNotif" type="checkbox" style="position: absolute; opacity: 0; width: 0; height: 0;">
                <div class="toggle-bg" style="width:44px;height:24px;background:rgb(100 116 139);border-radius:12px;position:relative;">
                  <div class="toggle-dot" style="width:20px;height:20px;background:#fff;border-radius:50%;position:absolute;top:2px;left:2px;transition:left 0.18s;"></div>
                </div>
              </label>
            </div>

            
          </div>
        </div>
        <!-- Actions -->
        <div style="display:flex;gap:12px;padding-top:16px;">
          <button id="settingsSaveBtn" type="submit" style="flex:1;background:rgb(37 99 235);color:white;padding:12px;border-radius:8px;font-weight:500;border:none;cursor:pointer;">Save Changes</button>
          <button id="cancelSettings" type="button" style="flex:1;background:rgb(71 85 105);color:white;padding:12px;border-radius:8px;font-weight:500;border:none;cursor:pointer;">Cancel</button>
        </div>
        <button id="deleteAccountBtn" type="button" style="background:#991b1b;color:white;padding:12px;border-radius:8px;font-weight:600;border:none;cursor:pointer;margin-top:12px;">
  Delete Account
</button>


<div id="deleteConfirmModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:100;align-items:center;justify-content:center;">
  <div style="background:#1e293b;border-radius:12px;padding:24px;max-width:400px;width:90%;">
    <h3 style="color:white;font-size:18px;margin:0 0 16px 0;">Delete Account?</h3>
    <p style="color:#94a3b8;margin:0 0 20px 0;line-height:1.5;">
      This will permanently delete your account and all associated data. This action cannot be undone.
    </p>
    <div style="display:flex;gap:12px;">
      <button id="confirmDeleteBtn" style="flex:1;background:#991b1b;color:white;border:none;padding:12px;border-radius:8px;font-weight:600;cursor:pointer;">
        Yes, Delete Account
      </button>
      <button id="cancelDeleteBtn" style="flex:1;background:#475569;color:white;border:none;padding:12px;border-radius:8px;font-weight:600;cursor:pointer;">
        Cancel
      </button>
    </div>
  </div>
</div>
        <button id="logoutBtn" type="button" style="background:#ef4444;color:white;padding:12px;border-radius:8px;font-weight:600;border:none;cursor:pointer;margin-top:18px;">Log Out</button>
      </form>

      
    </div>
    
  `;

  modal.appendChild(modalContent);
  // Add the event listeners in the same settings modal creation function:
const deleteAccountBtn = modalContent.querySelector('#deleteAccountBtn');
const deleteConfirmModal = modalContent.querySelector('#deleteConfirmModal');
const confirmDeleteBtn = modalContent.querySelector('#confirmDeleteBtn');
const cancelDeleteBtn = modalContent.querySelector('#cancelDeleteBtn');

if (deleteAccountBtn) {
  deleteAccountBtn.onclick = () => {
    deleteConfirmModal.style.display = 'flex';
  };
}

if (cancelDeleteBtn) {
  cancelDeleteBtn.onclick = () => {
    deleteConfirmModal.style.display = 'none';
  };
}

if (confirmDeleteBtn) {
  confirmDeleteBtn.onclick = async () => {
    try {
      await deleteUserAccount();
      window.location.href = './Login/signup';
    } catch (err) {
      console.error('Failed to delete account:', err);
      alert('Failed to delete account. Please try again.');
    }
  };
}
  // Helper: scoped toggle wiring (positions dot by left/right rather than transform)
  function wireToggle(labelId, { onBg = 'rgb(37 99 235)', offBg = 'rgb(100 116 139)', onChange } = {}) {
    const label = modalContent.querySelector(`#${labelId}`);
    if (!label) return null;
    const checkbox = label.querySelector('input[type="checkbox"]');
    const wrapper = label.querySelector('.toggle-bg') || label.querySelector('.toggle-wrapper');
    const dot = wrapper && wrapper.querySelector('.toggle-dot');

    const setVisual = (checked) => {
  if (!wrapper || !dot) return;
  wrapper.style.background = checked ? onBg : offBg;
  // Move dot using transform (for smooth animation)
  dot.style.transform = checked ? 'translateX(20px)' : 'translateX(0)';
};

    if (checkbox) {
      checkbox.addEventListener('change', () => {
        setVisual(checkbox.checked);
        if (typeof onChange === 'function') onChange(checkbox.checked);
      });
    }

    return { checkbox, setVisual };
  }

  // Wire toggles & special behaviors
  
  const pushToggle = wireToggle('labelPushNotif', {
  onChange: async (checked) => {
    // Only allow enabling if permission is granted and FCM token is available
    if (checked) {
      // Check browser permission first
      if (Notification.permission !== 'granted') {
        // Try to request permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          // Show toast and revert toggle
          if (pushToggle && pushToggle.checkbox) {
            pushToggle.checkbox.checked = false;
            pushToggle.setVisual(false);
          }
          showPopup("Please allow browser notifications to enable this feature.", "error");
          return;
        }
      }
      // Now check if FCM token is present in user settings
      const settings = await loadUserSettings();
      if (!settings.pushToken) {
        // Try to get token and save
        try {
          const messaging = getMessagingInstance();
          const token = await getToken(messaging, { vapidKey: VAPID_PUBLIC_KEY });
          if (token) {
            await saveUserSettings({ ...settings, pushToken: token, pushNotifications: true });
          } else {
            throw new Error("No FCM token received");
          }
        } catch (err) {
          // Show toast and revert toggle
          if (pushToggle && pushToggle.checkbox) {
            pushToggle.checkbox.checked = false;
            pushToggle.setVisual(false);
          }
          showPopup("Unable to enable notifications. Please check your browser settings and try again.", "error");
          return;
        }
      }
      // All good, keep toggle enabled
    } else {
      // If disabling, just update settings
      const settings = await loadUserSettings();
      await saveUserSettings({ ...settings, pushNotifications: false });
    }
  }
});

  // LOAD user settings and initialize visuals
  loadUserSettings().then(async (settings) => {
  const s = settings || {};
    // Add this line to detect currency
  currentCurrency = detectCurrency();
  // Initialize currency selector with detected value
  initCurrencySelector(modalContent);
  // Cleanup stale pending payments (if any) before rendering
  try {
    if (auth.currentUser && auth.currentUser.uid) {
      await cleanupStalePending(auth.currentUser.uid);
    }
  } catch (e) {
    console.warn('cleanupStalePending failed:', e);
  }
    modalContent.querySelector('#settingsName').value = s.name || '';
  initCurrencySelector(modalContent);

    
    if (pushToggle && pushToggle.checkbox) {
      pushToggle.checkbox.checked = !!s.pushNotifications;
      pushToggle.setVisual && pushToggle.setVisual(pushToggle.checkbox.checked);
    }
    
    
    renderPlanCard(modalContent, s);
    

    const sm = modalContent.querySelector('#modal-loading-overlay');
    if (sm) sm.style.display = 'none';
  }).catch(err => {
    console.error('Failed to load settings', err);
    const sm = modalContent.querySelector('#modal-loading-overlay');
    if (sm) sm.innerHTML = `<span style="color:#f87171;">Failed to load settings.</span>`;
  });

  // Save / Cancel / Close handlers
  const closeBtn = modalContent.querySelector('#closeSettings');
  if (closeBtn) closeBtn.addEventListener('click', () => { settingsOpen = false; render(); });

  const cancelBtn = modalContent.querySelector('#cancelSettings');
  if (cancelBtn) cancelBtn.addEventListener('click', () => { settingsOpen = false; render(); });

  // Form submission - save settings
  const settingsForm = modalContent.querySelector('#settingsForm');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const prevSettings = await loadUserSettings();
      const name = modalContent.querySelector('#settingsName').value.trim();
      
      const pushNotifications = modalContent.querySelector('#settingsPushNotif').checked;
      
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      await saveUserSettings({
        ...prevSettings,
        name,
        pushNotifications,
        timezone
      });

      settingsOpen = false;
      render();
    });
  }

  // Logout
  const logoutBtn = modalContent.querySelector('#logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await auth.signOut();
      window.location.href = 'signup';
    });
  }

  // Clicking outside closes modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      settingsOpen = false;
      render();
    }
  });

  return modal;
}



  // Create main container
  const container = document.createElement('div');
  container.style.cssText = `
    position: relative;
    z-index: 10;
  `;

  // Render function
  function render() {
    container.innerHTML = '';
    
    // Add mobile overlay
    if (window.innerWidth < 768 && sidebarOpen) {
      container.appendChild(createMobileOverlay());
    }
    
    // Add sidebar
    container.appendChild(createSidebarElement());
    
    // Add settings modal
    const settingsModal = createSettingsModal();
    if (settingsModal) {
  container.appendChild(settingsModal);
  fetchBillingInfoOnce()
    .catch(err => console.warn('billing fetch failed', err))
    .then(async () => {
      // After billing info is fetched and user doc is updated, reload settings and re-render plan card
      const latestSettings = await loadUserSettings();
      renderPlanCard(settingsModal.querySelector('.modal-content'), latestSettings || {});
    });
}
  }

  // Handle window resize
  window.addEventListener('resize', () => {
    render();
  });

  // Public methods
  const sidebarAPI = {
    // Get the sidebar container
    getElement: () => container,
    // Get current active section
    getActiveSection: () => activeSection,
    // Set active section programmatically
    setActiveSection: (section) => {
      activeSection = section;
      render();
    },
    // Toggle sidebar open/close
    toggle: () => {
      sidebarOpen = !sidebarOpen;
      render();
    },
    isOpen: () => sidebarOpen,
    openSettings: () => {
      settingsOpen = true;
      render();
    },
    closeSettings: () => {
      settingsOpen = false;
      render();
    }
  };

  // Attach to window for global access
  window.sidebar = sidebarAPI;

  // Initial render
  render();

  return sidebarAPI;
}
const sidebar = createSidebar();
window.sidebar = sidebar; // Expose globally
export { createSidebar };

function renderPlanChooserInModal(settings, chooserContainer, planCardContainer) {
  chooserContainer.innerHTML = ''; // Clear previous

  // Add/ensure styles for grid and animation
  if (!document.getElementById('plan-chooser-modern-styles')) {
    const style = document.createElement('style');
    style.id = 'plan-chooser-modern-styles';
    style.textContent = `
.pm-plan-chooser-grid {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 24px;
}
.pm-plan-chooser-card {
  flex: 1 1 220px;
  min-width: 220px;
  max-width: 320px;
  border-radius: 18px;
  box-shadow: 0 8px 32px 0 rgba(30,41,59,0.18);
  color: #fff;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  border: none;
  background-size: 400% 400%;
  background-position: 0% 50%;
  transition: box-shadow 0.2s, transform 0.2s, max-height 0.3s cubic-bezier(.4,0,.2,1);
  margin-bottom: 0;
  margin-top: 0;
  margin-right: 0;
  margin-left: 0;
  padding: 0;
  min-height: 160px;
}
.pm-plan-chooser-card.free {
  background: linear-gradient(120deg, #2563eb 0%, #38bdf8 40%, #60a5fa 80%, #2563eb 100%);
  animation: gradient-wave-blue 8s ease-in-out infinite;
}
.pm-plan-chooser-card.basic {
  background: linear-gradient(120deg, #a855f7 0%, #6366f1 40%, #7c3aed 80%, #a855f7 100%);
  animation: gradient-wave-purple 8s ease-in-out infinite;
}
.pm-plan-chooser-card.pro {
  background: linear-gradient(120deg, #fbbf24 0%, #f59e42 40%, #fcd34d 80%, #fbbf24 100%);
  animation: gradient-wave-gold 8s ease-in-out infinite;
  color: #2d1600;
}
  .pm-plan-chooser-card.pro .pm-plan-details {
  background: linear-gradient(120deg, #fffbe6 60%, #fbbf24 100%);
  color: #2d1600;
}
.pm-plan-chooser-card.pro .pm-plan-details ul,
.pm-plan-chooser-card.pro .pm-plan-details li {
  color: #2d1600;
}
.pm-plan-chooser-card.selected {
  box-shadow: 0 16px 48px 0 rgba(30,41,59,0.28);
  transform: scale(1.04);
  z-index: 2;
}
.pm-plan-chooser-card .pm-plan-title {
  font-size: 22px;
  font-weight: 900;
  margin: 0;
  padding: 28px 24px 0 24px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.pm-plan-chooser-card .pm-plan-badge {
  padding: 6px 12px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 13px;
  background: rgba(255,255,255,0.85);
  color: #2563eb;
  margin-left: 10px;
}
.pm-plan-chooser-card.pro .pm-plan-badge { color: #b45309; }
.pm-plan-chooser-card .pm-plan-price {
  font-size: 18px;
  font-weight: 700;
  margin: 8px 24px 0 24px;
  color: #fff;
}
.pm-plan-chooser-card.pro .pm-plan-price { color: #b45309; }
.pm-plan-chooser-card .pm-plan-summary {
  font-size: 15px;
  margin: 16px 24px 24px 24px;
  color: rgba(255,255,255,0.96);
}
.pm-plan-chooser-card .pm-plan-details {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 0 0 18px 18px;
  padding: 18px 24px 24px 24px;
  font-size: 15px;
  color: #1a1a1a;
  animation: fadeIn 0.3s;
}
.pm-plan-chooser-card .pm-plan-limits-btn {
  margin-top: 12px;
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  border: none;
  font-weight: 600;
  font-size: 15px;
  background: rgb(0 0 0 / 84%);
  color: #fff;
  cursor: pointer;
  transition: background 0.2s;
}
.pm-plan-chooser-card .pm-plan-limits-btn:hover {
  background: rgba(255,255,255,0.28);
}
.pm-plan-chooser-card .pm-plan-action-btn {
  margin-top: 18px;
  width: 100%;
  padding: 13px;
  border-radius: 10px;
  border: none;
  font-weight: 700;
  font-size: 16px;
  background: linear-gradient(90deg,#38bdf8, #7c3aed);
  color: #071033;
  cursor: pointer;
  transition: background 0.2s;
}
.pm-plan-chooser-card .pm-plan-action-btn:hover {
  /* Remove ugly hover effect, keep same as normal */
  background: inherit;
  color: inherit;
  filter: none;
  box-shadow: 0 2px 8px 0 rgba(30,41,59,0.08);
  transition: none;
  background: linear-gradient(90deg,#7c3aed, #38bdf8);
}
.pm-plan-chooser-card .pm-plan-back-btn {
  margin-top: 18px;
  width: 100%;
  padding: 13px;
  border-radius: 10px;
  border: none;
  font-weight: 700;
  font-size: 16px;
  background: rgba(255,255,255,0.18);
  color: #fff;
  cursor: pointer;
  transition: background 0.2s;
}
  .pm-plan-chooser-card.pro .pm-plan-back-btn,
.pm-plan-chooser-card.pro .pm-plan-limits-btn {
  background: #18181b !important;
  color: #fff !important;
  border: 1px solid #b45309 !important;
}
.pm-plan-chooser-card.pro .pm-plan-back-btn:hover,
.pm-plan-chooser-card.pro .pm-plan-limits-btn:hover {
  background: #27272a !important;
  color: #fff !important;
}
.pm-plan-chooser-card .pm-plan-back-btn:hover {
  background: rgba(255,255,255,0.28);
}
@keyframes fadeIn { from { opacity: 0; transform: translateY(16px);} to { opacity: 1; transform: none; } }
    .pm-benefit-badge {
  display: inline-block;
  background: #fff;
  color: #2563eb;
  border-radius: 8px;
  padding: 2px 10px;
  font-size: 13px;
  font-weight: 700;
  margin: 0 4px 4px 0;
  box-shadow: 0 2px 8px 0 rgba(30,41,59,0.10);
  border: 1px solid #e0e7ef;
  text-shadow: 0 1px 2px rgba(30,41,59,0.08);
}
.pm-benefit-badge-pro {
  background: #23272f;
  color: #fbbf24;
  border: 1px solid #fbbf24;
  text-shadow: 0 1px 2px rgba(30,41,59,0.10);
}
.pm-benefit-badge-new {
  background: #e0f2fe;
  color: #2563eb;
  border: 1px solid #bae6fd;
}

    `;
    document.head.appendChild(style);
  }

  // User-friendly names for limits
const LIMIT_LABELS = {
  responsesGeneratedPerDay: "AI-enabled simple events per day",
  complexEventsPerDay: "Complex events per day",
  complexEventsWithAttachmentPerDay: "Complex events with attachments per day",
  justChatNanoPerDay: "Nano AI chat messages (GPT-4.1)",
  justChatMiniPerDay: "Mini AI chat messages (GPT-4.1 Mini)",
  justChatFullPerDay: "Full AI chat messages (GPT-4.1 Full)",
  justChatFileAndUrlPerDay: "Chat with files/links per day",
  justChatEventModePerDay: "Just Chat Event Mode per day",
  focusNanoPerDay: "Nano Focus sessions (GPT-4.1)",
  focusMiniPerDay: "Mini Focus sessions (GPT-4.1 Mini)",
  focusFullPerDay: "Full Focus sessions (GPT-4.1 Full)",
  focusFileAndUrlPerDay: "Focus with files/links per day",
  smartPlanContextAttachPerDay: "Attach context to plans per day",
  docLiveNanoPerDay: "Doc Live (GPT 4.1 Nano) per day",
  docLiveMiniPerDay: "Doc Live (GPT 4.1 Mini) per day",
  docLiveFullPerDay: "Doc Live (GPT 4.1 Full) per day",
  docFileAndUrlPerDay: "Doc Live with files/links per day",
  docContextAttachPerDay: "Attach context to Doc Live per day",
  docActionClickPerDay: "Doc Live action buttons, clicks per day",
  smartPlanGenPerDay: "Smart plan generations per day",
  smartPlanUpdatePerDay: "Smart plan updates per day",
};

  // Plan descriptions with benefit highlights
const PLAN_DESCRIPTIONS = {
  free: {
    summary: "Great for users starting off. Access all main features (Calendar, Doc Live, Just Chat) but with restrictions, perfect for testing.",
    details: `
      <div>
        <span class="pm-benefit-badge">Calendar & Events</span>
        <span class="pm-benefit-badge">Nano AI Chat</span>
        <span class="pm-benefit-badge">All features available</span>
      </div>
      <ul style="margin:10px 0 0 18px;padding:0;list-style:none;">
        <li style="color:#1a1a1a;display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#8b5cf6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Ideal for personal use & testing
        </li>
        <li style="color:#1a1a1a;display:flex;align-items:center;gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#8b5cf6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Upgrade to unlock more AI power, uploads, and context
        </li>
      </ul>
    `
  },
  basic: {
    summary: "Detailed plan for light use. More events, uploads, and smarter AI access.",
    details: `
      <div>
        <span class="pm-benefit-badge">File & image uploads</span>
        <span class="pm-benefit-badge">Attach context</span>
        <span class="pm-benefit-badge">GPT 4.1 mini</span>
        <span class="pm-benefit-badge">Attach more context</span>
        <span class="pm-benefit-badge">Generate more plans</span>
      </div>
      <ul style="margin:10px 0 0 18px;padding:0;list-style:none;">
        <li style="color:#1a1a1a;display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#8b5cf6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          All Free features, plus:
        </li>
        <li style="color:#1a1a1a;display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#8b5cf6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Upload files, images, and attach context to plans
        </li>
        <li style="color:#1a1a1a;display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#8b5cf6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Smarter AI (Mini) for chats
        </li>
        <li style="color:#1a1a1a;display:flex;align-items:center;gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#8b5cf6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Connect responses from the Response Centre in Doc Live
        </li>
      </ul>
    `
  },
  pro: {
    summary: "All features unlocked. Heavy use, full AI models, max uploads & Doc Live access.",
    details: `
      <div>
        <span class="pm-benefit-badge">GPT-4.1 available</span>
        <span class="pm-benefit-badge">Priority Support</span>
        <span class="pm-benefit-badge">Early access to features</span>
        <span class="pm-benefit-badge">All chat & focus models</span>
        <span class="pm-benefit-badge">More file/url uploads</span>
        <span class="pm-benefit-badge">Significantly Increased rates</span>
      </div>
      <ul style="margin:10px 0 0 18px;padding:0;list-style:none;">
        <li style="color:#1a1a1a;display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#8b5cf6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Everything in Basic, plus:
        </li>
        <li style="color:#1a1a1a;display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#8b5cf6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Early access to new features
        </li>
        <li style="color:#1a1a1a;display:flex;align-items:center;gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#8b5cf6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Priority support
        </li>
      </ul>
    `
  }
};

  // Limitation sections mapping
const LIMIT_SECTIONS = [
    {
      title: "Calendar",
      keys: [
        "responsesGeneratedPerDay",
        "complexEventsPerDay",
        "complexEventsWithAttachmentPerDay"
      ]
    },
    {
      title: "Responses",
      keys: [
        "smartPlanGenPerDay",
        "smartPlanUpdatePerDay"
      ]
    },
    {
      title: "Focus Mode",
      keys: [
        "focusNanoPerDay",
        "focusMiniPerDay",
        "focusFullPerDay",
        "focusFileAndUrlPerDay",
        "smartPlanContextAttachPerDay" // moved here as requested
      ]
    },
    {
      title: "Just Chat",
      keys: [
        "justChatNanoPerDay",
        "justChatMiniPerDay",
        "justChatFullPerDay",
        "justChatFileAndUrlPerDay",
        "justChatEventModePerDay" // added event mode here
      ]
    },
    {
      title: "Doc Live",
      keys: [
        "docLiveNanoPerDay",
        "docLiveMiniPerDay",
        "docLiveFullPerDay",
        "docFileAndUrlPerDay",
        "docContextAttachPerDay",
        "docActionClickPerDay"
      ]
    }
    // Removed Uploads section as requested
  ];

  // Header
  const header = document.createElement('div');
  header.style = "display:flex;align-items:center;justify-content:space-between;gap:12px;";
  header.innerHTML = `
  <div style="display:flex;gap:12px;align-items:center;">
    <button id="chooser-back" class="pm-back-btn" aria-label="Back" style="font-size:24px;background:rgba(71,85,105,0.5);border:none;cursor:pointer;padding:8px 16px;border-radius:8px;color:white;display:flex;align-items:center;gap:8px;margin-right:12px;">
      <span style="font-size:28px;">←</span>
      <span style="font-size:16px;">Back</span>
    </button>
    <div style="font-weight:900;font-size:20px;">Choose a Plan</div>
  </div>
  <div style="font-size:13px;color:#9fb0db;">Current: <b style="color:#fff;margin-left:6px;">${PLAN_LIMITS[settings.plan]?.planName || 'Free'}</b></div>
`;
  chooserContainer.appendChild(header);

  // Plan grid
  const grid = document.createElement('div');
  grid.className = 'pm-plan-chooser-grid';

  let expanded = settings.plan || 'free'; // Start with current plan expanded
  let showLimits = {};

  Object.entries(PLAN_LIMITS).forEach(([planKey]) => {
    showLimits[planKey] = false;
  });

  function renderCards() {
    grid.innerHTML = '';
    Object.entries(PLAN_LIMITS).forEach(([planKey, plan]) => {
      const card = document.createElement('div');
      card.className = `pm-plan-chooser-card ${planKey} ${expanded === planKey ? 'selected' : ''}`;
      card.tabIndex = 0;
      card.dataset.plan = planKey;

      // Get price based on plan and current currency
      const priceDisplay = getPriceInfo(planKey, currentCurrency).amount;

      // Card content
      let cardContent = `
        <div class="pm-plan-title">
          ${plan.planName}
          ${planKey === settings.plan ? `<span class="pm-plan-badge">Current</span>` : ''}
        </div>
        <div class="pm-plan-price">${priceDisplay}</div>
        <div class="pm-plan-summary">${PLAN_DESCRIPTIONS[planKey].summary}</div>
        <div class="pm-plan-details" style="display:${expanded === planKey ? 'block' : 'none'};">
      `;

      // Expanded view
      if (expanded === planKey) {
        if (showLimits[planKey]) {
          // Show limitations view
          cardContent += renderLimits(planKey, plan, planKey === settings.plan ? (settings.usage || {}) : null);
          cardContent += `<button class="pm-plan-back-btn">Back</button>`;
        } else {
          // Show description view
          cardContent += PLAN_DESCRIPTIONS[planKey].details;
          cardContent += `<button class="pm-plan-limits-btn">View detailed limits</button>`;
          if (planKey === settings.plan) {
            cardContent += `<div style="margin-top:16px;font-weight:700;font-size:16px;color:#fff;text-align:center;">Current Plan</div>`;
          } else {
            cardContent += `<button class="pm-plan-action-btn">Select</button>`;
          }
        }
        cardContent += `</div>`;
      } else {
        cardContent += `<div class="pm-plan-details" style="display:none;"></div>`;
      }

      card.innerHTML = cardContent;

      // Expand/collapse logic
      card.onclick = (e) => {
        // If clicking on current plan, close chooser
        if (planKey === settings.plan && expanded === planKey && !showLimits[planKey]) {
          chooserContainer.style.display = 'none';
          planCardContainer.style.display = '';
          return;
        }
        // Don't collapse if clicking the action/limits/back button
        if (
          e.target.classList.contains('pm-plan-action-btn') ||
          e.target.classList.contains('pm-plan-limits-btn') ||
          e.target.classList.contains('pm-plan-back-btn')
        ) return;
        if (expanded !== planKey || showLimits[planKey]) {
          expanded = planKey;
          Object.keys(showLimits).forEach(k => showLimits[k] = false);
          renderCards();
        }
      };

      // Limits button logic
      if (expanded === planKey && !showLimits[planKey]) {
        const limitsBtn = card.querySelector('.pm-plan-limits-btn');
        if (limitsBtn) {
          limitsBtn.onclick = (e) => {
            e.stopPropagation();
            showLimits[planKey] = true;
            renderCards();
          };
        }
      }

      // Back button logic (from limits view)
      if (expanded === planKey && showLimits[planKey]) {
        const backBtn = card.querySelector('.pm-plan-back-btn');
        if (backBtn) {
          backBtn.onclick = (e) => {
            e.stopPropagation();
            showLimits[planKey] = false;
            renderCards();
          };
        }
      }

      // Upgrade/downgrade button logic
if (expanded === planKey && !showLimits[planKey] && planKey !== settings.plan) {
  const actionBtn = card.querySelector('.pm-plan-action-btn');
  if (actionBtn) {
    actionBtn.onclick = async (e) => {
  e.stopPropagation();

  // keep original html so we can restore on error
  const originalHTML = actionBtn.innerHTML;
  const originalDisabled = actionBtn.disabled;

  // Add small inline spinner + text; style inline to avoid external CSS
  actionBtn.disabled = true;
  actionBtn.style.opacity = '0.9';
  actionBtn.innerHTML = `
    <span style="display:inline-block;width:18px;height:18px;border:3px solid rgba(255,255,255,0.2);border-top-color:currentColor;border-radius:50%;animation:pm-spin 0.9s linear infinite;margin-right:8px;vertical-align:middle;"></span>
    <span>Payment will initiate in a second</span>
  `;

  // ensure keyframes are defined (idempotent)
  if (!document.getElementById('pm-spinner-keyframes')) {
    const ks = document.createElement('style');
    ks.id = 'pm-spinner-keyframes';
    ks.textContent = `
      @keyframes pm-spin { 100% { transform: rotate(360deg); } }
    `;
    document.head.appendChild(ks);
  }

  try {
    // If downgrading to free — apply immediately
    if (planKey === 'free') {
      settings.plan = 'free';
      settings.planStartedAt = new Date().toISOString();
      await saveUserSettings(settings);
      chooserContainer.style.display = 'none';
      planCardContainer.style.display = '';
      window.dispatchEvent(new CustomEvent('openSettingsModal'));
      // restore button UI
      actionBtn.disabled = originalDisabled;
      actionBtn.innerHTML = originalHTML;
      return;
    }

    // For paid plans: start pending -> checkout flow
    e.preventDefault(); // prevent focus or default collapse behavior
    await changePlanFlow(planKey, settings);

    // After initiating checkout we expect Stripe to redirect the browser.
    // If user stays on page (e.g., extension failed to provide url), re-enable the button after a short timeout.
    setTimeout(() => {
      actionBtn.disabled = false;
      actionBtn.innerHTML = originalHTML;
    }, 60000); // re-enable after 60s if no redirect - user can retry
  } catch (error) {
    console.error('Plan change error:', error);
    // restore button UI on error
    actionBtn.disabled = false;
    actionBtn.innerHTML = originalHTML;
    alert('There was an error processing your request. Please try again.');
  }
};
  }
}


      grid.appendChild(card);
    });
  }

  // Render limits with sections and (if current plan) usage
  function renderLimits(planKey, plan, usage) {
    let html = '';
    LIMIT_SECTIONS.forEach(section => {
      // Only show section if at least one key is present in plan and value > 0
      const sectionKeys = section.keys.filter(k => typeof plan[k] === 'number' && plan[k] > 0);
      if (sectionKeys.length === 0) return;
      html += `<div style="margin-bottom:12px;">
        <div style="font-weight:700;font-size:15px;margin-bottom:4px;color:#1a1a1a;">${section.title}</div>
        <ul style="margin:0 0 0 18px;padding:0;">`;
      sectionKeys.forEach(k => {
        const val = plan[k];
        let usageStr = '';
        if (usage && typeof usage[k] === 'number') {
          usageStr = ` <span style="color:#1a1a1a;font-size:13px;">(used: ${usage[k]} / ${val})</span>`;
        }
        html += `<li style="color:#1a1a1a;">${LIMIT_LABELS[k] || k}: <b>${val}</b>${usageStr}</li>`;
      });
      html += `</ul></div>`;
    });
    return html;
}
  // Store reference to renderCards
  renderCardsFunction = renderCards;
  renderCards();
  chooserContainer.appendChild(grid);

  // Back button logic
  header.querySelector('#chooser-back').onclick = () => {
    chooserContainer.style.display = 'none';
    planCardContainer.style.display = '';
  };
}


