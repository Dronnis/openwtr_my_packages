/**
 * FancyIndex Listener для GitHub Pages
 * Единый index.json + hash-роутинг
 */

const CONFIG = {
  dataFile: '/index.json',
  defaultSort: { field: 'name', order: 'asc', dirFirst: true },
  icons: {
    dir: 'folder-filled',
    file: 'file',
    key: 'key',
    image: 'file-type-img',
    package: 'package',
    archive: 'file-type-zip',
    default: 'file'
  }
};

let appData = null;
let currentPath = [];
let currentLayout = localStorage.getItem('layout') || 'list';
let currentSort = { ...CONFIG.defaultSort };

// === Инициализация ===
async function initApp() {
  document.getElementById('year').textContent = new Date().getFullYear();
  
  try {
    appData = await loadJSON(CONFIG.dataFile);
    applyConfig();
    parseHash();
    window.addEventListener('hashchange', onHashChange);
    render();
  } catch (err) {
    showError(`Не удалось загрузить index.json: ${err.message}`);
    console.error(err);
  }
}

async function loadJSON(url) {
  const res = await fetch(url + '?t=' + Date.now()); // cache-bust
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return await res.json();
}

function applyConfig() {
  if (appData.cfg?.title) document.title = appData.cfg.title;
  if (appData.cfg?.favicon) {
    document.querySelector('link[rel="icon"]')?.setAttribute('href', appData.cfg.favicon);
  }
}

function parseHash() {
  // #/releases/25.12.2/targets/x86 → ['releases', '25.12.2', 'targets', 'x86']
  const hash = location.hash.replace(/^#\/?/, '');
  currentPath = hash ? hash.split('/').filter(Boolean) : [];
  
  // Парсим параметры сортировки из query string в hash: #/path?sort=size&order=desc
  const [pathPart, queryPart] = (hash || '').split('?');
  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    if (params.has('sort')) currentSort.field = params.get('sort');
    if (params.has('order')) currentSort.order = params.get('order');
  }
}

function onHashChange() {
  parseHash();
  render();
}

// === Навигация по дереву JSON ===
function getNodeAtPath(pathArr) {
  let node = appData.files;
  
  for (const segment of pathArr) {
    if (!node || typeof node !== 'object' || !(segment in node)) {
      return null;
    }
    // Спускаемся: если есть __INFO__ — это контейнер, иначе — файл
    node = node[segment];
    if (node?.__INFO__) {
      node = { __INFO__: node.__INFO__, ...node };
    }
  }
  return node;
}

function getDirEntries(node) {
  if (!node || typeof node !== 'object') return [];
  
  return Object.entries(node)
    .filter(([key]) => key !== '__INFO__') // пропускаем метаданные
    .map(([name, data]) => {
      const info = data.__INFO__ || data;
      const isDir = info.type === 'dir' || (data.__INFO__ && !data.type);
      
      return {
        name,
        type: info.type || (isDir ? 'dir' : 'file'),
        size: info.size || 0,
        date: info.date || 0,
        icon: info.icon || CONFIG.icons[isDir ? 'dir' : 'default'],
        sha256sum: data.sha256sum || null,
        isDir
      };
    });
}

// === Рендеринг ===
function render() {
  const container = document.getElementById('app');
  const node = getNodeAtPath(currentPath);
  
  if (!node) {
    container.innerHTML = `
      <div class="error">
        ❌ Путь не найден: <code>/${currentPath.join('/')}</code><br>
        <small>Проверьте index.json или вернитесь <a href="#/">в корень</a></small>
      </div>
    `;
    updateLayoutToggle();
    return;
  }

  renderBreadcrumbs();
  
  let entries = getDirEntries(node);
  entries = sortEntries(entries);
  
  container.innerHTML = `
    ${renderMeta(entries)}
    ${currentLayout === 'grid' ? renderGrid(entries) : renderList(entries)}
    ${renderReadme()}
  `;
  
  initInteractions();
  updateLayoutToggle();
  updateSizeBars();
  localizeTime();
}

function renderBreadcrumbs() {
  const bc = document.getElementById('breadcrumbs');
  const title = document.getElementById('page-title');
  
  // Хлебные крошки
  let bcHtml = '<a href="#/">🏠 Home</a>';
  let pathAcc = '';
  for (const segment of currentPath) {
    pathAcc += '/' + segment;
    bcHtml += ` <span>›</span> <a href="#/${pathAcc}">${escapeHtml(segment)}</a>`;
  }
  bc.innerHTML = bcHtml;
  
  // Заголовок h1
  let titleHtml = '<a href="#/">/</a>';
  currentPath.forEach((seg, i) => {
    const href = '#/' + currentPath.slice(0, i+1).join('/');
    titleHtml += ` <a href="${href}">${escapeHtml(seg)}</a>`;
  });
  title.innerHTML = titleHtml;
}

