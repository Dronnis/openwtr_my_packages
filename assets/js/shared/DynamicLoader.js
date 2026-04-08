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
        const lastSlash = url.lastIndexOf('/');
        const moduleDir = lastSlash !== -1 ? url.substring(0, lastSlash + 1) : this.baseUrl + '/';
        
        // Переписываем относительные импорты на абсолютные
        const rewrittenCode = this.rewriteImports(code, moduleDir, url);
        
        // Выполняем модуль
        return await this.executeModule(rewrittenCode, url);
    }
    
    rewriteImports(code, moduleDir, originalUrl) {
        let rewrittenCode = code;
        
        // Обрабатываем import statements
        // import x from './file.js'
        // import { x } from '../file.js'
        // import * as x from './file.js'
        rewrittenCode = rewrittenCode.replace(/from\s+['"]([^'"]+)['"]/g, (match, importPath) => {
            const resolvedPath = this.resolvePath(importPath, moduleDir);
            if (resolvedPath !== importPath) {
                return `from '${resolvedPath}'`;
            }
            return match;
        });
        
        // Обрабатываем dynamic imports
        rewrittenCode = rewrittenCode.replace(/import\(['"]([^'"]+)['"]\)/g, (match, importPath) => {
            const resolvedPath = this.resolvePath(importPath, moduleDir);
            if (resolvedPath !== importPath) {
                return `import('${resolvedPath}')`;
            }
            return match;
        });
        
        // Обрабатываем export ... from
        rewrittenCode = rewrittenCode.replace(/export\s+.*\s+from\s+['"]([^'"]+)['"]/g, (match, importPath) => {
            const resolvedPath = this.resolvePath(importPath, moduleDir);
            if (resolvedPath !== importPath) {
                return match.replace(importPath, resolvedPath);
            }
            return match;
        });
        
        return rewrittenCode;
    }
    
    resolvePath(importPath, moduleDir) {
        // Если путь пустой
        if (!importPath) {
            return importPath;
        }
        
        // Если путь уже абсолютный или URL
        if (importPath.startsWith('http://') || importPath.startsWith('https://')) {
            return importPath;
        }
        
        // Если путь начинается с / - это абсолютный путь от корня
        if (importPath.startsWith('/')) {
            return importPath;
        }
        
        // Если относительный путь (начинается с ./ или ../)
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
            try {
                // Создаём URL относительно moduleDir
                const baseUrl = moduleDir.endsWith('/') ? moduleDir : moduleDir + '/';
                const resolved = new URL(importPath, baseUrl);
                return resolved.href;
            } catch (error) {
                console.warn(`Failed to resolve path: ${importPath} from ${moduleDir}`, error);
                // Возвращаем исходный путь, возможно он сработает
                return importPath;
            }
        }
        
        // Если это просто имя модуля (не поддерживается в браузере)
        console.warn(`Cannot resolve bare module specifier: ${importPath}. Converting to absolute path.`);
        return `/assets/js/${importPath}`;
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
        return new Promise((resolve) => {
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
        // Сохраняем в localStorage (если размер позволяет)
        try {
            cacheManager.set(url, code);
        } catch (e) {
            console.warn('localStorage save failed:', e);
        }
        
        // Сохраняем в IndexedDB
        return new Promise((resolve) => {
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
        return new Promise((resolve) => {
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