const CACHE_NAME = 'd-wrt-cache-v1';
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 часов

// Файлы, которые НЕ кешируем
const EXCLUDED_URLS = [
    '/index.json',
    '/info.json'
];

// Файлы, которые кешируем (JS и Markdown)
const CACHEABLE_EXTENSIONS = ['.js', '.md'];

self.addEventListener('install', (event) => {
    console.log('Service Worker installed');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activated');
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const pathname = url.pathname;
    
    // Проверяем, нужно ли кешировать
    const shouldCache = !EXCLUDED_URLS.some(excluded => pathname.includes(excluded)) &&
                        CACHEABLE_EXTENSIONS.some(ext => pathname.endsWith(ext));
    
    // Проверяем параметр cache=false
    const bypassCache = url.searchParams.get('cache') === 'false';
    
    if (!shouldCache || bypassCache) {
        event.respondWith(fetch(event.request));
        return;
    }
    
    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cachedResponse = await cache.match(event.request);
            
            if (cachedResponse) {
                // Проверяем время жизни кеша
                const cachedDate = cachedResponse.headers.get('sw-cache-date');
                if (cachedDate && (Date.now() - parseInt(cachedDate)) < CACHE_DURATION) {
                    console.log(`Cache hit (SW): ${pathname}`);
                    return cachedResponse;
                } else {
                    // Кеш устарел, удаляем
                    await cache.delete(event.request);
                }
            }
            
            // Загружаем свежий ресурс
            console.log(`Fetching (SW): ${pathname}`);
            const response = await fetch(event.request);
            
            if (response && response.status === 200) {
                // Клонируем ответ для кеширования
                const responseToCache = response.clone();
                const headers = new Headers(responseToCache.headers);
                headers.set('sw-cache-date', Date.now().toString());
                
                const cachedResponse = new Response(responseToCache.body, {
                    status: responseToCache.status,
                    statusText: responseToCache.statusText,
                    headers: headers
                });
                
                await cache.put(event.request, cachedResponse);
            }
            
            return response;
        })
    );
});