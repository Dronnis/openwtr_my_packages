import { loadingManager } from '../shared/LoadingManager.js';

export class ContentLoader {
    constructor(localization) {
        this.localization = localization;
        this.indexData = null;
        this.config = null;
        this.infoData = null;
        this.loadError = null;
        this.fileCheckCache = new Map();
    }

    async fileExists(url, taskId = null) {
        if (this.fileCheckCache.has(url)) {
            return this.fileCheckCache.get(url);
        }
        
        const id = taskId || `file_${url}`;
        loadingManager.startTask(id, 'file');
        
        try {
            const response = await fetch(url, { method: 'HEAD' });
            const exists = response.ok;
            this.fileCheckCache.set(url, exists);
            loadingManager.completeTask(id, exists);
            return exists;
        } catch {
            this.fileCheckCache.set(url, false);
            loadingManager.completeTask(id, false);
            return false;
        }
    }

    async loadIndex() {
        const indexId = 'load_index';
        loadingManager.startTask(indexId, 'index');
        
        try {
            const response = await fetch('/index.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const text = await response.text();
            
            try {
                this.indexData = JSON.parse(text);
            } catch (parseError) {
                throw new Error(`JSON Parse Error: ${parseError.message}`);
            }
            
            if (!this.indexData.cfg) {
                throw new Error('Invalid index.json: missing "cfg" section');
            }
            
            if (!this.indexData.files) {
                throw new Error('Invalid index.json: missing "files" section');
            }
            
            this.config = this.indexData.cfg;
            loadingManager.completeTask(indexId, true);
            
            await this.loadInfoFile();
            
            return this.indexData;
        } catch (error) {
            this.loadError = error.message;
            loadingManager.completeTask(indexId, false);
            throw error;
        }
    }

    async loadInfoFile() {
        const infoId = 'load_info';
        loadingManager.startTask(infoId, 'info');
        
        try {
            const exists = await this.fileExists('/info.json', 'check_info');
            if (exists) {
                const response = await fetch('/info.json');
                const text = await response.text();
                this.infoData = JSON.parse(text);
                loadingManager.completeTask(infoId, true);
            } else {
                this.infoData = { version: "1.0", paths: {} };
                loadingManager.completeTask(infoId, true);
            }
        } catch (error) {
            console.warn('Failed to load info.json:', error);
            this.infoData = { version: "1.0", paths: {} };
            loadingManager.completeTask(infoId, false);
        }
    }

    getPathInfo(path) {
        if (!this.infoData || !this.infoData.paths) {
            return null;
        }
        
        const cleanPath = path.replace(/^\/+|\/+$/g, '');
        const normalizedPath = cleanPath ? `/${cleanPath}` : '/';
        
        let bestMatch = null;
        let bestMatchLength = -1;
        
        for (const [key, value] of Object.entries(this.infoData.paths)) {
            if (normalizedPath === key) {
                return value;
            }
            
            if (normalizedPath.startsWith(key) && key.length > bestMatchLength) {
                bestMatch = value;
                bestMatchLength = key.length;
            }
        }
        
        return bestMatch;
    }

    getNodeInfo(path) {
        if (!this.indexData) return null;
        
        const cleanPath = path.replace(/^\/+/, '');
        if (!cleanPath) return { type: 'root' };
        
        const parts = cleanPath.split('/');
        let current = this.indexData.files;
        
        for (const part of parts) {
            if (current && current[part]) {
                current = current[part];
            } else {
                return null;
            }
        }
        
        return current.__INFO__ || (current.type ? current : null);
    }

    getChildren(path) {
        if (!this.indexData) return null;
        
        const cleanPath = path.replace(/^\/+/, '');
        if (!cleanPath) {
            return this.indexData.files;
        }
        
        const parts = cleanPath.split('/');
        let current = this.indexData.files;
        
        for (const part of parts) {
            if (current && current[part]) {
                current = current[part];
            } else {
                return null;
            }
        }
        
        const children = {};
        for (const [key, value] of Object.entries(current)) {
            if (key !== '__INFO__') {
                children[key] = value;
            }
        }
        
        return children;
    }

    async loadMarkdown(url, type = 'markdown') {
        if (!url) return null;
        
        const id = `markdown_${url}`;
        loadingManager.startTask(id, type);
        
        try {
            const exists = await this.fileExists(url, `check_${url}`);
            if (!exists) {
                loadingManager.completeTask(id, false);
                return null;
            }
            
            const response = await fetch(url);
            const text = await response.text();
            const html = this.renderMarkdownFromText(text);
            
            loadingManager.completeTask(id, true);
            return html;
        } catch (error) {
            loadingManager.completeTask(id, false);
            return null;
        }
    }

    renderMarkdownFromText(text) {
        let html = text
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
            .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/~~(.*?)~~/g, '<del>$1</del>')
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/^\- (.*$)/gm, '<li>$1</li>')
            .replace(/^\* (.*$)/gm, '<li>$1</li>')
            .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
            .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
            .replace(/`{3}.*?\n([\s\S]*?)`{3}/g, '<pre><code>$1</code></pre>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
        
        if (!html.startsWith('<')) {
            html = `<p>${html}</p>`;
        }
        
        html = html.replace(/<li>.*?<\/li>/gs, (match) => {
            if (match.includes('<ul>') || match.includes('<ol>')) return match;
            return `<ul>${match}</ul>`;
        });
        
        return `<div class="markdown-content">${html}</div>`;
    }

