// Global app state
window.app = {
    indexData: null,
    currentPath: '',
    breadcrumbs: [],
    config: null
};

// Show progress bar
function showProgress(message = 'Loading...') {
    let overlay = document.getElementById('progress-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'progress-overlay';
        overlay.className = 'progress-overlay';
        overlay.innerHTML = `
            <div class="progress-container">
                <div class="progress-bar-wrapper">
                    <div class="progress-bar" id="progress-bar">0%</div>
                </div>
                <div class="progress-text" id="progress-text">${message}</div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    updateProgress(0, message);
}

function updateProgress(percent, message) {
    const bar = document.getElementById('progress-bar');
    const text = document.getElementById('progress-text');
    if (bar) {
        const p = Math.min(100, Math.max(0, percent));
        bar.style.width = p + '%';
        bar.textContent = p + '%';
    }
    if (text && message) {
        text.textContent = message;
    }
}

function hideProgress() {
    const overlay = document.getElementById('progress-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Load index.json with progress
async function loadIndex() {
    showProgress('Loading repository index...');
    
    try {
        const response = await fetch('/index.json');
        const total = parseInt(response.headers.get('content-length') || '0');
        let loaded = 0;
        
        const reader = response.body.getReader();
        const chunks = [];
        
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            
            chunks.push(value);
            loaded += value.length;
            if (total) {
                updateProgress((loaded / total) * 100, `Loading index... ${Math.round((loaded / total) * 100)}%`);
            }
        }
        
        const blob = new Blob(chunks);
        const text = await blob.text();
        window.app.indexData = JSON.parse(text);
        window.app.config = window.app.indexData.cfg;
        
        updateProgress(100, 'Complete!');
        setTimeout(hideProgress, 500);
        
        return window.app.indexData;
    } catch (error) {
        console.error('Failed to load index.json:', error);
        hideProgress();
        throw error;
    }
}

// Get file/folder info from index
function getNodeInfo(path) {
    if (!window.app.indexData) return null;
    
    const parts = path.split('/').filter(p => p);
    let current = window.app.indexData.files;
    
    for (const part of parts) {
        if (current[part]) {
            current = current[part];
        } else {
            return null;
        }
    }
    
    return current.__INFO__ || (current.type ? current : null);
}

// Get folder configuration (header, footer, notice, etc.)
function getFolderConfig(path) {
    if (!window.app.config || !window.app.config.folders) return null;
    
    // Try exact match
    if (window.app.config.folders[path]) {
        return window.app.config.folders[path];
    }
    
    // Try parent paths
    const parts = path.split('/');
    for (let i = parts.length; i > 0; i--) {
        const parentPath = parts.slice(0, i).join('/');
        if (window.app.config.folders[parentPath]) {
            return window.app.config.folders[parentPath];
        }
    }
    
    return null;
}

// Render markdown (simple version, you can use marked.js for full support)
async function renderMarkdown(url) {
    if (!url) return '';
    
    try {
        const response = await fetch(url);
        const text = await response.text();
        
        // Simple markdown to HTML conversion
        let html = text
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*)\*/g, '<em>$1</em>')
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/^\- (.*$)/gm, '<li>$1</li>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
        
        return `<div class="markdown-content"><p>${html}</p></div>`;
    } catch (error) {
        console.error('Failed to load markdown:', error);
        return '<p>Failed to load content</p>';
    }
}

// Build breadcrumbs
function buildBreadcrumbs(path) {
    const parts = path.split('/').filter(p => p);
    const breadcrumbs = [{ name: '/', path: '' }];
    
    let currentPath = '';
    for (const part of parts) {
        currentPath += '/' + part;
        breadcrumbs.push({ name: part, path: currentPath });
    }
    
    return breadcrumbs;
}

// Format file size
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format date
function formatDate(timestamp) {
    if (!timestamp) return '—';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
}

// Get icon based on file type
function getIcon(type, iconName) {
    if (iconName) {
        // You can map icon names to actual SVG icons
        return `<svg class="icon icon-tabler" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>`;
    }
    
    if (type === 'dir') {
        return `<svg class="icon icon-tabler icon-tabler-folder-filled" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="currentColor"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 3a1 1 0 0 1 .608 .206l.1 .087l2.706 2.707h6.586a3 3 0 0 1 2.995 2.824l.005 .176v8a3 3 0 0 1 -2.824 2.995l-.176 .005h-14a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-11a3 3 0 0 1 2.824 -2.995l.176 -.005h4z"/></svg>`;
    }
    
    return `<svg class="icon icon-tabler" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>`;
}

