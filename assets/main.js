import { loadingManager } from './js/shared/LoadingManager.js';
import { Localization } from './js/shared/Localization.js';
import { ContentLoader } from './js/filemanager/ContentLoader.js';
import { IndexPage } from './js/index/IndexPage.js';
import { FileManager } from './js/filemanager/FileManager.js';
import { UIHelper } from './js/shared/UIHelper.js';

class App {
    constructor() {
        this.localization = new Localization();
        this.contentLoader = null;
        this.indexPage = null;
        this.fileManager = null;
        this.config = null;
        this.currentLayout = localStorage.getItem('filemanager-layout') || 'list';
    }

    async init() {
        await this.localization.loadTranslations();
        
        this.contentLoader = new ContentLoader(this.localization);
        
        try {
            await this.contentLoader.loadIndex();
            this.config = this.contentLoader.config;
        } catch (error) {
            this.showIndexError(error.message);
            return;
        }
        
        this.setupHeader();
        this.setupFooter();
        this.createLanguageSwitcher();
        
        const currentPath = this.getCurrentPath();
        
        if (currentPath === '/' || currentPath === '/index.html') {
            this.indexPage = new IndexPage(this.contentLoader, this.localization, this.config);
            await this.indexPage.render();
            this.setupMainPage();
        } else {
            this.fileManager = new FileManager(this.contentLoader, this.localization, this.config);
            await this.fileManager.render(currentPath);
            this.setupFileManagerEvents();
        }
        
        this.setupGlobalFunctions();
        this.setupYear();
    }

    setupHeader() {
        const header = document.querySelector('header .wrapper');
        if (!header) return;
        
        const logo = document.createElement('div');
        logo.className = 'logo';
        logo.innerHTML = `
            <a href="/" class="logo-link">
                <span class="logo-icon">🖥️</span>
                <span class="logo-text">D-WRT</span>
            </a>
        `;
        
        const quickLinks = document.createElement('div');
        quickLinks.className = 'quick-links-menu';
        
        if (this.config?.mainPage?.quickLinks) {
            for (const link of this.config.mainPage.quickLinks) {
                const target = link.download ? `download="${link.path}"` : '';
                quickLinks.innerHTML += `<a href="${link.path}" ${target} class="quick-link-item">${link.label}</a>`;
            }
        }
        
        const headerContent = document.createElement('div');
        headerContent.className = 'header-content';
        headerContent.appendChild(logo);
        headerContent.appendChild(quickLinks);
        
        const existingSwitcher = header.querySelector('.language-switcher');
        if (existingSwitcher) {
            header.insertBefore(headerContent, existingSwitcher);
        } else {
            header.appendChild(headerContent);
        }
    }

    setupFooter() {
        const footer = document.querySelector('footer');
        if (!footer) return;
        
        const footerLinks = document.createElement('div');
        footerLinks.className = 'footer-links';
        
        if (this.config?.footer?.links) {
            for (const link of this.config.footer.links) {
                footerLinks.innerHTML += `<a href="${link.url}" target="_blank" rel="noopener noreferrer">${link.label}</a>`;
                footerLinks.innerHTML += '<span class="separator">|</span>';
            }
        } else {
            footerLinks.innerHTML = `
                <a href="https://github.com" target="_blank">GitHub</a>
                <span class="separator">|</span>
                <a href="#" target="_blank">Documentation</a>
                <span class="separator">|</span>
                <a href="#" target="_blank">Support</a>
            `;
        }
        
        const copyright = document.createElement('div');
        copyright.className = 'copyright';
        copyright.innerHTML = `<span id="year"></span> D-WRT Project`;
        
        footer.innerHTML = '';
        footer.appendChild(footerLinks);
        footer.appendChild(copyright);
    }

    createLanguageSwitcher() {
        const header = document.querySelector('header .wrapper');
        if (!header) return;
        
        const existingSwitcher = header.querySelector('.language-switcher');
        if (existingSwitcher) existingSwitcher.remove();
        
        const switcher = document.createElement('div');
        switcher.className = 'language-switcher';
        
        const flagMap = { ru: '🇷🇺', en: '🇬🇧' };
        const nameMap = { ru: 'RU', en: 'EN' };
        
        for (const locale of this.localization.getAvailableLocales()) {
            const option = document.createElement('button');
            option.className = `lang-option ${locale === this.localization.getCurrentLocale() ? 'active' : ''}`;
            option.innerHTML = `${flagMap[locale]} ${nameMap[locale]}`;
            option.onclick = async () => {
                if (this.localization.setLocale(locale)) {
                    window.location.reload();
                }
            };
            switcher.appendChild(option);
        }
        
        header.appendChild(switcher);
    }

    setupMainPage() {
        const breadcrumbDiv = document.querySelector('.breadcrumbs');
        if (breadcrumbDiv) breadcrumbDiv.style.display = 'none';
        
        const h1 = document.querySelector('h1');
        if (h1) {
            h1.innerHTML = '<a href="/">D-WRT</a>';
            h1.style.fontSize = '24px';
        }
        
        const meta = document.querySelector('.meta');
        if (meta) meta.style.display = 'none';
    }

    setupFileManagerEvents() {
        const breadcrumbDiv = document.querySelector('.breadcrumbs');
        if (breadcrumbDiv) breadcrumbDiv.style.display = 'none';
        
        const meta = document.querySelector('.meta');
        if (meta) meta.style.display = 'flex';
    }

    setupGlobalFunctions() {
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
        
        window.changeSort = (sortBy) => {
            if (this.fileManager) {
                this.fileManager.changeSort(sortBy);
            }
        };
        
        window.switchLayout = (layout) => {
            this.currentLayout = layout;
            localStorage.setItem('filemanager-layout', layout);
            
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
        };
        
        window.copyToClipboard = UIHelper.copyToClipboard;
        
        const savedLayout = localStorage.getItem('filemanager-layout');
        if (savedLayout && savedLayout !== this.currentLayout) {
            this.currentLayout = savedLayout;
            setTimeout(() => window.switchLayout(savedLayout), 100);
        }
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
                        <p>Please check that <code>/index.json</code> is valid JSON.</p>
                    </div>
                    <div class="error-actions">
                        <button onclick="location.reload()" class="error-btn">⟳ Retry</button>
                        <a href="/" class="error-btn">🏠 Go Home</a>
                    </div>
                </div>
            `;
        }
    }

    getCurrentPath() {
        let currentPath = window.location.pathname;
        if (currentPath.endsWith('/') && currentPath !== '/') {
            currentPath = currentPath.slice(0, -1);
        }
        return currentPath;
    }

    setupYear() {
        const yearSpan = document.getElementById('year');
        if (yearSpan) {
            yearSpan.innerHTML = new Date().getFullYear();
        }
    }
}

const app = new App();
app.init();