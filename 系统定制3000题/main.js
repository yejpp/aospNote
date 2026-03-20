class DataManager {
    constructor() {
        this.articles = window.articlesData || [];
        this.storageKeys = {
            practiced: 'practicedArticles',
            pinned: 'pinnedArticles',
            order: 'articleOrder',
            sortMode: 'articleSortMode',
            keyword: 'articleKeyword'
        };

        this.practicedArticles = new Set(this.loadArray(this.storageKeys.practiced));
        this.pinnedArticles = new Set(this.loadArray(this.storageKeys.pinned));
        this.customOrder = this.loadArray(this.storageKeys.order);
        this.currentVersion = null;
        this.currentPracticeStatus = null;
        this.currentKeyword = this.loadText(this.storageKeys.keyword, '');
        this.draftKeyword = this.currentKeyword;
        this.sortMode = this.loadText(this.storageKeys.sortMode, 'priority');

        this.init();
    }

    init() {
        this.articles.forEach((item, index) => {
            item.originalIndex = index;
            item.version = this.extractVersion(item.title);
            item.isPracticed = this.practicedArticles.has(item.articleId);
            item.isPinned = this.pinnedArticles.has(item.articleId);
        });

        this.ensureCustomOrder();
    }

    ensureCustomOrder() {
        const existingIds = new Set(this.articles.map(item => item.articleId));
        const cleanedOrder = this.customOrder.filter(id => existingIds.has(id));
        const knownIds = new Set(cleanedOrder);

        this.articles.forEach(item => {
            if (!knownIds.has(item.articleId)) {
                cleanedOrder.push(item.articleId);
            }
        });

        this.customOrder = cleanedOrder;
        this.saveArray(this.storageKeys.order, this.customOrder);
    }

    extractVersion(title) {
        const match = title.match(/Android\s+(\d+(?:\.\d+)?)/i);
        return match ? `Android ${match[1]}` : '其他';
    }

    getVersions() {
        return [...new Set(this.articles.map(item => item.version))].sort((a, b) => {
            if (a === '其他') return 1;
            if (b === '其他') return -1;

            const aNum = parseFloat(a.replace('Android ', ''));
            const bNum = parseFloat(b.replace('Android ', ''));

            if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
                return bNum - aNum;
            }

            return a.localeCompare(b, 'zh-CN');
        });
    }

    getOrderMap() {
        return new Map(this.customOrder.map((id, index) => [id, index]));
    }

    getFilteredArticles() {
        const keyword = this.currentKeyword.trim().toLowerCase();
        const orderMap = this.getOrderMap();

        return this.articles
            .filter(item => {
                const versionMatch = this.currentVersion ? item.version === this.currentVersion : true;
                const practiceMatch = this.currentPracticeStatus !== null
                    ? item.isPracticed === this.currentPracticeStatus
                    : true;
                const keywordMatch = keyword
                    ? `${item.title} ${item.description || ''}`.toLowerCase().includes(keyword)
                    : true;

                return versionMatch && practiceMatch && keywordMatch;
            })
            .sort((a, b) => {
                if (this.sortMode === 'default') {
                    return a.originalIndex - b.originalIndex;
                }

                if (a.isPinned !== b.isPinned) {
                    return a.isPinned ? -1 : 1;
                }

                const orderA = orderMap.has(a.articleId) ? orderMap.get(a.articleId) : Number.MAX_SAFE_INTEGER;
                const orderB = orderMap.has(b.articleId) ? orderMap.get(b.articleId) : Number.MAX_SAFE_INTEGER;

                if (orderA !== orderB) {
                    return orderA - orderB;
                }

                return a.originalIndex - b.originalIndex;
            });
    }

    getPinnedCount() {
        return this.pinnedArticles.size;
    }

    isPriorityMode() {
        return this.sortMode === 'priority';
    }

    togglePracticeStatus(articleId) {
        if (this.practicedArticles.has(articleId)) {
            this.practicedArticles.delete(articleId);
        } else {
            this.practicedArticles.add(articleId);
        }

        this.saveArray(this.storageKeys.practiced, [...this.practicedArticles]);
        this.syncArticleState(articleId);
    }

    togglePinStatus(articleId) {
        if (this.pinnedArticles.has(articleId)) {
            this.pinnedArticles.delete(articleId);
        } else {
            this.pinnedArticles.add(articleId);
        }

        this.saveArray(this.storageKeys.pinned, [...this.pinnedArticles]);
        this.syncArticleState(articleId);
    }

    moveArticleToTop(articleId) {
        const index = this.customOrder.indexOf(articleId);
        if (index === -1) {
            this.customOrder.unshift(articleId);
        } else {
            this.customOrder.splice(index, 1);
            this.customOrder.unshift(articleId);
        }

        this.saveArray(this.storageKeys.order, this.customOrder);
    }

    moveArticleBefore(movedArticleId, targetArticleId) {
        if (movedArticleId === targetArticleId) {
            return;
        }

        const movedIndex = this.customOrder.indexOf(movedArticleId);
        const targetIndex = this.customOrder.indexOf(targetArticleId);

        if (movedIndex === -1 || targetIndex === -1) {
            return;
        }

        this.customOrder.splice(movedIndex, 1);
        const nextTargetIndex = this.customOrder.indexOf(targetArticleId);
        this.customOrder.splice(nextTargetIndex, 0, movedArticleId);
        this.saveArray(this.storageKeys.order, this.customOrder);
    }

    resetCustomOrder() {
        this.customOrder = this.articles
            .slice()
            .sort((a, b) => a.originalIndex - b.originalIndex)
            .map(item => item.articleId);

        this.saveArray(this.storageKeys.order, this.customOrder);
    }

    syncArticleState(articleId) {
        this.articles.forEach(item => {
            if (item.articleId === articleId) {
                item.isPracticed = this.practicedArticles.has(articleId);
                item.isPinned = this.pinnedArticles.has(articleId);
            }
        });
    }

    setVersionFilter(version) {
        this.currentVersion = version;
    }

    setPracticeFilter(status) {
        this.currentPracticeStatus = status;
    }

    setKeyword(keyword) {
        this.currentKeyword = keyword;
        this.draftKeyword = keyword;
        this.saveText(this.storageKeys.keyword, keyword);
    }

    setDraftKeyword(keyword) {
        this.draftKeyword = keyword;
    }

    applyDraftKeyword() {
        this.setKeyword(this.draftKeyword);
    }

    setSortMode(mode) {
        this.sortMode = mode;
        this.saveText(this.storageKeys.sortMode, mode);
    }

    loadArray(key) {
        try {
            const value = localStorage.getItem(key);
            const parsed = value ? JSON.parse(value) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error(`读取 ${key} 失败`, error);
            return [];
        }
    }

    saveArray(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error(`保存 ${key} 失败`, error);
        }
    }

    loadText(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value === null ? fallback : value;
        } catch (error) {
            console.error(`读取 ${key} 失败`, error);
            return fallback;
        }
    }

    saveText(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            console.error(`保存 ${key} 失败`, error);
        }
    }
}

