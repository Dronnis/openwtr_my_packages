import { cacheManager } from './CacheManager.js';

export class DynamicLoader {
    constructor() {
        this.loadedModules = new Map();
        this.loadingPromises = new Map();
        this.moduleRegistry = new Map();
    }

    async loadModule(url) {
        // Нормализуем URL
        const normalizedUrl = url.split('?')[0].split('#')[0];
        
        // Проверяем, загружен ли уже модуль
        if (this.moduleRegistry.has(normalizedUrl)) {
            console.log(`Module already loaded: ${normalizedUrl}`);
            return this.moduleRegistry.get(normalizedUrl);
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
            this.moduleRegistry.set(normalizedUrl, result);
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
        
        // Обрабатываем код - заменяем импорты на загрузку из реестра
        const processedCode = this.processImports(code, moduleDir, url);
        
        // Создаём уникальный ID для модуля
        const moduleId = 'mod_' + btoa(url).replace(/[^a-zA-Z0-9]/g, '_');
        
        // Выполняем модуль и получаем экспорты
        const exports = await this.executeModule(processedCode, moduleId, url);
        
        return exports;
    }
    
    processImports(code, moduleDir, moduleUrl) {
        // Находим все import statements
        const importRegex = /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g;
        const importDefaultRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
        const importAllRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
        
        let processedCode = code;
        
        // Обрабатываем named imports
        processedCode = processedCode.replace(importRegex, (match, imports, importPath) => {
            const resolvedPath = this.resolvePath(importPath, moduleDir);
            const importNames = imports.split(',').map(i => i.trim());
            const varName = `__mod_${btoa(resolvedPath).replace(/[^a-zA-Z0-9]/g, '_')}`;
            
            // Создаём переменные для импортированных значений
            const declarations = importNames.map(name => {
                if (name.includes(' as ')) {
                    const [original, alias] = name.split(' as ');
                    return `let ${alias} = ${varName}.${original};`;
                }
                return `let ${name} = ${varName}.${name};`;
            }).join('\n    ');
            
            return `// Import from ${resolvedPath}
    const ${varName} = window.__moduleRegistry['${resolvedPath}'] || (async () => {
        const mod = await window.dynamicLoader.loadModule('${resolvedPath}');
        window.__moduleRegistry['${resolvedPath}'] = mod;
        return mod;
    })();
    ${declarations}`;
        });
        
        // Обрабатываем default imports
        processedCode = processedCode.replace(importDefaultRegex, (match, importName, importPath) => {
            const resolvedPath = this.resolvePath(importPath, moduleDir);
            const varName = `__mod_${btoa(resolvedPath).replace(/[^a-zA-Z0-9]/g, '_')}`;
            
            return `// Import from ${resolvedPath}
    const ${importName} = (async () => {
        const mod = await window.dynamicLoader.loadModule('${resolvedPath}');
        return mod.default || mod;
    })();`;
        });
        
        // Обрабатываем namespace imports
        processedCode = processedCode.replace(importAllRegex, (match, importName, importPath) => {
            const resolvedPath = this.resolvePath(importPath, moduleDir);
            
            return `// Import from ${resolvedPath}
    const ${importName} = await window.dynamicLoader.loadModule('${resolvedPath}');`;
        });
        
        // Оборачиваем код в async функцию для поддержки await
        return `(async function() {
    const __exports = {};
    ${processedCode}
    
    // Обрабатываем export statements
    const exportRegex = /export\\s+{([^}]+)}/g;
    const exportDefaultRegex = /export\\s+default\\s+(\\w+)/g;
    const exportConstRegex = /export\\s+(?:const|let|var)\\s+(\\w+)\\s*=\\s*([^;]+)/g;
    const exportFunctionRegex = /export\\s+function\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*{/g;
    
    // Восстанавливаем export statements
    let exportCode = \`${processedCode.replace(/`/g, '\\`')}\`;
    
    // Находим все экспорты
    let exportMatch;
    while ((exportMatch = exportConstRegex.exec(exportCode)) !== null) {
        const [full, name, value] = exportMatch;
        __exports[name] = eval(value);
    }
    
    while ((exportMatch = exportFunctionRegex.exec(exportCode)) !== null) {
        const [full, name] = exportMatch;
        __exports[name] = eval(name);
    }
    
    while ((exportMatch = exportDefaultRegex.exec(exportCode)) !== null) {
        __exports.default = eval(exportMatch[1]);
    }
    
    while ((exportMatch = exportRegex.exec(exportCode)) !== null) {
        const exports_list = exportMatch[1].split(',').map(e => e.trim());
        for (const exp of exports_list) {
            const [name, alias] = exp.includes(' as ') ? exp.split(' as ') : [exp, exp];
            __exports[alias] = eval(name);
        }
    }
    
    return __exports;
})()`;
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
    
    async executeModule(code, moduleId, url) {
        return new Promise((resolve, reject) => {
            // Регистрируем глобальные объекты
            window.__moduleRegistry = window.__moduleRegistry || {};
            window.dynamicLoader = this;
            
            // Создаём скрипт
            const script = document.createElement('script');
            script.id = moduleId;
            
            // Оборачиваем код в IIFE
            const wrappedCode = `
                (function() {
                    window.__moduleRegistry['${url}'] = (${code}).then(exports => {
                        window.__moduleRegistry['${url}'] = exports;
                        return exports;
                    }).catch(error => {
                        console.error('Module error:', error);
                        delete window.__moduleRegistry['${url}'];
                        throw error;
                    });
                })();
            `;
            
            script.textContent = wrappedCode;
            
            script.onerror = (error) => {
                reject(new Error(`Failed to load module ${url}: ${error}`));
            };
            
            // Ждём выполнения модуля
            const checkInterval = setInterval(async () => {
                const moduleExports = window.__moduleRegistry[url];
                if (moduleExports && typeof moduleExports.then === 'function') {
                    try {
                        const result = await moduleExports;
                        clearInterval(checkInterval);
                        resolve(result);
                    } catch (error) {
                        clearInterval(checkInterval);
                        reject(error);
                    }
                } else if (moduleExports && !moduleExports.then) {
                    clearInterval(checkInterval);
                    resolve(moduleExports);
                }
            }, 10);
            
            // Добавляем скрипт на страницу
            document.head.appendChild(script);
            
            // Таймаут на случай зависания
            setTimeout(() => {
                clearInterval(checkInterval);
                if (!window.__moduleRegistry[url]) {
                    reject(new Error(`Timeout loading module ${url}`));
                }
            }, 30000);
        });
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
        this.moduleRegistry.clear();
        window.__moduleRegistry = {};
        console.log('Module cache cleared');
    }
}

export const dynamicLoader = new DynamicLoader();