// Render file listing
function renderListing(items, currentPath) {
    const tbody = document.querySelector('#file-listing tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Add parent directory link if not at root
    if (currentPath) {
        const parentPath = currentPath.split('/').slice(0, -1).join('/');
        const row = document.createElement('tr');
        row.className = 'file';
        row.innerHTML = `
            <td></td>
            <td>
                <a href="?path=${encodeURIComponent(parentPath)}">
                    <svg class="icon icon-tabler" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                    <span class="name">../</span>
                </a>
            </td>
            <td>—</td>
            <td class="timestamp hideable">—</td>
            <td class="hideable"></td>
        `;
        tbody.appendChild(row);
    }
    
    for (const [name, data] of Object.entries(items)) {
        if (name === '__INFO__') continue;
        
        const isDir = data.type === 'dir' || data.__INFO__?.type === 'dir';
        const info = data.__INFO__ || data;
        const newPath = currentPath ? `${currentPath}/${name}` : name;
        
        const row = document.createElement('tr');
        row.className = 'file';
        row.innerHTML = `
            <td></td>
            <td>
                <a href="${isDir ? `?path=${encodeURIComponent(newPath)}` : `/${newPath}`}">
                    ${getIcon(isDir ? 'dir' : 'file', info.icon)}
                    <span class="name">${name}${isDir ? '/' : ''}</span>
                </a>
            </td>
            <td class="size" data-size="${info.size || 0}">
                <div class="sizebar">
                    <div class="sizebar-bar"></div>
                    <div class="sizebar-text">${isDir ? '—' : formatSize(info.size || 0)}</div>
                </div>
            </td>
            <td class="timestamp hideable">
                <time datetime="${new Date((info.date || 0) * 1000).toISOString()}">${formatDate(info.date)}</time>
            </td>
            <td class="hideable"></td>
        `;
        tbody.appendChild(row);
    }
    
    // Update size bars
    updateSizeBars();
}

function updateSizeBars() {
    let largest = 0;
    document.querySelectorAll('.size').forEach(el => {
        largest = Math.max(largest, Number(el.dataset.size));
    });
    document.querySelectorAll('.size').forEach(el => {
        const size = Number(el.dataset.size);
        const bar = el.querySelector('.sizebar-bar');
        if (bar && largest > 0) {
            bar.style.width = `${(size / largest) * 100}%`;
        }
    });
}

// Main initialization for both index.html and 404.html
async function initPage() {
    // Get current path from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    let currentPath = urlParams.get('path') || '';
    
    // Load index data
    await loadIndex();
    
    // Update page title
    if (window.app.config?.title) {
        document.title = window.app.config.title;
        const titleEl = document.querySelector('title');
        if (titleEl) titleEl.textContent = window.app.config.title;
    }
    
    // Update favicon
    if (window.app.config?.favicon) {
        const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        link.href = window.app.config.favicon;
        document.getElementsByTagName('head')[0].appendChild(link);
    }
    
    // Handle main page (index.html)
    if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
        await renderMainPage();
    } else {
        // Handle folder navigation (404.html)
        await renderFolderPage(currentPath);
    }
    
    // Initialize filter and other UI elements
    initializeUI();
}

