/**
 * Cross-surface author (@) and article (#) references.
 * - @ opens author search
 * - # opens article-title search
 * Inserts: @handle | #/blogId (rendered as linked title)
 */
(function (global) {
    'use strict';

    const AUTHOR_TRIGGER = '@';
    const ARTICLE_TRIGGER = '#';
    const MAX_RESULTS = 8;

    let catalogPromise = null;
    let catalog = { authors: [], articles: [], byId: new Map() };
    /** handle(lower) → /pfps/... */
    const avatarByHandle = Object.create(null);
    const avatarFetchInflight = Object.create(null);

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeAuthor(raw) {
        return String(raw || '')
            .trim()
            .replace(/^@+/, '')
            .split('@')[0]
            .replace(/\s+/g, '_');
    }

    function hashHandle(s) {
        let h = 0;
        const str = String(s || '');
        for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
        return Math.abs(h);
    }

    function normalizeAvatarPath(path) {
        const raw = String(path || '').trim();
        if (!raw) return '';
        const m = raw.match(/(?:^|\/)pfps\/([^/?#]+)$/i);
        if (!m) return '';
        const files = Array.isArray(global.AUTHOR_AVATAR_FILES) ? global.AUTHOR_AVATAR_FILES : [];
        if (files.length && !files.includes(m[1])) return '';
        return `/pfps/${m[1]}`;
    }

    function fallbackAvatarUrl(handle) {
        const files = Array.isArray(global.AUTHOR_AVATAR_FILES) ? global.AUTHOR_AVATAR_FILES : [];
        if (!files.length) return '';
        const key = normalizeAuthor(handle).toLowerCase();
        return `/pfps/${files[hashHandle(key) % files.length]}`;
    }

    function cachedAvatarUrl(handle) {
        const key = normalizeAuthor(handle).toLowerCase();
        if (!key) return '';
        if (avatarByHandle[key]) return avatarByHandle[key];
        return fallbackAvatarUrl(key);
    }

    function resolveAuthorAvatar(handle) {
        const key = normalizeAuthor(handle).toLowerCase();
        if (!key) return Promise.resolve('');
        if (avatarByHandle[key]) return Promise.resolve(avatarByHandle[key]);
        if (avatarFetchInflight[key]) return avatarFetchInflight[key];
        avatarFetchInflight[key] = fetch(`/api/author-profile/${encodeURIComponent(key)}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                const fromProfile = normalizeAvatarPath(data && data.profile && data.profile.avatar);
                const url = fromProfile || fallbackAvatarUrl(key);
                avatarByHandle[key] = url;
                return url;
            })
            .catch(() => {
                const url = fallbackAvatarUrl(key);
                avatarByHandle[key] = url;
                return url;
            })
            .finally(() => {
                delete avatarFetchInflight[key];
            });
        return avatarFetchInflight[key];
    }

    /** Rendered author mention: little pfp + handle (no leading @). Homepage wall tags keep @. */
    function authorRefHtml(handle) {
        const h = normalizeAuthor(handle);
        const src = cachedAvatarUrl(h);
        const img = src
            ? `<img class="content-ref-author-avatar" src="${escapeHtml(src)}" alt="" width="14" height="14" decoding="async" />`
            : '';
        return (
            `<a class="content-ref content-ref-author" data-ref="author" data-ref-id="${escapeHtml(h)}" href="${authorHref(h)}">` +
            `${img}<span class="content-ref-author-name">${escapeHtml(h)}</span></a>`
        );
    }

    /** Upgrade existing / freshly linkified author refs; hydrate profile avatars. */
    function enhanceAuthorRefs(root) {
        if (!root || !root.querySelectorAll) return;
        const nodes = root.querySelectorAll('a.content-ref-author[data-ref-id]');
        nodes.forEach((a) => {
            const handle = normalizeAuthor(a.getAttribute('data-ref-id') || a.textContent);
            if (!handle) return;
            a.setAttribute('data-ref-id', handle);
            a.setAttribute('href', authorHref(handle));
            let img = a.querySelector('img.content-ref-author-avatar');
            let nameEl = a.querySelector('.content-ref-author-name');
            if (!nameEl || !img) {
                const src = cachedAvatarUrl(handle);
                a.innerHTML =
                    (src
                        ? `<img class="content-ref-author-avatar" src="${escapeHtml(src)}" alt="" width="14" height="14" decoding="async" />`
                        : '') + `<span class="content-ref-author-name">${escapeHtml(handle)}</span>`;
                img = a.querySelector('img.content-ref-author-avatar');
                nameEl = a.querySelector('.content-ref-author-name');
            } else if (nameEl.textContent !== handle) {
                nameEl.textContent = handle;
            }
            resolveAuthorAvatar(handle).then((url) => {
                if (!url) return;
                let el = a.querySelector('img.content-ref-author-avatar');
                if (!el) {
                    el = document.createElement('img');
                    el.className = 'content-ref-author-avatar';
                    el.alt = '';
                    el.width = 14;
                    el.height = 14;
                    el.decoding = 'async';
                    a.insertBefore(el, a.firstChild);
                }
                if (el.getAttribute('src') !== url) el.src = url;
            });
        });
    }

    function ensureCatalog() {
        if (catalogPromise) return catalogPromise;
        const db = global.db;
        if (!db || !db.collection) {
            catalogPromise = Promise.resolve(catalog);
            return catalogPromise;
        }
        catalogPromise = db
            .collection('blogs')
            .get()
            .then((snap) => {
                const authorSet = new Set();
                const articles = [];
                const byId = new Map();
                snap.forEach((doc) => {
                    const data = doc.data() || {};
                    const id = doc.id;
                    const title = String(data.title || '').trim() || id;
                    const author = normalizeAuthor(data.author) || 'Anonymous';
                    authorSet.add(author);
                    const item = { id, title, author };
                    articles.push(item);
                    byId.set(id, item);
                });
                articles.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
                catalog = {
                    authors: Array.from(authorSet).sort((a, b) =>
                        a.localeCompare(b, undefined, { sensitivity: 'base' })
                    ),
                    articles,
                    byId,
                };
                return catalog;
            })
            .catch((err) => {
                console.error('ContentRefs catalog', err);
                catalogPromise = null;
                return catalog;
            });
        return catalogPromise;
    }

    function getCatalog() {
        return catalog;
    }

    function filterAuthors(query) {
        const q = String(query || '').toLowerCase();
        const list = catalog.authors;
        if (!q) return list.slice(0, MAX_RESULTS);
        return list.filter((a) => a.toLowerCase().includes(q)).slice(0, MAX_RESULTS);
    }

    function filterArticles(query) {
        const q = String(query || '').toLowerCase();
        const list = catalog.articles;
        if (!q) return list.slice(0, MAX_RESULTS);
        return list
            .filter(
                (a) =>
                    a.title.toLowerCase().includes(q) ||
                    a.id.toLowerCase().includes(q) ||
                    a.author.toLowerCase().includes(q)
            )
            .slice(0, MAX_RESULTS);
    }

    /** Detect active @ or # query at caret in a plain string. */
    function detectQuery(value, caret) {
        const text = String(value || '');
        const pos = Math.max(0, Math.min(caret | 0, text.length));
        const before = text.slice(0, pos);
        // Don't treat email local-parts as author mentions.
        const authorMatch = before.match(/(^|[\s([{«"'])@([A-Za-z0-9_]*)$/);
        if (authorMatch) {
            return {
                type: 'author',
                trigger: AUTHOR_TRIGGER,
                query: authorMatch[2],
                start: pos - authorMatch[2].length - 1,
                end: pos,
            };
        }
        // Article: #query or #/id — titles may include colons (and ids keep them).
        const articleMatch = before.match(/(^|[\s([{«"'])#(\/?[A-Za-z0-9 _.:-]*)$/);
        if (articleMatch) {
            const triggerIdx = before.lastIndexOf('#');
            return {
                type: 'article',
                trigger: ARTICLE_TRIGGER,
                query: String(articleMatch[2] || '').replace(/^\//, ''),
                start: triggerIdx,
                end: pos,
            };
        }
        return null;
    }

    function tokenForSelection(type, item) {
        if (type === 'author') return `@${item.id || item}`;
        return `#/${item.id}`;
    }

    function labelForSelection(type, item) {
        if (type === 'author') return `@${item.id || item}`;
        return item.title || item.id;
    }

    let activeMenu = null;

    function destroyMenu() {
        if (activeMenu) {
            activeMenu.remove();
            activeMenu = null;
        }
    }

    function setActiveMenu(el) {
        destroyMenu();
        activeMenu = el || null;
    }

    function positionMenu(menu, anchorRect) {
        if (!anchorRect) return;
        const pad = 6;
        const vw = window.innerWidth || 800;
        const vh = window.innerHeight || 600;
        let left = anchorRect.left;
        let top = anchorRect.bottom + 4;
        menu.style.left = '0px';
        menu.style.top = '0px';
        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        if (left + rect.width > vw - pad) left = Math.max(pad, vw - rect.width - pad);
        if (top + rect.height > vh - pad) top = Math.max(pad, anchorRect.top - rect.height - 4);
        menu.style.left = `${Math.round(left)}px`;
        menu.style.top = `${Math.round(top)}px`;
    }

    function renderMenu(items, type, selectedIndex, onPick) {
        destroyMenu();
        if (!items.length) return null;
        const menu = document.createElement('div');
        menu.className = 'content-ref-menu';
        menu.setAttribute('role', 'listbox');
        items.forEach((item, i) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'content-ref-menu-item' + (i === selectedIndex ? ' is-active' : '');
            row.setAttribute('role', 'option');
            if (type === 'author') {
                row.innerHTML = `<span class="content-ref-menu-primary">@${escapeHtml(item)}</span>`;
            } else {
                row.innerHTML =
                    `<span class="content-ref-menu-primary">${escapeHtml(item.title)}</span>` +
                    `<span class="content-ref-menu-meta">@${escapeHtml(item.author)}</span>`;
            }
            row.addEventListener('mousedown', (e) => {
                e.preventDefault();
                onPick(type === 'author' ? { id: item, title: item } : item);
            });
            menu.appendChild(row);
        });
        setActiveMenu(menu);
        return menu;
    }

    /**
     * Attach @ / # autocomplete to an <input> or <textarea>.
     * onInsert(token, meta) optional — default replaces the query range in the field.
     */
    function attachToTextField(field, options = {}) {
        if (!field || field.dataset.contentRefsBound === '1') return () => {};
        field.dataset.contentRefsBound = '1';
        ensureCatalog();

        let selectedIndex = 0;
        let current = null;
        let items = [];

        const close = () => {
            destroyMenu();
            current = null;
            items = [];
            selectedIndex = 0;
        };

        const refresh = async () => {
            await ensureCatalog();
            const caret = field.selectionStart ?? field.value.length;
            const detected = detectQuery(field.value, caret);
            if (!detected) {
                close();
                return;
            }
            current = detected;
            items =
                detected.type === 'author'
                    ? filterAuthors(detected.query)
                    : filterArticles(detected.query);
            if (!items.length) {
                destroyMenu();
                return;
            }
            selectedIndex = Math.min(selectedIndex, items.length - 1);
            const menu = renderMenu(items, detected.type, selectedIndex, (item) => {
                applySelection(item);
            });
            if (!menu) return;
            const rect = field.getBoundingClientRect();
            positionMenu(menu, rect);
        };

        const applySelection = (item) => {
            if (!current) return;
            const token = tokenForSelection(current.type, item) + ' ';
            if (typeof options.onInsert === 'function') {
                options.onInsert(token, { type: current.type, item, range: current });
            } else {
                const v = field.value;
                field.value = v.slice(0, current.start) + token + v.slice(current.end);
                const pos = current.start + token.length;
                field.focus();
                field.setSelectionRange(pos, pos);
                field.dispatchEvent(new Event('input', { bubbles: true }));
            }
            close();
        };

        const onKeyDown = (e) => {
            if (!activeMenu || !items.length) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % items.length;
                refresh();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = (selectedIndex - 1 + items.length) % items.length;
                refresh();
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                const item =
                    current.type === 'author'
                        ? { id: items[selectedIndex], title: items[selectedIndex] }
                        : items[selectedIndex];
                applySelection(item);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        };

        const onBlur = () => setTimeout(close, 150);

        field.addEventListener('input', refresh);
        field.addEventListener('keyup', refresh);
        field.addEventListener('click', refresh);
        field.addEventListener('keydown', onKeyDown);
        field.addEventListener('blur', onBlur);

        return () => {
            field.removeEventListener('input', refresh);
            field.removeEventListener('keyup', refresh);
            field.removeEventListener('click', refresh);
            field.removeEventListener('keydown', onKeyDown);
            field.removeEventListener('blur', onBlur);
            delete field.dataset.contentRefsBound;
            close();
        };
    }

    /** Escape text then turn @handle / #/id into links. */
    function linkifyPlainText(text) {
        const escaped = escapeHtml(text);
        // Articles first (#/id)
        let html = escaped.replace(/#\/([A-Za-z0-9._~:-]+)/g, (_, id) => {
            const resolved = resolveArticleId(id);
            const art = catalog.byId.get(resolved);
            const label = art ? escapeHtml(art.title) : escapeHtml(resolved);
            return `<a class="content-ref content-ref-article" data-ref="article" data-ref-id="${escapeHtml(resolved)}" href="${articleHref(resolved)}">${label}</a>`;
        });
        html = html.replace(
            /(^|[\s([{«"'])@([A-Za-z0-9_]+)/g,
            (_, pre, handle) => `${pre}${authorRefHtml(handle)}`
        );
        return html;
    }

    /** Enhance article HTML: convert remaining plain tokens in text nodes; leave existing .content-ref alone. */
    function linkifyElement(root) {
        if (!root) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue || !/[@#]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
                const p = node.parentElement;
                if (!p) return NodeFilter.FILTER_REJECT;
                if (p.closest('a, .content-ref, .footnote-ref, script, style')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach((textNode) => {
            const raw = textNode.nodeValue;
            const html = linkifyPlainText(raw);
            if (html === escapeHtml(raw)) return;
            const wrap = document.createElement('span');
            wrap.innerHTML = html;
            const parent = textNode.parentNode;
            if (!parent) return;
            while (wrap.firstChild) parent.insertBefore(wrap.firstChild, textNode);
            parent.removeChild(textNode);
        });
        enhanceAuthorRefs(root);
    }

    function authorHref(handle) {
        return `/?author=${encodeURIComponent(normalizeAuthor(handle))}`;
    }

    function articleHref(id) {
        // Colon is valid in path segments; encoding as %3A breaks decodeURI-based readers.
        return `/${encodeURIComponent(String(id))}`.replace(/%3A/gi, ':');
    }

    /** Map truncated #/ids (missing random suffix) onto a unique catalog entry when possible. */
    function resolveArticleId(id) {
        const wanted = String(id || '');
        if (!wanted) return wanted;
        if (catalog.byId.has(wanted)) return wanted;
        const matches = catalog.articles.filter(
            (a) => a.id === wanted || a.id.startsWith(`${wanted}-`)
        );
        return matches.length === 1 ? matches[0].id : wanted;
    }

    /** TipTap insert HTML for a selection. */
    function htmlForSelection(type, item) {
        if (type === 'author') {
            return authorRefHtml(item.id || item);
        }
        const id = item.id;
        const title = item.title || id;
        return `<a class="content-ref content-ref-article" data-ref="article" data-ref-id="${escapeHtml(id)}" href="${articleHref(id)}">${escapeHtml(title)}</a>`;
    }

    global.ContentRefs = {
        AUTHOR_TRIGGER,
        ARTICLE_TRIGGER,
        ensureCatalog,
        getCatalog,
        detectQuery,
        filterAuthors,
        filterArticles,
        attachToTextField,
        linkifyPlainText,
        linkifyElement,
        enhanceAuthorRefs,
        htmlForSelection,
        tokenForSelection,
        labelForSelection,
        destroyMenu,
        setActiveMenu,
    };
})(typeof window !== 'undefined' ? window : globalThis);
