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
        const bypassCache = cacheManager.shouldBypassCache();
        
        let code;
        
        if (!bypassCache) {
            const cachedCode = await this.getFromIndexedDB(url);
            if (cachedCode) {
                console.log(`Using cached module: ${url}`);
                code = cachedCode;
            }
        }
        
        if (!code) {
            console.log(`Fetching module: ${url}`);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} for ${url}`);
            }
            code = await response.text();
            
            if (!bypassCache) {
                await this.saveToIndexedDB(url, code);
            }
        }
        
        // Получаем директорию модуля
        const moduleDir = url.substring(0, url.lastIndexOf('/') + 1);
        
        // Заменяем абсолютные импорты на относительные
        let fixedCode = code;
        
        // Заменяем импорты с абсолютными путями на относительные
        fixedCode = fixedCode.replace(
            /import\s+{([^}]+)}\s+from\s+['"]\/([^'"]+)['"]/g,
            (match, imports, importPath) => {
                const relativePath = this.getRelativePath(moduleDir, '/' + importPath);
                return `import {${imports}} from '${relativePath}'`;
            }
        );
        
        fixedCode = fixedCode.replace(
            /import\s+(\w+)\s+from\s+['"]\/([^'"]+)['"]/g,
            (match, importName, importPath) => {
                const relativePath = this.getRelativePath(moduleDir, '/' + importPath);
                return `import ${importName} from '${relativePath}'`;
            }
        );
        
        return await this.executeModule(fixedCode, url);
    }
    
    getRelativePath(fromDir, toPath) {
        const fromParts = fromDir.split('/').filter(p => p);
        const toParts = toPath.split('/').filter(p => p);
        
        // Находим общий префикс
        let i = 0;
        while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
            i++;
        }
        
        // Считаем количество подъёмов
        const upCount = fromParts.length - i;
        const relativeParts = [];
        
        for (let j = 0; j < upCount; j++) {
            relativeParts.push('..');
        }
        
        for (let j = i; j < toParts.length; j++) {
            relativeParts.push(toParts[j]);
        }
        
        return './' + relativeParts.join('/');
    }
    
    async executeModule(code, url) {
        const blob = new Blob([code], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        
        try {
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
        return new Promise((resolve) => {
            const request = indexedDB.open('DWRTCache', 1);
            
            request.onerror = () => resolve(null);
            
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
                    db.close();
                };
                
                getRequest.onerror = () => {
                    resolve(null);
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
        return new Promise((resolve) => {
            const request = indexedDB.open('DWRTCache', 1);
            
            request.onerror = () => resolve(false);
            
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
                    console.log(`Cached: ${url}`);
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
    
    async clearIndexedDBCache() {
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