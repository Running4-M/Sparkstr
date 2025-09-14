// Move state declaration to the top
let state = {
  sidebarExpanded: false,
  currentChatId: null,
  messages: [],
  attachedFiles: [],
  attachedUrls: [],
  showAddOptions: false,
  showUrlInput: false,
  eventMode: false,
  isDark: false,
  isFocused: false,
  chatHistory: [], // Added chat history here
  isTyping: false,  // Added typing state here
  premiumModel: 'gpt-4.1-nano', // Default model
reasoningThinking: false, // Show thinking bar
  currentChatId: null,
  chatList: []
};
import { getToken } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging.js";
import { submitFeedback } from '../backend/firebase.js';
import { PLAN_LIMITS } from '../backend/planLimits.js';
import { saveUserSettings, loadUserSettings } from '../backend/firebase.js';
import { 
  getCurrentUserId,
  getSmartPlan,
  updateSmartPlan,
  initializeFirebase,
  fetchEventData,
  updateProgressInFirebase,
  getEventIdFromUrl,
  saveEvent, 
  createNewChat,
  saveMessage,
  loadChat,
  loadChatList,
  deleteChat,
  updateChatTitle,
  firebaseInitPromise,
  auth, // Add this import
  db,
  deleteUserAccount,
} from "../backend/firebase.js";
import { getMessagingInstance } from '../backend/firebase.js';

import { checkAndUpdateUsage } from '../backend/planUsage.js';

// Add after the existing imports
// REPLACE THIS IMPORT BLOCK (exact)
import {
  doc,
  setDoc,
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  getDoc,
  getDocs,
  updateDoc,
  writeBatch,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
// Map plans to Stripe prices
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

/* -------------------------
   Helper utilities
   ------------------------- */
function getPriceInfo(planKey, currency) {
  if (planKey === 'free') return { amount: 'Free', id: null };
  try {
    return PRICE_MAP[planKey]?.[currency] || { amount: 'Price not available', id: null };
  } catch {
    return { amount: 'Price not available', id: null };
  }
}
function getPriceLabel(planKey) {
  return getPriceInfo(planKey, currentCurrency).amount;
}
function getPriceId(planKey) {
  return getPriceInfo(planKey, currentCurrency).id;
}
function detectCurrency() {
  try {
    const locale = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    const lower = locale.toLowerCase();
    if (lower.startsWith("en-gb") || lower.includes("uk") || lower === "gb" || lower.includes("ie")) {
      return "GBP";
    }
    const euroCountries = [
      "de","fr","es","it","nl","be","pt","ie","gr","at","fi","se","dk","pl","cz","ro","hu",
      "bg","hr","lv","lt","ee","sk","si","mt","cy","lu","mc","sm","va"
    ];
    for (const c of euroCountries) {
      if (lower.startsWith(c)) return "EUR";
    }
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) {
      if (timezone.startsWith("Europe/London")) return "GBP";
      if (timezone.startsWith("Europe/")) return "EUR";
    }
    return "USD";
  } catch {
    return "USD";
  }
}
let currentCurrency = detectCurrency();
let renderCardsFunction = null;
function initCurrencySelector(containerRoot = document) {
  const select = containerRoot.querySelector("#currency-selector-select");
  if (!select) return;
  currentCurrency = PRICE_MAP.basic[currentCurrency] ? currentCurrency : 'USD';
  select.value = currentCurrency;
  select.addEventListener("change", (e) => {
    const newCurrency = e.target.value;
    if (PRICE_MAP.basic[newCurrency]) {
      currentCurrency = newCurrency;
      if (renderCardsFunction) renderCardsFunction();
      updatePlanPrices(containerRoot);
    } else {
      select.value = currentCurrency;
    }
  });
}

// update displayed price labels within a container (looks for #price-label-basic / pro)
function updatePlanPrices(containerRoot = document) {
  ["basic","pro"].forEach(pk => {
    const el = containerRoot.querySelector(`#price-label-${pk}`);
    if (el) el.textContent = getPriceLabel(pk) + "/mo";
  });
}

// Helper for starting Stripe Checkout via Firebase extension
async function startCheckoutWithExtension(priceId) {
  if (!auth.currentUser) {
    showPopup("You must be logged in to subscribe.", "error");
    return;
  }
  const uid = auth.currentUser.uid;
  try {
    const docRef = await addDoc(collection(db, "customers", uid, "checkout_sessions"), {
      price: priceId,
      success_url: window.location.origin + "/Calendar/Calendar.html",
      cancel_url: window.location.origin + "/settings.html",
      mode: "subscription",
      createdAt: serverTimestamp()
    });
    const unsub = onSnapshot(docRef, snap => {
      const data = snap.data();
      if (!data) return;
      if (data.error) {
        showPopup("Payment error: " + (data.error.message || "Unknown"), "error");
        unsub();
        return;
      }
      if (data.url) {
        unsub();
        window.location.href = data.url;
      }
    });
  } catch (err) {
    showPopup("Failed to start checkout: " + err.message, "error");
  }
}

// Unified plan change flow
async function changePlanFlow(planKey, settings = null) {
  if (!auth.currentUser) {
    showPopup("Please sign in to change your plan.", "error");
    return;
  }
  const uid = auth.currentUser.uid;

  // --- Case 1: Downgrade to Free ---
  if (planKey === 'free') {
    try {
      const currentSubscriptionId = await getActiveSubscriptionId(uid);
      if (!currentSubscriptionId) {
        // no Stripe sub → just update Firestore
        const batch = writeBatch(db);
        batch.update(doc(db, "users", uid), { plan: "free", requestedPlan: null });
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
      }

      // Preview proration/refund
      const preview = await previewProration(currentSubscriptionId, null);
      const refundAmountCents = preview.invoicePreview?.total_with_credit < 0
        ? Math.abs(preview.invoicePreview.total_with_credit)
        : 0;

      showProrationModal({
  planKey: 'free',
  currentPlan: settings?.plan || "free",
  humanAmount: preview.invoicePreview?.human_total_with_credit || preview.invoicePreview?.human_amount_due || "£0.00",
  isCredit: refundAmountCents > 0,
  creditUsed: refundAmountCents > 0 ? (refundAmountCents / 100) : 0,
  preview,
  onConfirm: async () => {
    const result = await performProratedUpgrade(currentSubscriptionId, null, true, true);
    await updateDoc(doc(db, "users", uid), { plan: "free", requestedPlan: null });
    await setDoc(doc(db, "users", uid, "settings", "profile"), {
      ...(settings || {}),
      plan: "free",
      requestedPlan: null,
      planStartedAt: new Date().toISOString()
    }, { merge: true });

    if (result && result.totalRefunded > 0) {
      showPopup(`Subscription cancelled. Refund issued: £${(result.totalRefunded / 100).toFixed(2)}`);
    } else {
      showPopup('Subscription cancelled.');
    }
    // Reload to success URL (same as upgrade)
    window.location.href = window.location.origin + "/Calendar/Calendar.html";
  },
  onCancel: async () => {
    await updateDoc(doc(db, "users", uid), { plan: settings?.plan || "free", requestedPlan: null });
  }
});
      return;
    } catch (err) {
      console.error("Downgrade (free) error:", err);
      showPopup("Failed to downgrade plan", "error");
      return;
    }
  }

  // --- Case 2: Upgrade from Free → Paid (via Firebase Checkout extension) ---
  const currentSubscriptionId = await getActiveSubscriptionId(uid);
  if (!currentSubscriptionId && planKey !== 'free') {
    try {
      const newPriceId = getPriceId(planKey);
      await startCheckoutWithExtension(newPriceId);
      return;
    } catch (err) {
      console.error("Checkout session error:", err);
      showPopup("Failed to start checkout: " + (err.message || err), "error");
      return;
    }
  }

  // --- Case 3 & 4: Paid ↔ Paid (basic ↔ pro) ---
  try {
    const newPriceId = getPriceId(planKey);
    const preview = await previewProration(currentSubscriptionId, newPriceId);
    if (!preview?.invoicePreview) {
      throw new Error('No preview received');
    }

    const humanAmount = preview.invoicePreview.human_total_with_credit;
    const direction = getUpgradeDirection(settings?.plan || "free", planKey);
    const refundIfCredit = direction === 'Downgrade';

         showProrationModal({
     planKey: 'free',
     currentPlan: settings?.plan || "free",
     humanAmount: preview.invoicePreview?.human_total_with_credit || preview.invoicePreview?.human_amount_due || "£0.00",
     isCredit: refundAmountCents > 0,
     creditUsed: refundAmountCents > 0 ? (refundAmountCents / 100) : 0,
     preview,
     onConfirm: async () => {
       const result = await performProratedUpgrade(currentSubscriptionId, null, true, true);
       await updateDoc(doc(db, "users", uid), { plan: "free", requestedPlan: null });
       await setDoc(doc(db, "users", uid, "settings", "profile"), {
         ...(settings || {}),
         plan: "free",
         requestedPlan: null,
         planStartedAt: new Date().toISOString()
       }, { merge: true });
   
       if (result && result.totalRefunded > 0) {
         showPopup(`Subscription cancelled. Refund issued: £${(result.totalRefunded / 100).toFixed(2)}`);
       } else {
         showPopup('Subscription cancelled.');
       }
       // Reload to success URL (same as upgrade)
       window.location.href = window.location.origin + "/Calendar/Calendar.html";
     },
     onCancel: async () => {
       await updateDoc(doc(db, "users", uid), { plan: settings?.plan || "free", requestedPlan: null });
     }
   });
  } catch (err) {
    console.error("Plan change error:", err);
    showPopup("Plan change failed: " + (err.message || err), "error");
  }
}

function getUpgradeDirection(currentPlan, newPlan) {
  const planOrder = { free: 0, basic: 1, pro: 2 };
  if (planOrder[newPlan] > planOrder[currentPlan]) return "Upgrade";
  if (planOrder[newPlan] < planOrder[currentPlan]) return "Downgrade";
  return "Change";
}

