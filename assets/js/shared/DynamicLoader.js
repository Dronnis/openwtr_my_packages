import { cacheManager } from './CacheManager.js';

export class DynamicLoader {
    constructor() {
        this.loadedModules = new Map();
        this.loadingPromises = new Map();
    }

    async loadModule(url) {
        // Проверяем, загружен ли уже модуль
        if (this.loadedModules.has(url)) {
            console.log(`Module already loaded: ${url}`);
            return this.loadedModules.get(url);
        }
        
        // Проверяем, не загружается ли уже модуль
        if (this.loadingPromises.has(url)) {
            console.log(`Module already loading: ${url}`);
            return this.loadingPromises.get(url);
        }
        
        const loadPromise = this._loadModuleInternal(url);
        this.loadingPromises.set(url, loadPromise);
        
        try {
            const result = await loadPromise;
            this.loadedModules.set(url, result);
            return result;
        } finally {
            this.loadingPromises.delete(url);
        }
    }
    
    async _loadModuleInternal(url) {
        // Проверяем, нужно ли обойти кеш
        const bypassCache = cacheManager.shouldBypassCache();
        
        if (!bypassCache) {
            // Пытаемся загрузить из кеша через IndexedDB
            const cachedCode = await this.getFromIndexedDB(url);
            if (cachedCode) {
                console.log(`Using cached module from IndexedDB: ${url}`);
                return await this.executeModule(cachedCode, url);
            }
        }
        
        // Загружаем свежий модуль
        console.log(`Fetching module: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${url}`);
        }
        const code = await response.text();
        
        // Сохраняем в IndexedDB
        if (!bypassCache) {
            await this.saveToIndexedDB(url, code);
        }
        
        return await this.executeModule(code, url);
    }
    
    async executeModule(code, url) {
        // Создаём blob URL для модуля
        const blob = new Blob([code], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        
        try {
            // Динамически импортируем модуль
            const module = await import(blobUrl);
            URL.revokeObjectURL(blobUrl);
            return module;
        } catch (error) {
            URL.revokeObjectURL(blobUrl);
            console.error(`Error executing module ${url}:`, error);
            throw error;
        }
    }
    
    async getFromIndexedDB(url) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('DWRTCache', 1);
            
            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                resolve(null);
            };
            
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(['modules'], 'readonly');
                const store = transaction.objectStore('modules');
                const getRequest = store.get(url);
                
                getRequest.onsuccess = () => {
                    const result = getRequest.result;
                    if (result && result.expiry > Date.now()) {
                        resolve(result.code);
                    } else {
                        resolve(null);
                    }
                };
                
                getRequest.onerror = () => {
                    resolve(null);
                };
                
                transaction.oncomplete = () => {
                    db.close();
                };
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('modules')) {
                    db.createObjectStore('modules', { keyPath: 'url' });
                }
            };
        });
    }
    
    async saveToIndexedDB(url, code) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('DWRTCache', 1);
            
            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                resolve(false);
            };
            
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(['modules'], 'readwrite');
                const store = transaction.objectStore('modules');
                const data = {
                    url: url,
                    code: code,
                    timestamp: Date.now(),
                    expiry: Date.now() + (12 * 60 * 60 * 1000) // 12 часов
                };
                
                const putRequest = store.put(data);
                putRequest.onsuccess = () => {
                    console.log(`Saved to IndexedDB: ${url}`);
                    resolve(true);
                };
                putRequest.onerror = () => {
                    console.error('Save to IndexedDB failed:', putRequest.error);
                    resolve(false);
                };
                
                transaction.oncomplete = () => {
                    db.close();
                };
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('modules')) {
                    db.createObjectStore('modules', { keyPath: 'url' });
                }
            };
        });
    }
    
    async clearIndexedDBCache() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('DWRTCache', 1);
            
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(['modules'], 'readwrite');
                const store = transaction.objectStore('modules');
                const clearRequest = store.clear();
                
                clearRequest.onsuccess = () => {
                    console.log('IndexedDB cache cleared');
                    resolve(true);
                };
                clearRequest.onerror = () => {
                    console.error('Clear IndexedDB failed:', clearRequest.error);
                    resolve(false);
                };
                
                transaction.oncomplete = () => {
                    db.close();
                };
            };
            
            request.onerror = () => {
                resolve(false);
            };
        });
    }
    
    async preloadScripts(urls) {
        // Предзагрузка через IndexedDB
        for (const url of urls) {
            const cached = await this.getFromIndexedDB(url);
            if (!cached && !cacheManager.shouldBypassCache()) {
                console.log(`Preloading: ${url}`);
                fetch(url)
                    .then(response => response.text())
                    .then(code => this.saveToIndexedDB(url, code))
                    .catch(error => console.error(`Preload failed for ${url}:`, error));
            }
        }
    }
    
    clearModuleCache() {
        this.loadedModules.clear();
        this.loadingPromises.clear();
        console.log('Module cache cleared');
    }
}

export const dynamicLoader = new DynamicLoader();