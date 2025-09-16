importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js");
importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js");

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyC9MoRFgajbAt58_s2zuW6vW6QKzpzUIbc",
  authDomain: "sparkstr.com",
  projectId: "ai-calendar-5753a",
  storageBucket: "ai-calendar-5753a.appspot.com",
  messagingSenderId: "610949624500",
  appId: "1:610949624500:web:b63a91859c298bb0e7dde1",
  measurementId: "G-8JTTER2Z6T",
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(function (payload) {
  console.log("[Service Worker] Received background message:", payload);

  // Support both notification & data payloads
  const title = payload.notification?.title || payload.data?.title || "Reminder";
  const body = payload.notification?.body || payload.data?.body || "Event is starting soon!";

  const notificationOptions = {
    body,
    icon: "https://sparkstr.com/img/Logo.png",   // small app logo
    badge: "https://sparkstr.com/img/Logo.png",  // Android status bar
    image: "https://sparkstr.com/img/Logo.png",  // big left/top image (Android + desktop only)
  };

  self.registration.showNotification(title, notificationOptions);
});

// Handle notification click
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url.includes("https://sparkstr.com/Calendar/Calendar") && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow("https://sparkstr.com/Calendar/Calendar");
    })
  );
});