function renderMeta(entries) {
  const dirs = entries.filter(e => e.isDir).length;
  const files = entries.filter(e => !e.isDir).length;
  
  return `
    <div class="meta">
      <div id="summary">
        <span class="meta-item"><b>${dirs}</b> director${dirs===1?'y':'ies'}</span>
        <span class="meta-item"><b>${files}</b> file${files===1?'':'s'}</span>
      </div>
      <a href="#" id="layout-list" class="layout ${currentLayout==='list'?'current':''}" data-layout="list">
        ${iconSvg('layout-list')} List
      </a>
      <a href="#" id="layout-grid" class="layout ${currentLayout==='grid'?'current':''}" data-layout="grid">
        ${iconSvg('layout-grid')} Grid
      </a>
    </div>
  `;
}

function renderList(entries) {
  const rows = [];
  
  // Кнопка "наверх" если не в корне
  if (currentPath.length > 0) {
    const parentHash = '#/' + currentPath.slice(0, -1).join('/');
    rows.push(`
      <tr class="file">
        <td>${iconSvg('arrow-up')}</td>
        <td><a href="${parentHash}" class="go-up">⬆ ..</a></td>
        <td>—</td>
        <td class="timestamp hideable"></td>
        <td class="hideable"></td>
      </tr>
    `);
  }
  
  // Элементы
  rows.push(...entries.map(renderListRow));
  
  return `
    <div class="listing">
      <table aria-describedby="summary">
        <thead>
          <tr>
            <th></th>
            <th>${sortLink('name', 'Name')}</th>
            <th>${sortLink('size', 'Size')}</th>
            <th class="hideable">${sortLink('date', 'Modified')}</th>
            <th class="hideable"></th>
          </tr>
          <tr>
            <th colspan="5">
              <div class="filter-container">
                ${iconSvg('search', 'search-icon')}
                <input type="text" placeholder="Search..." id="filter" oninput="filterRows()">
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          ${rows.join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderListRow(entry) {
  // Ссылка: для папок — хеш-навигация, для файлов — прямой download
  const href = entry.isDir
    ? `#/${[...currentPath, entry.name].join('/')}`
    : `/${[...currentPath, entry.name].join('/')}`;
  
  const sizeText = entry.isDir ? '—' : formatSize(entry.size);
  const dateText = entry.date 
    ? new Date(entry.date * 1000).toLocaleString(undefined, {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    : '';
  
  return `
    <tr class="file" data-name="${entry.name.toLowerCase()}" data-type="${entry.type}">
      <td>${iconSvg(entry.icon)}</td>
      <td>
        <a href="${href}">
          ${iconSvg(entry.icon)}
          <span class="name">${escapeHtml(entry.name)}${entry.isDir ? '/' : ''}</span>
        </a>
      </td>
      <td class="size" data-size="${entry.size}">
        ${entry.isDir 
          ? '—' 
          : `<div class="sizebar"><div class="sizebar-bar"></div><div class="sizebar-text">${sizeText}</div></div>`
        }
      </td>
      <td class="timestamp hideable">
        ${dateText ? `<time datetime="${new Date(entry.date*1000).toISOString()}">${dateText}</time>` : ''}
      </td>
      <td class="hideable">
        ${entry.sha256sum 
          ? `<span class="sha256" title="SHA256: ${entry.sha256sum}">🔐</span>` 
          : ''
        }
      </td>
    </tr>
  `;
}

function renderGrid(entries) {
  const items = [];
  
  // Кнопка "наверх"
  if (currentPath.length > 0) {
    const parentHash = '#/' + currentPath.slice(0, -1).join('/');
    items.push(`
      <div class="entry" data-name="..">
        <a href="${parentHash}">
          ${iconSvg('arrow-up')}
          <span class="name">..</span>
        </a>
      </div>
    `);
  }
  
  items.push(...entries.map(renderGridItem));
  
  return `<div class="grid">${items.join('')}</div>`;
}

function renderGridItem(entry) {
  const href = entry.isDir
    ? `#/${[...currentPath, entry.name].join('/')}`
    : `/${[...currentPath, entry.name].join('/')}`;
  
  return `
    <div class="entry" data-name="${entry.name.toLowerCase()}" data-type="${entry.type}">
      <a href="${href}">
        ${iconSvg(entry.icon)}
        <span class="name">${escapeHtml(entry.name)}${entry.isDir ? '/' : ''}</span>
        ${!entry.isDir ? `<span class="size">${formatSize(entry.size)}</span>` : ''}
      </a>
    </div>
  `;
}

function renderReadme() {
  const readme = appData.cfg?.readme;
  if (!readme) return '';
  
  // Авто-выбор языка
  const lang = navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  const content = readme[lang] || readme.en || readme.ru || '';
  if (!content) return '';
  
  return `
    <div class="readme">
      <br><h2>ℹ️ О репозитории</h2><hr><br>
      <div class="well">${content.replace(/\n/g, '<br>')}</div>
    </div>
  `;
}

// === Сортировка ===
function sortLink(field, label) {
  const active = currentSort.field === field;
  const nextOrder = (active && currentSort.order === 'asc') ? 'desc' : 'asc';
  const arrow = active ? (currentSort.order === 'asc' ? ' ▲' : ' ▼') : '';
  
  // Сохраняем текущий путь + новые параметры сортировки
  const basePath = '#/' + currentPath.join('/');
  const query = `?sort=${field}&order=${nextOrder}`;
  const href = currentPath.length ? `${basePath}${query}` : `#${query}`;
  
  return `<a href="${href}">${label}${arrow}</a>`;
}

function sortEntries(entries) {
  const { field, order, dirFirst } = currentSort;
  
  return [...entries].sort((a, b) => {
    // Приоритет: сначала папки
    if (dirFirst) {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
    }
    
    // Сравнение по полю
    let cmp = 0;
    if (field === 'name') cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
    else if (field === 'size') cmp = a.size - b.size;
    else if (field === 'date') cmp = a.date - b.date;
    
    return order === 'asc' ? cmp : -cmp;
  });
}

// === Интерактив ===
function initInteractions() {
  // Переключение layout
  document.querySelectorAll('.layout').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      currentLayout = btn.dataset.layout;
      localStorage.setItem('layout', currentLayout);
      document.documentElement.setAttribute('data-layout', currentLayout);
      render();
    };
  });
  
  // Поиск
  window.filterRows = function() {
    const q = document.getElementById('filter')?.value.toLowerCase().trim() || '';
    document.querySelectorAll('tr.file, .grid .entry').forEach(el => {
      const name = el.dataset.name || '';
      const type = el.dataset.type || '';
      // Скрываем только элементы, не соответствующие запросу (но не "..")
      if (name === '..') return;
      el.style.display = !q || name.includes(q) || type.includes(q) ? '' : 'none';
    });
  };
}

