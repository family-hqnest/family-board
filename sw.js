const CACHE_NAME = 'famboard-cache-v6';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './sw.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/Righteous-Regular.ttf',
  './fonts/DMSans-VariableFont_opsz,wght.ttf',
  './fonts/DMSans-Italic-VariableFont_opsz,wght.ttf'
];

// Install event - cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => {
        // Notify all clients about the update
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'CACHE_UPDATED',
              version: 'v3'
            });
          });
        });
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - network first with cache fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip chrome-extension requests
  if (event.request.url.startsWith('chrome-extension://')) return;
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => {
        // Network failed - try cache
        return caches.match(event.request)
          .then(cached => {
            if (cached) {
              return cached;
            }
            
            // For navigation requests, return the app shell
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            
            // Return a fallback for other requests
            return new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain' })
            });
          });
      })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-chores') {
    event.waitUntil(syncChores());
  }
});

// Periodic sync for updates
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-check') {
    event.waitUntil(checkForUpdates());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'Family Board Notification',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || './'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Family Board', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url === event.notification.data.url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      })
  );
});

// Helper functions
async function syncChores() {
  // In a real app, this would sync with a server
  console.log('Syncing chores...');
}

async function checkForUpdates() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const requests = ASSETS.map(url => new Request(url));
    
    const updates = await Promise.all(
      requests.map(async request => {
        try {
          const networkResponse = await fetch(request);
          const cachedResponse = await cache.match(request);
          
          if (!cachedResponse || 
              networkResponse.headers.get('etag') !== cachedResponse.headers.get('etag')) {
            await cache.put(request, networkResponse.clone());
            return true;
          }
          return false;
        } catch {
          return false;
        }
      })
    );
    
    if (updates.some(updated => updated)) {
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'CONTENT_UPDATED' });
        });
      });
    }
  } catch (error) {
    console.error('Update check failed:', error);
  }
}
