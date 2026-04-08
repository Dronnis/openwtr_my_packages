import { cacheManager } from './CacheManager.js';

export class DynamicLoader {
    constructor() {
        this.loadedModules = new Map();
        this.loadingPromises = new Map();
        this.moduleCache = new Map();
    }

    async loadModule(url, baseUrl = null) {
        // Проверяем, загружен ли уже модуль
        if (this.moduleCache.has(url)) {
            console.log(`Module already loaded: ${url}`);
            return this.moduleCache.get(url);
        }
        
        // Проверяем, не загружается ли уже модуль
        if (this.loadingPromises.has(url)) {
            console.log(`Module already loading: ${url}`);
            return this.loadingPromises.get(url);
        }
        
        const loadPromise = this._loadModuleInternal(url, baseUrl);
        this.loadingPromises.set(url, loadPromise);
        
        try {
            const result = await loadPromise;
            this.moduleCache.set(url, result);
            return result;
        } finally {
            this.loadingPromises.delete(url);
        }
    }
    
    async _loadModuleInternal(url, baseUrl = null) {
        try {
            // Проверяем кеш
            let code = await cacheManager.getJS(url);
            let fromCache = true;
            
            if (!code) {
                console.log(`Fetching JS module: ${url}`);
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} for ${url}`);
                }
                code = await response.text();
                fromCache = false;
                
                // Сохраняем в кеш
                await cacheManager.setJS(url, code);
            } else {
                console.log(`Using cached JS module: ${url}`);
            }
            
            // Получаем директорию текущего модуля для разрешения относительных путей
            const moduleDir = url.substring(0, url.lastIndexOf('/') + 1);
            
            // Создаём функцию-модуль с поддержкой import
            const moduleFunction = new Function(
                'exports',
                'require',
                'module',
                '__filename',
                '__dirname',
                'import',
                code + '\n return module.exports;'
            );
            
            const moduleObj = { exports: {} };
            
            // Создаём require функцию для разрешения зависимостей
            const customRequire = async (path) => {
                let resolvedPath;
                
                if (path.startsWith('./') || path.startsWith('../')) {
                    // Относительный путь
                    resolvedPath = new URL(path, moduleDir).href;
                } else if (path.startsWith('/')) {
                    // Абсолютный путь
                    resolvedPath = path;
                } else {
                    // Имя модуля (не поддерживается в браузере)
                    throw new Error(`Cannot resolve module "${path}" - only relative paths are supported`);
                }
                
                // Убираем query параметры и хеш
                resolvedPath = resolvedPath.split('?')[0].split('#')[0];
                
                // Загружаем модуль
                const importedModule = await this.loadModule(resolvedPath, moduleDir);
                return importedModule;
            };
            
            // Создаём функцию import для ES модулей
            const customImport = async (path) => {
                let resolvedPath;
                
                if (path.startsWith('./') || path.startsWith('../')) {
                    resolvedPath = new URL(path, moduleDir).href;
                } else if (path.startsWith('/')) {
                    resolvedPath = path;
                } else {
                    throw new Error(`Cannot resolve module "${path}" - only relative paths are supported`);
                }
                
                resolvedPath = resolvedPath.split('?')[0].split('#')[0];
                return await this.loadModule(resolvedPath, moduleDir);
            };
            
            // Выполняем модуль
            const result = moduleFunction(
                moduleObj.exports,
                customRequire,
                moduleObj,
                url,
                moduleDir,
                customImport
            );
            
            const exports = moduleObj.exports;
            
            if (!fromCache) {
                console.log(`JS module loaded and cached: ${url}`);
            } else {
                console.log(`JS module loaded from cache: ${url}`);
            }
            
            return exports;
            
        } catch (error) {
            console.error(`Error loading module ${url}:`, error);
            throw error;
        }
    }
    
    async loadScript(url) {
        // Для обычных скриптов (не ES модулей)
        const cachedCode = await cacheManager.getJS(url);
        
        return new Promise((resolve, reject) => {
            if (cachedCode) {
                console.log(`Using cached script: ${url}`);
                try {
                    // Выполняем кешированный код
                    const script = document.createElement('script');
                    script.textContent = cachedCode;
                    document.head.appendChild(script);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            } else {
                console.log(`Fetching script: ${url}`);
                const script = document.createElement('script');
                script.src = url;
                script.onload = () => {
                    // Сохраняем в кеш после загрузки
                    fetch(url)
                        .then(response => response.text())
                        .then(code => cacheManager.setJS(url, code))
                        .catch(console.error);
                    resolve();
                };
                script.onerror = reject;
                document.head.appendChild(script);
            }
        });
    }
    
    preloadScripts(urls) {
        urls.forEach(url => {
            // Проверяем, есть ли уже в кеше
            const cached = cacheManager.getJS(url);
            if (cached) {
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
    
    clearModuleCache() {
        this.moduleCache.clear();
        this.loadedModules.clear();
        this.loadingPromises.clear();
        console.log('Module cache cleared');
    }
}

export const dynamicLoader = new DynamicLoader();