class UIManager {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.statsEl = document.getElementById('stats');
        this.filterBarEl = document.getElementById('filterBar');
        this.toolbarEl = document.getElementById('toolbar');
        this.articleListEl = document.getElementById('articleList');
        this.backToTopBtnEl = document.getElementById('backToTopBtn');
    }

    updateStats() {
        const filtered = this.dataManager.getFilteredArticles();
        const total = this.dataManager.articles.length;
        const pinned = this.dataManager.getPinnedCount();
        const modeText = this.dataManager.isPriorityMode() ? '当前为优先级排序' : '当前为默认顺序';

        this.statsEl.textContent = `共 ${total} 条，当前显示 ${filtered.length} 条，已置顶 ${pinned} 条，${modeText}`;
    }

    renderFilters() {
        const versions = this.dataManager.getVersions();
        const currentVersion = this.dataManager.currentVersion;
        const currentPracticeStatus = this.dataManager.currentPracticeStatus;

        this.filterBarEl.innerHTML = `
            <div class="filter-group">
                <h3>版本</h3>
                <div class="filter-buttons">
                    <button class="filter-btn ${currentVersion === null ? 'active' : ''}" data-type="version" data-value="all">全部</button>
                    ${versions.map(version => `
                        <button class="filter-btn ${currentVersion === version ? 'active' : ''}" data-type="version" data-value="${version}">${version}</button>
                    `).join('')}
                </div>
            </div>
            <div class="filter-group">
                <h3>实践状态</h3>
                <div class="filter-buttons">
                    <button class="filter-btn ${currentPracticeStatus === null ? 'active' : ''}" data-type="practice" data-value="all">全部</button>
                    <button class="filter-btn ${currentPracticeStatus === true ? 'active' : ''}" data-type="practice" data-value="true">已实践</button>
                    <button class="filter-btn ${currentPracticeStatus === false ? 'active' : ''}" data-type="practice" data-value="false">未实践</button>
                </div>
            </div>
        `;
    }

    renderToolbar() {
        const sortMode = this.dataManager.sortMode;
        const keyword = this.escapeHtml(this.dataManager.draftKeyword);

        this.toolbarEl.innerHTML = `
            <div class="toolbar-left">
                <span class="toolbar-label">排序模式</span>
                <button class="sort-btn ${sortMode === 'priority' ? 'active' : ''}" data-role="sort-mode" data-value="priority">我的优先级</button>
                <button class="sort-btn ${sortMode === 'default' ? 'active' : ''}" data-role="sort-mode" data-value="default">原始顺序</button>
                <button class="toolbar-btn" data-role="reset-order">重置自定义顺序</button>
            </div>
            <div class="toolbar-right">
                <input
                    id="keywordInput"
                    class="search-input"
                    type="search"
                    placeholder="搜索标题或简介，比如 Android 13、Settings、音量键"
                    value="${keyword}"
                />
                <button class="toolbar-btn toolbar-search-btn" data-role="search-keyword">搜索</button>
            </div>
            <div class="toolbar-tip">
                优先级模式下可直接拖动卡片调整顺序；右键可置顶、取消置顶，或一键移到最前。
            </div>
        `;
    }

    renderArticles() {
        const filtered = this.dataManager.getFilteredArticles();
        const canDrag = this.dataManager.isPriorityMode();

        if (filtered.length === 0) {
            this.articleListEl.innerHTML = '<div class="no-data">没有匹配的内容，换个筛选条件试试。</div>';
            return;
        }

        this.articleListEl.innerHTML = filtered.map(item => `
            <div
                class="article-item ${item.isPracticed ? 'practiced' : ''} ${item.isPinned ? 'pinned' : ''}"
                data-article-id="${item.articleId}"
                draggable="${canDrag}"
            >
                <div class="article-title">
                    ${canDrag ? '<span class="drag-hint" title="拖动调整顺序">☰</span>' : ''}
                    ${item.isPinned ? '<span class="pin-tag">置顶</span>' : ''}
                    <span class="version-tag">${item.version}</span>
                    <a href="${item.url}" target="_blank" rel="noopener">${this.escapeHtml(item.title)}</a>
                    <span class="practice-status ${item.isPracticed ? 'practiced' : ''}" title="${item.isPracticed ? '已实践' : '未实践'}">
                        ${item.isPracticed ? '✓' : '✗'}
                    </span>
                </div>
                <div class="article-desc">${this.escapeHtml(item.description || '暂无简介')}</div>
                <div class="article-meta">
                    <span>时间 ${this.escapeHtml(item.postTime || item.formatTime || '-')}</span>
                    <span>阅读 ${item.viewCount || 0}</span>
                    <span>评论 ${item.commentCount || 0}</span>
                    <span>点赞 ${item.diggCount || 0}</span>
                    <span>收藏 ${item.collectCount || 0}</span>
                    <button class="practice-btn" data-article-id="${item.articleId}">
                        ${item.isPracticed ? '取消实践' : '标记实践'}
                    </button>
                    <button class="note-btn" data-article-id="${item.articleId}" title="创建或打开笔记">
                        笔记
                    </button>
                </div>
            </div>
        `).join('');
    }

    updateUI() {
        this.updateStats();
        this.renderFilters();
        this.renderToolbar();
        this.renderArticles();
        this.updateBackToTopVisibility();
    }

    updateBackToTopVisibility() {
        if (!this.backToTopBtnEl) {
            return;
        }

        this.backToTopBtnEl.classList.toggle('visible', window.scrollY > 240);
    }

    escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

