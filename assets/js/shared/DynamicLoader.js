import { cacheManager } from './CacheManager.js';

export class DynamicLoader {
    constructor() {
        this.loadedModules = new Map();
        this.loadingPromises = new Map();
    }

    async loadModule(url, baseUrl = null) {
        // Нормализуем URL
        const normalizedUrl = this.normalizeUrl(url, baseUrl);
        
        // Проверяем, загружен ли уже модуль
        if (this.loadedModules.has(normalizedUrl)) {
            console.log(`Module already loaded: ${normalizedUrl}`);
            return this.loadedModules.get(normalizedUrl);
        }
        
        // Проверяем, не загружается ли уже модуль
        if (this.loadingPromises.has(normalizedUrl)) {
            console.log(`Module already loading: ${normalizedUrl}`);
            return this.loadingPromises.get(normalizedUrl);
        }
        
        const loadPromise = this._loadModuleInternal(normalizedUrl);
        this.loadingPromises.set(normalizedUrl, loadPromise);
        
        try {
            const result = await loadPromise;
            this.loadedModules.set(normalizedUrl, result);
            return result;
        } finally {
            this.loadingPromises.delete(normalizedUrl);
        }
    }
    
    normalizeUrl(url, baseUrl) {
        if (url.startsWith('/')) {
            return url;
        }
        if (url.startsWith('./') && baseUrl) {
            const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
            return basePath + url.substring(2);
        }
        if (url.startsWith('../') && baseUrl) {
            let basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
            let parts = url.split('/');
            for (const part of parts) {
                if (part === '..') {
                    basePath = basePath.substring(0, basePath.lastIndexOf('/', basePath.length - 2) + 1);
                } else if (part !== '.') {
                    basePath += part + '/';
                }
            }
            return basePath.slice(0, -1);
        }
        return url;
    }
    
    async _loadModuleInternal(url) {
        // Проверяем, нужно ли обойти кеш
        const bypassCache = cacheManager.shouldBypassCache();
        
        let code;
        let fromCache = false;
        
        if (!bypassCache) {
            // Пытаемся загрузить из IndexedDB
            const cachedCode = await this.getFromIndexedDB(url);
            if (cachedCode) {
                console.log(`Using cached module from IndexedDB: ${url}`);
                code = cachedCode;
                fromCache = true;
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
            
            // Сохраняем в IndexedDB
            if (!bypassCache) {
                await this.saveToIndexedDB(url, code);
            }
        }
        
        // Получаем директорию текущего модуля
        const moduleDir = url.substring(0, url.lastIndexOf('/') + 1);
        
        // Модифицируем код модуля, заменяя импорты на наши загрузчики
        const modifiedCode = this.modifyImports(code, moduleDir);
        
        return await this.executeModule(modifiedCode, url);
    }
    
    modifyImports(code, moduleDir) {
        // Регулярное выражение для поиска import/export statements
        // Заменяем import { x } from 'path' на динамические импорты
        let modifiedCode = code;
        
        // Обрабатываем import statements
        const importRegex = /import\s+(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
        const exportRegex = /export\s+(\{[^}]+\})|export\s+default\s+(\w+)|export\s+(?:const|let|var|function|class)\s+(\w+)/g;
        
        // Временно заменяем импорты на комментарии (они будут обработаны динамически)
        modifiedCode = modifiedCode.replace(importRegex, (match, named, namespace, default_, path) => {
            const resolvedPath = this.resolveImportPath(path, moduleDir);
            return `// IMPORT:${resolvedPath}:${named || namespace || default_ || ''}`;
        });
        
        // Добавляем загрузчик модулей в начало файла
        const loaderCode = `
// Dynamic module loader
const __modules = window.__dynamicLoader || {};
window.__dynamicLoader = __modules;

async function __require(path) {
    const resolvedPath = path.startsWith('/') ? path : new URL(path, '${moduleDir}').href;
    if (__modules[resolvedPath]) {
        return __modules[resolvedPath];
    }
    const module = await import(resolvedPath);
    __modules[resolvedPath] = module;
    return module;
}

// Восстанавливаем импорты
${modifiedCode.replace(/\/\/ IMPORT:([^:]+):(.*)/g, (match, path, exports) => {
    if (exports) {
        return `const ${exports} = await __require('${path}');`;
    }
    return `await __require('${path}');`;
})}
`;
        
        return loaderCode;
    }
    
    resolveImportPath(importPath, moduleDir) {
        if (importPath.startsWith('/')) {
            return importPath;
        }
        if (importPath.startsWith('./')) {
            return moduleDir + importPath.substring(2);
        }
        if (importPath.startsWith('../')) {
            let dir = moduleDir;
            const parts = importPath.split('/');
            for (const part of parts) {
                if (part === '..') {
                    dir = dir.substring(0, dir.lastIndexOf('/', dir.length - 2)) + '/';
                } else if (part !== '.') {
                    dir += part + '/';
                }
            }
            return dir.slice(0, -1);
        }
        return importPath;
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
                    console.log(`Saved to IndexedDB: ${url}`);
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
    
    async preloadScripts(urls) {
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