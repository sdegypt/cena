/**
 * Service Worker لموقع أمل حبرك
 * يوفر التخزين المؤقت وتحسين الأداء
 */

const CACHE_NAME = 'amlhabrak-v2.0.0';
const STATIC_CACHE = 'amlhabrak-static-v2.0.0';
const DYNAMIC_CACHE = 'amlhabrak-dynamic-v2.0.0';

// الملفات المهمة للتخزين المؤقت
const STATIC_FILES = [
  '/',
  '/css/style.css',
  '/css/responsive.css',
  '/js/error-handler.js',
  '/js/performance-optimizer.js',
  '/uploads/images/icon-192x192.png',
  '/uploads/images/icon-512x512.png',
  '/public/favicon/logo.png',
  '/manifest.json',
  '/offline.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&family=Tajawal:wght@700&display=swap'
];

// الملفات التي لا يجب تخزينها مؤقتاً
const EXCLUDE_URLS = [
  '/admin/',
  '/api/',
  '/auth/',
  'chrome-extension://',
  'moz-extension://',
  'safari-extension://',
  'ms-browser-extension://'
];

// تثبيت Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('Service Worker: Static files cached successfully');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Service Worker: Error caching static files', error);
      })
  );
});

// تفعيل Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            // حذف الكاشات القديمة
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activated successfully');
        return self.clients.claim();
      })
  );
});

// اعتراض الطلبات
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  
  // تجاهل الطلبات المستثناة
  if (shouldExcludeUrl(requestUrl.href)) {
    return;
  }
  
  // تجاهل طلبات POST وغيرها من الطرق غير GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    handleRequest(event.request)
  );
});

// معالجة الطلبات
async function handleRequest(request) {
  const requestUrl = new URL(request.url);
  
  try {
    // للملفات الثابتة: Cache First
    if (isStaticFile(requestUrl.pathname)) {
      return await cacheFirst(request);
    }
    
    // للصفحات: Network First مع Fallback
    if (isPageRequest(requestUrl.pathname)) {
      return await networkFirst(request);
    }
    
    // للصور: Cache First مع Network Fallback
    if (isImageRequest(requestUrl.pathname)) {
      return await cacheFirst(request);
    }
    
    // للـ API: Network Only
    if (isApiRequest(requestUrl.pathname)) {
      return await fetch(request);
    }
    
    // الافتراضي: Network First
    return await networkFirst(request);
    
  } catch (error) {
    console.error('Service Worker: Error handling request', error);
    return await handleOffline(request);
  }
}

// استراتيجية Cache First
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Service Worker: Cache first failed', error);
    return await caches.match(request);
  }
}

// استراتيجية Network First
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.warn('Service Worker: Network failed, trying cache', error);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return await handleOffline(request);
  }
}

// معالجة حالة عدم الاتصال
async function handleOffline(request) {
  const requestUrl = new URL(request.url);
  
  // للصفحات: إرجاع صفحة offline
  if (isPageRequest(requestUrl.pathname)) {
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) {
      return offlinePage;
    }
  }
  
  // للصور: إرجاع صورة افتراضية
  if (isImageRequest(requestUrl.pathname)) {
    const defaultImage = await caches.match('/uploads/images/icon-192x192.png');
    if (defaultImage) {
      return defaultImage;
    }
  }
  
  // إرجاع استجابة خطأ
  return new Response('المحتوى غير متوفر في وضع عدم الاتصال', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}

// فحص نوع الملف
function isStaticFile(pathname) {
  return /\.(css|js|woff|woff2|ttf|eot|ico|svg)$/.test(pathname);
}

function isImageRequest(pathname) {
  return /\.(jpg|jpeg|png|gif|webp|svg|ico)$/.test(pathname);
}

function isPageRequest(pathname) {
  return !pathname.includes('.') || pathname.endsWith('.html');
}

function isApiRequest(pathname) {
  return pathname.startsWith('/api/') || pathname.startsWith('/auth/');
}

function shouldExcludeUrl(url) {
  return EXCLUDE_URLS.some(excludeUrl => url.includes(excludeUrl));
}

// تنظيف الكاش القديم
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAN_CACHE') {
    cleanOldCache();
  }
});

async function cleanOldCache() {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    const requests = await cache.keys();
    
    // حذف الملفات القديمة (أكثر من 7 أيام)
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    for (const request of requests) {
      const response = await cache.match(request);
      const dateHeader = response.headers.get('date');
      
      if (dateHeader) {
        const responseDate = new Date(dateHeader).getTime();
        if (responseDate < oneWeekAgo) {
          await cache.delete(request);
          console.log('Service Worker: Deleted old cache entry', request.url);
        }
      }
    }
  } catch (error) {
    console.error('Service Worker: Error cleaning cache', error);
  }
}

// تحديث الكاش
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'UPDATE_CACHE') {
    updateCache();
  }
});

async function updateCache() {
  try {
    const cache = await caches.open(STATIC_CACHE);
    
    for (const url of STATIC_FILES) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          await cache.put(url, response);
          console.log('Service Worker: Updated cache for', url);
        }
      } catch (error) {
        console.warn('Service Worker: Failed to update cache for', url, error);
      }
    }
  } catch (error) {
    console.error('Service Worker: Error updating cache', error);
  }
}

// إشعارات Push
self.addEventListener('push', event => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'إشعار جديد من أمل حبرك',
      icon: '/uploads/images/icon-192x192.png',
      badge: '/uploads/images/icon-72x72.png',
      tag: data.tag || 'general',
      requireInteraction: true,
      actions: [
        {
          action: 'view',
          title: 'عرض',
          icon: '/uploads/images/icon-96x96.png'
        },
        {
          action: 'dismiss',
          title: 'إغلاق',
          icon: '/uploads/images/icon-96x96.png'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'أمل حبرك', options)
    );
  } catch (error) {
    console.error('Service Worker: Error handling push notification', error);
  }
});

// معالجة النقر على الإشعارات
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// مزامنة البيانات في الخلفية
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  try {
    console.log('Service Worker: Background sync started');
    console.log('Service Worker: Background sync completed');
  } catch (error) {
    console.error('Service Worker: Background sync failed', error);
  }
}

// معلومات Service Worker
console.log('Service Worker: Loaded successfully');
console.log('Cache Name:', CACHE_NAME);
console.log('Static Cache:', STATIC_CACHE);
console.log('Dynamic Cache:', DYNAMIC_CACHE);

