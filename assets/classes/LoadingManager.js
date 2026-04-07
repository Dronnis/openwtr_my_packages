export class LoadingManager {
    constructor() {
        this.loadingTasks = new Map();
        this.totalTasks = 0;
        this.completedTasks = 0;
        this.failedTasks = 0;
        this.onProgress = null;
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
            this.updateProgress();
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
            
            this.updateProgress();
            
            if (this.completedTasks + this.failedTasks === this.totalTasks) {
                this.hide();
            }
        }
    }

    updateProgress() {
        const total = this.totalTasks;
        const completed = this.completedTasks + this.failedTasks;
        const percent = total > 0 ? (completed / total) * 100 : 0;
        
        const activeTasks = Array.from(this.loadingTasks.values())
            .filter(t => t.status === 'loading');
        
        const currentTask = activeTasks[0];
        const currentType = currentTask?.type || '';
        
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
        
        const typeNameRu = typeNames[currentType] || currentType;
        const typeNameEn = {
            'index': 'Loading index',
            'markdown': 'Loading documentation',
            'file': 'Checking files',
            'message': 'Loading messages',
            'header': 'Loading header',
            'footer': 'Loading footer',
            'changelog': 'Loading changelog',
            'readme': 'Loading readme'
        }[currentType] || currentType;
        
        // Try to get current locale
        const isRu = document.documentElement.lang === 'ru' || 
                     (localStorage.getItem('locale') || 'ru') === 'ru';
        
        const message = isRu ? typeNameRu : typeNameEn;
        const progressText = isRu ? 
            `Загрузка... ${Math.round(percent)}% (${completed}/${total})` :
            `Loading... ${Math.round(percent)}% (${completed}/${total})`;
        
        this.updateUI(percent, message, progressText, completed, total);
        
        if (this.onProgress) {
            this.onProgress(percent, completed, total, currentType);
        }
        
        if (completed === total && this.onComplete) {
            this.onComplete(this.failedTasks === 0);
        }
    }

    updateUI(percent, currentTask, progressText, completed, total) {
        let overlay = document.getElementById('progress-overlay');
        if (!overlay) return;
        
        const bar = overlay.querySelector('.progress-bar-fill');
        const messageEl = overlay.querySelector('.progress-message');
        const textEl = overlay.querySelector('.progress-text');
        const countEl = overlay.querySelector('.progress-count');
        
        if (bar) bar.style.width = `${percent}%`;
        if (messageEl) messageEl.textContent = currentTask;
        if (textEl) textEl.textContent = progressText;
        if (countEl) countEl.textContent = `${completed}/${total}`;
        
        // Change spinner to progress bar when we have tasks
        const spinner = overlay.querySelector('.spinner');
        const progressBarWrapper = overlay.querySelector('.progress-bar-wrapper');
        
        if (total > 1 && spinner && progressBarWrapper) {
            spinner.style.display = 'none';
            progressBarWrapper.style.display = 'block';
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
                    <div class="progress-bar-wrapper" style="display: none;">
                        <div class="progress-bar">
                            <div class="progress-bar-fill"></div>
                        </div>
                    </div>
                    <div class="progress-message"></div>
                    <div class="progress-text"></div>
                    <div class="progress-count"></div>
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