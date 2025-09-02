// frontend/pwa.js - improved / debug-friendly version
(function () {
  "use strict";
  console.log("pwa.js loaded (improved)");

  // ---------- Config ----------
  // If true, show the install UI even when browser says the app is already installed.
  const ALWAYS_SHOW_INSTALL = true;

  // ---------- Helpers ----------
  const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isStandalone = () =>
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

  function showLoadingOverlay() {
    const loadingOverlay = document.getElementById("pwa-loading-overlay");
    if (loadingOverlay) {
      loadingOverlay.style.display = "flex";
      // small timeout to ensure transition applies
      setTimeout(() => (loadingOverlay.style.opacity = "1"), 10);
    }
  }

  function hideLoadingOverlay() {
    const loadingOverlay = document.getElementById("pwa-loading-overlay");
    if (loadingOverlay) {
      loadingOverlay.style.opacity = "0";
      setTimeout(() => {
        loadingOverlay.style.display = "none";
      }, 300);
    }
  }

  // ---------- Small UI helpers (will be wired to DOM elements) ----------
  let installSection = null;
  let installBtn = null;
  let installInfo = null;

  function showInstallUI(message) {
    if (!installSection) return;
    installSection.style.display = "flex";
    if (installInfo && message) installInfo.textContent = message;
  }
  function hideInstallUI() {
    if (!installSection) return;
    installSection.style.display = "none";
  }
  function showLoadingMsg(message) {
    if (installInfo) installInfo.textContent = message || "Please wait...";
  }
  function showDoneMsg(message) {
    if (installInfo) installInfo.textContent = message || "Installed.";
  }

  // ---------- Manifest / SW path detection ----------
  function detectSwPaths() {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    let baseUrl;
    if (manifestLink && manifestLink.href) {
      baseUrl = manifestLink.href;
      console.log("Found manifest link:", baseUrl);
    } else {
      // fallback: script src or location
      let scriptUrl = (document.currentScript && document.currentScript.src) || null;
      if (!scriptUrl) {
        const scripts = document.getElementsByTagName("script");
        for (let i = 0; i < scripts.length; i++) {
          const s = scripts[i];
          if (s.src && s.src.endsWith("/pwa.js")) {
            scriptUrl = s.src;
            break;
          }
        }
      }
      scriptUrl = scriptUrl || location.href;
      baseUrl = scriptUrl;
      console.warn("Manifest not found; falling back to script/page location:", baseUrl);
    }

    const swUrl = new URL("service-worker.js", baseUrl).href;
    const swScopePath = new URL("./", baseUrl).pathname;
    const swScope = swScopePath.endsWith("/") ? swScopePath : swScopePath + "/";
    return { swUrl, swScope, manifestHref: manifestLink ? manifestLink.href : null };
  }

  async function getStartUrlFromManifest(manifestHref) {
    try {
      if (!manifestHref) throw new Error("No manifest href");
      const resp = await fetch(manifestHref, { cache: "no-store" });
      if (!resp.ok) throw new Error("Manifest fetch failed: " + resp.status);
      const m = await resp.json();
      const start = m.start_url || "./";
      const resolved = new URL(start, manifestHref).href;
      console.log("Resolved start_url:", resolved);
      return resolved;
    } catch (err) {
      console.warn("Could not read start_url from manifest:", err);
      // fallback - assume signup page parent
      return new URL("./Login/signup.html", location.href).href;
    }
  }

  // ---------- Service worker register (kept, with extra logging) ----------
  function registerServiceWorker(swUrl, swScope) {
    if (!("serviceWorker" in navigator)) {
      console.log("Service Worker unsupported in this browser.");
      return;
    }
    console.log("Registering service worker at", swUrl, "with scope", swScope);
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(swUrl, { scope: swScope })
        .then(reg => {
          console.log("Service Worker registered:", reg.scope, reg);
        })
        .catch(err => {
          console.warn("Service Worker registration failed:", err);
        });
    });
  }

  // ---------- Install flow ----------
  let deferredPrompt = null;
  let startUrlFromManifest = null;

  function attachInstallButtonHandlers() {
    if (!installBtn) return;
    installBtn.addEventListener("click", async () => {
      console.log("Install button clicked (deferredPrompt present?):", !!deferredPrompt);

      // If app already appears as standalone, optionally act as "Open app"
      if (isStandalone()) {
        console.log("App is running in standalone mode.");
        // if startUrlFromManifest available, open it; else just show installed message
        if (startUrlFromManifest) {
          window.location.href = startUrlFromManifest;
          return;
        } else {
          showDoneMsg("App already installed - opening...");
          return;
        }
      }

      if (deferredPrompt) {
        try {
          showLoadingOverlay();
          // prompt
          deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          deferredPrompt = null;

          if (choice && choice.outcome === "accepted") {
            showDoneMsg("Thanks! Installation started.");
            // navigate to start_url after a small delay so animation completes
            const start = startUrlFromManifest || (await getStartUrlFromManifest(detectSwPaths().manifestHref));
            setTimeout(() => (window.location.href = start), 1000);
          } else {
            hideLoadingOverlay();
            showInstallUI("Installation cancelled. You can try again later.");
          }
        } catch (err) {
          console.error("Install prompt error:", err);
          hideLoadingOverlay();
          showInstallUI("Installation failed. Please try again.");
        }
        return;
      }

      // No beforeinstallprompt available
      if (isIos()) {
        showInstallUI("On iPhone/iPad: tap Share → Add to Home Screen to install.");
      } else {
        // Not iOS: show helpful guidance + debug hint
        showInstallUI("Installation not available here. Try Chrome on Android or check console for reasons.");
        console.warn("beforeinstallprompt not available. Check: HTTPS, manifest validity, SW registered and same-origin, not already installed.");
      }
    });
  }

  // ---------- DOM init ----------
  window.addEventListener("DOMContentLoaded", async () => {
    // get elements now (safer)
    installSection = document.getElementById("pwa-install-section");
    installBtn = document.getElementById("pwa-install-btn");
    installInfo = document.getElementById("pwa-install-info") || null;

    // ensure install section exists (signup.html creates this)
    if (!installSection) {
      console.warn("pwa-install-section not found in DOM.");
      return;
    }

    // detect paths and register SW
    const { swUrl, swScope, manifestHref } = detectSwPaths();
    registerServiceWorker(swUrl, swScope);
    // attempt to fetch start_url for "Open app" behavior
    startUrlFromManifest = await getStartUrlFromManifest(manifestHref).catch(() => null);

    // if ALWAYS_SHOW_INSTALL, show it; otherwise hide until beforeinstallprompt or iOS hint
    if (ALWAYS_SHOW_INSTALL) {
      showInstallUI("Install Catalyst — quick access & offline support.");
    } else {
      // existing behavior: if standalone hide, else keep hidden until beforeinstallprompt
      if (isStandalone()) {
        console.log("Running in standalone mode; hiding install UI.");
        hideInstallUI();
      } else {
        installSection.style.display = "none";
        if (isMobile() && isIos()) {
          showInstallUI("On iPhone/iPad: tap Share → Add to Home Screen to install.");
        }
      }
    }

    attachInstallButtonHandlers();

    // developer debug helper
    window.__pwa = window.__pwa || {};
    window.__pwa.getDeferredPrompt = () => deferredPrompt;
    window.__pwa.startUrl = startUrlFromManifest;
  });

  // Listen for beforeinstallprompt and cache it
  window.addEventListener("beforeinstallprompt", (e) => {
    console.log("beforeinstallprompt event fired");
    e.preventDefault();
    deferredPrompt = e;
    // show actionable message if we're not in standalone OR ALWAYS_SHOW_INSTALL is true
    showInstallUI("Install our app — tap the button to add Catalyst to your device.");
  });

  window.addEventListener("appinstalled", (ev) => {
    console.log("App installed event:", ev);
    showDoneMsg("Installation complete!");
    setTimeout(() => {
      if (!ALWAYS_SHOW_INSTALL) hideInstallUI();
    }, 1200);
    // hide overlay if it's still visible
    hideLoadingOverlay();
  });

})();
