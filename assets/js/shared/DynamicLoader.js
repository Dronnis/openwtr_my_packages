import { cacheManager } from './CacheManager.js';

export class DynamicLoader {
    constructor() {
        this.loadedModules = new Map();
        this.loadingPromises = new Map();
    }

    async loadScript(url, moduleName = null) {
        // Проверяем, загружен ли уже модуль
        if (moduleName && this.loadedModules.has(moduleName)) {
            console.log(`Module already loaded: ${moduleName}`);
            return this.loadedModules.get(moduleName);
        }
        
        // Проверяем, не загружается ли уже модуль
        if (this.loadingPromises.has(url)) {
            console.log(`Module already loading: ${url}`);
            return this.loadingPromises.get(url);
        }
        
        const loadPromise = this._loadScriptInternal(url, moduleName);
        this.loadingPromises.set(url, loadPromise);
        
        try {
            const result = await loadPromise;
            return result;
        } finally {
            this.loadingPromises.delete(url);
        }
    }
    
    async _loadScriptInternal(url, moduleName) {
        try {
            // Проверяем кеш
            const cachedCode = await cacheManager.getJS(url);
            
            let code;
            if (cachedCode) {
                console.log(`Using cached JS: ${url}`);
                code = cachedCode;
            } else {
                console.log(`Fetching JS: ${url}`);
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} for ${url}`);
                }
                code = await response.text();
                
                // Сохраняем в кеш
                await cacheManager.setJS(url, code);
            }
            
            // Выполняем код
            const module = { exports: {} };
            const exports = {};
            
            // Создаём функцию-модуль
            const moduleFunction = new Function('exports', 'require', 'module', '__filename', '__dirname', code);
            
            // Временная заглушка для require
            const customRequire = (path) => {
                if (path.startsWith('./') || path.startsWith('../')) {
                    // Относительный путь - загружаем как модуль
                    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
                    const fullPath = new URL(path, baseUrl).href;
                    return this.loadScript(fullPath);
                }
                // Встроенные модули или node_modules
                throw new Error(`Cannot require "${path}" in browser environment`);
            };
            
            moduleFunction(exports, customRequire, module, url, url);
            
            const result = module.exports || exports;
            
            if (moduleName) {
                this.loadedModules.set(moduleName, result);
            }
            
            console.log(`JS loaded successfully: ${url}`);
            return result;
            
        } catch (error) {
            console.error(`Error loading JS ${url}:`, error);
            throw error;
        }
    }
    
    async loadModule(url) {
        // Для ES модулей используем динамический импорт с кешем
        const cachedCode = await cacheManager.getJS(url);
        
        if (cachedCode && !this.shouldForceFetch(url)) {
            console.log(`Using cached ES module: ${url}`);
            // Создаём blob URL из кешированного кода
            const blob = new Blob([cachedCode], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            try {
                const module = await import(blobUrl);
                URL.revokeObjectURL(blobUrl);
                return module;
            } catch (error) {
                console.error(`Error executing cached module ${url}:`, error);
                URL.revokeObjectURL(blobUrl);
                // При ошибке загружаем заново
                return this._fetchAndCacheModule(url);
            }
        }
        
        return this._fetchAndCacheModule(url);
    }
    
    async _fetchAndCacheModule(url) {
        console.log(`Fetching ES module: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${url}`);
        }
        const code = await response.text();
        
        // Сохраняем в кеш
        await cacheManager.setJS(url, code);
        
        // Выполняем модуль
        const blob = new Blob([code], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        try {
            const module = await import(blobUrl);
            URL.revokeObjectURL(blobUrl);
            return module;
        } catch (error) {
            URL.revokeObjectURL(blobUrl);
            throw error;
        }
    }
    
    shouldForceFetch(url) {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('cache') === 'false') {
            return true;
        }
        return false;
    }
    
    preloadScripts(urls) {
        urls.forEach(url => {
            if (cacheManager.getJS(url)) {
                console.log(`JS already cached: ${url}`);
            } else {
                console.log(`Preloading JS: ${url}`);
                fetch(url)
                    .then(response => response.text())
                    .then(code => cacheManager.setJS(url, code))
                    .catch(error => console.error(`Preload failed for ${url}:`, error));
            }
        });
    }
}

export const dynamicLoader = new DynamicLoader();