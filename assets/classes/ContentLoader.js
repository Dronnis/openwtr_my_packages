import { loadingManager } from './LoadingManager.js';

export class ContentLoader {
    constructor(localization) {
        this.localization = localization;
        this.indexData = null;
        this.config = null;
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
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
            
            return this.indexData;
        } catch (error) {
            console.error('Failed to load index.json:', error);
            this.loadError = error.message;
            loadingManager.completeTask(indexId, false);
            throw error;
        }
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
            console.error('Failed to load markdown:', url, error);
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
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>')
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
        const basePath = cleanPath ? `/${cleanPath}` : '';
        
        const messageFiles = [
            { file: '.notice.md', type: 'notice', taskType: 'message' },
            { file: '.info.md', type: 'info', taskType: 'message' },
            { file: '.success.md', type: 'success', taskType: 'message' },
            { file: '.warning.md', type: 'warning', taskType: 'message' },
            { file: '.error.md', type: 'error', taskType: 'message' }
        ];
        
        // Load messages
        for (const msg of messageFiles) {
            const msgPath = `${basePath}${msg.file}`;
            const exists = await this.fileExists(msgPath, `check_${msgPath}`);
            if (exists) {
                const taskId = `load_${msg.file}_${basePath || 'root'}`;
                loadingManager.startTask(taskId, msg.taskType);
                try {
                    const response = await fetch(msgPath);
                    const text = await response.text();
                    if (text && text.trim()) {
                        content.messages.push({
                            type: msg.type,
                            content: this.renderMarkdownFromText(text)
                        });
                    }
                    loadingManager.completeTask(taskId, true);
                } catch (error) {
                    loadingManager.completeTask(taskId, false);
                }
            }
        }
        
        // Load header
        const headerPath = `${basePath}/header.md`;
        if (await this.fileExists(headerPath, `check_header_${basePath || 'root'}`)) {
            content.header = await this.loadMarkdown(headerPath, 'header');
        }
        
        // Load footer
        const footerPath = `${basePath}/footer.md`;
        if (await this.fileExists(footerPath, `check_footer_${basePath || 'root'}`)) {
            content.footer = await this.loadMarkdown(footerPath, 'footer');
        }
        
        // Load changelog
        const changelogPath = `${basePath}/changelog.md`;
        if (await this.fileExists(changelogPath, `check_changelog_${basePath || 'root'}`)) {
            content.changelog = await this.loadMarkdown(changelogPath, 'changelog');
        }
        
        // Load readme
        const readmePath = `${basePath}/readme.md`;
        if (await this.fileExists(readmePath, `check_readme_${basePath || 'root'}`)) {
            content.readme = await this.loadMarkdown(readmePath, 'readme');
        }
        
        return content;
    }

    getLoadError() {
        return this.loadError;
    }
}