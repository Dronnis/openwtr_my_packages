export class LoadingManager {
    constructor() {
        this.loadingTasks = new Map();
        this.totalTasks = 0;
        this.completedTasks = 0;
        this.failedTasks = 0;
        this.currentTask = null;
        this.isActive = false;
        this.localization = null;
    }

    setLocalization(localization) {
        this.localization = localization;
    }

    startTask(id, type = 'unknown') {
        if (!this.isActive) {
            this.show();
        }
        
        if (!this.loadingTasks.has(id)) {
            this.loadingTasks.set(id, { type, status: 'loading' });
            this.totalTasks++;
            this.currentTask = { id, type };
            this.updateUI();
        }
    }

    completeTask(id, success = true) {
        const task = this.loadingTasks.get(id);
        if (task && task.status === 'loading') {
            task.status = success ? 'completed' : 'failed';
            
            if (success) {
                this.completedTasks++;
            } else {
                this.failedTasks++;
            }
            
            const nextTask = Array.from(this.loadingTasks.entries())
                .find(([_, t]) => t.status === 'loading');
            
            this.currentTask = nextTask ? { id: nextTask[0], type: nextTask[1].type } : null;
            
            this.updateUI();
            
            if (this.completedTasks + this.failedTasks === this.totalTasks) {
                this.hide();
            }
        }
    }

    getTypeName(type) {
        const typeNames = {
            'index': 'loading_index',
            'info': 'loading_metadata',
            'markdown': 'loading_documentation',
            'file': 'checking_files',
            'message': 'loading_messages',
            'header': 'loading_header',
            'footer': 'loading_footer',
            'changelog': 'loading_changelog',
            'readme': 'loading_readme'
        };
        
        const key = typeNames[type] || 'loading';
        
        if (this.localization) {
            return this.localization.t(key);
        }
        
        const fallback = {
            'index': 'Loading index...',
            'info': 'Loading metadata...',
            'markdown': 'Loading documentation...',
            'file': 'Checking files...',
            'message': 'Loading messages...',
            'header': 'Loading header...',
            'footer': 'Loading footer...',
            'changelog': 'Loading changelog...',
            'readme': 'Loading readme...'
        };
        
        return fallback[type] || 'Loading...';
    }

    updateUI() {
        let statusText = '';
        
        if (this.currentTask) {
            statusText = this.getTypeName(this.currentTask.type);
        }
        
        const completed = this.completedTasks + this.failedTasks;
        this.updateUIElements(statusText, completed, this.totalTasks);
    }

    updateUIElements(statusText, completed, total) {
        let overlay = document.getElementById('progress-overlay');
        if (!overlay) return;
        
        const messageEl = overlay.querySelector('.progress-message');
        const statusEl = overlay.querySelector('.progress-status');
        
        if (messageEl && statusText) {
            messageEl.textContent = statusText;
        }
        
        if (statusEl) {
            statusEl.textContent = total > 0 ? `${completed}/${total}` : '';
        }
    }

    show() {
        this.isActive = true;
        let overlay = document.getElementById('progress-overlay');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'progress-overlay';
            overlay.className = 'progress-overlay';
            overlay.innerHTML = `
                <div class="progress-container">
                    <div class="spinner"></div>
                    <div class="progress-message">Loading...</div>
                    <div class="progress-status"></div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        
        overlay.style.display = 'flex';
    }

    hide() {
        if (this.isActive) {
            setTimeout(() => {
                const overlay = document.getElementById('progress-overlay');
                if (overlay && this.completedTasks + this.failedTasks === this.totalTasks) {
                    overlay.style.display = 'none';
                    this.reset();
                }
            }, 500);
        }
    }

    reset() {
        this.loadingTasks.clear();
        this.totalTasks = 0;
        this.completedTasks = 0;
        this.failedTasks = 0;
        this.currentTask = null;
        this.isActive = false;
    }
}

export const loadingManager = new LoadingManager();