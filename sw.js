const CACHE_NAME = 'food-tracker-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache.map(url => new Request(url, {cache: 'reload'})));
      })
      .catch(err => {
        console.log('Cache addAll error:', err);
      })
  );
});

// Fetch from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Don't cache Supabase API calls
          if (!event.request.url.includes('supabase.co')) {
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
          }

          return response;
        }).catch(() => {
          // Network failed, check if we have a cached version
          return caches.match('/index.html');
        });
      })
  );
});

// Clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Background sync (when back online)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-entries') {
    event.waitUntil(syncEntries());
  }
});

async function syncEntries() {
  // This will be triggered by the app when connection is restored
  console.log('Syncing offline entries...');
}

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  // Open the app when notification is clicked
  event.waitUntil(
    clients.openWindow('/')
  );
});

// Periodic background sync for reminders (if supported)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'daily-reminder') {
    event.waitUntil(checkAndSendReminder());
  }
});

async function checkAndSendReminder() {
  // Check if reminders are enabled
  const remindersEnabled = await caches.match('/reminders-enabled')
    .then(response => response ? response.text() : 'true');
  
  if (remindersEnabled === 'false') return;
  
  // Check last entry time from cache or storage
  const currentHour = new Date().getHours();
  
  // Only send reminders during daytime (8am-8pm)
  if (currentHour >= 8 && currentHour <= 20) {
    self.registration.showNotification('מעקב אוכל והרגשה 💙', {
      body: 'זוכרת למלא את הטופס אחרי הארוחה? זה לוקח רק 10 שניות 😊',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'reminder',
      requireInteraction: false,
      data: {
        url: '/'
      }
    });
  }
}