class NoteManager {
    createNote(article) {
        const noteId = `note_${article.articleId}`;
        const noteContent = `# ${article.title}\n\n${article.description || ''}\n\n原文链接: ${article.url}\n\n# 实践笔记\n\n`;
        const existingNote = localStorage.getItem(noteId);

        if (existingNote) {
            this.openNote(article, existingNote);
            return;
        }

        localStorage.setItem(noteId, noteContent);
        this.openNote(article, noteContent);
    }

    openNote(article, content) {
        const noteWindow = window.open('', '_blank', 'width=1100,height=720,left=80,top=60');

        if (!noteWindow) {
            alert('无法打开笔记窗口，请检查浏览器弹窗设置。');
            return;
        }

        const initialMd = JSON.stringify(content);
        noteWindow.document.write(`
            <!DOCTYPE html>
            <html lang="zh">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>笔记 - ${article.title}</title>
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.css">
                <style>
                    body {
                        font-family: 'Microsoft YaHei', sans-serif;
                        margin: 0;
                        padding: 20px;
                        background: #f5f5f5;
                    }
                    .container {
                        max-width: 960px;
                        margin: 0 auto;
                        background: white;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        padding: 20px;
                    }
                    h1 {
                        font-size: 20px;
                        color: #333;
                        margin-bottom: 16px;
                    }
                    .editor-wrap .EasyMDEContainer .CodeMirror {
                        min-height: 420px;
                        font-size: 14px;
                        line-height: 1.6;
                    }
                    .buttons {
                        margin-top: 16px;
                        display: flex;
                        gap: 10px;
                        justify-content: flex-end;
                    }
                    button {
                        padding: 8px 16px;
                        border: 1px solid #ddd;
                        background: white;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        transition: all 0.2s;
                    }
                    button:hover {
                        background: #f0f0f0;
                    }
                    .save-btn {
                        background: #4caf50;
                        color: white;
                        border-color: #4caf50;
                    }
                    .save-btn:hover {
                        background: #45a049;
                    }
                    .download-btn {
                        background: #2196f3;
                        color: white;
                        border-color: #2196f3;
                    }
                    .download-btn:hover {
                        background: #1976d2;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>笔记 - ${article.title}</h1>
                    <p style="margin:0 0 12px;font-size:13px;color:#666;">支持 Markdown 编辑、预览和下载。</p>
                    <div class="editor-wrap">
                        <textarea id="noteContent"></textarea>
                    </div>
                    <div class="buttons">
                        <button type="button" class="download-btn" onclick="downloadNote()">下载 .md</button>
                        <button type="button" class="save-btn" onclick="saveNote()">保存笔记</button>
                    </div>
                </div>
                <script src="https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.js"></script>
                <script>
                    const noteId = 'note_${article.articleId}';
                    let noteEditor;

                    (function init() {
                        noteEditor = new EasyMDE({
                            element: document.getElementById('noteContent'),
                            spellChecker: false,
                            autosave: { enabled: false },
                            placeholder: '在这里记录你的实践步骤、踩坑和结论',
                            status: ['lines', 'words', 'cursor'],
                            toolbar: ['bold', 'italic', 'heading', '|', 'quote', 'unordered-list', 'ordered-list', '|', 'link', 'image', '|', 'preview', 'side-by-side', 'fullscreen', '|', 'guide']
                        });
                        noteEditor.value(${initialMd});
                    })();

                    function saveNote() {
                        const text = noteEditor.value();
                        localStorage.setItem(noteId, text);
                        alert('笔记已保存');
                    }

                    function downloadNote() {
                        const text = noteEditor.value();
                        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = '${this.sanitizeFileName(article.title)}.md';
                        a.click();
                        URL.revokeObjectURL(url);
                    }
                </script>
            </body>
            </html>
        `);
        noteWindow.document.close();
    }

