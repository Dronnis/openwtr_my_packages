import { cacheManager } from './CacheManager.js';

export class DynamicLoader {
    constructor() {
        this.loadedModules = new Map();
        this.loadingPromises = new Map();
        this.baseUrl = window.location.origin;
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
        
        let code;
        
        if (!bypassCache) {
            // Пытаемся загрузить из кеша
            const cachedCode = await this.getFromCache(url);
            if (cachedCode) {
                console.log(`Using cached module: ${url}`);
                code = cachedCode;
            }
        }
        
        if (!code) {
            // Загружаем свежий модуль
            console.log(`Fetching module: ${url}`);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} for ${url}`);
            }
            code = await response.text();
            
            // Сохраняем в кеш
            if (!bypassCache) {
                await this.saveToCache(url, code);
            }
        }
        
        // Получаем директорию модуля
        const moduleDir = url.substring(0, url.lastIndexOf('/') + 1);
        
        // Переписываем относительные импорты на абсолютные
        const rewrittenCode = this.rewriteImports(code, moduleDir);
        
        // Выполняем модуль
        return await this.executeModule(rewrittenCode, url);
    }
    
    rewriteImports(code, moduleDir) {
        // Регулярка для поиска import/export statements
        const importRegex = /(?:import|export)\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
        const dynamicImportRegex = /import\(['"]([^'"]+)['"]\)/g;
        
        let rewrittenCode = code;
        
        // Переписываем статические импорты
        rewrittenCode = rewrittenCode.replace(importRegex, (match, importPath) => {
            const resolvedPath = this.resolvePath(importPath, moduleDir);
            return match.replace(importPath, resolvedPath);
        });
        
        // Переписываем динамические импорты
        rewrittenCode = rewrittenCode.replace(dynamicImportRegex, (match, importPath) => {
            const resolvedPath = this.resolvePath(importPath, moduleDir);
            return match.replace(importPath, resolvedPath);
        });
        
        return rewrittenCode;
    }
    
    resolvePath(importPath, moduleDir) {
        // Если путь уже абсолютный или URL, возвращаем как есть
        if (importPath.startsWith('http://') || importPath.startsWith('https://') || importPath.startsWith('/')) {
            return importPath;
        }
        
        // Если относительный путь
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
            const resolved = new URL(importPath, moduleDir).href;
            return resolved;
        }
        
        // Если путь к модулю (не поддерживается)
        console.warn(`Cannot resolve module path: ${importPath}, treating as absolute`);
        return importPath;
    }
    
    async executeModule(code, url) {
        // Создаём blob URL с переписанным кодом
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
    
    async getFromCache(url) {
        // Пытаемся получить из localStorage
        const cached = cacheManager.get(url);
        if (cached) {
            return cached;
        }
        
        // Пытаемся получить из IndexedDB
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('DWRTCache', 1);
            
            request.onerror = () => {
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
    
    async saveToCache(url, code) {
        // Сохраняем в localStorage
        cacheManager.set(url, code);
        
        // Сохраняем в IndexedDB
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('DWRTCache', 1);
            
            request.onerror = () => {
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
                    expiry: Date.now() + (12 * 60 * 60 * 1000)
                };
                
                const putRequest = store.put(data);
                putRequest.onsuccess = () => {
                    console.log(`Saved to cache: ${url}`);
                    resolve(true);
                };
                putRequest.onerror = () => {
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
    
    async clearCache() {
        // Очищаем localStorage
        cacheManager.clearAll();
        
        // Очищаем IndexedDB
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
    
    clearModuleCache() {
        this.loadedModules.clear();
        this.loadingPromises.clear();
        console.log('Module cache cleared');
    }
}

export const dynamicLoader = new DynamicLoader();