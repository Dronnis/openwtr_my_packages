import { UIHelper } from './UIHelper.js';
import { ContentLoader } from './ContentLoader.js';
import { FileListRenderer } from './FileListRenderer.js';
import { Localization } from './Localization.js';

export class FileManager {
    constructor() {
        this.localization = new Localization();
        this.contentLoader = null;
        this.fileListRenderer = null;
    }

    async init() {
        // Load translations first
        await this.localization.loadTranslations();
        
        // Initialize content loader with localization
        this.contentLoader = new ContentLoader(this.localization);
        
        try {
            await this.contentLoader.loadIndex();
        } catch (error) {
            this.showIndexError(error.message);
            return;
        }
        
        if (this.contentLoader.config?.title) {
            document.title = this.contentLoader.config.title;
        }
        
        if (this.contentLoader.config?.favicon) {
            const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
            link.type = 'image/x-icon';
            link.rel = 'shortcut icon';
            link.href = this.contentLoader.config.favicon;
            document.getElementsByTagName('head')[0].appendChild(link);
        }
        
        this.fileListRenderer = new FileListRenderer(this.contentLoader, this.localization);
        
        const currentPath = this.getCurrentPath();
        
        if (currentPath === '/' || currentPath === '/index.html') {
            await this.renderMainPage();
        } else {
            await this.renderFolderPage(currentPath);
        }
        
        this.initUI();
        this.createLanguageSwitcher();
    }

