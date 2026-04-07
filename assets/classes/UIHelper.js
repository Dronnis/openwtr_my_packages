// UI Helper Class for common UI operations
export class UIHelper {
    static showProgress(message = 'Loading...') {
        let overlay = document.getElementById('progress-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'progress-overlay';
            overlay.className = 'progress-overlay';
            overlay.innerHTML = `
                <div class="progress-container">
                    <div class="spinner"></div>
                    <div class="progress-message">${message}</div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
        const msgEl = overlay.querySelector('.progress-message');
        if (msgEl) msgEl.textContent = message;
    }

    static updateProgressMessage(message) {
        const overlay = document.getElementById('progress-overlay');
        if (overlay) {
            const msgEl = overlay.querySelector('.progress-message');
            if (msgEl) msgEl.textContent = message;
        }
    }

    static hideProgress() {
        const overlay = document.getElementById('progress-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    static formatSize(bytes) {
        if (bytes === 0) return '0 B';
        if (!bytes || bytes === null) return '—';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    static formatDate(timestamp) {
        if (!timestamp) return '—';
        const date = new Date(timestamp * 1000);
        return date.toLocaleString();
    }

    static async copyToClipboard(text, element) {
        try {
            await navigator.clipboard.writeText(text);
            const originalText = element.textContent;
            element.textContent = '✓ Copied!';
            element.style.color = '#4caf50';
            setTimeout(() => {
                element.textContent = originalText;
                element.style.color = '';
            }, 1500);
        } catch (err) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            
            const originalText = element.textContent;
            element.textContent = '✓ Copied!';
            setTimeout(() => {
                element.textContent = originalText;
            }, 1500);
        }
    }

    static renderMessage(content, type) {
        const icons = {
            notice: '📌',
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };
        const icon = icons[type] || '📌';
        
        return `
            <div class="message message-${type}">
                <div class="message-icon">${icon}</div>
                <div class="message-content">${content}</div>
            </div>
        `;
    }

    static getIcon(type, iconName) {
        if (type === 'dir') {
            return `<svg class="icon icon-tabler icon-tabler-folder-filled" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="currentColor"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 3a1 1 0 0 1 .608 .206l.1 .087l2.706 2.707h6.586a3 3 0 0 1 2.995 2.824l.005 .176v8a3 3 0 0 1 -2.824 2.995l-.176 .005h-14a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-11a3 3 0 0 1 2.824 -2.995l.176 -.005h4z"/></svg>`;
        }
        
        const icons = {
            package: `<svg class="icon icon-tabler" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5"/><path d="M16.5 9.5l-4.5-2.5M10 15.5l-2-1.5"/></svg>`,
            image: `<svg class="icon icon-tabler" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 8h.01M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M4 16l5-5c.928-.893 2.072-.893 3 0l5 5"/><path d="M14 14l1-1c.928-.893 2.072-.893 3 0l3 3"/></svg>`,
            key: `<svg class="icon icon-tabler" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0zM15 9h.01"/></svg>`
        };
        
        return icons[iconName] || `<svg class="icon icon-tabler" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M9 12h6"/><path d="M12 9v6"/></svg>`;
    }

    static buildBreadcrumbs(path) {
        const cleanPath = path.replace(/^\/+|\/+$/g, '');
        const parts = cleanPath.split('/').filter(p => p);
        const breadcrumbs = [{ name: 'Главная', path: '/' }];
        
        let currentPath = '';
        for (const part of parts) {
            currentPath += '/' + part;
            breadcrumbs.push({ name: part, path: currentPath });
        }
        
        return breadcrumbs;
    }
}