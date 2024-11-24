// Dalam index.ts atau file terpisah
app.post("/register-service-worker", (req, res) => {
  // Endpoint untuk registrasi service worker
});

// public/scripts/service-worker.js
self.addEventListener('push', (event) => {
  const data = event.data.json();
  self.registration.showNotification('Emergency Button', {
      body: 'Tekan untuk mengirim emergency',
      icon: 'public/img/alert.png',
      data: {
          action: 'emergency'
      }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // Kirim request emergency
  fetch("/emergency", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
          latitude: currentLatitude, 
          longitude: currentLongitude 
      })
  });
});