function updateLayoutToggle() {
  document.querySelectorAll('.layout').forEach(btn => {
    btn.classList.toggle('current', btn.dataset.layout === currentLayout);
  });
  document.documentElement.setAttribute('data-layout', currentLayout);
}

function updateSizeBars() {
  let maxSize = 0;
  document.querySelectorAll('.size[data-size]').forEach(el => {
    const s = +el.dataset.size;
    if (s > maxSize) maxSize = s;
  });
  
  document.querySelectorAll('.size[data-size]').forEach(el => {
    const size = +el.dataset.size;
    const bar = el.querySelector('.sizebar-bar');
    if (bar && maxSize > 0) {
      bar.style.width = `${(size / maxSize) * 100}%`;
    }
  });
}

function localizeTime() {
  document.querySelectorAll('time[datetime]').forEach(el => {
    const d = new Date(el.dateTime);
    if (!isNaN(d)) {
      el.textContent = d.toLocaleString(undefined, {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    }
  });
}

// === Утилиты ===
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function iconSvg(name, extraClass = '') {
  const cls = `icon icon-tabler icon-tabler-${name} ${extraClass}`.trim();
  
  const icons = {
    'folder-filled': `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M9 3a1 1 0 0 1 .608.206l.1.087L12.414 6H19a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h4z"/></svg>`,
    'file': `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="10 9H8"/></svg>`,
    'key': `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1-4.069 0l-.301-.301-6.558 6.558a2 2 0 0 1-1.239.578l-.175.008H4.172a1 1 0 0 1-1-1v-1.172a2 2 0 0 1 .586-1.414l2.144-2.144-.301-.301a2.877 2.877 0 0 1 0-4.069l2.643-2.643a2.877 2.877 0 0 1 4.069 0z"/><circle cx="15" cy="9" r="1"/></svg>`,
    'package': `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.89 1.45l8 4A2 2 0 0 1 22 7.24v9.53a2 2 0 0 1-1.11 1.79l-8 4a2 2 0 0 1-1.79 0l-8-4a2 2 0 0 1-1.1-1.8V7.24a2 2 0 0 1 1.11-1.79l8-4a2 2 0 0 1 1.78 0z"/><polyline points="2.32 6.16 12 11 21.68 6.16"/><line x1="12" y1="22.76" x2="12" y2="11"/></svg>`,
    'image': `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
    'search': `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-6-6"/></svg>`,
    'layout-list': `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="6" rx="1"/><rect x="3" y="15" width="18" height="6" rx="1"/></svg>`,
    'layout-grid': `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
    'arrow-up': `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>`,
  };
  
  return icons[name] || icons.file;
}

function showError(msg) {
  document.getElementById('app').innerHTML = `<div class="error">❌ ${escapeHtml(msg)}</div>`;
}

// Запуск
document.addEventListener('DOMContentLoaded', initApp);