    showIndexError(errorMessage) {
        const main = document.querySelector('main');
        if (main) {
            main.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">❌</div>
                    <h2>${this.localization.t('error_loading_index')}</h2>
                    <div class="error-details">
                        <p>${errorMessage}</p>
                        <p>Please check that <code>/index.json</code> is valid JSON and has the correct structure.</p>
                    </div>
                    <div class="error-actions">
                        <button onclick="location.reload()" class="error-btn">⟳ Retry</button>
                        <a href="/" class="error-btn">🏠 Go Home</a>
                    </div>
                </div>
            `;
        }
    }

    createLanguageSwitcher() {
        const header = document.querySelector('header .wrapper');
        if (!header) return;
        
        const switcher = document.createElement('div');
        switcher.className = 'language-switcher';
        
        const currentLocale = this.localization.getCurrentLocale();
        const locales = this.localization.getAvailableLocales();
        
        const flagMap = {
            ru: '🇷🇺',
            en: '🇬🇧'
        };
        
        const nameMap = {
            ru: 'Русский',
            en: 'English'
        };
        
        locales.forEach(locale => {
            const option = document.createElement('button');
            option.className = `lang-option ${locale === currentLocale ? 'active' : ''}`;
            option.innerHTML = `${flagMap[locale]} ${nameMap[locale]}`;
            option.onclick = async () => {
                if (this.localization.setLocale(locale)) {
                    // Reload the page to apply new locale
                    window.location.reload();
                }
            };
            switcher.appendChild(option);
        });
        
        header.appendChild(switcher);
    }

    getCurrentPath() {
        let currentPath = window.location.pathname;
        if (currentPath.endsWith('/') && currentPath !== '/') {
            currentPath = currentPath.slice(0, -1);
        }
        return currentPath;
    }

    async renderMainPage() {
        const main = document.querySelector('main');
        if (!main) return;
        
        const config = this.contentLoader.config;
        const rootContent = await this.contentLoader.loadFolderContent('');
        
        let html = `<div class="main-content">`;
        
        for (const msg of rootContent.messages) {
            html += UIHelper.renderMessage(msg.content, msg.type);
        }
        
        if (config?.mainPage?.latestRelease) {
            const latestPath = config.mainPage.latestRelease;
            const latestNode = this.contentLoader.getNodeInfo(latestPath);
            const latestInfo = latestNode?.__INFO__ || latestNode;
            
            if (latestInfo && latestInfo.downloadFile) {
                const downloadUrl = `${latestPath}/${latestInfo.downloadFile}`;
                const versionName = latestPath.split('/').pop();
                const exists = await this.contentLoader.fileExists(downloadUrl);
                
                if (exists) {
                    html += `
                        <div class="latest-release-banner">
                            <h2>🎉 ${this.localization.t('latest_release')}: ${versionName}</h2>
                            <a href="${downloadUrl}" class="download-btn" download>
                                ⬇️ ${this.localization.t('download')} ${latestInfo.downloadFile}
                            </a>
                        </div>
                    `;
                }
            }
        }
        
        if (rootContent.header) html += rootContent.header;
        
        if (config?.mainPage?.showChangelog && config?.mainPage?.changelogFile) {
            const changelogPath = config.mainPage.changelogFile;
            const exists = await this.contentLoader.fileExists(changelogPath);
            if (exists) {
                const changelogHtml = await this.contentLoader.loadMarkdown(changelogPath);
                if (changelogHtml) {
                    html += `<div class="changelog-preview"><h2>📝 ${this.localization.t('whats_new')}</h2>${changelogHtml}</div>`;
                }
            }
        }
        
        if (config?.mainPage?.quickLinks?.length) {
            html += `<div class="quick-links"><h3>${this.localization.t('quick_links')}</h3><div class="quick-links-grid">`;
            for (const link of config.mainPage.quickLinks) {
                let label = link.label;
                if (label.includes('Все релизы')) label = this.localization.t('all_releases');
                if (label.includes('Ключ репозитория')) label = this.localization.t('repository_key');
                if (label.includes('Документация')) label = this.localization.t('documentation');
                
                const target = link.download ? `download="${link.path}"` : '';
                html += `<a href="${link.path}" ${target} class="quick-link">${label}</a>`;
            }
            html += `</div></div>`;
        }
        
        if (rootContent.footer) html += rootContent.footer;
        
        html += `</div>`;
        main.innerHTML = html;
        
        // Update header
        const breadcrumbDiv = document.querySelector('.breadcrumbs');
        if (breadcrumbDiv) breadcrumbDiv.innerHTML = this.localization.t('repository_home');
        const h1 = document.querySelector('h1');
        if (h1) h1.innerHTML = `<a href="/">${this.localization.t('home')}</a>`;
    }

    async renderFolderPage(path) {
        const main = document.querySelector('main');
        if (!main) return;
        
        const nodeInfo = this.contentLoader.getNodeInfo(path);
        
        if (!nodeInfo) {
            main.innerHTML = `
                <div class="empty-state">
                    <h2>404 - ${this.localization.t('path_not_found')}</h2>
                    <p>${path} ${this.localization.t('not_found_in_index')}</p>
                    <p><a href="/">← ${this.localization.t('back_to_home')}</a></p>
                </div>
            `;
            return;
        }
        
        if (nodeInfo.type === 'file' || (nodeInfo.type !== 'dir' && !nodeInfo.__INFO__)) {
            const exists = await this.contentLoader.fileExists(path);
            if (exists) {
                window.location.href = path;
            } else {
                main.innerHTML = `
                    <div class="empty-state">
                        <h2>404 - ${this.localization.t('file_not_found')}</h2>
                        <p>${path} ${this.localization.t('listed_but_not_exists')}</p>
                        <p><a href="/">← ${this.localization.t('back_to_home')}</a></p>
                    </div>
                `;
            }
            return;
        }
        
        const children = this.contentLoader.getChildren(path);
        if (!children || Object.keys(children).length === 0) {
            main.innerHTML = `
                <div class="empty-state">
                    <h2>📁 ${this.localization.t('directory_empty')}</h2>
                    <p>${this.localization.t('contains_no_files')}</p>
                    <p><a href="/">← ${this.localization.t('back_to_home')}</a></p>
                </div>
            `;
            return;
        }
        
        const folderContent = await this.contentLoader.loadFolderContent(path);
        
        let html = `
            <div class="meta">
                <div id="summary">
                    <span class="meta-item"><b id="dir-count">0</b> ${this.localization.t('directories')}</span>
                    <span class="meta-item"><b id="file-count">0</b> ${this.localization.t('files')}</span>
                </div>
                <div class="view-controls">
                    <a href="javascript:void(0)" onclick="window.fileManager && window.fileManager.setLayout('list')" id="layout-list" class="layout current">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-layout-list" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                            <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"></path>
                            <path d="M4 14m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"></path>
                        </svg>
                        ${this.localization.t('list_view')}
                    </a>
                    <a href="javascript:void(0)" onclick="window.fileManager && window.fileManager.setLayout('grid')" id="layout-grid" class="layout">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-layout-grid" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                            <path d="M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                            <path d="M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                            <path d="M4 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                            <path d="M14 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                        </svg>
                        ${this.localization.t('grid_view')}
                    </a>
                </div>
            </div>
        `;
        
        for (const msg of folderContent.messages) {
            html += UIHelper.renderMessage(msg.content, msg.type);
        }
        
        if (folderContent.header) html += folderContent.header;
        if (folderContent.changelog) html += `<div class="changelog-preview">${folderContent.changelog}</div>`;
        
        html += `
            <div class="listing">
                <div class="filter-bar">
                    <div class="filter-container">
                        <svg id="search-icon" xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-search" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                            <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/>
                            <path d="M21 21l-6 -6"/>
                        </svg>
                        <input type="text" placeholder="${this.localization.t('filter_placeholder')}" id="filter" onkeyup="window.filterFiles()">
                    </div>
                </div>
                <table id="file-listing">
                    <thead>
                        <tr>
                            <th class="icon-column"></th>
                            <th class="name-column">
                                <a href="javascript:void(0)" onclick="window.fileManager && window.fileManager.changeSort('name')" class="sort-name">${this.localization.t('name')}</a>
                            </th>
                            <th class="size-column">
                                <a href="javascript:void(0)" onclick="window.fileManager && window.fileManager.changeSort('size')" class="sort-size">${this.localization.t('size')}</a>
                            </th>
                            <th class="checksum-column">SHA256</th>
                            <th class="timestamp-column hideable">
                                <a href="javascript:void(0)" onclick="window.fileManager && window.fileManager.changeSort('date')" class="sort-date">${this.localization.t('modified')}</a>
                            </th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
        
        if (folderContent.readme) html += `<div class="readme">${folderContent.readme}</div>`;
        if (folderContent.footer) html += folderContent.footer;
        
        main.innerHTML = html;
        
        await this.fileListRenderer.render(children, path);
        
        let dirCount = 0, fileCount = 0;
        for (const [name, data] of Object.entries(children)) {
            if (name === '__INFO__') continue;
            if (data.type === 'dir' || data.__INFO__?.type === 'dir') {
                dirCount++;
            } else {
                fileCount++;
            }
        }
        
        const dirCountEl = document.getElementById('dir-count');
        const fileCountEl = document.getElementById('file-count');
        if (dirCountEl) dirCountEl.textContent = dirCount;
        if (fileCountEl) fileCountEl.textContent = fileCount;
        
        // Update breadcrumbs
        const breadcrumbs = UIHelper.buildBreadcrumbs(path);
        const breadcrumbDiv = document.querySelector('.breadcrumbs');
        if (breadcrumbDiv) {
            breadcrumbDiv.innerHTML = `${this.localization.t('navigation')}: ${breadcrumbs.map((bc, i) => 
                `<a href="${bc.path}">${bc.name === 'Главная' ? this.localization.t('home') : bc.name}</a>${i < breadcrumbs.length - 1 ? ' / ' : ''}`
            ).join('')}`;
        }
        
        const h1 = document.querySelector('h1');
        if (h1) {
            h1.innerHTML = breadcrumbs.map((bc, i) => 
                `<a href="${bc.path}">${bc.name === 'Главная' ? this.localization.t('home') : bc.name}</a>${i < breadcrumbs.length - 1 ? ' / ' : ''}`
            ).join('');
        }
    }

    changeSort(sortBy) {
        if (!this.fileListRenderer) return;
        const result = this.fileListRenderer.changeSort(sortBy);
        
        const currentPath = this.getCurrentPath();
        if (currentPath !== '/' && currentPath !== '/index.html') {
            const children = this.contentLoader.getChildren(currentPath);
            if (children) {
                this.fileListRenderer.render(children, currentPath);
            }
        }
    }

    setLayout(layout) {
        const listing = document.querySelector('.listing');
        if (!listing) return;
        
        const existingGrid = listing.querySelector('.grid-container');
        if (existingGrid) existingGrid.remove();
        
        if (layout === 'grid') {
            listing.classList.add('grid-view');
            listing.classList.remove('list-view');
            
            const table = listing.querySelector('table');
            const tbody = table.querySelector('tbody');
            const rows = tbody.querySelectorAll('tr:not(.parent-dir)');
            
            const gridContainer = document.createElement('div');
            gridContainer.className = 'grid-container';
            
            rows.forEach(row => {
                const iconCell = row.querySelector('.icon-cell');
                const nameLink = row.querySelector('.name-cell a');
                const nameSpan = row.querySelector('.name');
                const sizeCell = row.querySelector('.size-cell .sizebar-text');
                const checksumCell = row.querySelector('.checksum-cell .sha256-hash');
                const timeEl = row.querySelector('time');
                const isMissing = row.classList.contains('missing');
                
                if (nameSpan) {
                    const gridItem = document.createElement('div');
                    gridItem.className = 'grid-item';
                    
                    if (isMissing) {
                        gridItem.classList.add('missing');
                        gridItem.innerHTML = `
                            <div class="grid-item-content missing">
                                ${iconCell ? iconCell.innerHTML : ''}
                                <div class="name">${nameSpan.textContent}</div>
                                <div class="missing-badge">404 - Not Found</div>
                            </div>
                        `;
                    } else if (nameLink) {
                        let checksumHtml = '';
                        if (checksumCell) {
                            const sha256 = checksumCell.textContent.replace('✓ Copied!', '').trim();
                            if (sha256 && sha256 !== '—') {
                                checksumHtml = `<div class="grid-item-checksum" onclick="window.copyToClipboard('${sha256.replace('...', '')}', this)">${sha256}</div>`;
                            }
                        }
                        
                        gridItem.innerHTML = `
                            <a href="${nameLink.getAttribute('href')}">
                                ${iconCell ? iconCell.innerHTML : ''}
                                <div class="name">${nameSpan.textContent}</div>
                                <div class="grid-item-size">${sizeCell ? sizeCell.textContent : '—'}</div>
                                ${checksumHtml}
                                <div class="grid-item-date">${timeEl ? UIHelper.formatDate(parseInt(new Date(timeEl.getAttribute('datetime')).getTime() / 1000)) : '—'}</div>
                            </a>
                        `;
                    }
                    gridContainer.appendChild(gridItem);
                }
            });
            
            table.style.display = 'none';
            listing.appendChild(gridContainer);
        } else {
            listing.classList.add('list-view');
            listing.classList.remove('grid-view');
            const table = listing.querySelector('table');
            if (table) table.style.display = 'table';
        }
        
        const listBtn = document.getElementById('layout-list');
        const gridBtn = document.getElementById('layout-grid');
        
        if (listBtn && gridBtn) {
            if (layout === 'list') {
                listBtn.classList.add('current');
                gridBtn.classList.remove('current');
            } else {
                gridBtn.classList.add('current');
                listBtn.classList.remove('current');
            }
        }
        
        localStorage.setItem('filemanager-layout', layout);
    }

    initUI() {
        const yearSpan = document.getElementById('year');
        if (yearSpan) {
            yearSpan.innerHTML = new Date().getFullYear();
        }
        
        const savedLayout = localStorage.getItem('filemanager-layout');
        if (savedLayout) {
            setTimeout(() => this.setLayout(savedLayout), 100);
        }
        
        // Global filter function
        window.filterFiles = () => {
            const filterEl = document.getElementById('filter');
            if (!filterEl) return;
            
            const q = filterEl.value.trim().toLowerCase();
            const rows = document.querySelectorAll('#file-listing tbody tr');
            
            rows.forEach(row => {
                if (!q) {
                    row.style.display = '';
                    return;
                }
                const nameEl = row.querySelector('.name');
                if (nameEl) {
                    const nameVal = nameEl.textContent.trim().toLowerCase();
                    row.style.display = nameVal.indexOf(q) !== -1 ? '' : 'none';
                }
            });
        };
        
        window.copyToClipboard = UIHelper.copyToClipboard;
    }
}