function showProrationModal({ planKey, currentPlan, humanAmount, isCredit, creditUsed = 0, preview = {}, onConfirm, onCancel }) {
  if (document.getElementById("prorationModal")) return;

  const overlay = document.createElement("div");
  overlay.id = "prorationModal";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
  `;

  const direction = getUpgradeDirection(currentPlan, planKey);
  const title = `${direction} to ${planKey.charAt(0).toUpperCase() + planKey.slice(1)}`;

  // --- CLEARER, STRAIGHTFORWARD MESSAGE ---
  let message = "";
  const invoicePreview = preview.invoicePreview || {};
  if (invoicePreview.raw_proration_lines && invoicePreview.raw_proration_lines.length) {
    message += `<div style="text-align:left;margin-bottom:10px;font-weight:600;color:#111;">Proration breakdown:</div>`;
    message += `<div style="background:#f3f4f6;padding:10px 14px;border-radius:8px;color:#111;margin-bottom:10px;">`;
    invoicePreview.raw_proration_lines.forEach(l => {
      const desc = l.description || 'Line';
      // Remove minus sign for clarity
      let amt = l.amount_formatted || (l.amount != null ? (Math.abs(l.amount) / 100).toLocaleString(undefined, { style: 'currency', currency: 'GBP' }) : '£0.00');
      // Add "credit" or "charge" label for clarity
      if (l.amount < 0) {
        amt = `${amt} credit`;
      } else if (l.amount > 0) {
        amt = `${amt} charge`;
      }
      message += `<div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span>${desc}</span>
        <span>${amt}</span>
      </div>`;
    });
    message += `</div>`;
  }

  // Show the final amount/refund in a clear, direct way
  let finalAmount = invoicePreview.human_total_with_credit || humanAmount;
  let isRefund = false;
  let refundValue = finalAmount;
  // Try to detect if it's a refund (negative amount)
  if (typeof invoicePreview.total_with_credit === "number" && invoicePreview.total_with_credit < 0) {
    isRefund = true;
    // Remove minus for display
    refundValue = finalAmount.replace(/^-/, '');
  }

  message += `
    <div style="margin-top:10px;font-size:1.1em;color:#111;font-weight:700;">
      ${isRefund
        ? `You will receive a refund of: <span style="color:#22c55e;">${refundValue}</span>`
        : `You will pay: <span style="color:#2563eb;">${finalAmount}</span>`}
    </div>
    <div style="margin-top:10px;font-size:0.97em;color:#444;">
      ${isRefund
        ? 'You are being refunded for the unused portion of your previous plan, minus the cost of your new plan for the rest of the billing period.'
        : 'This is the prorated amount after applying any credits or unused time.'}
    </div>
  `;

  overlay.innerHTML = `
    <div style="
      background:#fff;
      color:#111;
      padding:2rem 2.5rem;
      border-radius:18px;
      box-shadow:0 8px 32px #6366f133;
      max-width:420px; width:90%;
      text-align:center;
      font-family:inherit;
    ">
      <h2 style="color:#2563eb;font-size:1.4rem;margin-bottom:1rem;font-weight:800;">
        ${title}
      </h2>
      <div style="font-size:1.05rem;color:#222;margin-bottom:1.5rem;">
        ${message}
      </div>
      <div style="display:flex;gap:1rem;justify-content:center;">
        <button id="cancelUpgradeBtn" style="background:#e5e7eb;color:#374151;padding:0.6em 1.2em;border:none;border-radius:8px;font-weight:600;cursor:pointer;">
          Cancel
        </button>
        <button id="confirmUpgradeBtn" style="background:#2563eb;color:#fff;padding:0.6em 1.2em;border:none;border-radius:8px;font-weight:600;cursor:pointer;">
          Confirm
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("cancelUpgradeBtn").onclick = () => {
    overlay.remove();
    if (onCancel) onCancel();
  };
  document.getElementById("confirmUpgradeBtn").onclick = () => {
    overlay.remove();
    if (onConfirm) onConfirm();
  };
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
  const resp = await fetch('https://my-backend-three-pi.vercel.app/api/preview-upgrade', {
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

async function performProratedUpgrade(subscriptionId, newPriceId, refundIfCredit = false, cancelSubscription = false) {
  const resp = await fetch('https://my-backend-three-pi.vercel.app/api/perform-upgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscriptionId, newPriceId, refundIfCredit, cancelSubscription })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(()=>({error: 'Upgrade failed'}));
    throw new Error(err.error || 'Failed to perform upgrade');
  }
  return resp.json();
}




// --- Revert stale pending_payment if user abandons checkout (client-side) ---
async function cleanupStalePending(uid, maxAgeMinutes = 15) {
  if (!uid) return;
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    const u = userSnap.data();
    if (u.plan !== "pending_payment") return;
    const pendingAt = u.pendingAt;
    if (!pendingAt) return;

    // Convert Firestore Timestamp to Date
    let pendingDate;
    if (pendingAt.toDate && typeof pendingAt.toDate === 'function') {
      pendingDate = pendingAt.toDate();
    } else if (pendingAt.seconds) {
      pendingDate = new Date(pendingAt.seconds * 1000);
    } else {
      return;
    }

    const ageMs = Date.now() - pendingDate.getTime();
    if (ageMs < maxAgeMinutes * 60 * 1000) return; // still within grace period

    // Check if Stripe extension added an active subscription
    const subsCol = collection(db, 'customers', uid, 'subscriptions');
    const subsSnap = await getDocs(subsCol);
    let hasActive = false;
    subsSnap.forEach(s => {
      const d = s.data();
      if (d && (d.status === "active" || d.status === "trialing")) hasActive = true;
    });

    if (hasActive) return; // subscription exists

    // No active subscription and stale -> revert user's plan to prevPlan or free
    const revertTo = (u.prevPlan && typeof u.prevPlan === 'string') ? u.prevPlan : 'free';

    await updateDoc(userRef, {
      plan: revertTo,
      requestedPlan: null,
      pendingAt: null,
      prevPlan: null
    });

    await updateDoc(doc(db, "users", uid, "settings", "profile"), {
      plan: revertTo,
      requestedPlan: null,
      pendingAt: null,
      prevPlan: null,
      planStartedAt: new Date().toISOString()
    }).catch(()=>{});

    console.log('Reverted stale pending_payment for user', uid, '->', revertTo);
  } catch (err) {
    console.error('cleanupStalePending error', err);
  }
}


// Add after createSettingsModal function
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
    
    const settings = await loadUserSettings();

    // ------------------------------
    // 1) Subscriptions
    // ------------------------------
    const subsCol = collection(db, "customers", uid, "subscriptions");
    const subsSnap = await getDocs(subsCol);

    let activeSub = null, activeSubId = null;
subsSnap.forEach((snap) => {
  const data = snap.data();
  console.log("Subscription doc:", snap.id, data); // 👈 debug log
  if (data && (data.status === "active" || data.status === "trialing")) {
    activeSub = data;
    activeSubId = snap.id; // <— capture Stripe subscription id
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
        // Show Stripe credit balance if available
      const settings = await loadUserSettings();


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
  creditBalance: typeof serverCredit === 'number' ? serverCredit : 0
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
} else if (typeof latestPayment.created === "number" && latestPayment.created > 1000000000) {
  // Looks like a Unix timestamp in seconds
  dateText = new Date(latestPayment.created * 1000).toLocaleDateString();
} else if (typeof latestPayment.created === "number" && latestPayment.created > 1000000000000) {
  // Looks like a JS timestamp in ms
  dateText = new Date(latestPayment.created).toLocaleDateString();
} else {
  dateText = "Unknown date";
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



// Attach to settings modal toggle
document.addEventListener('change', async (e) => {
  if (e.target && e.target.id === 'settingsPushNotif') {
    if (e.target.checked) {
      await requestPushPermissionAndSaveToken();
    }
  }
});
firebaseInitPromise.then(() => {
  if (!getCurrentUserId()) {
    window.location.href = "../Login/signup.html";
  }
});

const premiumModels = [
  { key: 'nano', label: 'Nano', desc: 'Fast, basic answers', toast: 'Nano: Fastest, basic capabilities for quick replies.' },
  { key: 'mini', label: 'Mini', desc: 'Smarter, more accurate', toast: 'Mini: Smarter, more accurate answers with better reasoning.' },
  { key: 'full', label: 'Full', desc: 'Best, advanced GPT-4.1', toast: 'Full: Most advanced, best reasoning and creativity (GPT-4.1).' }
];
let premiumIdx = 0;

function updatePremiumBtn() {
  const btn = document.getElementById('premiumChatBtn');
  if (!btn) return;
  const model = premiumModels[premiumIdx];
  btn.classList.remove('nano', 'mini', 'full');
  btn.classList.add(model.key);
  btn.querySelector('.premium-label').textContent = model.label;
  btn.querySelector('.premium-desc').textContent = model.desc;
}

document.getElementById('premiumChatBtn').onclick = () => {
  premiumIdx = (premiumIdx + 1) % premiumModels.length;
  updatePremiumBtn();
  // Always show toast on toggle (for mobile too)
  showToast(premiumModels[premiumIdx].toast, 'info');
  // Update state so backend uses correct model
  state.premiumModel = (
    premiumModels[premiumIdx].key === 'nano' ? 'gpt-4.1-nano' :
    premiumModels[premiumIdx].key === 'mini' ? 'gpt-4.1-mini' :
    'gpt-4.1-full'
  );
};
updatePremiumBtn();

function getSpinnerSVG() {
  return `
    <svg class="icon spinner" viewBox="0 0 24 24" style="width:22px;height:22px;">
      <circle cx="12" cy="12" r="10" stroke="#a78bfa" stroke-width="4" fill="none" opacity="0.2"/>
      <path d="M22 12a10 10 0 0 1-10 10" stroke="#facc15" stroke-width="4" fill="none">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
      </path>
    </svg>
  `;
}

// Initialize markdown-it with options
const md = window.markdownit({
  html: true,
  breaks: true,
  linkify: true,
  tables: true
});

const elements = {
  sidebar: document.getElementById('sidebar'),
  mobileOverlay: document.getElementById('mobileOverlay'),
  mobileSidebarToggle: document.getElementById('mobileSidebarToggle'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  newChatBtn: document.getElementById('newChatBtn'),
  mobileNewChat: document.getElementById('mobileNewChat'),
  chatList: document.getElementById('chatList'),
  themeToggle: document.getElementById('themeToggle'),
  quickActionsContainer: document.getElementById('quickActionsContainer'),
  messagesList: document.getElementById('messagesList'),
  messagesContainer: document.getElementById('messagesContainer'),
  inputForm: document.getElementById('inputForm'),
  inputContainer: document.getElementById('inputContainer'),
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  addBtn: document.getElementById('addBtn'),
  addOptions: document.getElementById('addOptions'),
  fileBtn: document.getElementById('fileBtn'),
  urlBtn: document.getElementById('urlBtn'),
  eventBtn: document.getElementById('eventBtn'),
  urlInputContainer: document.getElementById('urlInputContainer'),
  urlInput: document.getElementById('urlInput'),
  addUrlBtn: document.getElementById('addUrlBtn'),
  attachments: document.getElementById('attachments'),
  fileInput: document.getElementById('fileInput'),
  micBtn: document.getElementById('micBtn'),
  reasoningToggleBtn: document.getElementById('reasoningToggleBtn'),
};




// --- App Loader on Startup ---
document.addEventListener('DOMContentLoaded', async () => {
  showAppLoader();
  await init();
  hideAppLoader();
});
window.addEventListener('openSettingsModal', showSettingsModal);

// Update init to be async
async function init() {
  try {
    await firebaseInitPromise;
    if (!getCurrentUserId()) {
      window.location.href = "../Login/login.html";
      return;
    }
    initializeTheme();
    await loadAndRenderChatList();
    initializeEventListeners();
    renderMessages();
    updateInputState();
  } catch (error) {
    console.error('Error initializing chat:', error);
  }
}
document.getElementById('micBtn').addEventListener('click', showComingSoonModal);
function showComingSoonModal() {
  if (document.getElementById('comingSoonModal')) return;
  const modal = document.createElement('div');
  modal.id = 'comingSoonModal';
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center;
  `;
  modal.innerHTML = `
    <div style="background:#fff;padding:2rem 2.5rem;border-radius:18px;box-shadow:0 8px 32px #6366f133;text-align:center;max-width:90vw;">
      <h2 style="color:#6366f1;font-size:1.3rem;margin-bottom:1rem;">🎤 Coming Soon!</h2>
      <p style="font-size:1.1rem;color:#374151;margin-bottom:1.5rem;">Voice input is coming soon. Stay tuned!</p>
      <button id="closeComingSoonBtn" style="background:#6366f1;color:#fff;padding:0.7em 2em;border:none;border-radius:8px;font-weight:600;font-size:1rem;cursor:pointer;">Close</button>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('closeComingSoonBtn').onclick = () => modal.remove();
}

// --- Loader Overlay (global, for app load) ---
function showAppLoader() {
  if (document.getElementById('appLoaderOverlay')) return;
  const loader = document.createElement('div');
  loader.id = 'appLoaderOverlay';
  loader.innerHTML = `
    <div class="app-loader-inner">
      <div class="app-loader-spinner"></div>
      <div class="app-loader-text">Loading Just Chat...</div>
    </div>
  `;
  document.body.appendChild(loader);
}
function hideAppLoader() {
  document.getElementById('appLoaderOverlay')?.remove();
}

function renderSavedTemplate(content) {
  try {
    const templateData = JSON.parse(content);
    const isDark = state.isDark;
    if (templateData.type === 'single') {
      return createSingleEventCard(templateData.event, isDark);
    } else if (templateData.type === 'plan') {
      return createEventPlanCard(templateData.events, isDark);
    }
    return content;
  } catch (error) {
    console.error('Error rendering template:', error);
    return content;
  }
}


// Add these functions near your other utility functions
async function processFileAttachment(item) {
  try {
    if (!item || !item.file) return null;

    // If it's an image and already has base64, just return it
    if (item.isImage && item.base64) {
      return { name: item.file.name, isImage: true, base64: item.base64 };
    }

    const file = item.file;
    let extractedText = "";

    // PDF
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        extractedText += strings.join(" ") + "\n";
      }
      return { name: file.name, content: extractedText };
    }
    // DOCX
    else if (file.name.toLowerCase().endsWith(".docx")) {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const contentXml = await zip.file("word/document.xml").async("string");

      const xmlDoc = new DOMParser().parseFromString(contentXml, "application/xml");
      const textNodes = [...xmlDoc.getElementsByTagName("w:t")];
      extractedText = textNodes.map(node => node.textContent).join(" ");
      return { name: file.name, content: extractedText };
    }
    // Fallback
    else {
      throw new Error("Unsupported file type. Only PDF, DOCX, and images are supported.");
    }
  } catch (error) {
    console.error("❌ Error processing file:", error);
    throw error;
  }
}

async function processUrlContent(url) {
  try {
    console.log("🌐 Processing URL:", url);
    
    const response = await fetch(`https://my-backend-three-pi.vercel.app/api/parser?url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL content: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("📄 Extracted URL content:", data.text?.substring(0, 100) + "...");
    return data.text || '';
    
  } catch (error) {
    console.error("❌ Error processing URL:", error);
    return null;
  }
}

function updateSendBtnUI() {
  if (!elements.sendBtn) return;
  if (state.isTyping) {
    elements.sendBtn.innerHTML = getSpinnerSVG();
  } else {
    elements.sendBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"></path>
      </svg>
    `;
  }
}


// Update the handleSendMessage function to process attachments
async function handleSendMessage(e) {
  e.preventDefault();

  const content = elements.messageInput.value.trim();
  const hasFileOrUrl = state.attachedFiles.length > 0 || state.attachedUrls.length > 0;

  if (!content && !hasFileOrUrl) return;

  // --- PLAN USAGE LOGIC ---
let usageKey = null;
let usageMsg = '';
const highestModelActive = state.premiumModel === 'gpt-4.1-full';
const premiumChatActive = state.premiumModel === 'gpt-4.1-mini';

if (state.eventMode) {
  usageKey = 'justChatEventModePerDay';
  usageMsg = 'You have reached your daily Add Event usage limit.';
} else if (state.attachedFiles.length > 0 || state.attachedUrls.length > 0) {
  usageKey = 'justChatFileAndUrlPerDay';
  usageMsg = 'You have reached your daily file/url upload limit for your plan.';
} else if (highestModelActive) {
  usageKey = 'justChatFullPerDay';
  usageMsg = 'You have reached your daily GPT-4.1 (Highest) message limit.';
} else if (premiumChatActive) {
  usageKey = 'justChatMiniPerDay';
  usageMsg = 'You have reached your daily GPT-4.1 Mini message limit.';
} else {
  usageKey = 'justChatNanoPerDay';
  usageMsg = 'You have reached your daily chat message limit for this model.';
}

// Restrict by plan
if (usageKey) {
  const allowed = await checkAndUpdateUsage(usageKey);
  if (!allowed) {
    showToast(usageMsg, 'error');
    elements.sendBtn.disabled = false;
    elements.inputForm.disabled = false;
    return;
  }
}

  if (!content && state.attachedFiles.length === 0 && state.attachedUrls.length === 0) return;

  if (elements.sendBtn.disabled) return;
  elements.sendBtn.disabled = true;
  elements.inputForm.disabled = true;

  try {
    // Create new chat if none exists
    if (!state.currentChatId) {
      state.currentChatId = await createNewChat();
    }

    // Process attachments
    let attachments = {
      files: null,
      urls: null
    };

    const filesToProcess = [...state.attachedFiles];
    const urlsToProcess = [...state.attachedUrls];
    state.attachedFiles = [];
    state.attachedUrls = [];

    // Process URLs
    if (urlsToProcess.length > 0) {
      try {
        const urlResults = await Promise.all(
          urlsToProcess.map(async item => {
            const extractedText = await processUrlContent(item.url);
            return { url: item.url, content: extractedText };
          })
        );
        if (urlResults.some(r => r.content)) {
          attachments.urls = urlResults;
        }
      } catch (error) {
        showToast('Warning', 'Some URLs could not be processed', 'warning');
      }
    }

    // Process files
    if (filesToProcess.length > 0) {
      try {
        const fileResults = await Promise.all(
          filesToProcess.map(async item => {
            if (item.isImage && item.base64) {
              return { name: item.file.name, isImage: true, base64: item.base64 };
            } else {
              return await processFileAttachment(item);
            }
          })
        );
        if (fileResults.length > 0) {
          attachments.files = fileResults;
        }
      } catch (error) {
        showToast('Warning', 'Some files could not be processed', 'warning');
      }
    }

    // Create user message
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMessage = createMessage(content, true, timestamp, attachments);

    // Strip base64 for Firebase
    function stripBase64FromAttachments(attachments) {
      if (!attachments) return null;
      const files = attachments.files?.map(f => {
        if (f.isImage) {
          return { name: f.name, isImage: true };
        } else if (f.content) {
          return { name: f.name, content: f.content };
        }
        return { name: f.name };
      });
      const urls = attachments.urls?.map(u => ({ url: u.url, content: u.content }));
      return {
        files: files?.length ? files : null,
        urls: urls?.length ? urls : null
      };
    }
    const attachmentsForFirebase = stripBase64FromAttachments(attachments);

    if (!state.eventMode) {
      try {
        await saveMessage(state.currentChatId, {
          content,
          isUser: true,
          attachments: attachmentsForFirebase,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        showToast('Warning', 'Message saved locally but not synced', 'warning');
      }
    }

    

    elements.messageInput.value = '';
    state.showAddOptions = false;
    state.isFocused = false;
    state.isTyping = false;

    updateInputState();
    updateAttachmentsPreview();
    updateAddOptions();
    scrollToBottom();

    // Show typing indicator
    state.isTyping = true;
    updateSendBtnUI();

    // Get last 5 messages from chat history
    const recentHistory = state.messages
      .slice(-5)
      .map(msg => ({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.content
      }));
      addMessage(userMessage);
    const currentDate = new Date().toISOString().split('T')[0];

    // Prepare payload
    const payload = {
  message: content,
  userId: getCurrentUserId(),
  files: attachments.files || null,
  urls: attachments.urls || null,
  history: recentHistory,
  isEventMode: state.eventMode,
  currentDate: currentDate,
  model: state.premiumModel, // Use selected model
};

    // Fetch AI response
    try {
      console.log('[JustChat] Sending payload to backend:', payload);
      const aiResponse = await fetchAIResponse(payload);
      if (!state.eventMode) {
        await loadAndRenderChatList();
      }
      return aiResponse;
    } catch (error) {
      showToast('Error', 'Failed to get AI response', 'error');
      const errorMessage = createMessage(
        "I'm sorry, I encountered an error processing your request. Please try again.",
        false,
        timestamp
      );
      addMessage(errorMessage);
    } finally {
      // Hide typing indicator
      state.isTyping = false;
      updateSendBtnUI();
      // Hide reasoning bar and reset input border
      if (state.reasoningThinking) {
        state.reasoningThinking = false;
        hideReasoningThinkingBar();
        elements.inputContainer.style.border = '';
        elements.inputContainer.style.boxShadow = '';
      }
    }

  } catch (error) {
  // showToast('Error', 'Failed to process message', 'error');
  console.error('[JustChat] handleSendMessage error:', error);
  } finally {
    elements.sendBtn.disabled = false;
    elements.inputForm.disabled = false;
  }
}

// Helper function to update typing indicator
function updateTypingIndicator() {
  const typingIndicator = document.querySelector('.typing-indicator');
  if (!typingIndicator) return;
  
  typingIndicator.style.display = state.isTyping ? 'flex' : 'none';
}

// --- Event Mode Loader (rotating phrases) ---
const eventLoadingPhrases = [
  "Wrangling your event...",
  "Sorting things out...",
  "Syncing your calendar magic...",
  "Finding the best time slots...",
  "Organizing your schedule...",
  "Making things neat and tidy...",
  "Almost ready..."
];
let eventLoaderInterval = null;
function showEventLoader(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="event-loader">
      <div class="event-loader-spinner"></div>
      <div class="event-loader-text" id="eventLoaderText">${eventLoadingPhrases[0]}</div>
    </div>
  `;
  let idx = 1;
  eventLoaderInterval = setInterval(() => {
    const textEl = container.querySelector('#eventLoaderText');
    if (textEl) textEl.textContent = eventLoadingPhrases[idx % eventLoadingPhrases.length];
    idx++;
  }, 2000);
}
function hideEventLoader() {
  clearInterval(eventLoaderInterval);
  eventLoaderInterval = null;
}

const eventProgressSteps = [
  "Creating event",
  "Adding details",
  "Matching",
  "Finalizing",
  "Done!"
];

let eventProgressTimeout = null;
let eventProgressWrapper = null;
let eventProgressStepIdx = 0;
let eventProgressInterval = null;
let eventProgressFinished = false;
let eventProgressContainer = null;
let eventProgressExtraStepActive = false;

/**
 * Show event progress immediately, each step 1s, block template until finished.
 * If template not ready at last step, show extra "Resolving challenge..." step for 3s.
 */
function showEventProgress(container) {
  if (!container) return;
  hideEventProgress();

  eventProgressContainer = container;
  eventProgressStepIdx = 0;
  eventProgressFinished = false;
  eventProgressExtraStepActive = false;

  eventProgressWrapper = document.createElement("div");
  eventProgressWrapper.className = "event-progress-timeline";
  eventProgressWrapper.innerHTML = `
    ${eventProgressSteps.map((step, idx) => `
      <div class="progress-step" data-step="${idx}">
        <div class="progress-circle">${idx + 1}</div>
        <div class="progress-label">${step}</div>
      </div>
    `).join('')}
  `;
  container.appendChild(eventProgressWrapper);

  // Show steps one by one, each 1s
  eventProgressInterval = setInterval(() => {
    // Mark current step as completed
    if (eventProgressStepIdx < eventProgressSteps.length) {
      const stepEl = eventProgressWrapper.querySelector(`[data-step="${eventProgressStepIdx}"]`);
      if (stepEl) {
        stepEl.classList.add("completed");
        stepEl.classList.add("active");
        // Remove active from previous
        if (eventProgressStepIdx > 0) {
          const prevEl = eventProgressWrapper.querySelector(`[data-step="${eventProgressStepIdx - 1}"]`);
          if (prevEl) prevEl.classList.remove("active");
        }
      }
      eventProgressStepIdx++;
    } else {
      // At last step, check if template is ready
      if (!eventProgressFinished) {
        // If not ready, show extra step
        if (!eventProgressExtraStepActive) {
          eventProgressExtraStepActive = true;
          // Add extra step
          const extraStep = document.createElement("div");
          extraStep.className = "progress-step extra resolving";
          extraStep.innerHTML = `
            <div class="progress-circle" style="background:#f59e42;border-color:#f59e42;color:#fff;">!</div>
            <div class="progress-label" style="color:#f59e42;">We hit a challenge, resolving...</div>
          `;
          eventProgressWrapper.appendChild(extraStep);
          setTimeout(() => {
            extraStep.classList.add("completed");
            // After 3s, check again if template is ready
            if (!eventProgressFinished) {
              // Wait until template is ready, then hide progress
              // (This is handled by hideEventProgress when template is ready)
            }
          }, 3000);
        }
      } else {
        // Progress finished, hide loader
        hideEventProgress();
      }
    }
  }, 1000); // 1s per step
}

/**
 * Hide event progress and clear timers.
 * Only called when template is ready.
 */
function hideEventProgress() {
  if (eventProgressInterval) clearInterval(eventProgressInterval);
  eventProgressInterval = null;
  if (eventProgressTimeout) clearTimeout(eventProgressTimeout);
  eventProgressTimeout = null;
  if (eventProgressWrapper && eventProgressWrapper.parentNode) {
    eventProgressWrapper.parentNode.removeChild(eventProgressWrapper);
  }
  eventProgressWrapper = null;
  eventProgressFinished = true;
  eventProgressExtraStepActive = false;
}

// Add styles once
if (!document.getElementById("event-progress-style")) {
  const style = document.createElement("style");
  style.id = "event-progress-style";
  style.textContent = `
.event-progress-timeline {
  display: flex;
  justify-content: space-between;
  gap: 1.2rem;
  margin: 2rem auto;
  max-width: 480px;
  background: var(--progress-bg, transparent);
  border-radius: 14px;
  box-shadow: 0 4px 24px var(--progress-shadow, #e0e7ef55);
  padding: 1.2rem 1.5rem;
}
.progress-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  opacity: 0.6;
  transition: all .3s ease;
}
.progress-circle {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--progress-inactive);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  background: transparent;
  color: var(--progress-inactive);
  transition: all .3s ease;
}
.progress-label {
  font-size: 11px;
  margin-top: 6px;
  text-align: center;
  line-height: 1.3;
  font-weight: 500;
  color: var(--progress-inactive);
  transition: all .3s ease;
}
.progress-step.completed .progress-circle {
  background: var(--progress-completed);
  border-color: var(--progress-completed);
  color: #fff;
  box-shadow: 0 0 6px var(--progress-completed-glow);
}
.progress-step.completed .progress-label {
  color: var(--progress-completed);
  font-weight: 600;
  opacity: 1;
}
.progress-step.active .progress-circle {
  background: var(--progress-active);
  border-color: var(--progress-active);
  color: #fff;
  box-shadow: 0 0 6px var(--progress-active-glow);
}
.progress-step.active .progress-label {
  color: var(--progress-active);
  font-weight: 700;
  opacity: 1;
}
.progress-step.extra.resolving .progress-circle {
  background: #f59e42;
  border-color: #f59e42;
  color: #fff;
  box-shadow: 0 0 8px #f59e4255;
}
.progress-step.extra.resolving .progress-label {
  color: #f59e42;
  font-weight: 700;
  opacity: 1;
}
/* Light theme vars */
:root {
  --progress-inactive: #d1d5db;
  --progress-active: #6366f1;
  --progress-completed: #22c55e;
  --progress-active-glow: #6366f155;
  --progress-completed-glow: #22c55e55;
  --progress-bg: #f8fafc;
  --progress-shadow: #e0e7ef55;
}
/* Dark theme overrides */
.dark {
  --progress-inactive: #52525b;
  --progress-active: #6366f1;
  --progress-completed: #22c55e;
  --progress-active-glow: #6366f155;
  --progress-completed-glow: #22c55e55;
  --progress-bg: #18181b;
  --progress-shadow: #18181b55;
}
  `;
  document.head.appendChild(style);
}




function makeAiTablesScrollable() {
  document.querySelectorAll('.ai-text').forEach(aiText => {
    aiText.querySelectorAll('table').forEach(table => {
      // Only wrap if not already wrapped
      if (!table.parentElement.classList.contains('ai-table-scroll')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'ai-table-scroll';
        wrapper.style.overflowX = 'auto';
        wrapper.style.webkitOverflowScrolling = 'touch';
        wrapper.style.maxWidth = '100%';
        wrapper.style.margin = '8px 0';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      }
    });
  });
}

// Add this array near the top of your file (if not already present)
const imageLoadingPhrases = [
  "Analysing your masterpiece...",
  "Scanning pixels for awesomeness...",
  "Nice photo! Thinking...",
  "Looking for hidden details...",
  "Appreciating your artistic taste...",
  "Zooming in on creativity...",
  "Image detected! Summoning my inner artist...",
  "Processing your visual story...",
  "Wow, that's a cool image! Analysing...",
  "Let me take a closer look at your picture..."
];

// Updated fetchAIResponse: accepts the payload object from handleSendMessage
async function fetchAIResponse(payload) {
  const userId = payload.userId || getCurrentUserId();
  if (!userId) throw new Error('User not authenticated');

  const backendURL = 'https://my-backend-three-pi.vercel.app/api/just_chat';

  // Disable send button while streaming
  elements.sendBtn.disabled = true;

  try {
    // Prefer history from payload, fallback to local last 5 messages
    const recentHistory = payload.history || state.messages.slice(-5).map(msg => ({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.content
    }));

    // Determine attachments from payload
    const attachments = {
      files: payload.files || null,
      urls: payload.urls || null
    };

    const userInput = payload.message || '';
    const isEventModeLocal = !!payload.isEventMode;
    const currentDate = payload.currentDate || new Date().toISOString().split('T')[0];

    // Create empty AI message (shows loader)
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const aiMessageId = `ai-${Date.now()}`;
    const tempMessage = createMessage('', false, timestamp);
    tempMessage.id = aiMessageId;
    addMessage(tempMessage);

    // Get reference to message container
    const messageElement = document.querySelector(`[data-message-id="${aiMessageId}"]`);
    const container = messageElement?.querySelector('.ai-text');
    if (!container) throw new Error('Could not find message container');
    let imageLoaderInterval = null;
    let isImage = attachments.files && attachments.files.some(f => f.isImage);

    if (isEventModeLocal) {
      // Always show event loader if event mode is on (even if image is present)
      showEventLoader(container);
      showEventProgress(container);
    } else if (isImage) {
      // Only show image loader if image is present and NOT event mode
      let idx = Math.floor(Math.random() * imageLoadingPhrases.length);
      container.innerHTML = `
        <div class="ai-image-loader" style="display:flex;align-items:center;gap:10px;">
          <span class="loader-spinner" style="width:18px;height:18px;border:3px solid #8b5cf6;border-top:3px solid #fff;border-radius:50%;display:inline-block;animation:spin 1s linear infinite;"></span>
          <span id="aiImageLoaderText">${imageLoadingPhrases[idx]}</span>
        </div>
      `;
      imageLoaderInterval = setInterval(() => {
        idx = (idx + 1) % imageLoadingPhrases.length;
        const textEl = container.querySelector('#aiImageLoaderText');
        if (textEl) textEl.textContent = imageLoadingPhrases[idx];
      }, 2000);
    }
    // Remove inline loader spinner as soon as stream starts
    const loader = container.querySelector('.inline-loader');
    if (loader) loader.remove();

    

    // --- Use the payload directly (no duplicated payload creation here) ---
    // Start streaming or not based on image presence OR event mode (backend decides)
    console.log('[JustChat] fetchAIResponse POST to', backendURL, 'with payload:', payload);
    const response = await fetch(backendURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Failed to get AI response: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    let isImageResponse = isImage && !isEventModeLocal;
    let streamStarted = false;

    // If image: accumulate all, then show at once
     // If image is present (non-streaming), accumulate all and show at once
    if (isImage) {
      let fullData = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        streamStarted = true;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
  const parsed = JSON.parse(data);
  // --- Handle synthetic progress updates ---
  if (parsed.progress && !parsed.event) {
  // --- Accumulate progress logs ---
  if (!container.progressLogs) container.progressLogs = [];
  container.progressLogs.push(parsed.progress);
  container.innerHTML = `
    <div class="event-progress-log" style="color:#6366f1;font-weight:600;font-size:1.1em;padding:1em 0;">
      ${container.progressLogs.map(msg => `<div>${msg}</div>`).join('')}
    </div>
  `;
  continue; // Skip normal rendering
}
  // --- Final event JSON ---
  if (parsed.progress === "done" && parsed.event) {
    // Render event card as usual
    hideEventLoader();
    hideEventProgress();
    container.innerHTML = '';
    const templateContainer = document.createElement('div');
    templateContainer.className = 'event-template-container';
    templateContainer.style.cssText = 'width: 100%; max-width: 800px; margin: 1rem auto;';
    if (parsed.event.type === 'single' && parsed.event.event) {
      templateContainer.innerHTML = createSingleEventCard(parsed.event.event);
    } else if (parsed.event.type === 'plan' && Array.isArray(parsed.event.events)) {
      templateContainer.innerHTML = createEventPlanCard(parsed.event.events);
      requestAnimationFrame(() => {
        initEventExpansion(templateContainer);
      });
    }
    container.appendChild(templateContainer);
    continue; // Skip normal markdown rendering
  }
            const deltaContent = parsed.choices?.[0]?.delta?.content;
            if (deltaContent) {
              fullData += deltaContent;
            }
          } catch (err) {}
        }
      }
      if (imageLoaderInterval) clearInterval(imageLoaderInterval);
      if (isEventModeLocal) {
        // Hide event loader and render event card
        hideEventLoader();
        hideEventProgress();
        container.innerHTML = '';
        try {
          const jsonData = JSON.parse(fullData);
          const templateContainer = document.createElement('div');
          templateContainer.className = 'event-template-container';
          templateContainer.style.cssText = 'width: 100%; max-width: 800px; margin: 1rem auto;';
          if (jsonData.type === 'single' && jsonData.event) {
            templateContainer.innerHTML = createSingleEventCard(jsonData.event);
          } else if (jsonData.type === 'plan' && Array.isArray(jsonData.events)) {
            templateContainer.innerHTML = createEventPlanCard(jsonData.events);
            requestAnimationFrame(() => {
              initEventExpansion(templateContainer);
            });
          }
          container.appendChild(templateContainer);
        } catch (err) {
          // Fallback: render as markdown
          container.innerHTML = md.render(fullData);
        }
      } else {
        // Not event mode: render as markdown
        container.innerHTML = md.render(fullData);
      }
      accumulated = fullData;
      scrollToBottom();
    } else {
      // Streaming for text/event mode
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        streamStarted = true;
        // Remove loader as soon as first chunk arrives
        if (container.querySelector('.inline-loader')) {
          container.querySelector('.inline-loader').remove();
        }
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const deltaContent = parsed.choices?.[0]?.delta?.content;
            if (deltaContent) {
              accumulated += deltaContent;
              try {
                const jsonData = JSON.parse(accumulated);
                if (isEventModeLocal) {
                  // Hide loader, show template
                  hideEventLoader();
                  container.innerHTML = '';
                  const templateContainer = document.createElement('div');
                  templateContainer.className = 'event-template-container';
                  templateContainer.style.cssText = 'width: 100%; max-width: 800px; margin: 1rem auto;';
                  if (jsonData.type === 'single' && jsonData.event) {
                    templateContainer.innerHTML = createSingleEventCard(jsonData.event);
                  } else if (jsonData.type === 'plan' && Array.isArray(jsonData.events)) {
                    templateContainer.innerHTML = createEventPlanCard(jsonData.events);
                    requestAnimationFrame(() => {
                      initEventExpansion(templateContainer);
                    });
                  }
                  container.appendChild(templateContainer);
                } else {
                  // Render markdown for tables, etc
                  const aiText = container.querySelector('.ai-text') || createAiTextElement();
                  aiText.innerHTML = md.render(accumulated);
                  if (!aiText.parentElement) container.appendChild(aiText);
                }
              } catch (jsonError) {
                // Not valid JSON yet, just render as markdown
                if (!isEventModeLocal) {
                  const aiText = container.querySelector('.ai-text') || createAiTextElement();
                  aiText.innerHTML = md.render(accumulated);
                  if (!aiText.parentElement) container.appendChild(aiText);
                }
              }
              scrollToBottom();
              makeAiTablesScrollable();
            }
          } catch (err) {}
        }
      }
    }

    // If nothing was streamed, remove loader and show error
    if (!streamStarted) {
      if (container.querySelector('.inline-loader')) {
        container.querySelector('.inline-loader').remove();
      }
      container.innerHTML = `<div style="color:#ef4444;font-weight:600;">Sorry, I couldn't process your request. Please try again.</div>`;
    }

    // Update message when done
    const messageIndex = state.messages.findIndex(m => m.id === aiMessageId);
    if (messageIndex !== -1) {
      state.messages[messageIndex].content = accumulated;
    }

    // After streaming complete, only save AI message if not in event mode
    if (!isEventModeLocal) {
      await saveMessage(state.currentChatId, {
        content: accumulated,
        isUser: false,
        timestamp: new Date().toISOString()
      });
      await loadAndRenderChatList();
    }

    return accumulated;

  } catch (error) {
    // Remove loader and show error
    const messageElement = document.querySelector(`[data-message-id^="ai-"]`);
    const container = messageElement?.querySelector('.ai-text');
    if (container) {
      container.innerHTML = `<div style="color:#ef4444;font-weight:600;">Sorry, I couldn't process your request. Please try again.</div>`;
    }
    throw error;
  } finally {
    // Always re-enable send button after streaming
    elements.sendBtn.disabled = false;
  }
}


function createAiTextElement() {
  const div = document.createElement('div');
  div.className = 'ai-text';
  return div;
}

// Add this function to create the event card HTML
// Add this function to create the event card HTML
function createEventCard(data) {
  if (data.type === 'single') {
    return createSingleEventCard(data.event);
  } else if (data.type === 'plan') {
    return createEventPlanCard(data.events);
  }
  return '';
}

/**
 * Utility functions
 */

const getPriorityClass = (p, dark = false) => {
  // Used for badge background & text colors
  if (dark) {
    return [
      '',
      'background:rgba(239,68,68,0.18);color:#fca5a5;',
      'background:rgba(253,186,116,0.18);color:#fdba74;',
      'background:rgba(253,224,71,0.18);color:#fde047;',
      'background:rgba(191,219,254,0.18);color:#93c5fd;',
      'background:rgba(134,239,172,0.18);color:#6ee7b7;'
    ][p] || 'background:rgba(253,224,71,0.18);color:#fde047;';
  }
  return [
    '',
    'background:#fee2e2;color:#991b1b;',
    'background:#ffedd5;color:#ea580c;',
    'background:#fef9c3;color:#a16207;',
    'background:#dbeafe;color:#1d4ed8;',
    'background:#dcfce7;color:#166534;'
  ][p] || 'background:#fef9c3;color:#a16207;';
};

const getPriorityLabel = (p) =>
  ['', 'Critical', 'High', 'Medium', 'Low', 'Optional'][p] || 'Medium';

const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

const formatTime = (t) => {
  if (!t) return '';
  const [hh, mm] = t.split(':');
  const dt = new Date();
  dt.setHours(+hh, +mm);
  return dt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

/**
 * Renders the Single Event Card.
 * @param {object} event
 * @param {boolean} dark
 * @returns {string}
 */
function createSingleEventCard(event, dark = false) {
  const iconBoxBg = dark
    ? "background:linear-gradient(135deg,#312e81 0%,#3730a3 100%);"
    : "background:linear-gradient(135deg,#3b82f6 0%,#6366f1 100%);";

  const cardBg = dark
    ? "background:linear-gradient(135deg,rgba(30,41,59,.92) 0%,rgba(49,46,129,.9) 100%);"
    : "background:linear-gradient(135deg,rgba(239,246,255,0.89) 0%,rgba(238,242,255,0.91) 100%);";

  const cardShadow =
    "box-shadow:0 10px 20px -6px rgba(0,0,0,.18),0 2px 6px -2px rgba(0,0,0,0.05);";

  const headerBorderRadius = "border-radius:14px 14px 0 0;";
  const contentBorderRadius = "border-radius:0 0 14px 14px;";
   const textColor = dark ? "#fff" : "#111827"; // <-- force white in dark mode
  const descColor = dark ? "#a1a1aa" : "#374151";
  const labelColor = dark ? "#a3a3a3" : "#6b7280";
  const detailBg = dark ? "rgba(71,85,105,0.48)" : "rgba(255,255,255,0.64)";
  const badgeStyle = getPriorityClass(event.priority, dark);

  const calendarIconBg = dark
    ? "rgba(100,116,139,0.21)"
    : "rgba(219,234,254,1)";
  const clockIconBg = dark
    ? "rgba(99,102,241,0.17)"
    : "rgba(224,231,255,1)";

  // New: icon backgrounds for notification/ai
  const notifIconBg = dark
    ? "background:rgba(99,102,241,0.23);"
    : "background:rgba(224,231,255,0.85);";
  const aiIconBg = dark
    ? "background:rgba(236,72,153,0.18);"
    : "background:rgba(252,231,243,0.85);";

  const buttonBg = dark
    ? "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)"
    : "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)";

  // --- Notification/AI styled exactly like detail-item, with icon bg ---
  const notificationSection = `
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
      <div class="detail-item" style="display:flex;align-items:center;gap:13px;padding:12px 0 12px 10px;background:${detailBg};border-radius:10px;">
        <div class="detail-icon" style="${notifIconBg}width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;">
          <svg width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" style="display:block;">
            <path d="M13.73 21a2 2 0 0 1-3.46 0M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path>
          </svg>
        </div>
        <div class="detail-content">
          <p class="detail-label" style="font-size:12px;color:${labelColor};text-transform:uppercase;letter-spacing:.025em;margin-bottom:1px;font-weight:500;">Notifications</p>
          <p class="detail-value" style="font-weight:700;color:${textColor};font-size:15px;margin:0;">
            <span>${event.notificationsEnabled ? "Yes" : "No"}</span>
          </p>
        </div>
      </div>
      <div class="detail-item" style="display:flex;align-items:center;gap:13px;padding:12px 0 12px 10px;background:${detailBg};border-radius:10px;">
        <div class="detail-icon" style="${aiIconBg}width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;">
          <svg width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" style="display:block;">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19.5 3 21l1.5-4L16.5 3.5z"></path>
          </svg>
        </div>
        <div class="detail-content">
          <p class="detail-label" style="font-size:12px;color:${labelColor};text-transform:uppercase;letter-spacing:.025em;margin-bottom:1px;font-weight:500;">AI Assistance</p>
          <p class="detail-value" style="font-weight:700;color:${textColor};font-size:15px;margin:0;">
            <span>${event.aiEnabled ? "Yes" : "No"}</span>
          </p>
        </div>
      </div>
    </div>
  `;

  const isAdded = event.addedToCalendar === true;

  return `
 <div class="single-event-card" style="width:100%;max-width:448px;margin:0 auto;${cardBg}${cardShadow}border-radius:14px;border:none;${dark ? 'color:#fff;' : ''}">
      <div class="single-event-header" style="padding:20px 24px 0 24px;${headerBorderRadius}">
        <div class="single-event-top" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <div class="single-event-icon" style="${iconBoxBg}width:52px;height:52px;border-radius:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px -6px rgba(0,0,0,0.2);">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" style="display:block;">
              <path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
            </svg>
          </div>
          <div class="priority-badge" style="display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;padding:4px 14px; border-radius:8px;${badgeStyle}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:-2px;">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
            </svg>
            <span>${getPriorityLabel(event.priority)}</span>
          </div>
        </div>
        <h2 class="single-event-title" style="font-size:22px;font-weight:700;margin:0;color:${textColor};line-height:1.2;">${event.title}</h2>
      </div>
     <div class="single-event-content" style="padding:0 24px 24px 24px;${contentBorderRadius}display:flex;flex-direction:column;gap:18px;${dark ? 'color:#fff;' : ''}">
        <p class="single-event-description markdown-description" style="color:${descColor};font-size:15px;line-height:1.5;margin:0;font-weight:500;${dark ? 'color:#fff;' : ''}">
  ${md.render(event.description || '')}
</p>
        <div class="single-event-details" style="display:flex;flex-direction:column;gap:10px;">
          <!-- Date Item -->
          <div class="detail-item" style="display:flex;align-items:center;gap:13px;padding:12px 0 12px 10px;background:${detailBg};border-radius:10px;">
            <div class="detail-icon calendar" style="background:${calendarIconBg};width:42px;height:42px;border-radius:9px;display:flex;align-items:center;justify-content:center;">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2">
                <path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
              </svg>
            </div>
            <div class="detail-content">
              <p class="detail-label" style="font-size:12px;color:${labelColor};text-transform:uppercase;letter-spacing:.025em;margin-bottom:1px;font-weight:500;">Date</p>
              <p class="detail-value" style="font-weight:700;color:${textColor};font-size:15px;margin:0;">${formatDate(event.date)}</p>
            </div>
          </div>
          <!-- Time Item -->
          ${event.time ? `
          <div class="detail-item" style="display:flex;align-items:center;gap:13px;padding:12px 0 12px 10px;background:${detailBg};border-radius:10px;">
            <div class="detail-icon clock" style="background:${clockIconBg};width:42px;height:42px;border-radius:9px;display:flex;align-items:center;justify-content:center;">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12,6 12,12 16,14"/>
              </svg>
            </div>
            <div class="detail-content">
              <p class="detail-label" style="font-size:12px;color:${labelColor};text-transform:uppercase;letter-spacing:.025em;margin-bottom:1px;font-weight:500;">Time</p>
              <p class="detail-value" style="font-weight:700;color:${textColor};font-size:15px;margin:0;">
                <span>${formatTime(event.time)}</span>
              </p>
            </div>
          </div>` : ""}
        </div>
        ${notificationSection}
        <button 
          onclick='handleSaveEvent(${JSON.stringify({ ...event, addedToCalendar: true })})'
          style="
            background: ${buttonBg};
            color: white;
            font-weight: 500;
            padding: 0.75rem 2rem;
            border-radius: 0.5rem;
            border: none;
            cursor: pointer;
            transition: all 0.2s;
            transform: scale(1);
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            ${isAdded ? 'opacity:0.6;cursor:not-allowed;' : ''}
          "
          ${isAdded ? 'disabled' : ''}
        >
          ${isAdded ? 'Added to Calendar' : 'Add to Calendar'}
        </button>
      </div>
    </div>
  `;
}



/**
 * Renders the Multi-Day Plan Card
 * @param {array} events
 * @param {boolean} dark
 */
function createEventPlanCard(events, dark = false) {
  const labelColor = dark ? "#a3a3a3" : "#6b7280";

  const grouped = events.reduce((acc, e) => {
    (acc[e.date] || (acc[e.date] = [])).push(e);
    return acc;
  }, {});
  const days = Object.keys(grouped).length;
  const total = events.length;

  const planCardBg = dark
    ? "background:linear-gradient(135deg,rgba(30,41,59,.92) 0%,rgba(49,46,129,.9) 100%);"
    : "background:linear-gradient(135deg,rgba(250,245,255,0.66) 0%,rgba(252,231,243,0.53) 100%);";
  const cardShadow = "box-shadow:0 10px 20px -6px rgba(0,0,0,.12),0 2px 6px -2px rgba(0,0,0,0.05);";
 const titleColor = dark ? "#fff" : "#1e293b";
  const subtitleColor = dark ? "#a1a1aa" : "#64748b";
  const planIconBg = dark
    ? "background:linear-gradient(135deg,#312e81 0%,#ec4899 100%);"
    : "background:linear-gradient(135deg,#8b5cf6 0%,#ec4899 100%);";
  const borderColor = dark ? "#3b3b5c" : "rgba(229,231,235,1)";
  const badgeBg = dark ? "background:#232946;" : "background:rgba(243,244,246,1);";
  const badgeColor = dark ? "color:#e0e7ef;" : "color:#374151;";
  const eventDescColor = dark ? "#a1a1aa" : "#64748b";
  const eventTitleColor = dark ? "#e5e7eb" : "#1e293b";
  const metaColor = dark ? "#a3a3a3" : "#6b7280";
  const expandedDetailBg = dark ? "rgba(49,46,129,0.91)" : "rgba(249,250,251,0.91)";

  // Icon backgrounds for expanded details
  const notifIconBg = dark
    ? "background:rgba(99,102,241,0.23);"
    : "background:rgba(224,231,255,0.85);";
  const aiIconBg = dark
    ? "background:rgba(236,72,153,0.18);"
    : "background:rgba(252,231,243,0.85);";

  // PATCH: Check if all events are already added
  const allAdded = events.every(ev => ev.addedToCalendar === true);

  // Helper for notification/ai styled exactly like expanded-detail-item, with icon bg and smaller icons
  const extraSection = (e) => `
    <div style="display:flex;gap:13px;width:100%;">
      <div class="expanded-detail-item" style="background:${expandedDetailBg};padding:9px 13px;border-radius:8px;border:1px solid ${borderColor};display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
        <div style="${notifIconBg}width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="21" height="20" fill="none" stroke="currentColor" stroke-width="2" style="display:block;">
            <path d="M13.73 21a2 2 0 0 1-3.46 0M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path>
          </svg>
        </div>
        <span style="font-size:13px;color:${dark ? "#e0e7ef" : "#374151"};">
          Notifications: <b>${e.notificationsEnabled ? "Yes" : "No"}</b>
        </span>
      </div>
      <div class="expanded-detail-item" style="background:${expandedDetailBg};padding:9px 13px;border-radius:8px;border:1px solid ${borderColor};display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
        <div style="${aiIconBg}width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="21" height="22" fill="none" stroke="currentColor" stroke-width="2" style="display:block;">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19.5 3 21l1.5-4L16.5 3.5z"></path>
          </svg>
        </div>
        <span style="font-size:13px;color:${dark ? "#e0e7ef" : "#374151"};">
          AI Assistance: <b>${e.aiEnabled ? "Yes" : "No"}</b>
        </span>
      </div>
    </div>
  `;

  // Helper to build expanded detail items in pairs (two per row, equal width)
  function buildExpandedDetails(e) {
    const items = [];
    if (e.location) {
      items.push(`
        <div class="expanded-detail-item" style="background:${expandedDetailBg};padding:9px 13px;border-radius:8px;border:1px solid ${borderColor};flex:1;min-width:0;">
          <div class="expanded-detail-label" style="font-size:11px;color:${labelColor};text-transform:uppercase;letter-spacing:0.025em;font-weight:600;margin-bottom:1.5px;">Location</div>
          <div class="expanded-detail-value" style="font-size:13px;color:${eventTitleColor};font-weight:600;">${e.location}</div>
        </div>
      `);
    }
    if (e.attendees) {
      items.push(`
        <div class="expanded-detail-item" style="background:${expandedDetailBg};padding:9px 13px;border-radius:8px;border:1px solid ${borderColor};flex:1;min-width:0;">
          <div class="expanded-detail-label" style="font-size:11px;color:${labelColor};text-transform:uppercase;letter-spacing:0.025em;font-weight:600;margin-bottom:1.5px;">Attendees</div>
          <div class="expanded-detail-value" style="font-size:13px;color:${eventTitleColor};font-weight:600;">${e.attendees}</div>
        </div>
      `);
    }
    items.push(`
      <div class="expanded-detail-item" style="background:${expandedDetailBg};padding:9px 13px;border-radius:8px;border:1px solid ${borderColor};flex:1;min-width:0;">
        <div class="expanded-detail-label" style="font-size:11px;color:${labelColor};text-transform:uppercase;letter-spacing:0.025em;font-weight:600;margin-bottom:1.5px;">Time</div>
        <div class="expanded-detail-value" style="font-size:13px;color:${eventTitleColor};font-weight:600;">${formatTime(e.time)}</div>
      </div>
    `);
    items.push(`
      <div class="expanded-detail-item" style="background:${expandedDetailBg};padding:9px 13px;border-radius:8px;border:1px solid ${borderColor};flex:1;min-width:0;">
        <div class="expanded-detail-label" style="font-size:11px;color:${labelColor};text-transform:uppercase;letter-spacing:0.025em;font-weight:600;margin-bottom:1.5px;">Priority</div>
        <div class="expanded-detail-value" style="font-size:13px;color:${eventTitleColor};font-weight:600;">${getPriorityLabel(e.priority)}</div>
      </div>
    `);

    // Add the extraSection (notification/ai) as a row (2 columns)
    // So, group all items in pairs of 2
    let html = '';
    for (let i = 0; i < items.length; i += 2) {
      html += `<div style="display:flex;gap:13px;width:100%;">${items[i]}${items[i + 1] || ''}</div>`;
    }
    // Add notification/ai row
    html += extraSection(e);
    return html;
  }

  return `
    <div class="plan-card" style="width:100%;max-width:680px;margin:0 auto;${planCardBg}${cardShadow}border-radius:14px;border:none;${dark ? 'color:#fff;' : ''}">
      <div class="plan-header" style="padding:20px 24px 0 24px;">
        <div class="plan-title-row" style="display:flex;align-items:center;gap:11px;margin-bottom:8px;">
          <div class="plan-icon" style="${planIconBg}width:37px;height:37px;border-radius:8px;display:flex;align-items:center;justify-content:center;">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
              <path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
            </svg>
          </div>
          <h2 class="plan-title" style="font-size:22px;font-weight:700;color:${titleColor};margin:0;">Event Plan</h2>
        </div>
        <p class="plan-subtitle" style="font-size:15px;color:${subtitleColor};margin:0 0 3px 0;font-weight:500;">
          ${days} days • ${total} events
        </p>
      </div>
      <div class="plan-content" style="padding:0 24px 24px 24px;display:flex;flex-direction:column;gap:27px;${dark ? 'color:#fff;' : ''}">
        ${Object.entries(grouped).map(
          ([date, dayEvents]) => `
          <div class="day-section" style="display:flex;flex-direction:column;gap:13px;">
            <div class="day-header" style="display:flex;align-items:center;gap:9px;padding-bottom:10px;border-bottom:1px solid ${borderColor};">
              <h3 class="day-title" style="font-weight:600;color:${titleColor};font-size:17px;margin:0;">${formatDate(date)}</h3>
              <div class="event-count-badge" style="font-size:12px;${badgeBg}${badgeColor}padding:2px 9px 3px 9px;border-radius:4px;font-weight:500;">${dayEvents.length} events</div>
            </div>
            <div class="events-list" style="display:flex;flex-direction:column;gap:9px;">
              ${dayEvents.map(
  (e) => `
    <div class="event-item" style="cursor:pointer;transition:box-shadow .18s, border-color .18s;background:${dark ? "rgba(49,46,129,0.51)" : "rgba(255,255,255,0.51)"};border:1px solid ${borderColor};padding:13px 12px 14px 12px;border-radius:9px;display:flex;align-items:flex-start;gap:15px;position:relative;" 
         onclick="toggleEventExpansion(this)">
      <div class="event-indicator" style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%);display:flex;align-items:center;justify-content:center;margin-top:2.7px;flex-shrink:0;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </div>
      <div class="event-details" style="flex:1;min-width:0;">
        <div class="event-main" style="display:flex;align-items:flex-start;justify-content:space-between;gap:7px;margin-bottom:7px;">
          <div class="event-info" style="flex:1;">
            <h4 class="event-title" style="margin:0 0 3px 0;font-size:17px;font-weight:700;color:${eventTitleColor};display:inline;">
              ${e.title}
              <span class="expand-indicator" style="margin-left:8px;font-size:10px;color:#9ca3af;transition:transform.18s;display:inline-block;vertical-align:middle;">▼</span>
            </h4>
            <div class="event-description collapsed markdown-description" style="
              font-size:11px;
              color:${eventDescColor};
              margin:0;
              line-height:1.45;
              font-weight:500;
              display:-webkit-box;
              -webkit-line-clamp:1;
              -webkit-box-orient:vertical;
              overflow:hidden;
              max-height:1.6em;
              transition:max-height .2s;
            ">
              ${md.render(e.description || '')}
            </div>
          </div>
          <div class="priority-badge event-badge" style="flex-shrink:0;display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;padding:3.5px 12px 3.5px 12px;border-radius:7px;${getPriorityClass(
            e.priority,
            dark
          )}">${getPriorityLabel(e.priority)}
          </div>
        </div>
        <div class="event-meta" style="display:flex;align-items:center;gap:15px;font-size:12px;color:${metaColor};margin-top:5px;flex-wrap:wrap;">
          <div class="event-time" style="display:flex;align-items:center;gap:4px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12,6 12,12 16,14"/>
            </svg>
            ${formatTime(e.time)}
          </div>
        </div>
        <div class="event-expanded-content" style="display:none;margin-top:13px;padding-top:13px;border-top:1px solid ${borderColor};">
          <div class="expanded-details" style="display:flex;flex-direction:column;gap:13px;margin-top:7px;width:100%;">
            ${buildExpandedDetails(e)}
            <div class="event-description expanded markdown-description" style="
              font-size:12px;
              color:${eventDescColor};
              margin:0;
              line-height:1.6;
              font-weight:500;
              margin-top:10px;
              display:block;
              max-height:none;
            ">
              ${md.render(e.description || '')}
            </div>
          </div>
        </div>
      </div>
    </div>`
).join('')}
            </div>
          </div>`
        ).join('')}
      </div>
      <div class="plan-content" style="padding:0 24px 24px 24px;display:flex;flex-direction:column;gap:27px;">
        <button onclick='handleSaveEventPlan(${JSON.stringify(events)})' style="
          background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
          color: white;
          font-weight: 500;
          padding: 0.75rem 2rem;
          border-radius: 0.5rem;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          transform: scale(1);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          align-self: flex-start;
          ${allAdded ? 'opacity:0.6;cursor:not-allowed;' : ''}
        " ${allAdded ? 'disabled' : ''}>
          ${allAdded ? 'All Events Added' : 'Add All Events to Calendar'}
        </button>
      </div>
    </div>
  `;
}


/**
 * Expands/collapses an event item; toggles styling.
 * Attach this globally after render.
 */
function toggleEventExpansion(el) {
  el.classList.toggle("expanded");

  const expandedContent = el.querySelector('.event-expanded-content');
  const desc = el.querySelector('.event-description');
  if (el.classList.contains('expanded')) {
    expandedContent.style.display = 'block';
    desc.classList.remove('collapsed');
    desc.classList.add('expanded');
    desc.style.display = 'block';
    // Rotate the ▼ indicator
    el.querySelector('.expand-indicator').style.transform = 'rotate(180deg)';
  } else {
    expandedContent.style.display = 'none';
    desc.classList.remove('expanded');
    desc.classList.add('collapsed');
    // Clamp text
    desc.style.display = '-webkit-box';
    el.querySelector('.expand-indicator').style.transform = '';
  }
}

/**
 * Example usage:
 *   element.innerHTML = createSingleEventCard(data, darkModeEnabled);
 *   element.innerHTML = createEventPlanCard(arrayOfEvents, darkModeEnabled);
 * Then call initEventExpansion() to add expansion logic for plan cards.
 */

function initEventExpansion(container) {
  if (!container) container = document.body;
  container.querySelectorAll('.event-item').forEach(ev => {
    ev.onclick = () => toggleEventExpansion(ev);
  });
}

// Expose globally for inline HTML use
window.createSingleEventCard = createSingleEventCard;
window.createEventPlanCard = createEventPlanCard;
window.toggleEventExpansion = toggleEventExpansion;
window.initEventExpansion = initEventExpansion;





// Add the toggle function for expanding/collapsing events
window.toggleEventExpansion = function(eventElement, eventIndex, dayIndex) {
  const isExpanded = eventElement.classList.contains('expanded');
  const expandedContent = eventElement.querySelector('.event-expanded-content');
  const description = eventElement.querySelector('.event-description');
  
  if (isExpanded) {
    eventElement.classList.remove('expanded');
    expandedContent.classList.remove('visible');
    description.classList.add('collapsed');
    description.classList.remove('expanded');
  } else {
    eventElement.classList.add('expanded');
    expandedContent.classList.add('visible');
    description.classList.remove('collapsed');
    description.classList.add('expanded');
  }
};

// --- PATCH: Save addedToCalendar in event JSON and disable button forever ---
window.handleSaveEvent = async function(event) {
  try {
    // Show spinner in button
    const btn = document.querySelector('.single-event-card button[disabled], .single-event-card button:not([disabled])');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="display:inline-block;width:18px;height:18px;border:3px solid #fff;border-top:3px solid #6366f1;border-radius:50%;animation:spin 1s linear infinite;vertical-align:middle;margin-right:8px;"></span>Adding...`;
    }

    event.addedToCalendar = true;
    const formattedEvent = {
      title: event.title,
      description: event.description,
      date: event.date,
      time: event.time || "09:00",
      priority: event.priority || "none",
      color: "teal",
      isComplex: false,
      aiEnabled: event.aiEnabled ?? false,
      aiTaskType: "event",
      aiReason: "User created event",
      notificationsEnabled: event.notificationsEnabled ?? false,
      addedDate: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      recurrence: "none",
      syncAction: "create",
      addedToCalendar: true,
      templateData: {
        formFields: {
          additionalInfo: "",
          taskTopic: "",
        }
      }
    };

    await saveEvent(formattedEvent);
    state.eventMode = false;
    elements.messageInput.placeholder = 'Message...';
    elements.eventBtn.classList.remove('active');
    updateAddOptions();
    // PATCH: Save template JSON to chat with addedToCalendar
    if (state.currentChatId) {
      await saveMessage(state.currentChatId, {
        content: JSON.stringify({
          type: 'single',
          event: { ...event, addedToCalendar: true }
        }),
        isUser: false,
        isTemplate: true,
        timestamp: new Date().toISOString()
      });
    }

    // Remove spinner and show toast
    if (btn) {
      btn.innerHTML = 'Added to Calendar';
      btn.disabled = true;
    }
    showToast('Event saved successfully!');
  } catch (error) {
    console.error('Error saving event:', error);
    showToast('Failed to save event', 'error');
  }
};

// PATCH: Save addedToCalendar for all events in plan and disable button forever
window.handleSaveEventPlan = async function(events) {
  try {
    // Show spinner in button
    const btn = document.querySelector('.plan-card button[disabled], .plan-card button:not([disabled])');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="display:inline-block;width:18px;height:18px;border:3px solid #fff;border-top:3px solid #6366f1;border-radius:50%;animation:spin 1s linear infinite;vertical-align:middle;margin-right:8px;"></span>Adding...`;
    }

    const sharedColor = "violet";
    const now = new Date().toISOString();

    // Mark all as added
    const updatedEvents = events.map(ev => ({ ...ev, addedToCalendar: true }));

    // Save each event
    for (const event of updatedEvents) {
      const formattedEvent = {
        title: event.title,
        description: event.description,
        date: event.date,
        time: event.time || "09:00",
        priority: event.priority || "none",
        color: sharedColor,
        isComplex: false,
        aiEnabled: event.aiEnabled ?? false,
        aiTaskType: "event",
        aiReason: "Part of event plan",
        notificationsEnabled: event.notificationsEnabled ?? false,
        addedDate: now,
        lastUpdated: now,
        recurrence: "none",
        syncAction: "create",
        addedToCalendar: true,
        templateData: {
          formFields: {
            additionalInfo: "",
            taskTopic: "",
          }
        }
      };

      await saveEvent(formattedEvent);
    }

    // Save template JSON to chat with addedToCalendar for all events
    if (state.currentChatId) {
      await saveMessage(state.currentChatId, {
        content: JSON.stringify({
          type: 'plan',
          events: updatedEvents
        }),
        isUser: false,
        isTemplate: true,
        timestamp: new Date().toISOString()
      });
    }

    // Remove spinner and show toast
    if (btn) {
      btn.innerHTML = 'All Events Added';
      btn.disabled = true;
    }
    showToast('All events saved successfully!');
    state.eventMode = false;
    elements.messageInput.placeholder = 'Message...';
    elements.eventBtn.classList.remove('active');
    updateAddOptions();
  } catch (error) {
    console.error('Error saving event plan:', error);
    showToast('Failed to save some events', 'error');
  }
}

// Helper function to get current message ID
function getCurrentMessageId() {
  const activeMessage = document.querySelector('.message-container[data-message-id]');
  return activeMessage?.dataset?.messageId;
}



function showToast(message, type = 'info', duration = 2000) {
  // Remove any existing toast
  document.querySelectorAll('.custom-toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'custom-toast';
  toast.style.cssText = `
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #23272f;
    color: #fff;
    border-radius: 8px;
    padding: 10px 22px;
    font-size: 15px;
    font-weight: 600;
    z-index: 99999;
    box-shadow: 0 2px 12px #0004;
    opacity: 0.97;
    display: flex;
    align-items: center;
    gap: 10px;
  `;
  // Simple icons
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  toast.innerHTML = `<span style="font-size:18px;">${icon}</span> <span>${message}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 350);
  }, 2000);
}

function createMobileFeedbackModal(onClose) {
  // Modal overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
  `;

  // Modal content
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: #1e293b;
    border-radius: 16px;
    padding: 24px 18px 18px 18px;
    max-width: 95vw;
    width: 95vw;
    min-width: 0;
    box-shadow: 0 8px 32px 0 rgba(30,41,59,0.18);
    display: flex;
    flex-direction: column;
    gap: 14px;
    position: relative;
  `;

  modal.innerHTML = `
    <h3 style="color:white;font-size:18px;margin:0 0 10px 0;">Send Feedback</h3>
    <label style="color: white; font-weight: 500; font-size: 14px;">Type</label>
    <select id="mobileFeedbackType" class="sidebar-feedback-select">
      <option value="bug">Report Bug</option>
      <option value="feedback">General Feedback</option>
      <option value="feature">Suggest Feature</option>
    </select>
    <label style="color: white; font-weight: 500; font-size: 14px;">Message</label>
    <textarea id="mobileFeedbackText" rows="4" style="padding: 8px; border-radius: 6px; border: 1px solid #64748b; background: #1e293b; color: white; resize: vertical;"></textarea>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button id="mobileFeedbackClose" style="background:#475569;color:white;padding:10px 18px;border-radius:8px;font-weight:600;border:none;cursor:pointer;">Close</button>
      <button id="mobileFeedbackSend" style="background:rgb(37 99 235);color:white;padding:10px 18px;border-radius:8px;font-weight:600;border:none;cursor:pointer;">Send</button>
    </div>
    <div id="mobileFeedbackMsg" style="color: rgb(34 197 94); font-size: 13px; margin-top: 4px; display: none;"></div>
  `;

  overlay.appendChild(modal);

  // Send feedback logic (same as sidebar)
  modal.querySelector('#mobileFeedbackSend').onclick = async () => {
    const type = modal.querySelector('#mobileFeedbackType').value;
    const text = modal.querySelector('#mobileFeedbackText').value.trim();
    const msgDiv = modal.querySelector('#mobileFeedbackMsg');
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
      modal.querySelector('#mobileFeedbackText').value = '';
      setTimeout(() => {
        msgDiv.style.display = 'none';
        if (onClose) onClose();
        overlay.remove();
      }, 1200);
    } catch (err) {
      msgDiv.style.display = 'block';
      msgDiv.style.color = 'rgb(239 68 68)';
      msgDiv.textContent = 'Failed to send feedback.';
    }
  };

  // Close button
  modal.querySelector('#mobileFeedbackClose').onclick = () => {
    if (onClose) onClose();
    overlay.remove();
  };

  // Clicking outside closes modal
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      if (onClose) onClose();
      overlay.remove();
    }
  };

  return overlay;
}

// DOM Elements


// Utility Functions
function toggleClass(element, className, condition) {
  if (condition) {
    element.classList.add(className);
  } else {
    element.classList.remove(className);
  }
}

function createSVG(pathData, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  if (className) svg.className = className;
  
  if (Array.isArray(pathData)) {
    pathData.forEach(data => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', data.type || 'path');
      Object.keys(data).forEach(attr => {
        if (attr !== 'type') {
          path.setAttribute(attr, data[attr]);
        }
      });
      svg.appendChild(path);
    });
  } else {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
  }
  
  return svg;
}

// Theme Management
function initializeTheme() {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    state.isDark = true;
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  } else {
    state.isDark = false;
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  }
  updateThemeButton();
}

function toggleTheme() {
  state.isDark = !state.isDark;

  if (state.isDark) {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    localStorage.setItem('theme', 'light');
  }

  updateThemeButton();
  renderNavSidebarContent(); // <--- Add this line
}

function onThemeChange() {
  renderMessages(); // This will re-render all messages/templates with the new theme
}



function updateThemeButton() {
  const themeIcon = elements.themeToggle.querySelector('.theme-icon');
  const themeText = elements.themeToggle.querySelector('.theme-toggle-text');
  
  if (state.isDark) {
    themeIcon.innerHTML = '<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707"></path>';
    themeText.textContent = 'Light Mode';
  } else {
    themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    themeText.textContent = 'Dark Mode';
  }
}

// Message Management
function createMessage(content, isUser, timestamp, attachments = null) {
  return {
    id: Date.now().toString() + Math.random(),
    content,
    isUser,
    timestamp,
    attachments
  };
}

function addMessage(message) {
  state.messages.push(message);
  renderMessages();
  scrollToBottom();
}

// After rendering messages, initialize event expansion for plan templates
function renderMessages() {
  if (state.messages.length === 0) {
    elements.quickActionsContainer.style.display = 'flex';
    elements.messagesList.style.display = 'none';
  } else {
    elements.quickActionsContainer.style.display = 'none';
    elements.messagesList.style.display = 'block';
    elements.messagesList.innerHTML = '';
    state.messages.forEach(message => {
      const messageEl = createMessageElement(message);
      elements.messagesList.appendChild(messageEl);
    });
    // After all messages rendered, initialize expansion for any plan templates
    setTimeout(() => {
      document.querySelectorAll('.plan-card').forEach(card => {
        window.initEventExpansion(card);
      });
    }, 0);
  }
}

// --- PATCH: Always render template if isTemplate, even after user sends new message ---
function createMessageElement(message) {
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.setAttribute('data-message-id', message.id);

  const attachmentsHtml = message.attachments ? renderAttachments(message.attachments) : '';

  if (message.isUser) {
    messageEl.innerHTML = `
      <div class="user-message">
        <div class="user-message-content">
          ${attachmentsHtml}
          <div class="user-bubble">
            <div class="user-text">${message.content || ''}</div>
          </div>
        </div>
      </div>
    `;
  } else {
    // PATCH: Always try to render as template if content is valid JSON with type
    let templateHtml = '';
    let explanation = '';
    let isLoading = message.content === '' && !message.isTemplate; // Show loader if content is empty and not a template
    try {
      // --- PATCH: Extract JSON and explanation sentence ---
      let content = message.content || '';
      let jsonPart = '';
      let explanationPart = '';
      if (/^\s*\{/.test(content)) {
        // Try to split JSON and explanation
        const match = content.match(/^(\{[\s\S]+\})\s*\n+([\s\S]+)$/);
        if (match) {
          jsonPart = match[1];
          explanationPart = match[2].trim();
        } else {
          jsonPart = content;
        }
      }
      let parsed;
      if (jsonPart) {
        parsed = JSON.parse(jsonPart);
        if (parsed && (parsed.type === 'single' || parsed.type === 'plan')) {
          templateHtml = renderSavedTemplate(JSON.stringify(parsed));
        }
      }
      explanation = explanationPart;
    } catch {
      // Not JSON, fallback
    }
    messageEl.innerHTML = `
      <div class="ai-message" style="width:100%;display:flex;justify-content:flex-start;margin-bottom:2.2em;">
        <div class="ai-content" style="display:flex;flex-direction:column;align-items:flex-start;width:100%;">
          <div class="ai-inner" style="background:none;padding:0;width:100%;">
            <div class="ai-text" style="margin:0;padding:0 0 0.5em 0;">
              ${
                isLoading
                  ? `<span class="inline-loader" style="display:inline-flex;align-items:center;gap:8px;">
                      <span class="spinner" style="display:inline-block;width:20px;height:20px;border:3px solid #8b5cf6;border-top:3px solid #fff;border-radius:50%;animation:spin 1s linear infinite;"></span>
                      <span style="color:#8b5cf6;font-weight:500;">Thinking...</span>
                    </span>`
                  : templateHtml ||
                    (message.isTemplate
                      ? renderSavedTemplate(message.content)
                      : `<div style="display:flex;flex-direction:column;gap:1.2em;">${md.render(message.content || '')}</div>`)
              }
              ${
                explanation
                  ? `<div class="ai-explanation" style="margin-top:1.2em;font-size:1.08em;color:#6366f1;font-weight:500;background:rgba(99,102,241,0.07);border-radius:8px;padding:0.7em 1em 0.7em 1em;">
                      <span style="display:inline-block;">${explanation}</span>
                    </div>`
                  : ''
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return messageEl;
}

// --- PATCH: Add dark mode CSS for notification/AI boxes ---
if (!document.getElementById('event-extra-dark-style')) {
  const style = document.createElement('style');
  style.id = 'event-extra-dark-style';
  style.innerHTML = `
    .single-event-extra > div {
      transition: background 0.2s, border 0.2s;
    }
    .dark .single-event-extra > div {
      background: #232946 !important;
      border-color: #3b3b5c !important;
      color: #e0e7ef !important;
    }
    .single-event-extra svg {
      display: block;
      min-width: 26px;
      min-height: 26px;
      max-width: 26px;
      max-height: 26px;
    }
  `;
  document.head.appendChild(style);
}

function scrollToBottom() {
  setTimeout(() => {
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
  }, 100);
}

// Input Management
function updateInputState() {
  const hasContent = elements.messageInput.value.trim().length > 0;
  const hasAttachments = state.attachedFiles.length > 0 || state.attachedUrls.length > 0;
  
  elements.sendBtn.disabled = !hasContent && !hasAttachments;
  
  toggleClass(elements.inputContainer, 'has-content', hasContent || hasAttachments);
  toggleClass(elements.inputContainer, 'focused', state.isFocused);
  
  // Auto-resize textarea
  elements.messageInput.style.height = 'auto';
  const scrollHeight = elements.messageInput.scrollHeight;
  const maxHeight = 200;
  elements.messageInput.style.height = Math.min(scrollHeight, maxHeight) + 'px';
}





// Attachment Management
function handleFileUpload() {
  elements.fileInput.click();
}

// Helper to process image files to base64 immediately
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// New combined file/url attachment handler
async function handleFileOrUrlAttachment(type, value) {
  if (type === 'file') {
    state.attachedFiles.push(value);
  } else if (type === 'url') {
    state.attachedUrls.push({ url: value, processed: false });
  }
  updateAttachmentsPreview();
  updateInputState();
  return true;
}

// Replace handleFileSelect:
async function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  for (const file of files) {
    // Only allow images, PDFs, or DOCX
    const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp)$/i.test(file.name);
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isDocx = file.name.toLowerCase().endsWith(".docx");
    if (isImage) {
      const base64 = await fileToBase64(file);
      const value = { file, isImage: true, base64, processed: true };
      await handleFileOrUrlAttachment('file', value);
    } else if (isPdf || isDocx) {
      const value = { file, isImage: false, processed: true };
      await handleFileOrUrlAttachment('file', value);
    } else {
      showToast('Only images, PDF, or DOCX files are allowed.', 'error');
    }
  }
}

// Replace handleAddUrl:
async function handleAddUrl() {
  const url = elements.urlInput.value.trim();
  if (url) {
    const ok = await handleFileOrUrlAttachment('url', url);
    if (!ok) return;
    elements.urlInput.value = '';
    state.showUrlInput = false;
    updateAttachmentsPreview();
    updateAddOptions();
    updateInputState();
  }
}

function updateAttachmentsPreview() {
  const container = elements.attachments;
  if (!container) return;

  container.innerHTML = '';

  if (
    state.attachedFiles.length === 0 &&
    state.attachedUrls.length === 0
  ) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  let html = '<div class="attachments-preview" style="display:flex;gap:8px;flex-wrap:wrap;">';

  // Only show the image itself for images
  if (state.attachedFiles.length > 0) {
    html += '<div class="files-section" style="display:flex;gap:8px;">';
    state.attachedFiles.forEach((item, index) => {
      if (item.isImage && item.base64) {
        html += `
          <div class="attachment-item" style="position:relative;display:inline-block;width:62px;">
            <img src="${item.base64}" alt="${item.file.name}" style="max-width:60px;max-height:60px;border-radius:6px;vertical-align:middle;border:1px solid #e5e7eb;">
            <button onclick="removeAttachment('file', ${index})" class="remove-attachment" style="position:absolute;top:2px;right:2px;background:#fff;border-radius:50%;border:none;width:18px;height:18px;line-height:16px;font-size:14px;cursor:pointer;">×</button>
          </div>
        `;
      } else {
        html += `
          <div class="attachment-item" style="position:relative;display:inline-block;min-width:80px;">
            <span class="attachment-icon">📎</span>
            <span class="attachment-name" style="font-size:12px;">${item.file.name}</span>
            <button onclick="removeAttachment('file', ${index})" class="remove-attachment" style="position:absolute;top:2px;right:2px;background:#fff;border-radius:50%;border:none;width:18px;height:18px;line-height:16px;font-size:14px;cursor:pointer;">×</button>
          </div>
        `;
      }
    });
    html += '</div>';
  }

  // Add URLs preview
  if (state.attachedUrls.length > 0) {
    html += '<div class="urls-section" style="display:flex;gap:8px;">';
    state.attachedUrls.forEach((item, index) => {
      html += `
        <div class="attachment-item" style="position:relative;display:inline-block;min-width:80px;">
          <span class="attachment-icon">🔗</span>
          <span class="attachment-name" style="font-size:12px;">${item.url}</span>
          <button onclick="removeAttachment('url', ${index})" class="remove-attachment" style="position:absolute;top:2px;right:2px;background:#fff;border-radius:50%;border:none;width:18px;height:18px;line-height:16px;font-size:14px;cursor:pointer;">×</button>
        </div>`;
    });
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function removeAttachment(type, index) {
  if (type === 'file') {
    state.attachedFiles.splice(index, 1);
  } else if (type === 'url') {
    state.attachedUrls.splice(index, 1);
  }
  updateAttachmentsPreview();
  updateInputState();
}
window.removeAttachment = removeAttachment;

function renderAttachments(attachments) {
  if (!attachments) return '';

  let html = '';

  if (
    (attachments.files?.length > 0) ||
    (attachments.urls?.length > 0)
  ) {
    html += '<div class="attachments-preview" style="display:flex;gap:8px;flex-wrap:wrap;">';

    if (attachments.files?.length > 0) {
      html += '<div class="files-section" style="display:flex;gap:8px;">';
      attachments.files.forEach(file => {
        if (file.isImage && file.base64) {
          html += `
            <div class="attachment-item" style="display:inline-block;width:62px;">
              <span class="attachment-icon">🖼️</span>
              <img src="${file.base64}" alt="${file.name}" style="max-width:60px;max-height:60px;border-radius:6px;vertical-align:middle;margin-right:2px;border:1px solid #e5e7eb;">
              <span class="attachment-name" style="font-size:12px;">${file.name}</span>
            </div>
          `;
        } else if (file.name) {
          html += `
            <div class="attachment-item" style="display:inline-block;min-width:80px;">
              <span class="attachment-icon">📎</span>
              <span class="attachment-name" style="font-size:12px;">${file.name}</span>
            </div>
          `;
        }
      });
      html += '</div>';
    }

    if (attachments.urls?.length > 0) {
      html += '<div class="urls-section" style="display:flex;gap:8px;">';
      attachments.urls.forEach(url => {
        if (url.url) {
          html += `
            <div class="attachment-item" style="display:inline-block;min-width:80px;">
              <span class="attachment-icon">🔗</span>
              <span class="attachment-name" style="font-size:12px;">${url.url}</span>
            </div>
          `;
        }
      });
      html += '</div>';
    }

    html += '</div>';
  }

  return html;
}

// Update file input to accept images as well
elements.fileInput.setAttribute('accept', '.pdf,.docx,image/png,image/jpeg,image/jpg,image/gif,image/webp,image/bmp');
// Add Options Management
function toggleAddOptions() {
  state.showAddOptions = !state.showAddOptions;
  updateAddOptions();
}

function toggleUrlInput() {
  state.showUrlInput = !state.showUrlInput;
  updateAddOptions();
}

async function toggleEventMode() {
  state.eventMode = !state.eventMode;
  elements.messageInput.placeholder = state.eventMode ? 'Describe your event...' : 'Message...';
  elements.eventBtn.classList.toggle('active', state.eventMode);
  updateAddOptions();
}

function updateAddOptions() {
  elements.addOptions.style.display = state.showAddOptions ? 'block' : 'none';
  elements.urlInputContainer.style.display = state.showUrlInput ? 'flex' : 'none';

  toggleClass(elements.eventBtn, 'active', state.eventMode);
  
}

function groupChatsByDate(chats) {
  const today = [];
  const yesterday = [];
  const lastWeek = [];
  const lastMonth = [];
  const superOld = [];
  const now = new Date();

  chats.forEach(chat => {
    const date = new Date(chat.updatedAt);
    const diffTime = now - date;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      today.push(chat);
    } else if (diffDays === 1) {
      yesterday.push(chat);
    } else if (diffDays < 7) {
      lastWeek.push(chat);
    } else if (diffDays < 30) {
      lastMonth.push(chat);
    } else {
      superOld.push(chat);
    }
  });

  return { today, yesterday, lastWeek, lastMonth, superOld };
}

// --- Sidebar: Remove Fake Values ---
async function loadAndRenderChatList() {
  try {
    const chats = await loadChatList();
    state.chatList = chats;
    const chatListEl = document.getElementById('chatList');
    if (!chatListEl) return; // Fix: don't set innerHTML if element missing
    chatListEl.innerHTML = '';

    const grouped = groupChatsByDate(chats);

    function renderSection(title, arr) {
      if (arr.length === 0) return;
      const section = document.createElement('div');
      section.className = 'chat-section';
      const sectionTitle = document.createElement('div');
      sectionTitle.className = 'chat-section-title';
      sectionTitle.textContent = title;
      section.appendChild(sectionTitle);
      arr.forEach(chat => {
        const chatItem = document.createElement('button');
chatItem.type = 'button';
chatItem.className = 'chat-item';
chatItem.setAttribute('data-chat-id', chat.id);
        if (chat.id === state.currentChatId) chatItem.classList.add('active');
        const isMobile = window.innerWidth < 768;
        chatItem.innerHTML = `
          <div class="chat-item-content">
            <div class="chat-item-header">
              <p class="chat-item-title" contenteditable="${!isMobile}">${chat.title || 'New Chat'}</p>
              <div class="chat-actions">
                <span class="chat-item-timestamp">${formatTimestamp(chat.updatedAt)}</span>
                ${isMobile ? `
                  <button class="edit-chat-btn" title="Edit chat" tabindex="0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19.5 3 21l1.5-4L16.5 3.5z"></path>
                    </svg>
                  </button>
                  <button class="delete-chat-btn" title="Delete chat" tabindex="0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"></path>
                    </svg>
                  </button>
                ` : `
                  <button class="delete-chat-btn" title="Delete chat" tabindex="0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"></path>
                    </svg>
                  </button>
                `}
              </div>
            </div>
            <p class="chat-item-preview">${chat.preview || ''}</p>
          </div>
        `;
        // ...event listeners unchanged...
        section.appendChild(chatItem);
      });
      chatListEl.appendChild(section);
    }

     renderSection('Today', grouped.today);
    renderSection('Yesterday', grouped.yesterday);
    renderSection('Last Week', grouped.lastWeek);
    renderSection('Last 30 Days', grouped.lastMonth);
    renderSection('Super Old Chats', grouped.superOld);

    const now = new Date();
    for (const chat of grouped.superOld) {
      const chatDate = new Date(chat.updatedAt);
      const diffDays = Math.floor((now - chatDate) / (1000 * 60 * 60 * 24));
      if (diffDays > 45) {
        try {
          await deleteChat(chat.id);
          console.log('Deleted super old chat:', chat.id);
        } catch (err) {
          console.error('Failed to auto-delete super old chat:', chat.id, err);
        }
      }
    }
  } catch (error) {
    console.error('Error loading chat list:', error);
  }
}

// Modal logic
function openEditTitleModal(chatId, currentTitle) {
  const modal = document.getElementById('editTitleModal');
  const input = document.getElementById('editTitleInput');
  const renameBtn = document.getElementById('renameTitleBtn');
  const cancelBtn = document.getElementById('cancelEditTitleBtn');
  input.value = currentTitle;
  modal.classList.add('active');
  input.focus();

  function closeModal() {
    modal.classList.remove('active');
    renameBtn.onclick = null;
    cancelBtn.onclick = null;
  }

  renameBtn.onclick = async () => {
    const newTitle = input.value.trim();
    if (newTitle) {
      await updateChatTitle(chatId, newTitle);
      await loadAndRenderChatList();
      closeModal();
    }
  };
  cancelBtn.onclick = closeModal;
}
window.openEditTitleModal = openEditTitleModal;




console.log('Just Chat script loaded successfully!');


// Add the delete handler
window.handleDeleteChat = async function(chatId) {
  try {
    await deleteChat(chatId);
    await loadAndRenderChatList();
    // Only clear currentChatId and messages if the deleted chat was active
    if (state.currentChatId === chatId) {
      state.currentChatId = null;
      state.messages = [];
      renderMessages();
      updateInputState();
    }
  } catch (error) {
    console.error('Error deleting chat:', error);
    showToast('Failed to delete chat', 'error');
  }
};


// Helper function to format timestamp
function formatTimestamp(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
  return date.toLocaleDateString();
}

// Update new chat function
async function newChat() {
  // Do NOT create a chat in Firebase yet!
  state.currentChatId = null;
  state.messages = [];
  state.attachedFiles = [];
  state.attachedUrls = [];
  state.showAddOptions = false;
  state.showUrlInput = false;
  state.eventMode = false;

  renderMessages();
  updateInputState();
  // Do NOT call loadAndRenderChatList() here, since no new chat is created yet
}

// Update select chat function
async function selectChat(chatId) {
  try {
    const messages = await loadChat(chatId);
    state.currentChatId = chatId;
    state.messages = messages;
    
    document.querySelectorAll('.chat-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-chat-id="${chatId}"]`)?.classList.add('active');
    
    renderMessages();
    updateInputState();
  } catch (error) {
    console.error('Error loading chat:', error);
    showToast('Error', 'Failed to load chat', 'error');
  }
}

function handleQuickAction(prompt) {
  elements.messageInput.value = prompt;
  updateInputState();
  
  // Auto-send the message
  setTimeout(() => {
    handleSendMessage(new Event('submit'));
  }, 100);
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
} `;
  document.head.appendChild(style);
}

// --- Sidebar State ---
let sidebarOpen = false; // Always false on load (collapsed)
let feedbackFormOpen = false;
let sidebarSection = 'collapsed'; // Only use this for sidebar state

function showSidebarSection(section) {
  sidebarSection = section;
  const collapsed = document.getElementById('collapsedSidebarActions');
  const chat = document.getElementById('chatSidebarContent');
  const nav = document.getElementById('navSidebarContent');
  if (!collapsed || !chat || !nav) return;

  if (section === 'collapsed') {
    collapsed.style.display = '';
    chat.style.display = 'none';
    nav.style.display = 'none';
    elements.sidebar.classList.add('collapsed');
    elements.sidebar.classList.remove('expanded');
    elements.sidebar.style.width = window.innerWidth < 768 ? '0' : '64px';
    elements.sidebar.style.left = window.innerWidth < 768 ? '-90vw' : '0';
  } else if (section === 'chat') {
    collapsed.style.display = 'none';
    chat.style.display = '';
    nav.style.display = 'none';
    elements.sidebar.classList.add('expanded');
    elements.sidebar.classList.remove('collapsed');
    elements.sidebar.style.width = window.innerWidth < 768 ? '90vw' : '320px';
    elements.sidebar.style.left = '0';
    // Always load chat list when opening chat sidebar
    loadAndRenderChatList();
  } else if (section === 'nav') {
    collapsed.style.display = 'none';
    chat.style.display = 'none';
    nav.style.display = '';
    elements.sidebar.classList.add('expanded');
    elements.sidebar.classList.remove('collapsed');
    elements.sidebar.style.width = window.innerWidth < 768 ? '90vw' : '320px';
    elements.sidebar.style.left = '0';
    renderNavSidebarContent(); // <--- add this line
  }
}

document.getElementById('navSidebarBtn').onclick = () => showSidebarSection('nav');
document.getElementById('chatSidebarBtn').onclick = () => showSidebarSection('chat');
if (elements.sidebarToggle) {
  elements.sidebarToggle.onclick = () => showSidebarSection('collapsed');
}
if (elements.mobileSidebarToggle) {
  elements.mobileSidebarToggle.onclick = () => {
    const sidebar = elements.sidebar;
    const isCollapsed = sidebar.classList.contains('collapsed');
    if (isCollapsed) {
      sidebar.classList.remove('collapsed');
      sidebar.classList.add('expanded');
      sidebar.style.left = '0';
      sidebar.style.width = '90vw';
      elements.mobileOverlay.classList.add('active');
      showSidebarSection('collapsed');
    } else {
      sidebar.classList.remove('expanded');
      sidebar.classList.add('collapsed');
      sidebar.style.left = '-90vw';
      sidebar.style.width = '0';
      elements.mobileOverlay.classList.remove('active');
      showSidebarSection('collapsed');
    }
  };
}
if (elements.mobileOverlay) {
  elements.mobileOverlay.onclick = () => {
    elements.sidebar.classList.remove('expanded');
    elements.sidebar.classList.add('collapsed');
    elements.sidebar.style.width = '';
    elements.sidebar.style.left = '';
    elements.mobileOverlay.classList.remove('active');
    showSidebarSection('collapsed');
  };
}

const mobileSidebarMenu = document.getElementById('mobileSidebarMenu');
const navSidebarBtnMobile = document.getElementById('navSidebarBtnMobile');
const chatSidebarBtnMobile = document.getElementById('chatSidebarBtnMobile');

// Hamburger click: show mobile sidebar menu and overlay
elements.mobileSidebarToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  if (window.innerWidth < 768) {
    mobileSidebarMenu.style.display = 'flex';
    elements.mobileOverlay.classList.add('active');
  }
});

// Overlay click: hide mobile sidebar menu and overlay
elements.mobileOverlay.addEventListener('click', () => {
  mobileSidebarMenu.style.display = 'none';
  elements.mobileOverlay.classList.remove('active');
});

// Navigation button: open nav sidebar, hide menu
navSidebarBtnMobile.addEventListener('click', () => {
  mobileSidebarMenu.style.display = 'none';
  elements.mobileOverlay.classList.add('active');
  showSidebarSection('nav');
  elements.sidebar.classList.add('expanded');
  elements.sidebar.classList.remove('collapsed');
  elements.sidebar.style.left = '0';
  elements.sidebar.style.width = '90vw';
});

// Chat button: open chat sidebar, hide menu
chatSidebarBtnMobile.addEventListener('click', () => {
  mobileSidebarMenu.style.display = 'none';
  elements.mobileOverlay.classList.add('active');
  showSidebarSection('chat');
  elements.sidebar.classList.add('expanded');
  elements.sidebar.classList.remove('collapsed');
  elements.sidebar.style.left = '0';
  elements.sidebar.style.width = '90vw';
});

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

function renderNavSidebarContent() {
  const navSidebar = document.getElementById('navSidebarContent');
  if (!navSidebar) return;

  // Set active section to "Just Chat"
  const activeSection = 'Just Chat';

  // Navigation items
const navigationItems = [
  { name: 'Calendar', path: '/Calendar/Calendar.html', icon: 'calendar' },
  { name: 'Just Chat', path: '/Just_Chat/Just_Chat.html', icon: 'message-circle' },
  { name: 'Responses', path: '/responses_centre/Responses.html', icon: 'responses' },
  { name: 'Doc Live', path: '/DocLive/documentHub.html', icon: 'doclive' },
  { name: 'Help', path: '../help', icon: 'help' },
  { name: 'Feedback', path: '#', icon: 'message-square' }
];

  // Build navigation HTML
  let html = `
    <div style="display:flex;flex-direction:column;height:100vh;min-height:100vh;max-height:100vh;width:100%;box-sizing:border-box;
    background: var(--sidebar-bg-dark);
    border-right: 1px solid var(--sidebar-border-dark);
    color: var(--sidebar-text-dark);
    transition: background 0.2s, color 0.2s, border 0.2s;
    position:relative;">
      <button id="navSidebarCloseBtn" style="position:absolute;top:18px;right:18px;z-index:10;background:none;border:none;color:#fff;font-size:22px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div style="padding:24px 24px 0 24px;flex-shrink:0;">
        <h2 style="font-size:20px;font-weight:700;margin-bottom:1.5em;background:linear-gradient(to right, rgb(96 165 250), rgb(168 85 247));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Navigator</h2>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:0;padding:0 24px;overflow-y:auto;">
        ${navigationItems
          .filter(item => item.name !== 'Feedback')
          .map(item => {
            const isActive = item.name === activeSection;
            return `
              <a href="${item.path}" style="
                width:100%;display:flex;align-items:center;gap:12px;padding:12px;border-radius:8px;
                transition:all 0.2s;border:none;cursor:pointer;background:${isActive ? 'linear-gradient(to right, rgba(37, 99, 235, 0.2), rgba(147, 51, 234, 0.2))' : 'none'};
                border:${isActive ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent'};
                color:${isActive ? 'rgb(147 197 253)' : 'rgb(148 163 184)'};
                font-weight:500;font-size:15px;text-decoration:none;justify-content:flex-start;
              " onmouseover="this.style.background='rgba(71,85,105,0.5)';this.style.color='white';"
                onmouseout="this.style.background='${isActive ? 'linear-gradient(to right, rgba(37, 99, 235, 0.2), rgba(147, 51, 234, 0.2))' : 'none'}';this.style.color='${isActive ? 'rgb(147 197 253)' : 'rgb(148 163 184)'}';">
                ${createIcon(item.icon, 20)}
                <span>${item.name}</span>
                <span style="margin-left:auto;opacity:0.5;">${createIcon('chevron-right', 16)}</span>
              </a>
            `;
          })
          .join('')}
        <button id="navSidebarFeedbackBtn" style="
          width:100%;border-radius:8px;padding:12px;margin-top:16px;
          background:linear-gradient(90deg,#2563eb 0%,#a855f7 100%);
          border:2px dashed rgba(59,130,246,0.7);color:white;cursor:pointer;
          font-weight:600;font-size:15px;display:flex;align-items:center;gap:12px;justify-content:flex-start;box-shadow:0 4px 24px 0 rgba(59,130,246,0.15);transition:all 0.2s;position:relative;overflow:hidden;
        ">
          ${createIcon('message-square', 20)}
          <span>Feedback</span>
        </button>
        <div id="navSidebarFeedbackFormContainer"></div>
      </div>
      <div style="padding:16px;border-top:1px solid rgba(71,85,105,0.5);flex-shrink:0;">
        <button id="navSidebarUserBtn" style="
          width:100%;display:flex;align-items:center;gap:12px;padding:12px;border-radius:8px;transition:all 0.2s;border:none;cursor:pointer;background:none;color:rgb(148 163 184);justify-content:flex-start;
        " onmouseover="this.style.background='rgba(71,85,105,0.5)';this.style.color='white';"
          onmouseout="this.style.background='none';this.style.color='rgb(148 163 184)';">
          <div style="
            width:32px;height:32px;min-width:32px;min-height:32px;max-width:32px;max-height:32px;
            border-radius:50%;background:linear-gradient(to right, rgb(59 130 246), rgb(147 51 234));
            display:flex;align-items:center;justify-content:center;transition:all 0.2s;overflow:hidden;
          ">
            ${createIcon('user', 16)}
          </div>
          <div style="flex:1;text-align:left;" id="navSidebarUserInfo">
  <p style="font-weight:500;margin:0;font-size:14px;"></p>
  <p style="font-size:12px;color:rgb(148 163 184);margin:0;"></p>
</div>
        </button>
      </div>
    </div>
  `;
loadUserSettings().then(settings => {
    const userName = settings?.name || '';
    const userPlan = PLAN_LIMITS[settings?.plan]?.planName || '';
    const infoDiv = document.getElementById('navSidebarUserInfo');
    if (infoDiv) {
      infoDiv.innerHTML = `
        <p style="font-weight:500;margin:0;font-size:14px;">${userName}</p>
        <p style="font-size:12px;color:rgb(148 163 184);margin:0;">${userPlan}</p>
      `;
    }
  });
  navSidebar.innerHTML = html;

  // Add close button logic
  const navSidebarCloseBtn = document.getElementById('navSidebarCloseBtn');
  if (navSidebarCloseBtn) {
    navSidebarCloseBtn.onclick = () => {
      elements.sidebar.classList.remove('expanded');
      elements.sidebar.classList.add('collapsed');
      elements.sidebar.style.left = '-90vw';
      elements.sidebar.style.width = '0';
      elements.mobileOverlay.classList.remove('active');
      showSidebarSection('collapsed');
    };
  }

  // Feedback form logic
document.getElementById('navSidebarFeedbackBtn').onclick = () => {
  if (window.innerWidth < 768) {
    // On mobile: show modal
    const modal = createMobileFeedbackModal();
    document.body.appendChild(modal);
    return;
  }
  // On desktop/tablet: show inline feedback form as before
  const container = document.getElementById('navSidebarFeedbackFormContainer');
  if (container.innerHTML) {
    container.innerHTML = '';
    navSidebar.scrollTop = 0; // Reset scroll
    return;
  }
  container.innerHTML = `
    <div style="background:#1e293b;border:1px solid rgba(59,130,246,0.3);border-radius:12px;padding:16px;margin-top:8px;margin-bottom:8px;display:flex;flex-direction:column;gap:12px;animation:fadeIn 0.2s;">
      <label style="color:white;font-weight:500;font-size:14px;">Type</label>
      <select id="sidebarFeedbackType" class="sidebar-feedback-select">
        <option value="bug">Report Bug</option>
        <option value="feedback">General Feedback</option>
        <option value="feature">Suggest Feature</option>
      </select>
      <label style="color:white;font-weight:500;font-size:14px;">Message</label>
      <textarea id="sidebarFeedbackText" rows="3" style="padding:8px;border-radius:6px;border:1px solid #64748b;background:#1e293b;color:white;resize:vertical;"></textarea>
      <button id="sidebarFeedbackSend" style="background:rgb(37 99 235);color:white;border:none;border-radius:8px;padding:10px;font-weight:600;cursor:pointer;margin-top:4px;">
        Send Feedback
      </button>
      <div id="sidebarFeedbackMsg" style="color:rgb(34 197 94);font-size:13px;margin-top:4px;display:none;"></div>
    </div>
  `;
  const select = document.getElementById('sidebarFeedbackType');
  function updateSelectBg() {
    if (select.value === 'bug') select.style.background = '#ef4444';
    else if (select.value === 'feedback') select.style.background = '#2563eb';
    else if (select.value === 'feature') select.style.background = '#a855f7';
    select.style.color = '#fff';
  }
  select.addEventListener('change', updateSelectBg);
  updateSelectBg();
  document.getElementById('sidebarFeedbackSend').onclick = async () => {
    const type = document.getElementById('sidebarFeedbackType').value;
    const text = document.getElementById('sidebarFeedbackText').value.trim();
    const msgDiv = document.getElementById('sidebarFeedbackMsg');
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
      document.getElementById('sidebarFeedbackText').value = '';
      setTimeout(() => {
        msgDiv.style.display = 'none';
      }, 2000);
    } catch (err) {
      msgDiv.style.display = 'block';
      msgDiv.style.color = 'rgb(239 68 68)';
      msgDiv.textContent = 'Failed to send feedback.';
    }
  };
  setTimeout(() => {
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);
};


  // User profile button logic (open settings modal)
  document.getElementById('navSidebarUserBtn').onclick = () => {
    window.dispatchEvent(new CustomEvent('openSettingsModal'));
  };
}

elements.themeToggle.onclick = (e) => {
  e.stopPropagation();
  toggleTheme();
};


function renderPlanCard(modalContent, settings) {
  const s = settings || {};
  const planKey = s.plan || 'free';
  const plan = PLAN_LIMITS[planKey] || PLAN_LIMITS.free;
  const planName = plan.planName || 'Free';
  const planCardContainer = modalContent.querySelector('#planCardContainer');

  const planClass = planKey === 'pro' ? 'pro' : planKey === 'basic' ? 'basic' : 'free';
  const keys = Object.keys(plan).filter(k => typeof plan[k] === 'number' && plan[k] > 0);
  const usageHtml = keys.map(k => {
    const todayStr = new Date().toISOString().slice(0, 10);
const usageToday = (s.usageByDate && s.usageByDate[todayStr]) || {};
const used = usageToday[k] != null ? usageToday[k] : (s.usage && s.usage[k]) || 0;
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


// --- Settings Modal (with Firebase save/load) ---
function renderSettingsModal() {
  const modal = document.createElement('div');
  modal.id = 'settingsModal'; // Set ID before appending
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
  modalContent.style.cssText = `
    background: rgb(30 41 59);
    border-radius: 12px;
    border: 1px solid rgba(71, 85, 105, 0.5);
    width: 100%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
  `;

  // Set modal content HTML first
    // Set modal content HTML first
  modalContent.innerHTML = `
    <div style="padding: 24px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
        <h2 style="font-size: 20px; font-weight: 600; margin: 0; color: white;">Settings</h2>
        <button id="closeSettings" style="padding: 8px; border-radius: 8px; background: none; border: none; color: white; cursor: pointer; transition: background-color 0.2s;">
          ${createIcon('x', 20)}
        </button>
      </div>
      <form id="settingsForm" style="display: flex; flex-direction: column; gap: 24px;">
      
        <!-- Profile Section -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
  <h3 style="font-size: 18px; font-weight: 500; display: flex; align-items: center; gap: 8px; margin: 0; color: white;">
    ${createIcon('user', 20)}
    Profile
  </h3>
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <div>
      <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 4px; color: white;">Name</label>
      <input id="settingsName" type="text" value="" style="width: 100%; padding: 12px; background: rgba(71, 85, 105, 0.5); border: 1px solid rgba(100, 116, 139, 0.5); border-radius: 8px; color: white; font-size: 14px; box-sizing: border-box;">
      <div style="margin-top:10px;">
  <label style="display:block;font-size:13px;color:#cbd5e1;margin-bottom:6px;font-weight:600;">
    Billing currency
  </label>
  <select id="currency-selector-select" style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(100,116,139,0.5);background:#0f1724;color:white;font-weight:600;">
    <option value="GBP">GBP — British Pound</option>
    <option value="EUR">EUR — Euro</option>
    <option value="USD">USD — US Dollar</option>
  </select>
  <div style="font-size:12px;color:#93c5fd;margin-top:6px;">Auto-detected currency shown by default. Pick a currency to override it.</div>
</div>
    </div>
  </div>
</div>
        <!-- Subscription Section -->
        <div id="planCardContainer"></div>
  <div id="planChooserContainer" style="display:none;"></div>
  <p id="nextBillingText" style="color:#9fb0db;font-size:13px;margin-top:8px;"></p>

        <div id="planChooserContainer" style="display:none;"></div>
        <!-- Notifications Section -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <h3 style="font-size: 18px; font-weight: 500; display: flex; align-items: center; gap: 8px; margin: 0; color: white;">
            ${createIcon('bell', 20)}
            Notifications
          </h3>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="color: white;">Notification Permission</span>
              <label style="position: relative; display: inline-flex; align-items: center; cursor: pointer;">
                <input id="settingsPushNotif" type="checkbox" style="position: absolute; opacity: 0; width: 0; height: 0;">
                <div class="toggle-bg" style="width: 44px; height: 24px; background: rgb(100 116 139); border-radius: 12px; position: relative; transition: background-color 0.2s;">
                  <div class="toggle-dot" style="width: 20px; height: 20px; background: white; border-radius: 50%; position: absolute; top: 2px; left: 2px; transition: transform 0.2s;"></div>
                </div>
              </label>
            </div>
            
          </div>
        </div>
        
        <!-- Action Buttons -->
        <div style="display: flex; gap: 12px; padding-top: 16px;">
          <button type="submit" style="flex: 1; background: rgb(37 99 235); color: white; padding: 12px; border-radius: 8px; font-weight: 500; transition: background-color 0.2s; border: none; cursor: pointer;">
            Save Changes
          </button>
          <button id="cancelSettings" type="button" style="flex: 1; background: rgb(71 85 105); color: white; padding: 12px; border-radius: 8px; font-weight: 500; transition: background-color 0.2s; border: none; cursor: pointer;">
            Cancel
          </button>
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
        <button id="logoutBtn" type="button" style="background: #ef4444; color: white; padding: 12px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; margin-top: 18px;">
          Log Out
        </button>
      </form>
    </div>
  `;

  // Now add the loading overlay (AFTER setting innerHTML)
  const loadingOverlay = document.createElement('div');
  loadingOverlay.style.cssText = `
    position: absolute;
    inset: 0;
    background: rgba(30,41,59,0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    transition: opacity 0.2s;
  `;
  loadingOverlay.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
      <div class="loader" style="border: 4px solid #64748b; border-top: 4px solid #38bdf8; border-radius: 50%; width: 38px; height: 38px; animation: spin 1s linear infinite;"></div>
      <span style="color:#dbeafe;font-size:15px;">Loading...</span>
    </div>
    <style>
      @keyframes spin { 100% { transform: rotate(360deg); } }
    </style>
  `;
  modalContent.appendChild(loadingOverlay);

  // Show loader until data is fetched
  loadingOverlay.style.display = 'flex';

  // --- LOGOUT HANDLER ---
  const logoutBtn = modalContent.querySelector('#logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await auth.signOut();
      window.location.href = 'signup.html';
    });
  }

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
      window.location.href = '../Login/signup.html';
    } catch (err) {
      console.error('Failed to delete account:', err);
      alert('Failed to delete account. Please try again.');
    }
  };
}

  // --- LOAD USER SETTINGS ---
loadUserSettings().then(async data => {
  const settings = data || {};
  initCurrencySelector(modalContent);
  updatePlanPrices(modalContent);
  modalContent.querySelector('#settingsName').value = settings.name || '';
  modalContent.querySelector('#settingsPushNotif').checked = !!settings.pushNotifications;

  renderPlanCard(modalContent, settings);

  // Wait for billing info and plan card to be fully loaded
  await cleanupStalePending(auth?.currentUser?.uid);
  await fetchBillingInfoOnce();

  // Optionally, reload plan card with latest settings after billing info
  const latestSettings = await loadUserSettings();
  renderPlanCard(modalContent, latestSettings || {});

  // Now hide loader overlay
  loadingOverlay.style.opacity = '0';
  setTimeout(() => { loadingOverlay.style.display = 'none'; }, 200);
  updateAllToggleVisuals();
}).catch(() => {
  loadingOverlay.innerHTML = `<span style="color:#f87171;">Failed to load settings.</span>`;
});

  // Update toggle visuals
function updateAllToggleVisuals() {
  document.querySelectorAll('label').forEach(label => {
    const checkbox = label.querySelector('input[type="checkbox"]');
    const toggleBg = label.querySelector('.toggle-bg');
    const toggleDot = label.querySelector('.toggle-dot');

    if (!checkbox || !toggleBg || !toggleDot) return;

    // update single toggle UI based on checkbox state
    const updateToggle = () => {
      if (checkbox.checked) {
        toggleBg.style.background = 'rgb(37 99 235)'; // on
        toggleDot.style.transform = 'translateX(20px)';
      } else {
        toggleBg.style.background = 'rgb(100 116 139)'; // off
        toggleDot.style.transform = 'translateX(0)';
      }
    };

    // initialize UI
    updateToggle();

    checkbox.addEventListener('change', updateToggle);
  });
}

  // Save/cancel/close handlers
  modalContent.querySelector('#closeSettings').onclick = hideSettingsModal;
  modalContent.querySelector('#cancelSettings').onclick = hideSettingsModal;

modalContent.querySelector('#settingsForm').onsubmit = async (e) => {
  e.preventDefault();
  const prevSettings = await loadUserSettings();

  const name = modalContent.querySelector('#settingsName').value.trim();
  
  const pushNotifications = modalContent.querySelector('#settingsPushNotif').checked;
  
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; // Get current timezone

  await saveUserSettings({
    ...prevSettings,
    name,
    pushNotifications,
    timezone // Only update timezone if changed
    // Do NOT update usage or tutorialSeen here
  });
  hideSettingsModal();
}

  // Append modal content to modal
  modal.appendChild(modalContent);

  // Remove any existing modal before adding a new one
  document.getElementById('settingsModal')?.remove();

  // Append modal to body
  document.body.appendChild(modal);
  fetchBillingInfoOnce()
  .catch(err => console.warn('billing fetch failed', err))
  .then(async () => {
    // After billing info is fetched and user doc is updated, reload settings and re-render plan card
    const latestSettings = await loadUserSettings();
    renderPlanCard(document.getElementById('settingsModal'), latestSettings || {});
  });fetchBillingInfoOnce();
}

function showSettingsModal() {
  renderSettingsModal();
  document.getElementById('settingsModal').style.display = 'flex';
}
function hideSettingsModal() {
  document.getElementById('settingsModal')?.remove();
}

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

      // Card content
      let cardContent = `
        <div class="pm-plan-title">
          ${plan.planName}
          ${planKey === settings.plan ? `<span class="pm-plan-badge">Current</span>` : ''}
        </div>
        <div id="price-label-${planKey}" class="pm-plan-price">${planKey !== 'free' ? getPriceLabel(planKey) + "/mo" : 'Free'}</div>

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
        <div style="font-weight:700;font-size:15px;margin-bottom:4px;color:#fff;">${section.title}</div>
        <ul style="margin:0 0 0 18px;padding:0;">`;
      sectionKeys.forEach(k => {
        const val = plan[k];
        let usageStr = '';
        if (usage && typeof usage[k] === 'number') {
          usageStr = ` <span style="color:#a5b4fc;font-size:13px;">(used: ${usage[k]} / ${val})</span>`;
        }
        html += `<li>${LIMIT_LABELS[k] || k}: <b>${val}</b>${usageStr}</li>`;
      });
      html += `</ul></div>`;
    });
    return html;
  }

  renderCards();
  chooserContainer.appendChild(grid);

  // Back button logic
  header.querySelector('#chooser-back').onclick = () => {
    chooserContainer.style.display = 'none';
    planCardContainer.style.display = '';
  };
}


