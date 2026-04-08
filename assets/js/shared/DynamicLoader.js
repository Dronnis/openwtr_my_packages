import { cacheManager } from './CacheManager.js';

export class DynamicLoader {
    constructor() {
        this.loadedModules = new Map();
        this.loadingPromises = new Map();
        this.moduleCache = new Map();
    }

    async loadModule(url) {
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
        
        const loadPromise = this._loadModuleInternal(url);
        this.loadingPromises.set(url, loadPromise);
        
        try {
            const result = await loadPromise;
            this.moduleCache.set(url, result);
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
            // Пытаемся загрузить из IndexedDB
            const cachedCode = await this.getFromIndexedDB(url);
            if (cachedCode) {
                console.log(`Using cached module from IndexedDB: ${url}`);
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
            
            // Сохраняем в IndexedDB
            if (!bypassCache) {
                await this.saveToIndexedDB(url, code);
            }
        }
        
        // Получаем директорию текущего модуля
        const moduleDir = url.substring(0, url.lastIndexOf('/') + 1);
        
        // Обрабатываем импорты в коде
        const processedCode = await this.processImports(code, moduleDir);
        
        return await this.executeModule(processedCode, url);
    }
    
    async processImports(code, moduleDir) {
        // Находим все import statements
        const importRegex = /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g;
        const importDefaultRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
        const importAllRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
        
        let processedCode = code;
        const importsToResolve = [];
        
        // Собираем все импорты
        let match;
        while ((match = importRegex.exec(code)) !== null) {
            const imports = match[1];
            const importPath = match[2];
            const resolvedPath = this.resolvePath(importPath, moduleDir);
            importsToResolve.push({
                type: 'named',
                imports: imports.split(',').map(i => i.trim()),
                importPath,
                resolvedPath
            });
        }
        
        while ((match = importDefaultRegex.exec(code)) !== null) {
            const importName = match[1];
            const importPath = match[2];
            const resolvedPath = this.resolvePath(importPath, moduleDir);
            importsToResolve.push({
                type: 'default',
                importName,
                importPath,
                resolvedPath
            });
        }
        
        while ((match = importAllRegex.exec(code)) !== null) {
            const importName = match[1];
            const importPath = match[2];
            const resolvedPath = this.resolvePath(importPath, moduleDir);
            importsToResolve.push({
                type: 'all',
                importName,
                importPath,
                resolvedPath
            });
        }
        
        // Загружаем все зависимости
        const loadedImports = new Map();
        for (const imp of importsToResolve) {
            if (!loadedImports.has(imp.resolvedPath)) {
                const module = await this.loadModule(imp.resolvedPath);
                loadedImports.set(imp.resolvedPath, module);
            }
        }
        
        // Строим новый код с уже загруженными зависимостями
        let newCode = '// Processed by DynamicLoader\n';
        newCode += 'const __modules = window.__dynamicLoader || {};\n';
        newCode += 'window.__dynamicLoader = __modules;\n\n';
        
        // Добавляем переменные для импортов
        for (const imp of importsToResolve) {
            const module = loadedImports.get(imp.resolvedPath);
            if (imp.type === 'named') {
                for (const importName of imp.imports) {
                    if (module[importName]) {
                        newCode += `const ${importName} = module_${imp.resolvedPath.replace(/[^a-zA-Z0-9]/g, '_')}.${importName};\n`;
                    }
                }
            } else if (imp.type === 'default') {
                newCode += `const ${imp.importName} = module_${imp.resolvedPath.replace(/[^a-zA-Z0-9]/g, '_')}.default || module_${imp.resolvedPath.replace(/[^a-zA-Z0-9]/g, '_')};\n`;
            } else if (imp.type === 'all') {
                newCode += `const ${imp.importName} = module_${imp.resolvedPath.replace(/[^a-zA-Z0-9]/g, '_')};\n`;
            }
        }
        
        // Удаляем оригинальные import statements и добавляем переменные для модулей
        let codeWithoutImports = code;
        for (const imp of importsToResolve) {
            const patterns = [
                new RegExp(`import\\s+{${imp.imports.map(i => i.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(',')}}\\s+from\\s+['"]${imp.importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
                new RegExp(`import\\s+${imp.importName}\\s+from\\s+['"]${imp.importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
                new RegExp(`import\\s+\\*\\s+as\\s+${imp.importName}\\s+from\\s+['"]${imp.importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g')
            ];
            for (const pattern of patterns) {
                codeWithoutImports = codeWithoutImports.replace(pattern, '');
            }
        }
        
        // Добавляем переменные для модулей
        for (const imp of importsToResolve) {
            const varName = `module_${imp.resolvedPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
            newCode += `const ${varName} = __modules['${imp.resolvedPath}'] || await import('${imp.resolvedPath}');\n`;
            newCode += `__modules['${imp.resolvedPath}'] = ${varName};\n`;
        }
        
        newCode += '\n' + codeWithoutImports;
        
        return newCode;
    }
    
    resolvePath(importPath, moduleDir) {
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
        this.moduleCache.clear();
        this.loadingPromises.clear();
        console.log('Module cache cleared');
    }
}

export const dynamicLoader = new DynamicLoader();