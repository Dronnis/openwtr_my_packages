export class DynamicLoader {
    constructor() {
        this.loadedModules = new Map();
        this.loadingPromises = new Map();
    }

    async loadModule(url) {
        // Нормализуем URL
        const normalizedUrl = this.normalizeUrl(url);
        
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
    
    normalizeUrl(url) {
        // Если URL уже абсолютный, возвращаем как есть
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
            return url;
        }
        // Иначе добавляем слеш в начало
        return '/' + url;
    }
    
    async _loadModuleInternal(url) {
        console.log(`Loading module: ${url}`);
        
        // Динамически импортируем модуль
        // Браузер сам закеширует его через HTTP cache
        const module = await import(url);
        return module;
    }
    
    clearModuleCache() {
        this.loadedModules.clear();
        this.loadingPromises.clear();
        console.log('Module cache cleared');
    }
}

export const dynamicLoader = new DynamicLoader();