// --- Collapsed Sidebar (shows chat/nav buttons) ---
function showCollapsedSidebar() {
  const sidebar = elements.sidebar;
  sidebar.classList.remove('expanded');
  sidebar.classList.add('collapsed');
  sidebar.style.width = window.innerWidth < 768 ? '0' : '64px';
  sidebar.style.left = window.innerWidth < 768 ? '-90vw' : '0';
  showSidebarSection('collapsed');
}



// Listen for theme changes to update icon color
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', showCollapsedSidebar);
document.addEventListener('DOMContentLoaded', () => {
  if (elements.sidebar) {
    // Update icons if theme toggled
    const observer = new MutationObserver(showCollapsedSidebar);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
});

function showChatSidebar() {
  const sidebar = elements.sidebar;
  sidebar.classList.add('expanded');
  sidebar.classList.remove('collapsed');
  sidebar.style.width = window.innerWidth < 768 ? '90vw' : '320px';
  sidebar.style.left = '0';
  showSidebarSection('chat');
}

function showNavSidebar() {
  const sidebar = elements.sidebar;
  sidebar.classList.add('expanded');
  sidebar.classList.remove('collapsed');
  sidebar.style.width = window.innerWidth < 768 ? '90vw' : '320px';
  sidebar.style.left = '0';
  showSidebarSection('nav');
}

document.getElementById('navSidebarBtn').onclick = showNavSidebar;
document.getElementById('chatSidebarBtn').onclick = showChatSidebar;


async function toggleReasoningMode() {
  state.reasoningMode = !state.reasoningMode;
  elements.messageInput.placeholder = state.reasoningMode ? 'Ask for deep reasoning...' : 'Message...';
  elements.reasoningToggleBtn.classList.toggle('active', state.reasoningMode);

  // Add/remove golden border for input container
  if (state.reasoningMode) {
    elements.inputContainer.classList.add('reasoning-active');
  } else {
    elements.inputContainer.classList.remove('reasoning-active');
  }

  updateAddOptions();
}



// Event Listeners
function initializeEventListeners() {
  // Sidebar toggles
elements.mobileSidebarToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  // Show sidebar as expanded, but only show collapsed actions
  elements.sidebar.classList.remove('collapsed');
  elements.sidebar.classList.add('expanded');
  elements.mobileOverlay.classList.add('active');
  // Only show collapsed actions, hide chat/nav content
  document.getElementById('collapsedSidebarActions').style.display = '';
  document.getElementById('chatSidebarContent').style.display = 'none';
  document.getElementById('navSidebarContent').style.display = 'none';
});

