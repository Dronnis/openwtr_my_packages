export class CacheManager {
    constructor() {
        this.cachePrefix = 'd wrt_cache_';
        this.cacheDuration = 12 * 60 * 60 * 1000; // 12 часов в миллисекундах
        this.excludedUrls = ['/index.json', '/info.json'];
        this.jsCache = new Map(); // In-memory кеш для JS модулей
    }

    isExcluded(url) {
        return this.excludedUrls.some(excluded => url.includes(excluded));
    }

    shouldBypassCache() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('cache') === 'false';
    }

    getCacheKey(url) {
        return this.cachePrefix + btoa(encodeURIComponent(url));
    }

    async getJS(url) {
        if (this.shouldBypassCache()) {
            console.log(`JS cache bypassed for: ${url}`);
            return null;
        }

        // Проверяем in-memory кеш
        if (this.jsCache.has(url)) {
            const cached = this.jsCache.get(url);
            const now = Date.now();
            if (now < cached.expiry) {
                console.log(`JS cache hit (memory): ${url}`);
                return cached.data;
            } else {
                this.jsCache.delete(url);
            }
        }

        // Проверяем localStorage
        const cacheKey = this.getCacheKey(url);
        const cached = localStorage.getItem(cacheKey);
        
        if (cached) {
            try {
                const item = JSON.parse(cached);
                const now = Date.now();
                
                if (now < item.expiry) {
                    console.log(`JS cache hit (localStorage): ${url}`);
                    // Сохраняем в in-memory кеш
                    this.jsCache.set(url, {
                        data: item.data,
                        expiry: item.expiry
                    });
                    return item.data;
                } else {
                    localStorage.removeItem(cacheKey);
                }
            } catch (error) {
                console.error('Error reading JS cache:', error);
                localStorage.removeItem(cacheKey);
            }
        }
        
        return null;
    }

    async setJS(url, data) {
        if (this.shouldBypassCache()) {
            return;
        }

        const expiry = Date.now() + this.cacheDuration;
        
        // Сохраняем в in-memory кеш
        this.jsCache.set(url, {
            data: data,
            expiry: expiry
        });
        
        // Сохраняем в localStorage
        const cacheKey = this.getCacheKey(url);
        const item = {
            data: data,
            timestamp: Date.now(),
            expiry: expiry
        };
        
        try {
            localStorage.setItem(cacheKey, JSON.stringify(item));
            console.log(`JS cached: ${url}`);
        } catch (error) {
            console.error('Error saving JS to cache:', error);
            this.clearOldestCache();
            try {
                localStorage.setItem(cacheKey, JSON.stringify(item));
            } catch (retryError) {
                console.error('JS cache storage failed:', retryError);
            }
        }
    }

    get(url) {
        if (this.shouldBypassCache()) {
            console.log(`Cache bypassed for: ${url}`);
            return null;
        }

        if (this.isExcluded(url)) {
            return null;
        }

        const cacheKey = this.getCacheKey(url);
        const cached = localStorage.getItem(cacheKey);
        
        if (!cached) {
            return null;
        }

        try {
            const item = JSON.parse(cached);
            const now = Date.now();
            
            if (now > item.expiry) {
                localStorage.removeItem(cacheKey);
                return null;
            }
            
            console.log(`Cache hit for: ${url}`);
            return item.data;
        } catch (error) {
            console.error('Error reading cache:', error);
            localStorage.removeItem(cacheKey);
            return null;
        }
    }

    set(url, data) {
        if (this.shouldBypassCache()) {
            return;
        }

        if (this.isExcluded(url)) {
            return;
        }

        const cacheKey = this.getCacheKey(url);
        const item = {
            data: data,
            timestamp: Date.now(),
            expiry: Date.now() + this.cacheDuration
        };
        
        try {
            localStorage.setItem(cacheKey, JSON.stringify(item));
            console.log(`Cached: ${url}`);
        } catch (error) {
            console.error('Error saving to cache:', error);
            this.clearOldestCache();
            try {
                localStorage.setItem(cacheKey, JSON.stringify(item));
            } catch (retryError) {
                console.error('Cache storage failed:', retryError);
            }
        }
    }

    clearOldestCache() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.cachePrefix)) {
                try {
                    const item = JSON.parse(localStorage.getItem(key));
                    keys.push({ key, timestamp: item.timestamp });
                } catch (e) {
                    keys.push({ key, timestamp: Infinity });
                }
            }
        }
        
        if (keys.length > 0) {
            keys.sort((a, b) => a.timestamp - b.timestamp);
            const oldestKey = keys[0].key;
            localStorage.removeItem(oldestKey);
            console.log(`Cleared oldest cache: ${oldestKey}`);
        }
    }

    clearAll() {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.cachePrefix)) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
        });
        
        // Очищаем in-memory кеш
        this.jsCache.clear();
        
        console.log(`Cleared ${keysToRemove.length} cache entries`);
    }

    getCacheStats() {
        let totalSize = 0;
        let itemCount = 0;
        let expiredCount = 0;
        let jsCount = 0;
        let markdownCount = 0;
        const now = Date.now();
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.cachePrefix)) {
                try {
                    const item = JSON.parse(localStorage.getItem(key));
                    const size = new Blob([localStorage.getItem(key)]).size;
                    totalSize += size;
                    itemCount++;
                    
                    // Определяем тип кешированного файла
                    const url = atob(key.replace(this.cachePrefix, ''));
                    if (url.endsWith('.js')) {
                        jsCount++;
                    } else if (url.endsWith('.md')) {
                        markdownCount++;
                    }
                    
                    if (now > item.expiry) {
                        expiredCount++;
                    }
                } catch (e) {
                    itemCount++;
                }
            }
        }
        
        // Добавляем in-memory кеш в статистику
        const memoryJSCount = this.jsCache.size;
        
        return {
            itemCount,
            expiredCount,
            jsFiles: jsCount + memoryJSCount,
            markdownFiles: markdownCount,
            totalSize: (totalSize / 1024).toFixed(2) + ' KB',
            cacheDuration: '12 hours',
            memoryCacheItems: memoryJSCount
        };
    }
}

export const cacheManager = new CacheManager();