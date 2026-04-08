export class CacheManager {
    constructor() {
        this.cachePrefix = 'd wrt_cache_';
        this.cacheDuration = 12 * 60 * 60 * 1000; // 12 часов в миллисекундах
        this.excludedUrls = ['/index.json', '/info.json'];
    }

    isExcluded(url) {
        return this.excludedUrls.some(excluded => url.includes(excluded));
    }

    shouldBypassCache() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('cache') === 'false';
    }

    getCacheKey(url) {
        return this.cachePrefix + btoa(url);
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
        
        console.log(`Cleared ${keysToRemove.length} cache entries`);
    }

    getCacheStats() {
        let totalSize = 0;
        let itemCount = 0;
        let expiredCount = 0;
        const now = Date.now();
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.cachePrefix)) {
                try {
                    const item = JSON.parse(localStorage.getItem(key));
                    const size = new Blob([localStorage.getItem(key)]).size;
                    totalSize += size;
                    itemCount++;
                    
                    if (now > item.expiry) {
                        expiredCount++;
                    }
                } catch (e) {
                    itemCount++;
                }
            }
        }
        
        return {
            itemCount,
            expiredCount,
            totalSize: (totalSize / 1024).toFixed(2) + ' KB',
            cacheDuration: '12 hours'
        };
    }
}

export const cacheManager = new CacheManager();