const mobileSidebarCloseBtn = document.getElementById('mobileSidebarCloseBtn');
function updateMobileSidebarCloseBtn() {
  if (window.innerWidth < 768) {
    mobileSidebarCloseBtn.style.display = 'inline-flex';
  } else {
    mobileSidebarCloseBtn.style.display = 'none';
  }
}
window.addEventListener('resize', updateMobileSidebarCloseBtn);
updateMobileSidebarCloseBtn();

if (mobileSidebarCloseBtn) {
  mobileSidebarCloseBtn.onclick = () => {
    elements.sidebar.classList.remove('expanded');
    elements.sidebar.classList.add('collapsed');
    elements.sidebar.style.left = '-90vw';
    elements.sidebar.style.width = '0';
    elements.mobileOverlay.classList.remove('active');
    showSidebarSection('collapsed');
  };
}
  // Update new chat button handlers
  elements.newChatBtn.addEventListener('click', newChat);
  elements.mobileNewChat.addEventListener('click', newChat);
  
 
  
  // Chat selection
  if (elements.chatList) {
    elements.chatList.addEventListener('click', async (e) => {
      const chatItem = e.target.closest('.chat-item');
      const deleteBtn = e.target.closest('.delete-chat-btn');
      const editBtn = e.target.closest('.edit-chat-btn');
      if (deleteBtn && chatItem) {
        e.stopPropagation();
        e.preventDefault();
        const chatId = chatItem.dataset.chatId;
        if (chatId) {
          await window.handleDeleteChat(chatId);
        }
        return;
      }
      if (editBtn && chatItem) {
        e.stopPropagation();
        e.preventDefault();
        const chatId = chatItem.dataset.chatId;
        const titleEl = chatItem.querySelector('.chat-item-title');
        const currentTitle = titleEl ? titleEl.textContent : '';
        window.openEditTitleModal(chatId, currentTitle);
        return;
      }
      if (chatItem && !deleteBtn && !editBtn) {
        const chatId = chatItem.dataset.chatId;
        await selectChat(chatId);
      }
    });
  }
  
  // Quick actions
  document.addEventListener('click', (e) => {
  const quickAction = e.target.closest('.quick-action-card');
  if (!quickAction) return;
  const action = quickAction.dataset.action;
  if (action === 'multi-day-plan') {
    // Set event mode and prefill input for multi-day plan
    state.eventMode = true;
    elements.eventBtn.classList.add('active');
    elements.messageInput.value = "I want to create a multi day plan for my task: ";
    elements.messageInput.placeholder = "Describe your task and days needed...";
    elements.messageInput.focus();
    updateInputState();
  } else if (action === 'add-event') {
    // Set event mode and prefill input for add event
    state.eventMode = true;
    elements.eventBtn.classList.add('active');
    elements.messageInput.value = "I'd like to add an event: ";
    elements.messageInput.placeholder = "Describe your event...";
    elements.messageInput.focus();
    updateInputState();
  } else if (action === 'wanna-talk') {
    // Normal chat mode
    state.eventMode = false;
    elements.eventBtn.classList.remove('active');
    elements.messageInput.value = "Let's chat!";
    elements.messageInput.placeholder = "Type your message...";
    elements.messageInput.focus();
    updateInputState();
  } else if (action === 'something-else') {
    // Normal chat mode, open-ended
    state.eventMode = false;
    elements.eventBtn.classList.remove('active');
    elements.messageInput.value = "I have another idea: ";
    elements.messageInput.placeholder = "Describe your idea or question...";
    elements.messageInput.focus();
    updateInputState();
  }
});
  
  // Input form