async function renderMainPage() {
    const main = document.querySelector('main');
    if (!main) return;
    
    const config = window.app.config;
    
    // Render main page content
    let html = `
        <div class="meta">
            <div id="summary">
                <span class="meta-item"><b>0</b> directories</span>
                <span class="meta-item"><b>0</b> files</span>
            </div>
            <a href="javascript:setLayout('list')" id="layout-list" class="layout current">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-layout-list" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                    <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"></path>
                    <path d="M4 14m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"></path>
                </svg>
                List
            </a>
            <a href="javascript:setLayout('grid')" id="layout-grid" class="layout">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-layout-grid" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                    <path d="M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                    <path d="M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                    <path d="M4 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                    <path d="M14 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                </svg>
                Grid
            </a>
        </div>
    `;
    
    // Add latest release banner if configured
    if (config?.mainPage?.latestRelease) {
        const latestPath = config.mainPage.latestRelease;
        const latestInfo = getNodeInfo(latestPath);
        
        if (latestInfo?.__INFO__?.downloadFile) {
            const downloadUrl = `${latestPath}/${latestInfo.__INFO__.downloadFile}`;
            html += `
                <div class="latest-release-banner">
                    <h3>🎉 Latest Release: ${latestPath.split('/').pop()}</h3>
                    <a href="${downloadUrl}" class="download-btn">⬇️ Download Latest Image</a>
                </div>
            `;
        }
    }
    
    // Add changelog if enabled
    if (config?.mainPage?.showChangelog && config?.mainPage?.changelogFile) {
        const changelogHtml = await renderMarkdown(config.mainPage.changelogFile);
        html += `
            <div class="changelog-preview">
                <h2>📝 Changelog</h2>
                ${changelogHtml}
            </div>
        `;
    }
    
    // Add quick links
    if (config?.mainPage?.quickLinks?.length) {
        html += `<div class="quick-links" style="margin: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">`;
        html += `<h3>Quick Links</h3>`;
        for (const link of config.mainPage.quickLinks) {
            const target = link.download ? `download="${link.path}"` : '';
            html += `<a href="${link.path}" ${target} style="margin-right: 15px; display: inline-block;">${link.label}</a>`;
        }
        html += `</div>`;
    }
    
    // Add file listing for root
    const files = window.app.indexData?.files || {};
    const dirs = {};
    const fileList = {};
    
    for (const [name, data] of Object.entries(files)) {
        if (name === '__INFO__') continue;
        if (data.type === 'dir' || data.__INFO__?.type === 'dir') {
            dirs[name] = data;
        } else {
            fileList[name] = data;
        }
    }
    
    html += `<div class="listing"><table id="file-listing" aria-describedby="summary"><thead>
        <tr>
            <th></th>
            <th>Name <div class="filter-container"><svg id="search-icon" xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-search" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/></svg>
            <input type="text" placeholder="Search" id="filter" onkeyup="filterFiles()"></div></th>
            <th>Size</th>
            <th class="hideable">Modified</th>
            <th class="hideable"></th>
        </tr>
    </thead><tbody></tbody></table></div>`;
    
    main.innerHTML = html;
    
    // Render the listing
    const allItems = { ...dirs, ...fileList };
    renderListing(allItems, '');
    
    // Update summary
    updateSummary(dirs, fileList);
}

