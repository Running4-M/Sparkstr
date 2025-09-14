
importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js");
importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js");

// Initialize Firebase in the service worker (REQUIRED for FCM to work here)
firebase.initializeApp({
  apiKey: "AIzaSyC9MoRFgajbAt58_s2zuW6vW6QKzpzUIbc",
  authDomain: "sparkstr.com",
  projectId: "ai-calendar-5753a",
  storageBucket: "ai-calendar-5753a.appspot.com",
  messagingSenderId: "610949624500",
  appId: "1:610949624500:web:b63a91859c298bb0e7dde1",
  measurementId: "G-8JTTER2Z6T"
});


// Get messaging instance
// Get messaging instance
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(function(payload) {
  const notificationTitle = payload.notification?.title || 'Background Message Title';
  const notificationOptions = {
    body: payload.notification?.body || 'Background Message body.',
    icon: './img/favicon.png',   // Use favicon as icon
    badge: './img/favicon.png'   // Use favicon as badge
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click to open Calendar.html
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        // If Calendar.html is already open, focus it
        if (client.url.includes('https://sparkstr.com/Calendar/Calendar') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new tab
      return clients.openWindow('https://sparkstr.com/Calendar/Calendar');
    })
  );
});



