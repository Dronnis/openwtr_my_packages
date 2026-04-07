import { UIHelper } from './UIHelper.js';

export class ContentLoader {
    constructor(localization) {
        this.localization = localization;
        this.indexData = null;
        this.config = null;
        this.loadError = null;
    }

    async fileExists(url) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            return response.ok;
        } catch {
            return false;
        }
    }

    async loadIndex() {
        UIHelper.showProgress(this.localization.t('loading_index'));
        
        try {
            const response = await fetch('/index.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const text = await response.text();
            
            // Try to parse JSON with error handling
            try {
                this.indexData = JSON.parse(text);
            } catch (parseError) {
                throw new Error(`JSON Parse Error: ${parseError.message}\nCheck that index.json is valid JSON`);
            }
            
            // Validate structure
            if (!this.indexData.cfg) {
                throw new Error('Invalid index.json: missing "cfg" section');
            }
            
            if (!this.indexData.files) {
                throw new Error('Invalid index.json: missing "files" section');
            }
            
            this.config = this.indexData.cfg;
            
            UIHelper.updateProgressMessage(this.localization.t('index_loaded'));
            setTimeout(UIHelper.hideProgress, 500);
            
            return this.indexData;
        } catch (error) {
            console.error('Failed to load index.json:', error);
            this.loadError = error.message;
            UIHelper.updateProgressMessage(`${this.localization.t('error_loading_index')}: ${error.message}`);
            setTimeout(UIHelper.hideProgress, 3000);
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

    async loadMarkdown(url) {
        if (!url) return null;
        
        try {
            const exists = await this.fileExists(url);
            if (!exists) return null;
            
            const response = await fetch(url);
            const text = await response.text();
            return this.renderMarkdownFromText(text);
        } catch (error) {
            console.error('Failed to load markdown:', url, error);
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
        
        // Fix: ensure proper path construction with slash
        const cleanPath = folderPath.replace(/^\/+|\/+$/g, '');
        const basePath = cleanPath ? `/${cleanPath}` : '';
        
        const messageFiles = [
            { file: '.notice.md', type: 'notice' },
            { file: '.info.md', type: 'info' },
            { file: '.success.md', type: 'success' },
            { file: '.warning.md', type: 'warning' },
            { file: '.error.md', type: 'error' }
        ];
        
        for (const msg of messageFiles) {
            const msgPath = `${basePath}${msg.file}`;
            if (await this.fileExists(msgPath)) {
                const response = await fetch(msgPath);
                const text = await response.text();
                if (text && text.trim()) {
                    content.messages.push({
                        type: msg.type,
                        content: this.renderMarkdownFromText(text)
                    });
                }
            }
        }
        
        const headerPath = `${basePath}/header.md`;
        if (await this.fileExists(headerPath)) {
            content.header = await this.loadMarkdown(headerPath);
        }
        
        const footerPath = `${basePath}/footer.md`;
        if (await this.fileExists(footerPath)) {
            content.footer = await this.loadMarkdown(footerPath);
        }
        
        const changelogPath = `${basePath}/changelog.md`;
        if (await this.fileExists(changelogPath)) {
            content.changelog = await this.loadMarkdown(changelogPath);
        }
        
        const readmePath = `${basePath}/readme.md`;
        if (await this.fileExists(readmePath)) {
            content.readme = await this.loadMarkdown(readmePath);
        }
        
        return content;
    }

    getLoadError() {
        return this.loadError;
    }
}