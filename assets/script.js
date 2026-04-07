// Global app state
window.app = {
    indexData: null,
    currentPath: '',
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

// Get file/folder info from index by path
function getNodeInfo(path) {
    if (!window.app.indexData) return null;
    
    // Remove leading and trailing slashes, split into parts
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    if (!cleanPath) return { type: 'root' };
    
    const parts = cleanPath.split('/');
    let current = window.app.indexData.files;
    
    for (const part of parts) {
        if (current && current[part]) {
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
    
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    
    // Try exact match
    if (window.app.config.folders[cleanPath]) {
        return window.app.config.folders[cleanPath];
    }
    
    // Try parent paths
    const parts = cleanPath.split('/');
    for (let i = parts.length; i > 0; i--) {
        const parentPath = parts.slice(0, i).join('/');
        if (window.app.config.folders[parentPath]) {
            return window.app.config.folders[parentPath];
        }
    }
    
    return null;
}

// Get children of a path (files and folders)
function getChildren(path) {
    if (!window.app.indexData) return null;
    
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    if (!cleanPath) {
        // Return root files
        return window.app.indexData.files;
    }
    
    const parts = cleanPath.split('/');
    let current = window.app.indexData.files;
    
    for (const part of parts) {
        if (current && current[part]) {
            current = current[part];
        } else {
            return null;
        }
    }
    
    // Filter out __INFO__ and return the rest
    const children = {};
    for (const [key, value] of Object.entries(current)) {
        if (key !== '__INFO__') {
            children[key] = value;
        }
    }
    
    return children;
}

// Check if path is a directory
function isDirectory(path) {
    const info = getNodeInfo(path);
    return info && (info.type === 'dir' || info.__INFO__?.type === 'dir');
}

// Render markdown (simple version)
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
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/^- (.*$)/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
        
        // Wrap in paragraphs if not already wrapped
        if (!html.startsWith('<')) {
            html = `<p>${html}</p>`;
        }
        
        return `<div class="markdown-content">${html}</div>`;
    } catch (error) {
        console.error('Failed to load markdown:', error);
        return '<p>Failed to load content</p>';
    }
}

// Format file size
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    if (!bytes) return '—';
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
    if (type === 'dir') {
        return `<svg class="icon icon-tabler icon-tabler-folder-filled" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="currentColor"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 3a1 1 0 0 1 .608 .206l.1 .087l2.706 2.707h6.586a3 3 0 0 1 2.995 2.824l.005 .176v8a3 3 0 0 1 -2.824 2.995l-.176 .005h-14a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-11a3 3 0 0 1 2.824 -2.995l.176 -.005h4z"/></svg>`;
    }
    
    // Different icons for different file types
    if (iconName === 'package') {
        return `<svg class="icon icon-tabler" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>`;
    }
    
    if (iconName === 'image') {
        return `<svg class="icon icon-tabler" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 8h.01M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M4 16l5-5c.928-.893 2.072-.893 3 0l5 5"/><path d="M14 14l1-1c.928-.893 2.072-.893 3 0l3 3"/></svg>`;
    }
    
    if (iconName === 'key') {
        return `<svg class="icon icon-tabler" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0zM15 9h.01"/></svg>`;
    }
    
    return `<svg class="icon icon-tabler" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>`;
}

// Build breadcrumbs from path
function buildBreadcrumbs(path) {
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    const parts = cleanPath.split('/').filter(p => p);
    const breadcrumbs = [{ name: '/', path: '/' }];
    
    let currentPath = '';
    for (const part of parts) {
        currentPath += '/' + part;
        breadcrumbs.push({ name: part, path: currentPath });
    }
    
    return breadcrumbs;
}