    sanitizeFileName(name) {
        return name.replace(/[\\/:*?"<>|]/g, '_');
    }
}

class EventManager {
    constructor(dataManager, uiManager, noteManager) {
        this.dataManager = dataManager;
        this.uiManager = uiManager;
        this.noteManager = noteManager;
        this.draggedArticleId = null;
        this.bindEvents();
    }

    bindEvents() {
        this.uiManager.filterBarEl.addEventListener('click', (event) => {
            const button = event.target.closest('.filter-btn');
            if (!button) {
                return;
            }

            const { type, value } = button.dataset;

            if (type === 'version') {
                this.dataManager.setVersionFilter(value === 'all' ? null : value);
            } else if (type === 'practice') {
                this.dataManager.setPracticeFilter(value === 'all' ? null : value === 'true');
            }

            this.uiManager.updateUI();
        });

        this.uiManager.toolbarEl.addEventListener('click', (event) => {
            const button = event.target.closest('[data-role]');
            if (!button) {
                return;
            }

            const role = button.dataset.role;

            if (role === 'sort-mode') {
                this.dataManager.setSortMode(button.dataset.value);
                this.uiManager.updateUI();
                return;
            }

            if (role === 'reset-order') {
                const confirmed = window.confirm('确定要重置你的自定义顺序吗？置顶状态会保留。');
                if (!confirmed) {
                    return;
                }

                this.dataManager.resetCustomOrder();
                this.uiManager.updateUI();
                return;
            }

            if (role === 'search-keyword') {
                this.dataManager.applyDraftKeyword();
                this.uiManager.updateUI();
            }
        });

        this.uiManager.toolbarEl.addEventListener('input', (event) => {
            if (event.target.id !== 'keywordInput') {
                return;
            }

            this.dataManager.setDraftKeyword(event.target.value);
        });

        this.uiManager.toolbarEl.addEventListener('keydown', (event) => {
            if (event.target.id !== 'keywordInput' || event.key !== 'Enter') {
                return;
            }

            event.preventDefault();
            this.dataManager.applyDraftKeyword();
            this.uiManager.updateUI();
        });

        this.uiManager.articleListEl.addEventListener('click', (event) => {
            const practiceBtn = event.target.closest('.practice-btn');
            if (practiceBtn) {
                const articleId = Number(practiceBtn.dataset.articleId);
                this.dataManager.togglePracticeStatus(articleId);
                this.uiManager.updateUI();
                return;
            }

            const noteBtn = event.target.closest('.note-btn');
            if (noteBtn) {
                const articleId = Number(noteBtn.dataset.articleId);
                const article = this.dataManager.articles.find(item => item.articleId === articleId);
                if (article) {
                    this.noteManager.createNote(article);
                }
            }
        });

        this.uiManager.articleListEl.addEventListener('contextmenu', (event) => {
            const articleItem = event.target.closest('.article-item');
            if (!articleItem) {
                return;
            }

            event.preventDefault();
            const articleId = Number(articleItem.dataset.articleId);
            const article = this.dataManager.articles.find(item => item.articleId === articleId);

            if (article) {
                this.showContextMenu(event, article);
            }
        });

        this.uiManager.articleListEl.addEventListener('dragstart', (event) => {
            if (!this.dataManager.isPriorityMode()) {
                event.preventDefault();
                return;
            }

            const articleItem = event.target.closest('.article-item');
            if (!articleItem) {
                return;
            }

            this.draggedArticleId = Number(articleItem.dataset.articleId);
            articleItem.classList.add('dragging');

            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(this.draggedArticleId));
            }
        });

        this.uiManager.articleListEl.addEventListener('dragover', (event) => {
            if (!this.dataManager.isPriorityMode()) {
                return;
            }

            const articleItem = event.target.closest('.article-item');
            if (!articleItem || Number(articleItem.dataset.articleId) === this.draggedArticleId) {
                return;
            }

            event.preventDefault();
            this.clearDragOverState();
            articleItem.classList.add('drag-over');
        });

        this.uiManager.articleListEl.addEventListener('drop', (event) => {
            if (!this.dataManager.isPriorityMode()) {
                return;
            }

            const articleItem = event.target.closest('.article-item');
            if (!articleItem) {
                return;
            }

            event.preventDefault();
            const targetArticleId = Number(articleItem.dataset.articleId);
            this.dataManager.moveArticleBefore(this.draggedArticleId, targetArticleId);
            this.draggedArticleId = null;
            this.uiManager.updateUI();
        });

        this.uiManager.articleListEl.addEventListener('dragend', () => {
            this.draggedArticleId = null;
            this.clearDragState();
        });

        if (this.uiManager.backToTopBtnEl) {
            this.uiManager.backToTopBtnEl.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        window.addEventListener('scroll', () => {
            this.uiManager.updateBackToTopVisibility();
        }, { passive: true });
    }

    clearDragOverState() {
        this.uiManager.articleListEl
            .querySelectorAll('.article-item.drag-over')
            .forEach(item => item.classList.remove('drag-over'));
    }

    clearDragState() {
        this.uiManager.articleListEl
            .querySelectorAll('.article-item.dragging, .article-item.drag-over')
            .forEach(item => item.classList.remove('dragging', 'drag-over'));
    }

    showContextMenu(event, article) {
        const existingMenu = document.querySelector('.context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;
        menu.innerHTML = `
            <div class="menu-item" data-action="toggle-pin">
                ${article.isPinned ? '取消置顶' : '置顶到前面'}
            </div>
            <div class="menu-item" data-action="move-top">
                移到当前优先级最前
            </div>
            <div class="menu-item" data-action="toggle-practice">
                ${article.isPracticed ? '取消实践标记' : '标记为已实践'}
            </div>
            <div class="menu-item" data-action="create-note">
                创建或打开笔记
            </div>
            <div class="menu-item" data-action="open-url">
                打开原文
            </div>
        `;

        document.body.appendChild(menu);

        const closeMenu = () => {
            if (document.body.contains(menu)) {
                menu.remove();
            }
            document.removeEventListener('click', closeMenu);
        };

        menu.addEventListener('click', (menuEvent) => {
            const menuItem = menuEvent.target.closest('.menu-item');
            if (!menuItem) {
                return;
            }

            const action = menuItem.dataset.action;

            if (action === 'toggle-pin') {
                const shouldPin = !article.isPinned;
                this.dataManager.togglePinStatus(article.articleId);
                if (shouldPin) {
                    this.dataManager.moveArticleToTop(article.articleId);
                }
                this.uiManager.updateUI();
            } else if (action === 'move-top') {
                this.dataManager.moveArticleToTop(article.articleId);
                if (!article.isPinned && !this.dataManager.isPriorityMode()) {
                    this.dataManager.setSortMode('priority');
                }
                this.uiManager.updateUI();
            } else if (action === 'toggle-practice') {
                this.dataManager.togglePracticeStatus(article.articleId);
                this.uiManager.updateUI();
            } else if (action === 'create-note') {
                this.noteManager.createNote(article);
            } else if (action === 'open-url') {
                window.open(article.url, '_blank', 'noopener');
            }

            closeMenu();
        });

        setTimeout(() => {
            document.addEventListener('click', closeMenu, { once: true });
        }, 0);
    }
}

class App {
    constructor() {
        this.dataManager = new DataManager();
        this.uiManager = new UIManager(this.dataManager);
        this.noteManager = new NoteManager();
        this.eventManager = new EventManager(this.dataManager, this.uiManager, this.noteManager);
        this.init();
    }

    init() {
        this.uiManager.updateUI();

        if (this.uiManager.backToTopBtnEl) {
            this.uiManager.backToTopBtnEl.textContent = 'TOP';
            this.uiManager.backToTopBtnEl.title = 'Back to top';
            this.uiManager.backToTopBtnEl.setAttribute('aria-label', 'Back to top');
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new App());
} else {
    new App();
}
