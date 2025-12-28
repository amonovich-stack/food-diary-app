const CACHE_NAME = 'food-tracker-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install Service Worker - force update
self.addEventListener('install', event => {
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
  
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

// Activate immediately and claim all clients
self.addEventListener('activate', event => {
  // Take control immediately
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Claim all clients immediately
      self.clients.claim()
    ])
  );
});

// Fetch strategy: Network first, then cache
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Don't cache if it's not a successful response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        // Don't cache Supabase API calls
        if (!event.request.url.includes('supabase.co')) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }

        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request)
          .then(response => {
            return response || caches.match('/index.html');
          });
      })
  );
});

// Listen for messages from the app to check for updates
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    // Force update check
    self.registration.update();
  }
});

// Periodic update check (every time app is opened)
self.addEventListener('fetch', () => {
  // Check for updates on every fetch
  if (Math.random() < 0.1) { // 10% of requests trigger update check
    self.registration.update();
  }
});

// Background sync (when back online)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-entries') {
    event.waitUntil(syncEntries());
  }
});

async function syncEntries() {
  console.log('Syncing offline entries...');
}

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
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
  const remindersEnabled = await caches.match('/reminders-enabled')
    .then(response => response ? response.text() : 'true');
  
  if (remindersEnabled === 'false') return;
  
  const currentHour = new Date().getHours();
  
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