// Render file listing for directory views
function renderListing(items, currentPath) {
    const tbody = document.querySelector('#file-listing tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Separate directories and files
    const dirs = {};
    const files = {};
    
    for (const [name, data] of Object.entries(items)) {
        if (name === '__INFO__') continue;
        const isDir = data.type === 'dir' || data.__INFO__?.type === 'dir';
        if (isDir) {
            dirs[name] = data;
        } else {
            files[name] = data;
        }
    }
    
    // Add parent directory link if not at root
    if (currentPath && currentPath !== '/') {
        const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
        const row = document.createElement('tr');
        row.className = 'file';
        row.innerHTML = `
            <td><td style="padding-left: 10px;"><td>
            <td>
                <a href="${parentPath}">
                    <svg class="icon icon-tabler" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                    <span class="name">../</span>
                </a>
            </td>
            <td class="size">—</td>
            <td class="timestamp hideable">—</td>
            <td class="hideable"></td>
        `;
        tbody.appendChild(row);
    }
    
    // Add directories
    for (const [name, data] of Object.entries(dirs)) {
        const info = data.__INFO__ || data;
        const newPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
        
        const row = document.createElement('tr');
        row.className = 'file';
        row.innerHTML = `
            <td><td style="padding-left: 10px;"></td>
            <td>
                <a href="${newPath}">
                    ${getIcon('dir', info.icon)}
                    <span class="name">${name}/</span>
                </a>
            </td>
            <td class="size">—</td>
            <td class="timestamp hideable">
                <time datetime="${new Date((info.date || 0) * 1000).toISOString()}">${formatDate(info.date)}</time>
            </td>
            <td class="hideable"></td>
        `;
        tbody.appendChild(row);
    }
    
    // Add files
    for (const [name, data] of Object.entries(files)) {
        const info = data.__INFO__ || data;
        const filePath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
        
        const row = document.createElement('tr');
        row.className = 'file';
        row.innerHTML = `
            <td><td style="padding-left: 10px;"></td>
            <td>
                <a href="${filePath}" ${info.sha256sum ? `download="${name}"` : ''}>
                    ${getIcon('file', info.icon)}
                    <span class="name">${name}</span>
                </a>
            </td>
            <td class="size" data-size="${info.size || 0}">
                <div class="sizebar">
                    <div class="sizebar-bar"></div>
                    <div class="sizebar-text">${formatSize(info.size)}</div>
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
        const size = parseInt(el.dataset.size);
        if (size && size > largest) largest = size;
    });
    document.querySelectorAll('.size').forEach(el => {
        const size = parseInt(el.dataset.size);
        const bar = el.querySelector('.sizebar-bar');
        if (bar && largest > 0 && size) {
            bar.style.width = `${(size / largest) * 100}%`;
        }
    });
}

// Render main page (index.html)
async function renderMainPage() {
    const main = document.querySelector('main');
    if (!main) return;
    
    const config = window.app.config;
    
    let html = `
        <div class="main-content">
    `;
    
    // Add latest release section
    if (config?.mainPage?.latestRelease) {
        const latestPath = config.mainPage.latestRelease;
        const latestNode = getNodeInfo(latestPath);
        const latestInfo = latestNode?.__INFO__ || latestNode;
        
        if (latestInfo && latestInfo.downloadFile) {
            const downloadUrl = `${latestPath}/${latestInfo.downloadFile}`;
            const versionName = latestPath.split('/').pop();
            
            html += `
                <div class="latest-release-banner">
                    <h2>🎉 Latest Release: ${versionName}</h2>
                    <p>Download the latest firmware image for your device</p>
                    <a href="${downloadUrl}" class="download-btn" download>
                        ⬇️ Download ${latestInfo.downloadFile}
                    </a>
                </div>
            `;
        }
    }
    
    // Add changelog if enabled
    if (config?.mainPage?.showChangelog && config?.mainPage?.changelogFile) {
        const changelogHtml = await renderMarkdown(config.mainPage.changelogFile);
        html += `
            <div class="changelog-preview">
                <h2>📝 What's New</h2>
                ${changelogHtml}
            </div>
        `;
    }
    
    // Add quick links
    if (config?.mainPage?.quickLinks?.length) {
        html += `<div class="quick-links">
            <h3>Quick Links</h3>
            <div class="quick-links-grid">`;
        for (const link of config.mainPage.quickLinks) {
            const target = link.download ? `download="${link.path}"` : '';
            html += `<a href="${link.path}" ${target} class="quick-link">${link.label}</a>`;
        }
        html += `</div></div>`;
    }
    
    html += `</div>`;
    
    main.innerHTML = html;
}

// Render folder page (for navigation)
async function renderFolderPage(path) {
    const main = document.querySelector('main');
    if (!main) return;
    
    // Check if path exists in index
    const nodeInfo = getNodeInfo(path);
    if (!nodeInfo) {
        // Real 404 - path not found in index
        main.innerHTML = `
            <div class="empty-state">
                <h2>404 - Path Not Found</h2>
                <p>The requested path "${path}" does not exist in the repository.</p>
                <p><a href="/">← Back to Home</a></p>
            </div>
        `;
        return;
    }
    
    // Check if it's a file (not directory)
    if (nodeInfo.type === 'file' || (nodeInfo.type !== 'dir' && !nodeInfo.__INFO__)) {
        // It's a file, redirect to actual file
        window.location.href = path;
        return;
    }
    
    // Get children (directory contents)
    const children = getChildren(path);
    if (!children) {
        main.innerHTML = `
            <div class="empty-state">
                <h2>Empty Directory</h2>
                <p>This directory contains no files or folders.</p>
                <p><a href="/">← Back to Home</a></p>
            </div>
        `;
        return;
    }
    
    // Get folder config
    const folderConfig = getFolderConfig(path);
    
    // Build HTML
    let html = `
        <div class="meta">
            <div id="summary">
                <span class="meta-item"><b id="dir-count">0</b> directories</span>
                <span class="meta-item"><b id="file-count">0</b> files</span>
            </div>
            <div class="view-controls">
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
        html += `<div class="changelog-preview">${changelogHtml}</div>`;
    }
    
    // Add file listing
    html += `
        <div class="listing">
            <div class="filter-bar">
                <div class="filter-container">
                    <svg id="search-icon" xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-search" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/>
                        <path d="M21 21l-6 -6"/>
                    </svg>
                    <input type="text" placeholder="Filter files..." id="filter" onkeyup="filterFiles()">
                </div>
            </div>
            <table id="file-listing" aria-describedby="summary">
                <thead>
                    <tr>
                        <th style="width: 40px;"></th>
                        <th>Name</th>
                        <th style="width: 100px;">Size</th>
                        <th class="hideable" style="width: 180px;">Modified</th>
                        <th class="hideable" style="width: 40px;"></th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
    `;
    
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
    
    // Render the listing
    renderListing(children, path);
    
    // Update summary counts
    let dirCount = 0, fileCount = 0;
    for (const [name, data] of Object.entries(children)) {
        if (name === '__INFO__') continue;
        if (data.type === 'dir' || data.__INFO__?.type === 'dir') {
            dirCount++;
        } else {
            fileCount++;
        }
    }
    document.getElementById('dir-count').textContent = dirCount;
    document.getElementById('file-count').textContent = fileCount;
}

// Main initialization
async function initPage() {
    // Load index data
    await loadIndex();
    
    // Update page title
    if (window.app.config?.title) {
        document.title = window.app.config.title;
    }
    
    // Update favicon
    if (window.app.config?.favicon) {
        const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        link.href = window.app.config.favicon;
        document.getElementsByTagName('head')[0].appendChild(link);
    }
    
    // Get current path from browser URL
    let currentPath = window.location.pathname;
    
    // Remove trailing slash for consistency
    if (currentPath.endsWith('/') && currentPath !== '/') {
        currentPath = currentPath.slice(0, -1);
    }
    
    // Check if we're on index.html or root
    if (currentPath === '/' || currentPath === '/index.html') {
        await renderMainPage();
    } else {
        // Check if path exists in index
        const nodeInfo = getNodeInfo(currentPath);
        
        if (!nodeInfo) {
            // Real 404 - show error
            const main = document.querySelector('main');
            if (main) {
                main.innerHTML = `
                    <div class="empty-state">
                        <h2>404 - Path Not Found</h2>
                        <p>The requested path "${currentPath}" does not exist in the repository.</p>
                        <p><a href="/">← Back to Home</a></p>
                    </div>
                `;
            }
            return;
        }
        
        // Update breadcrumbs in header
        const breadcrumbs = buildBreadcrumbs(currentPath);
        const breadcrumbDiv = document.querySelector('.breadcrumbs');
        if (breadcrumbDiv) {
            breadcrumbDiv.innerHTML = `Navigation: ${breadcrumbs.map((bc, i) => 
                `<a href="${bc.path}">${bc.name}</a>${i < breadcrumbs.length - 1 ? ' / ' : ''}`
            ).join('')}`;
        }
        
        const h1 = document.querySelector('h1');
        if (h1) {
            h1.innerHTML = breadcrumbs.map((bc, i) => 
                `<a href="${bc.path}">${bc.name}</a>${i < breadcrumbs.length - 1 ? ' / ' : ''}`
            ).join('');
        }
        
        // Render folder page
        await renderFolderPage(currentPath);
    }
    
    // Initialize UI
    initializeUI();
}

function initializeUI() {
    // Set year in footer
    const yearSpan = document.getElementById('year');
    if (yearSpan) {
        yearSpan.innerHTML = new Date().getFullYear();
    }
    
    // Load layout preference from localStorage
    const savedLayout = localStorage.getItem('filemanager-layout');
    if (savedLayout) {
        setLayout(savedLayout, false);
    }
}

function filterFiles() {
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
}

function setLayout(layout, save = true) {
    const listing = document.querySelector('.listing');
    if (!listing) return;
    
    if (layout === 'grid') {
        listing.classList.add('grid-view');
        listing.classList.remove('list-view');
    } else {
        listing.classList.add('list-view');
        listing.classList.remove('grid-view');
    }
    
    // Update button states
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
    
    if (save) {
        localStorage.setItem('filemanager-layout', layout);
    }
}

// Add grid view styles dynamically
const gridStyles = document.createElement('style');
gridStyles.textContent = `
    .listing.grid-view table {
        display: none;
    }
    .listing.grid-view .grid-container {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 16px;
        padding: 20px;
    }
    .listing.list-view .grid-container {
        display: none;
    }
    .listing.list-view table {
        display: table;
    }
    .filter-bar {
        padding: 15px 20px;
        border-bottom: 1px solid #e5e9ea;
    }
    .filter-container {
        position: relative;
        display: inline-block;
    }
    #search-icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        color: #999;
    }
    #filter {
        padding: 8px 12px 8px 35px;
        border: 1px solid #ddd;
        border-radius: 5px;
        font-size: 14px;
        width: 250px;
        background: white;
    }
    @media (prefers-color-scheme: dark) {
        .filter-bar {
            border-bottom-color: #2c3e4e;
        }
        #filter {
            background: #1a2530;
            border-color: #2c3e4e;
            color: #ccc;
        }
    }
    .view-controls {
        display: flex;
        gap: 10px;
        margin-left: auto;
    }
    .layout {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 10px;
        border-radius: 5px;
        color: #999;
        text-decoration: none;
    }
    .layout.current {
        background: #006ed3;
        color: white;
    }
    .quick-links {
        margin: 20px;
        padding: 20px;
        background: #f8f9fa;
        border-radius: 8px;
    }
    .quick-links-grid {
        display: flex;
        gap: 15px;
        flex-wrap: wrap;
        margin-top: 15px;
    }
    .quick-link {
        display: inline-block;
        padding: 10px 20px;
        background: white;
        border: 1px solid #dee2e6;
        border-radius: 5px;
        text-decoration: none;
        transition: all 0.2s;
    }
    .quick-link:hover {
        background: #006ed3;
        color: white;
        border-color: #006ed3;
    }
    @media (prefers-color-scheme: dark) {
        .quick-links {
            background: #0f151c;
        }
        .quick-link {
            background: #1a2530;
            border-color: #2c3e4e;
            color: #ccc;
        }
    }
`;
document.head.appendChild(gridStyles);