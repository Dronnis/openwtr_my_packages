export class LoadingManager {
    constructor() {
        this.loadingTasks = new Map();
        this.totalTasks = 0;
        this.completedTasks = 0;
        this.failedTasks = 0;
        this.currentTask = null;
        this.onComplete = null;
        this.isActive = false;
    }

    startTask(id, type = 'unknown') {
        if (!this.isActive) {
            this.show();
        }
        
        if (!this.loadingTasks.has(id)) {
            this.loadingTasks.set(id, { type, status: 'loading', startTime: Date.now() });
            this.totalTasks++;
            this.currentTask = { id, type };
            this.updateUI();
        }
    }

    completeTask(id, success = true) {
        const task = this.loadingTasks.get(id);
        if (task && task.status === 'loading') {
            task.status = success ? 'completed' : 'failed';
            task.endTime = Date.now();
            
            if (success) {
                this.completedTasks++;
            } else {
                this.failedTasks++;
            }
            
            // Find next loading task
            const nextTask = Array.from(this.loadingTasks.entries())
                .find(([_, t]) => t.status === 'loading');
            
            this.currentTask = nextTask ? { id: nextTask[0], type: nextTask[1].type } : null;
            
            this.updateUI();
            
            if (this.completedTasks + this.failedTasks === this.totalTasks) {
                this.hide();
            }
        }
    }

    updateUI() {
        const typeNames = {
            'index': 'Загрузка индекса',
            'markdown': 'Загрузка документации',
            'file': 'Проверка файлов',
            'message': 'Загрузка уведомлений',
            'header': 'Загрузка заголовка',
            'footer': 'Загрузка подвала',
            'changelog': 'Загрузка changelog',
            'readme': 'Загрузка readme'
        };
        
        const typeNamesEn = {
            'index': 'Loading index',
            'markdown': 'Loading documentation',
            'file': 'Checking files',
            'message': 'Loading messages',
            'header': 'Loading header',
            'footer': 'Loading footer',
            'changelog': 'Loading changelog',
            'readme': 'Loading readme'
        };
        
        // Try to get current locale
        const isRu = document.documentElement.lang === 'ru' || 
                     (localStorage.getItem('locale') || 'ru') === 'ru';
        
        let statusText = '';
        if (this.currentTask) {
            const typeName = isRu ? typeNames[this.currentTask.type] : typeNamesEn[this.currentTask.type];
            statusText = typeName || this.currentTask.type;
        }
        
        const total = this.totalTasks;
        const completed = this.completedTasks + this.failedTasks;
        
        this.updateUIElements(statusText, completed, total);
        
        if (this.onComplete && completed === total) {
            this.onComplete(this.failedTasks === 0);
        }
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
            if (total > 0) {
                statusEl.textContent = `${completed}/${total}`;
            } else {
                statusEl.textContent = '';
            }
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
                    <div class="progress-message">Загрузка...</div>
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

    getStats() {
        return {
            total: this.totalTasks,
            completed: this.completedTasks,
            failed: this.failedTasks,
            pending: this.totalTasks - this.completedTasks - this.failedTasks
        };
    }
}

// Global loading manager instance
export const loadingManager = new LoadingManager();