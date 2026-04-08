import { UIHelper } from '../shared/UIHelper.js';
import { ContentLoader } from './ContentLoader.js';
import { FileListRenderer } from './FileListRenderer.js';

export class FileManager {
    constructor(contentLoader, localization, config) {
        this.contentLoader = contentLoader;
        this.localization = localization;
        this.config = config;
        this.fileListRenderer = null;
    }

    async render(path) {
        const main = document.querySelector('main');
        if (!main) return;
        
        this.fileListRenderer = new FileListRenderer(this.contentLoader, this.localization);
        
        const nodeInfo = this.contentLoader.getNodeInfo(path);
        
        if (!nodeInfo) {
            main.innerHTML = `
                <div class="empty-state">
                    <div class="error-icon">🔍</div>
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
                        <div class="error-icon">📄</div>
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
                    <div class="error-icon">📁</div>
                    <h2>${this.localization.t('directory_empty')}</h2>
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
                    <a href="javascript:void(0)" onclick="window.switchLayout('list')" id="layout-list" class="layout current">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-layout-list" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                            <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"></path>
                            <path d="M4 14m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"></path>
                        </svg>
                        ${this.localization.t('list_view')}
                    </a>
                    <a href="javascript:void(0)" onclick="window.switchLayout('grid')" id="layout-grid" class="layout">
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
        
        if (folderContent.header) html += folderContent.header;
        
        for (const msg of folderContent.messages) {
            html += UIHelper.renderMessage(msg.content, msg.type);
        }
        
        if (folderContent.changelog) html += `<div class="changelog-preview">${folderContent.changelog}</div>`;
        
        if (folderContent.readme) html += `<div class="readme">${folderContent.readme}</div>`;
        
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
                                <a href="javascript:void(0)" onclick="window.changeSort('name')" class="sort-name">${this.localization.t('name')}</a>
                            </th>
                            <th class="size-column">
                                <a href="javascript:void(0)" onclick="window.changeSort('size')" class="sort-size">${this.localization.t('size')}</a>
                            </th>
                            <th class="checksum-column">SHA256</th>
                            <th class="timestamp-column hideable">
                                <a href="javascript:void(0)" onclick="window.changeSort('date')" class="sort-date">${this.localization.t('modified')}</a>
                            </th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
        
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
        
        // Формируем h1 из хлебных крошек
        const breadcrumbs = UIHelper.buildBreadcrumbs(path, (key) => this.localization.t(key));
        const h1 = document.querySelector('h1');
        if (h1) {
            h1.innerHTML = breadcrumbs.map((bc, i) => 
                `<a href="${bc.path}">${bc.name}</a>${i < breadcrumbs.length - 1 ? ' / ' : ''}`
            ).join('');
        }
        
        // Применяем сохранённый вид после рендера таблицы
        const savedLayout = localStorage.getItem('filemanager-layout');
        if (savedLayout && savedLayout !== 'list') {
            setTimeout(() => {
                if (window.switchLayout) {
                    window.switchLayout(savedLayout);
                }
            }, 50);
        }
    }

    changeSort(sortBy) {
        if (!this.fileListRenderer) return;
        this.fileListRenderer.changeSort(sortBy);
        
        const currentPath = window.location.pathname;
        if (currentPath !== '/' && currentPath !== '/index.html') {
            const children = this.contentLoader.getChildren(currentPath);
            if (children) {
                this.fileListRenderer.render(children, currentPath);
            }
        }
    }
}