// Update form submission handler
  elements.inputForm.removeEventListener('submit', handleSendMessage);
  elements.inputForm.addEventListener('submit', handleSendMessage);
  // Update enter key handler for message input
  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !state.isTyping) {
      e.preventDefault();
      handleSendMessage(e);
    }
  });
  elements.messageInput.addEventListener('input', updateInputState);
  elements.messageInput.addEventListener('focus', () => {
    state.isFocused = true;
    updateInputState();
  });
  elements.messageInput.addEventListener('blur', () => {
    state.isFocused = false;
    updateInputState();
  });
  
  // Input controls
  elements.addBtn.addEventListener('click', toggleAddOptions);
  elements.fileBtn.addEventListener('click', handleFileUpload);
  elements.urlBtn.addEventListener('click', toggleUrlInput);
  elements.eventBtn.addEventListener('click', toggleEventMode);
  elements.addUrlBtn.addEventListener('click', handleAddUrl);
  elements.fileInput.addEventListener('change', handleFileSelect);
  
  // URL input enter key
  elements.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleAddUrl();
    }
  });
  
  // Message input enter key
  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  });
  
  // Window resize
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      elements.mobileOverlay.classList.remove('active');
      if (state.sidebarExpanded) {
        elements.sidebar.classList.remove('expanded');
        state.sidebarExpanded = false;
      }
    }
  });
}

// Global functions for inline event handlers
window.removeAttachment = removeAttachment;
window.selectChat = selectChat;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  showSidebarSection('collapsed');
  initializeTheme();
  initializeEventListeners();
  renderMessages();
  updateInputState();
});