async function renderFolderPage(currentPath) {
    const main = document.querySelector('main');
    if (!main) return;
    
    // Get folder contents from index
    const files = window.app.indexData?.files || {};
    let current = files;
    const parts = currentPath.split('/').filter(p => p);
    
    for (const part of parts) {
        if (current[part]) {
            current = current[part];
        } else {
            // Path not found in index - real 404
            main.innerHTML = `
                <div class="meta"></div>
                <div class="empty-state">
                    <h2>404 - Path Not Found</h2>
                    <p>The requested path "${currentPath}" does not exist in the repository.</p>
                    <p><a href="/">← Back to Home</a></p>
                </div>
            `;
            return;
        }
    }
    
    // Separate directories and files
    const dirs = {};
    const fileList = {};
    
    for (const [name, data] of Object.entries(current)) {
        if (name === '__INFO__') continue;
        if (data.type === 'dir' || data.__INFO__?.type === 'dir') {
            dirs[name] = data;
        } else {
            fileList[name] = data;
        }
    }
    
    // Get folder config
    const folderConfig = getFolderConfig(currentPath);
    
    // Build breadcrumbs
    const breadcrumbs = buildBreadcrumbs(currentPath);
    const breadcrumbHtml = breadcrumbs.map((bc, i) => 
        `<a href="?path=${encodeURIComponent(bc.path)}">${bc.name}</a>${i < breadcrumbs.length - 1 ? ' / ' : ''}`
    ).join('');
    
    // Build HTML
    let html = `
        <div class="meta">
            <div id="summary">
                <span class="meta-item"><b>${Object.keys(dirs).length}</b> directories</span>
                <span class="meta-item"><b>${Object.keys(fileList).length}</b> files</span>
            </div>
            <a href="javascript:setLayout('list')" id="layout-list" class="layout current">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-layout-list" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                    <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"></path>
                    <path d="M4 14m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"></path>
                </svg>
                List
            </a>
            <a href="javascript:setLayout('grid')" id="layout-grid" class="layout">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-layout-grid" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                    <path d="M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                    <path d="M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                    <path d="M4 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                    <path d="M14 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                </svg>
                Grid
            </a>
        </div>
    `;
    
    // Add notice if exists
    if (folderConfig?.notice) {
        html += `<div class="notice">${folderConfig.notice}</div>`;
    }
    
    // Add header if exists
    if (folderConfig?.header) {
        const headerHtml = await renderMarkdown(folderConfig.header);
        html += headerHtml;
    }
    
    // Add changelog if exists
    if (folderConfig?.changelog) {
        const changelogHtml = await renderMarkdown(folderConfig.changelog);
        html += `<div class="changelog-preview"><h2>📋 Changelog</h2>${changelogHtml}</div>`;
    }
    
    // Add file listing
    html += `<div class="listing"><table id="file-listing" aria-describedby="summary"><thead>
        <tr>
            <th></th>
            <th>Name <div class="filter-container"><svg id="search-icon" xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-search" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/></svg>
            <input type="text" placeholder="Search" id="filter" onkeyup="filterFiles()"></div></th>
            <th>Size</th>
            <th class="hideable">Modified</th>
            <th class="hideable"></th>
        </tr>
    </thead><tbody></tbody></table></div>`;
    
    // Add readme if exists
    if (folderConfig?.readme) {
        const readmeHtml = await renderMarkdown(folderConfig.readme);
        html += `<div class="readme">${readmeHtml}</div>`;
    }
    
    // Add footer if exists
    if (folderConfig?.footer) {
        const footerHtml = await renderMarkdown(folderConfig.footer);
        html += footerHtml;
    }
    
    main.innerHTML = html;
    
    // Update breadcrumbs in header
    const breadcrumbDiv = document.querySelector('.breadcrumbs');
    if (breadcrumbDiv) {
        breadcrumbDiv.innerHTML = `Folder Path: ${breadcrumbHtml}`;
    }
    
    const h1 = document.querySelector('h1');
    if (h1) {
        h1.innerHTML = breadcrumbs.map((bc, i) => 
            `<a href="?path=${encodeURIComponent(bc.path)}">${bc.name}</a>${i < breadcrumbs.length - 1 ? ' / ' : ''}`
        ).join('');
    }
    
    // Render the listing
    const allItems = { ...dirs, ...fileList };
    renderListing(allItems, currentPath);
    
    // Update summary
    updateSummary(dirs, fileList);
}

function updateSummary(dirs, files) {
    const summary = document.querySelector('#summary');
    if (summary) {
        summary.innerHTML = `
            <span class="meta-item"><b>${Object.keys(dirs).length}</b> directories</span>
            <span class="meta-item"><b>${Object.keys(files).length}</b> files</span>
        `;
    }
}

function initializeUI() {
    const filterEl = document.getElementById('filter');
    if (filterEl) {
        filterEl.focus({ preventScroll: true });
        const filterParam = new URL(window.location.href).searchParams.get('filter');
        if (filterParam) {
            filterEl.value = filterParam;
        }
    }
    
    // Set year in footer
    const yearSpan = document.getElementById('year');
    if (yearSpan) {
        yearSpan.innerHTML = new Date().getFullYear();
    }
}

function filterFiles() {
    const filterEl = document.getElementById('filter');
    if (!filterEl) return;
    
    const q = filterEl.value.trim().toLowerCase();
    document.querySelectorAll('#file-listing tbody tr').forEach(function (el) {
        if (!q) {
            el.style.display = '';
            return;
        }
        const nameEl = el.querySelector('.name');
        if (nameEl) {
            const nameVal = nameEl.textContent.trim().toLowerCase();
            el.style.display = nameVal.indexOf(q) !== -1 ? '' : 'none';
        }
    });
}

function setLayout(layout) {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('layout', layout);
    window.location.search = urlParams.toString();
}

function localizeDatetime(e) {
    if (e.textContent === undefined) return;
    const d = new Date(e.getAttribute('datetime'));
    if (isNaN(d)) return;
    e.textContent = d.toLocaleString();
}

// Auto-localize dates when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    const timeList = Array.prototype.slice.call(document.getElementsByTagName("time"));
    timeList.forEach(localizeDatetime);
});