    async loadFolderContent(folderPath) {
        const content = {
            header: null,
            footer: null,
            changelog: null,
            readme: null,
            messages: []
        };
        
        const cleanPath = folderPath.replace(/^\/+|\/+$/g, '');
        const basePath = cleanPath ? `/${cleanPath}` : '/';
        
        const pathInfo = this.getPathInfo(basePath);
        
        if (pathInfo) {
            if (pathInfo.header) {
                const headerPath = `${basePath === '/' ? '' : basePath}${pathInfo.header}`;
                if (await this.fileExists(headerPath, `check_header_${basePath}`)) {
                    content.header = await this.loadMarkdown(headerPath, 'header');
                }
            }
            
            if (pathInfo.footer) {
                const footerPath = `${basePath === '/' ? '' : basePath}${pathInfo.footer}`;
                if (await this.fileExists(footerPath, `check_footer_${basePath}`)) {
                    content.footer = await this.loadMarkdown(footerPath, 'footer');
                }
            }
            
            if (pathInfo.changelog) {
                const changelogPath = `${basePath === '/' ? '' : basePath}${pathInfo.changelog}`;
                if (await this.fileExists(changelogPath, `check_changelog_${basePath}`)) {
                    content.changelog = await this.loadMarkdown(changelogPath, 'changelog');
                }
            }
            
            if (pathInfo.readme) {
                const readmePath = `${basePath === '/' ? '' : basePath}${pathInfo.readme}`;
                if (await this.fileExists(readmePath, `check_readme_${basePath}`)) {
                    content.readme = await this.loadMarkdown(readmePath, 'readme');
                }
            }
            
            if (pathInfo.messages) {
                const messageTypes = ['notice', 'info', 'success', 'warning', 'error'];
                for (const msgType of messageTypes) {
                    if (pathInfo.messages[msgType]) {
                        const msgPath = `${basePath === '/' ? '' : basePath}${pathInfo.messages[msgType]}`;
                        const exists = await this.fileExists(msgPath, `check_msg_${msgPath}`);
                        if (exists) {
                            const taskId = `load_${msgType}_${basePath}`;
                            loadingManager.startTask(taskId, 'message');
                            try {
                                const response = await fetch(msgPath);
                                const text = await response.text();
                                if (text && text.trim()) {
                                    content.messages.push({
                                        type: msgType,
                                        content: this.renderMarkdownFromText(text)
                                    });
                                }
                                loadingManager.completeTask(taskId, true);
                            } catch (error) {
                                loadingManager.completeTask(taskId, false);
                            }
                        }
                    }
                }
            }
        }
        
        return content;
    }

    getLoadError() {
        return this.loadError;
    }
}