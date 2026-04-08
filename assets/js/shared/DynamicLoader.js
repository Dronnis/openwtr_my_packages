import { cacheManager } from './CacheManager.js';

export class DynamicLoader {
    constructor() {
        this.loadedModules = new Map();
        this.loadingPromises = new Map();
        this.moduleExports = new Map();
    }

    async loadModule(url) {
        // Нормализуем URL
        const normalizedUrl = url.split('?')[0].split('#')[0];
        
        // Проверяем, загружен ли уже модуль
        if (this.moduleExports.has(normalizedUrl)) {
            console.log(`Module already loaded: ${normalizedUrl}`);
            return this.moduleExports.get(normalizedUrl);
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
            this.moduleExports.set(normalizedUrl, result);
            return result;
        } finally {
            this.loadingPromises.delete(normalizedUrl);
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
        
        // Обрабатываем код, заменяя импорты на динамические загрузки
        const processedCode = await this.processModuleCode(code, moduleDir, url);
        
        // Выполняем модуль и получаем экспорты
        const exports = await this.executeModule(processedCode, url);
        
        return exports;
    }
    
    async processModuleCode(code, moduleDir, moduleUrl) {
        // Находим все import statements
        const importRegex = /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g;
        const importDefaultRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
        const importAllRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
        
        let processedCode = code;
        const importsToLoad = [];
        
        // Собираем все импорты
        let match;
        while ((match = importRegex.exec(code)) !== null) {
            const imports = match[1].split(',').map(i => i.trim());
            const importPath = match[2];
            const resolvedPath = this.resolveImportPath(importPath, moduleDir);
            importsToLoad.push({
                type: 'named',
                imports: imports,
                importPath,
                resolvedPath
            });
        }
        
        while ((match = importDefaultRegex.exec(code)) !== null) {
            const importName = match[1];
            const importPath = match[2];
            const resolvedPath = this.resolveImportPath(importPath, moduleDir);
            importsToLoad.push({
                type: 'default',
                importName,
                importPath,
                resolvedPath
            });
        }
        
        while ((match = importAllRegex.exec(code)) !== null) {
            const importName = match[1];
            const importPath = match[2];
            const resolvedPath = this.resolveImportPath(importPath, moduleDir);
            importsToLoad.push({
                type: 'all',
                importName,
                importPath,
                resolvedPath
            });
        }
        
        if (importsToLoad.length === 0) {
            return code;
        }
        
        // Загружаем все зависимости
        const loadedDeps = new Map();
        for (const imp of importsToLoad) {
            if (!loadedDeps.has(imp.resolvedPath)) {
                try {
                    const depModule = await this.loadModule(imp.resolvedPath);
                    loadedDeps.set(imp.resolvedPath, depModule);
                } catch (error) {
                    console.error(`Failed to load dependency ${imp.resolvedPath}:`, error);
                    throw error;
                }
            }
        }
        
        // Строим новый код с уже загруженными зависимостями
        let newCode = '// Processed by DynamicLoader\n';
        newCode += '(function() {\n';
        newCode += '  const __exports = {};\n';
        newCode += '  const __modules = window.__dynModules || {};\n';
        newCode += '  window.__dynModules = __modules;\n\n';
        
        // Добавляем переменные для импортов
        for (const imp of importsToLoad) {
            const depModule = loadedDeps.get(imp.resolvedPath);
            const moduleVar = `__mod_${imp.resolvedPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
            
            newCode += `  const ${moduleVar} = __modules['${imp.resolvedPath}'] || (() => {\n`;
            newCode += `    const m = ${JSON.stringify(depModule)};\n`;
            newCode += `    __modules['${imp.resolvedPath}'] = m;\n`;
            newCode += `    return m;\n`;
            newCode += `  })();\n`;
            
            if (imp.type === 'named') {
                for (const importName of imp.imports) {
                    if (depModule[importName]) {
                        newCode += `  const ${importName} = ${moduleVar}.${importName};\n`;
                    }
                }
            } else if (imp.type === 'default') {
                newCode += `  const ${imp.importName} = ${moduleVar}.default || ${moduleVar};\n`;
            } else if (imp.type === 'all') {
                newCode += `  const ${imp.importName} = ${moduleVar};\n`;
            }
        }
        
        // Удаляем оригинальные import statements
        let codeWithoutImports = code;
        for (const imp of importsToLoad) {
            const patterns = [
                new RegExp(`import\\s+{${imp.imports.map(i => i.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(',')}}\\s+from\\s+['"]${imp.importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
                new RegExp(`import\\s+${imp.importName}\\s+from\\s+['"]${imp.importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
                new RegExp(`import\\s+\\*\\s+as\\s+${imp.importName}\\s+from\\s+['"]${imp.importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g')
            ];
            for (const pattern of patterns) {
                codeWithoutImports = codeWithoutImports.replace(pattern, '');
            }
        }
        
        // Добавляем оригинальный код
        newCode += '\n  // Original module code\n';
        newCode += codeWithoutImports;
        
        // Добавляем экспорт
        newCode += '\n\n  // Export handling\n';
        newCode += '  return __exports;\n';
        newCode += '})();\n';
        
        return newCode;
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
        // Создаём функцию из кода
        const moduleFunction = new Function('exports', 'require', 'module', code);
        
        const moduleObj = { exports: {} };
        
        // Создаём require функцию
        const customRequire = async (path) => {
            const resolvedPath = this.resolveImportPath(path, url.substring(0, url.lastIndexOf('/') + 1));
            return await this.loadModule(resolvedPath);
        };
        
        try {
            const result = moduleFunction(moduleObj.exports, customRequire, moduleObj);
            const exports = result || moduleObj.exports;
            
            // Обрабатываем экспорты
            if (exports.default) {
                return exports.default;
            }
            
            return exports;
        } catch (error) {
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
        this.moduleExports.clear();
        if (window.__dynModules) {
            window.__dynModules = {};
        }
        console.log('Module cache cleared');
    }
}

export const dynamicLoader = new DynamicLoader();