import { UIHelper } from './UIHelper.js';

export class FileListRenderer {
    constructor(contentLoader) {
        this.contentLoader = contentLoader;
        this.currentSort = 'name';
        this.currentOrder = 'asc';
    }

    sortItems(items) {
        const entries = Object.entries(items);
        
        entries.sort((a, b) => {
            const [nameA, dataA] = a;
            const [nameB, dataB] = b;
            
            const infoA = dataA.__INFO__ || dataA;
            const infoB = dataB.__INFO__ || dataB;
            
            const isDirA = dataA.type === 'dir' || infoA.type === 'dir';
            const isDirB = dataB.type === 'dir' || infoB.type === 'dir';
            
            if (this.currentSort !== 'name') {
                if (isDirA && !isDirB) return -1;
                if (!isDirA && isDirB) return 1;
            }
            
            let comparison = 0;
            
            switch (this.currentSort) {
                case 'name':
                    comparison = nameA.localeCompare(nameB);
                    break;
                case 'size':
                    const sizeA = infoA.size || 0;
                    const sizeB = infoB.size || 0;
                    comparison = sizeA - sizeB;
                    break;
                case 'date':
                    const dateA = infoA.date || 0;
                    const dateB = infoB.date || 0;
                    comparison = dateA - dateB;
                    break;
                default:
                    comparison = nameA.localeCompare(nameB);
            }
            
            return this.currentOrder === 'asc' ? comparison : -comparison;
        });
        
        const sorted = {};
        for (const [key, value] of entries) {
            sorted[key] = value;
        }
        
        return sorted;
    }

    changeSort(sortBy) {
        if (this.currentSort === sortBy) {
            this.currentOrder = this.currentOrder === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort = sortBy;
            this.currentOrder = 'asc';
        }
        this.updateSortIndicators();
        return { sort: this.currentSort, order: this.currentOrder };
    }

    updateSortIndicators() {
        document.querySelectorAll('.sort-indicator').forEach(el => el.remove());
        
        const headers = {
            name: document.querySelector('.sort-name'),
            size: document.querySelector('.sort-size'),
            date: document.querySelector('.sort-date')
        };
        
        for (const [key, header] of Object.entries(headers)) {
            if (header && this.currentSort === key) {
                const indicator = document.createElement('span');
                indicator.className = 'sort-indicator';
                indicator.textContent = this.currentOrder === 'asc' ? ' ↑' : ' ↓';
                header.appendChild(indicator);
            }
        }
    }

    async render(items, currentPath) {
        const tbody = document.querySelector('#file-listing tbody');
        if (!tbody) return;
        
        const sortedItems = this.sortItems(items);
        
        tbody.innerHTML = '';
        
        const dirs = {};
        const files = {};
        
        for (const [name, data] of Object.entries(sortedItems)) {
            if (name === '__INFO__') continue;
            const isDir = data.type === 'dir' || data.__INFO__?.type === 'dir';
            if (isDir) {
                dirs[name] = data;
            } else {
                files[name] = data;
            }
        }
        
        // Parent directory link
        if (currentPath && currentPath !== '/') {
            const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
            const row = document.createElement('tr');
            row.className = 'file parent-dir';
            row.innerHTML = `
                <td class="icon-cell">
                    <svg class="icon icon-tabler" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                </td>
                <td class="name-cell">
                    <a href="${parentPath}">
                        <span class="name">..</span>
                    </a>
                </td>
                <td class="size-cell">—</td>
                <td class="checksum-cell">—</td>
                <td class="timestamp-cell hideable">—</td>
            `;
            tbody.appendChild(row);
        }
        
        // Render directories
        for (const [name, data] of Object.entries(dirs)) {
            const info = data.__INFO__ || data;
            const newPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
            const size = info.size || 0;
            
            const row = document.createElement('tr');
            row.className = 'file dir';
            row.innerHTML = `
                <td class="icon-cell">
                    ${UIHelper.getIcon('dir', info.icon)}
                </td>
                <td class="name-cell">
                    <a href="${newPath}">
                        <span class="name">${name}/</span>
                    </a>
                </td>
                <td class="size-cell" data-size="${size}">
                    <div class="sizebar">
                        <div class="sizebar-bar"></div>
                        <div class="sizebar-text">${UIHelper.formatSize(size)}</div>
                    </div>
                </td>
                <td class="checksum-cell">—</td>
                <td class="timestamp-cell hideable">
                    <time datetime="${new Date((info.date || 0) * 1000).toISOString()}">${UIHelper.formatDate(info.date)}</time>
                </td>
            `;
            tbody.appendChild(row);
        }
        
        // Render files and verify existence
        for (const [name, data] of Object.entries(files)) {
            const info = data.__INFO__ || data;
            const filePath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
            const size = info.size || 0;
            const sha256 = info.sha256sum || '';
            
            const exists = await this.contentLoader.fileExists(filePath);
            
            if (!exists) {
                const row = document.createElement('tr');
                row.className = 'file missing';
                row.innerHTML = `
                    <td class="icon-cell">
                        ${UIHelper.getIcon('file', info.icon)}
                    </td>
                    <td class="name-cell">
                        <span class="name missing-file">${name}</span>
                        <span class="missing-badge">(404 - Not Found)</span>
                    </td>
                    <td class="size-cell">—</td>
                    <td class="checksum-cell">—</td>
                    <td class="timestamp-cell hideable">—</td>
                `;
                tbody.appendChild(row);
            } else {
                const row = document.createElement('tr');
                row.className = 'file';
                row.innerHTML = `
                    <td class="icon-cell">
                        ${UIHelper.getIcon('file', info.icon)}
                    </td>
                    <td class="name-cell">
                        <a href="${filePath}" ${sha256 ? `download="${name}"` : ''}>
                            <span class="name">${name}</span>
                        </a>
                    </td>
                    <td class="size-cell" data-size="${size}">
                        <div class="sizebar">
                            <div class="sizebar-bar"></div>
                            <div class="sizebar-text">${UIHelper.formatSize(size)}</div>
                        </div>
                    </td>
                    <td class="checksum-cell">
                        ${sha256 ? `<span class="sha256-hash" onclick="window.copyToClipboard && window.copyToClipboard('${sha256}', this)" title="Click to copy SHA256">${sha256.substring(0, 16)}...</span>` : '—'}
                    </td>
                    <td class="timestamp-cell hideable">
                        <time datetime="${new Date((info.date || 0) * 1000).toISOString()}">${UIHelper.formatDate(info.date)}</time>
                    </td>
                `;
                tbody.appendChild(row);
            }
        }
        
        this.updateSizeBars();
    }

    updateSizeBars() {
        let largest = 0;
        document.querySelectorAll('.size-cell').forEach(el => {
            const size = parseInt(el.dataset.size);
            if (size && size > largest) largest = size;
        });
        document.querySelectorAll('.size-cell').forEach(el => {
            const size = parseInt(el.dataset.size);
            const bar = el.querySelector('.sizebar-bar');
            const text = el.querySelector('.sizebar-text');
            if (bar && largest > 0 && size) {
                const percent = (size / largest) * 100;
                bar.style.width = `${percent}%`;
            }
        });
    }
}