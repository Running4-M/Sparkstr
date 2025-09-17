importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js");
importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js");

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
  const notificationTitle = payload.data?.title || "Notification";
  const notificationOptions = {
    body: payload.data?.body || "",
    icon: payload.data?.icon || "https://sparkstr.com/img/favicon.png",
    badge: payload.data?.badge || "https://sparkstr.com/img/favicon.png",
    data: {
      click_action:
        payload.data?.click_action || "https://sparkstr.com/Calendar/Calendar",
    },
  };

  return self.registration.showNotification(
    notificationTitle,
    notificationOptions
  );
});

// Handle notification click
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetUrl =
    event.notification.data?.click_action ||
    "https://sparkstr.com/Calendar/Calendar";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});











