/** Path may keep %3A etc.; decodeURI leaves those encoded and breaks Firestore lookups. */
function blogIdFromPath() {
    const pop = (location.pathname.split('/').filter(Boolean).pop() || '');
    try {
        return decodeURIComponent(pop);
    } catch (_) {
        try {
            return decodeURI(pop);
        } catch {
            return pop;
        }
    }
}
let blogId = blogIdFromPath();
const commentSection = document.querySelector('.comment-section');
const commentScreenEl = document.getElementById('comment-screen');

let docRef = db.collection("blogs").doc(blogId);
let commentRef = db.collection("comments").doc(blogId+'_'+0);
let comments = db.collection("comments");

function setResolvedBlogId(nextId) {
    const id = String(nextId || '');
    if (!id || id === blogId) return;
    blogId = id;
    docRef = db.collection('blogs').doc(blogId);
    commentRef = db.collection('comments').doc(`${blogId}_0`);
    try {
        const encoded = encodeURIComponent(blogId).replace(/%3A/gi, ':');
        history.replaceState({}, '', `/${encoded}${location.search}${location.hash}`);
    } catch (_) {}
}

/** Exact id, or unique prefix match (truncated #/ refs missing the random suffix). */
function resolveBlogDocument(id) {
    const wanted = String(id || '');
    if (!wanted) return Promise.resolve(null);
    return db
        .collection('blogs')
        .doc(wanted)
        .get()
        .then((doc) => {
            if (doc.exists) return doc;
            return db.collection('blogs').get().then((snap) => {
                const matches = snap.docs.filter(
                    (d) => d.id === wanted || d.id.startsWith(`${wanted}-`)
                );
                if (matches.length === 1) {
                    setResolvedBlogId(matches[0].id);
                    return matches[0];
                }
                return null;
            });
        });
}

let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
let numberofcomments = 0;
let commenttracker = [];
let commentsState = new Map();

let commentsReady = false;
let readerReady = false;
let commentsListenerAttached = false;
let articleBlocksCache = { blocks: [], footnoteDefs: new Map() };
let spreadResizeBound = false;
let spreadReflowTimer = null;
let annotationLayoutListenersBound = false;
let annotationLayoutRaf = null;
let currentBlogMeta = null;
/** Author opted in: readers may highlight & annotate this version. */
let blogNotesOpen = false;
let footnoteNavAttached = false;
let annotationsListenerAttached = false;
let annotationSelectionBound = false;
let annotationHighlightNavBound = false;
let annotationsState = [];
let pendingAnnotationRange = null;
/** Picked on first valid in-article selection; reused when clicking "Add annotation" so hue matches overlay + save. */
let selectionSessionAnnotationIds = null;
/** After "Add annotation": offsets + quote until user submits or cancels via the main #commentInput. */
let pendingAnnotationDraft = null;
let annotationToolbar = null;
let annotationToolbarHideTimer = null;
let annotationOverlayRoot = null;
const annotationColorSeed = Math.floor(Date.now() / 1000);
const READER_HANDOFF_KEY = 'readerHandoffPayload';
const READER_HANDOFF_MAX_AGE_MS = 90 * 1000;
const READER_EMBED = new URLSearchParams(location.search).get('embed') === '1';

if (READER_EMBED) {
    document.documentElement.classList.add('reader-embed');
    document.body.classList.add('reader-embed');
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta && !/interactive-widget/i.test(viewportMeta.content)) {
        viewportMeta.content = `${viewportMeta.content}, interactive-widget=resizes-content`;
    }
}

/** Last article content page — compose field is always pinned to this sheet’s foot. */
let lastArticlePageElForComments = null;

function articleHasPostedComments() {
    return Boolean(commentsState && commentsState.size > 0);
}

/** Thread sheet: any posted comment or annotation card. */
function articleHasCommentThread() {
    return (
        articleHasPostedComments() ||
        (Array.isArray(annotationsState) && annotationsState.length > 0)
    );
}

function ensureCommentComposeDock() {
    let dock = document.getElementById('comment-compose');
    if (!dock) {
        dock = document.createElement('div');
        dock.id = 'comment-compose';
        dock.className = 'comment-compose';
    }
    const form = document.getElementById('commentForm');
    if (form && form.parentElement !== dock) {
        dock.appendChild(form);
    }
    return dock;
}

/** Pin compose dock to the foot of a content page (above footnotes when present). */
function pinComposeToContentPageFoot(dock, anchor) {
    if (!dock || !anchor) return;
    dock.classList.remove('comment-compose--page-foot', 'comment-compose--above-footnotes');
    const footnotes = anchor.querySelector(':scope > .article-page-footnotes');
    const pageNumber = anchor.querySelector(':scope > .article-page-number');
    if (footnotes) {
        dock.classList.add('comment-compose--above-footnotes');
        footnotes.before(dock);
    } else if (pageNumber) {
        dock.classList.add('comment-compose--page-foot');
        pageNumber.before(dock);
    } else {
        dock.classList.add('comment-compose--page-foot');
        anchor.appendChild(dock);
    }
}

/** Last sheet that still has article body (skip footnote-only spill pages). */
function lastArticleContentPage(articleBody) {
    if (!articleBody) return null;
    const pages = articleBody.querySelectorAll(
        '.article-page-left:not(.article-page-comments)'
    );
    for (let i = pages.length - 1; i >= 0; i -= 1) {
        const body = pages[i].querySelector(':scope > .article-page-body');
        if (body && body.childElementCount > 0) return pages[i];
    }
    return pages.length ? pages[pages.length - 1] : null;
}

function removeDedicatedCommentsPages(articleBody) {
    if (!articleBody) return;
    articleBody.querySelectorAll('.article-page-comments').forEach((page) => {
        const spread = page.closest('.article-spread');
        if (spread) spread.remove();
        else page.remove();
    });
}

/**
 * Compose field always sits on the last content page (foot, above footnotes).
 * Once there is a thread (comments or annotations), the list gets its own sheet
 * after that page — input stays on the content sheet, before the comments page.
 */
function mountCommentScreenForLayout(lastArticlePageEl) {
    if (!commentScreenEl) return;

    const composeDock = ensureCommentComposeDock();
    const articleBody = document.getElementById('article-body');

    /*
     * Desktop embed (?embed=1) used to park comments outside pages for an old
     * iOS caret bug. On mobile that made compose + bands full-bleed under the
     * paper cards. Always use in-page mounting when we have article pages —
     * including the home mobile iframe reader.
     */
    if (READER_EMBED && !articleBody) {
        const blogRoot = document.querySelector('.blog');
        if (blogRoot) {
            blogRoot.appendChild(composeDock);
            blogRoot.appendChild(commentScreenEl);
        }
        return;
    }

    if (!articleBody) return;

    // Park list host so tearing down an old comments sheet doesn't destroy it.
    articleBody.appendChild(commentScreenEl);
    articleBody.appendChild(composeDock);
    removeDedicatedCommentsPages(articleBody);

    // Prefer an explicit page only if it still has body content; else resolve fresh.
    let anchor = null;
    if (
        lastArticlePageEl &&
        lastArticlePageEl.isConnected &&
        lastArticlePageEl.querySelector(':scope > .article-page-body')?.childElementCount > 0
    ) {
        anchor = lastArticlePageEl;
    } else if (
        lastArticlePageElForComments &&
        lastArticlePageElForComments.isConnected &&
        lastArticlePageElForComments.querySelector(':scope > .article-page-body')?.childElementCount > 0
    ) {
        anchor = lastArticlePageElForComments;
    }
    if (!anchor) anchor = lastArticleContentPage(articleBody);
    if (anchor) lastArticlePageElForComments = anchor;

    commentScreenEl.classList.remove('comment-screen--page-foot', 'comment-screen--above-footnotes');
    composeDock.classList.remove('comment-compose--page-foot', 'comment-compose--above-footnotes');

    // Same as desktop: compose on last content page foot; thread on its own sheet.
    if (anchor) pinComposeToContentPageFoot(composeDock, anchor);

    if (!articleHasCommentThread()) {
        commentScreenEl.hidden = true;
        applyPageNumbers(articleBody);
        return;
    }

    commentScreenEl.hidden = false;
    const spread = createSpread();
    articleBody.appendChild(spread.spread);
    const page = spread.leftPage;
    page.classList.add('article-page-comments');
    ensureArticlePageBody(page);
    page.appendChild(commentScreenEl);
    applyPageNumbers(articleBody);
}

function bindCommentInputEmbedFocusFix() {
    const input = document.getElementById('commentInput');
    if (!input || input.dataset.embedFocusFixBound) return;
    input.dataset.embedFocusFixBound = '1';
    const scrollInputIntoView = () => {
        requestAnimationFrame(() => {
            input.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
        });
    };
    input.addEventListener('focus', scrollInputIntoView);
    input.addEventListener('touchend', scrollInputIntoView, { passive: true });
}

document.body.classList.add('reader-loading');

function setupFootnoteRefNavigation() {
    if (footnoteNavAttached) return;
    footnoteNavAttached = true;
    document.body.addEventListener('click', (e) => {
        const ref = e.target.closest('.footnote-ref');
        if (!ref || !document.getElementById('article-body')?.contains(ref)) return;
        const id = ref.getAttribute('data-footnote-id');
        if (!id) return;
        e.preventDefault();
        let note = document.getElementById(`fn-${id}`);
        if (!note && typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            note = document.querySelector(`p[data-variant="footnote"][data-footnote-id="${CSS.escape(id)}"]`);
        }
        if (note) note.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

function getAnnotationToolbar() {
    if (annotationToolbar) return annotationToolbar;
    const toolbar = document.createElement('div');
    toolbar.className = 'annotation-toolbar';
    toolbar.hidden = true;
    toolbar.innerHTML = `<button type="button" class="annotation-add-btn">add annotation</button>`;
    document.body.appendChild(toolbar);
    toolbar.querySelector('.annotation-add-btn')?.addEventListener('click', beginAnnotationComposeFromSelection);
    annotationToolbar = toolbar;
    return toolbar;
}

function hideAnnotationToolbar() {
    const toolbar = getAnnotationToolbar();
    if (annotationToolbarHideTimer) {
        clearTimeout(annotationToolbarHideTimer);
        annotationToolbarHideTimer = null;
    }
    toolbar.hidden = true;
    clearAnnotationToolbarSessionTone();
}

function scheduleHideAnnotationToolbar() {
    if (annotationToolbarHideTimer) clearTimeout(annotationToolbarHideTimer);
    annotationToolbarHideTimer = setTimeout(() => {
        hideAnnotationToolbar();
    }, 120);
}

function articleContentRoot() {
    return document.getElementById('article-body');
}

function ensureAnnotationOverlayRoot() {
    if (annotationOverlayRoot) return annotationOverlayRoot;
    const root = document.createElement('div');
    root.id = 'annotation-overlay-root';
    document.body.appendChild(root);
    annotationOverlayRoot = root;
    return root;
}

function ensureAnnotationCommentsHost() {
    if (!commentSection) return null;
    let host = document.getElementById('annotation-comments');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'annotation-comments';
    host.className = 'annotation-comments';
    commentSection.prepend(host);
    return host;
}

function hashString(value) {
    const s = String(value || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function annotationSoftColor(id, index = 0) {
    const base = (hashString(id) + annotationColorSeed + (index * 97)) % 360;
    const hue = base;
    const sat = 58;
    const light = 84;
    const satBtn = 46;
    return {
        fill: `hsla(${hue}, ${sat}%, ${light}%, 0.42)`,
        fillActive: `hsla(${hue}, ${sat}%, ${Math.max(74, light - 8)}%, 0.62)`,
        border: `hsla(${hue}, 46%, ${Math.max(56, light - 22)}%, 0.33)`,
        borderActive: `hsla(${hue}, 52%, ${Math.max(48, light - 30)}%, 0.52)`,
        badge: `hsla(${hue}, 44%, ${Math.max(62, light - 14)}%, 0.28)`,
        badgeText: `hsla(${hue}, 38%, 30%, 0.95)`,
        /** Same hue as highlight; mostly opaque with a hint of translucency (Add annotation button). */
        buttonFillHi: `hsla(${hue}, ${satBtn}%, 90%, 0.92)`,
        buttonFillMid: `hsla(${hue}, ${satBtn + 4}%, 76%, 0.9)`,
        buttonFillLo: `hsla(${hue}, ${satBtn + 8}%, 63%, 0.88)`,
        buttonBorder: `hsla(${hue}, 34%, 38%, 0.92)`
    };
}

/** Matches list + card ordering so compose-time hue matches post-save highlight hue. */
function sortAnnotationsLikeRenderer(items) {
    return [...items].sort((a, b) => {
        const d = (a.createdAtMs || 0) - (b.createdAtMs || 0);
        if (d !== 0) return d;
        return String(a.id).localeCompare(String(b.id));
    });
}

function computeToneForAnnotationIdentity(annotationId, createdAtMs) {
    if (!annotationId || !Number.isFinite(createdAtMs)) {
        return annotationSoftColor('pending', 0);
    }
    const hypothetical = { id: annotationId, createdAtMs };
    const sorted = sortAnnotationsLikeRenderer([...annotationsState, hypothetical]);
    const idx = sorted.findIndex((a) => a.id === annotationId);
    const index = idx >= 0 ? idx : 0;
    return annotationSoftColor(annotationId, index);
}

function computeToneForPendingAnnotationDraft(draft) {
    if (!draft?.annotationId || !Number.isFinite(draft.createdAtMs)) {
        return annotationSoftColor('pending', 0);
    }
    return computeToneForAnnotationIdentity(draft.annotationId, draft.createdAtMs);
}

function applyAnnotationToolbarSessionTone(tone) {
    const t = getAnnotationToolbar();
    t.classList.add('annotation-toolbar-toned');
    t.style.setProperty('--ann-session-border', tone.buttonBorder);
    t.style.setProperty('--ann-session-fill-hi', tone.buttonFillHi);
    t.style.setProperty('--ann-session-fill-mid', tone.buttonFillMid);
    t.style.setProperty('--ann-session-fill-lo', tone.buttonFillLo);
}

function clearAnnotationToolbarSessionTone() {
    const t = annotationToolbar;
    if (!t) return;
    t.classList.remove('annotation-toolbar-toned');
    t.style.removeProperty('--ann-session-border');
    t.style.removeProperty('--ann-session-fill-hi');
    t.style.removeProperty('--ann-session-fill-mid');
    t.style.removeProperty('--ann-session-fill-lo');
}

function applyComposeInputTone(tone) {
    const input = document.getElementById('commentInput');
    if (!input) return;
    input.style.setProperty('--ann-compose-fill', tone.fill);
    input.style.setProperty('--ann-compose-border', tone.border);
    input.style.setProperty('--ann-compose-border-focus', tone.borderActive);
}

function clearComposeInputTone() {
    const input = document.getElementById('commentInput');
    if (!input) return;
    ['--ann-compose-fill', '--ann-compose-border', '--ann-compose-border-focus'].forEach((p) => {
        input.style.removeProperty(p);
    });
}

function clearPendingAnnotationHighlightPreview() {
    document.querySelectorAll('#annotation-overlay-root .annotation-highlight-pending').forEach((el) => el.remove());
}

/** Toolbar tint only (no overlay rects — avoids jank under Safari’s native selection). */
function applySelectionSessionToolbarToneOnly() {
    if (!selectionSessionAnnotationIds) return;
    const tone = computeToneForAnnotationIdentity(
        selectionSessionAnnotationIds.annotationId,
        selectionSessionAnnotationIds.createdAtMs
    );
    applyAnnotationToolbarSessionTone(tone);
}

function renderPendingAnnotationHighlightPreview(draft, tone) {
    clearPendingAnnotationHighlightPreview();
    const root = articleContentRoot();
    if (!root || !draft) return;
    const overlay = ensureAnnotationOverlayRoot();
    const range = rangeFromOffsets(root, draft.startOffset, draft.endOffset);
    if (!range) return;
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    rects.forEach((rect) => {
        const box = document.createElement('div');
        box.className = 'annotation-highlight annotation-highlight-pending';
        box.setAttribute('aria-hidden', 'true');
        box.style.left = `${window.scrollX + rect.left}px`;
        box.style.top = `${window.scrollY + rect.top}px`;
        box.style.width = `${rect.width}px`;
        box.style.height = `${rect.height}px`;
        box.style.setProperty('--ann-fill', tone.fill);
        box.style.setProperty('--ann-fill-active', tone.fillActive);
        box.style.setProperty('--ann-border', tone.border);
        box.style.setProperty('--ann-border-active', tone.borderActive);
        overlay.appendChild(box);
    });
}

function syncPendingAnnotationComposeChrome() {
    if (!pendingAnnotationDraft?.annotationId) return;
    const tone = computeToneForPendingAnnotationDraft(pendingAnnotationDraft);
    applyComposeInputTone(tone);
    renderPendingAnnotationHighlightPreview(pendingAnnotationDraft, tone);
}

function isSelectionInArticle(selection) {
    if (!selection || selection.rangeCount === 0) return false;
    const root = articleContentRoot();
    if (!root) return false;
    const range = selection.getRangeAt(0);
    if (range.collapsed) return false;
    const { startContainer, endContainer } = range;
    return root.contains(startContainer) && root.contains(endContainer);
}

function textNodesUnder(root) {
    const nodes = [];
    if (!root) return nodes;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.nodeValue || !node.nodeValue.length) return NodeFilter.FILTER_REJECT;
            const parentEl = node.parentElement;
            if (!parentEl) return NodeFilter.FILTER_REJECT;
            // Body prose only — chrome must not shift annotation offsets.
            if (parentEl.closest('#comment-screen')) return NodeFilter.FILTER_REJECT;
            if (parentEl.closest('.annotation-highlight')) return NodeFilter.FILTER_REJECT;
            if (parentEl.closest('.article-inline-masthead')) return NodeFilter.FILTER_REJECT;
            if (parentEl.closest('.article-title-block')) return NodeFilter.FILTER_REJECT;
            if (parentEl.closest('.article-page-footnotes')) return NodeFilter.FILTER_REJECT;
            if (parentEl.closest('.article-page-number')) return NodeFilter.FILTER_REJECT;
            if (parentEl.closest('.article-page-comments')) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    let cur = walker.nextNode();
    while (cur) {
        nodes.push(cur);
        cur = walker.nextNode();
    }
    return nodes;
}

function computeTextOffset(root, container, localOffset) {
    const nodes = textNodesUnder(root);
    let offset = 0;
    for (const node of nodes) {
        if (node === container) return offset + localOffset;
        offset += node.nodeValue.length;
    }
    return -1;
}

function serializeRangeOffsets(root, range) {
    const start = computeTextOffset(root, range.startContainer, range.startOffset);
    const end = computeTextOffset(root, range.endContainer, range.endOffset);
    if (start < 0 || end < 0 || end <= start) return null;
    return { startOffset: start, endOffset: end };
}

function rangeFromOffsets(root, startOffset, endOffset) {
    const nodes = textNodesUnder(root);
    const range = document.createRange();
    let running = 0;
    let startNode = null;
    let endNode = null;
    let startLocal = 0;
    let endLocal = 0;

    for (const node of nodes) {
        const next = running + node.nodeValue.length;
        if (!startNode && startOffset >= running && startOffset <= next) {
            startNode = node;
            startLocal = Math.max(0, Math.min(node.nodeValue.length, startOffset - running));
        }
        if (!endNode && endOffset >= running && endOffset <= next) {
            endNode = node;
            endLocal = Math.max(0, Math.min(node.nodeValue.length, endOffset - running));
        }
        running = next;
        if (startNode && endNode) break;
    }

    if (!startNode || !endNode) return null;
    range.setStart(startNode, startLocal);
    range.setEnd(endNode, endLocal);
    if (range.collapsed) return null;
    return range;
}

function normalizeAnnotationQuote(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

/** Locate quote in body text — survives chrome/offset-space churn after layout changes. */
function rangeFromSelectedText(root, selectedText) {
    const needle = normalizeAnnotationQuote(selectedText);
    if (!needle || needle.length < 2) return null;
    const nodes = textNodesUnder(root);
    let hay = '';
    const map = []; // hay index → { node, local }
    nodes.forEach((node) => {
        const value = node.nodeValue || '';
        for (let i = 0; i < value.length; i += 1) {
            map.push({ node, local: i });
            hay += value[i];
        }
    });
    const hayNorm = hay.replace(/\s+/g, ' ');
    // Build index map from normalized hay → original hay index
    const normToRaw = [];
    let raw = 0;
    let norm = '';
    while (raw < hay.length) {
        if (/\s/.test(hay[raw])) {
            if (norm.length && norm[norm.length - 1] !== ' ') {
                normToRaw.push(raw);
                norm += ' ';
            }
            while (raw < hay.length && /\s/.test(hay[raw])) raw += 1;
            continue;
        }
        normToRaw.push(raw);
        norm += hay[raw];
        raw += 1;
    }
    const idx = norm.indexOf(needle);
    if (idx < 0) return null;
    const startRaw = normToRaw[idx];
    const endRaw = normToRaw[idx + needle.length - 1];
    if (startRaw == null || endRaw == null || !map[startRaw] || !map[endRaw]) return null;
    const range = document.createRange();
    range.setStart(map[startRaw].node, map[startRaw].local);
    range.setEnd(map[endRaw].node, map[endRaw].local + 1);
    if (range.collapsed) return null;
    return range;
}

function rangeForAnnotation(root, item) {
    const byOffset =
        Number.isFinite(item.startOffset) && Number.isFinite(item.endOffset)
            ? rangeFromOffsets(root, item.startOffset, item.endOffset)
            : null;
    if (byOffset) {
        const got = normalizeAnnotationQuote(byOffset.toString());
        const want = normalizeAnnotationQuote(item.selectedText);
        if (!want || got === want || got.includes(want) || want.includes(got)) {
            return byOffset;
        }
    }
    return rangeFromSelectedText(root, item.selectedText) || byOffset;
}

function unwrapNode(el) {
    if (!el || !el.parentNode) return;
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    parent.normalize();
}

function clearAnnotationHighlights() {
    const overlay = ensureAnnotationOverlayRoot();
    overlay.querySelectorAll('.annotation-highlight:not(.annotation-highlight-pending)').forEach((el) => el.remove());
}

function scheduleAnnotationLayoutSync() {
    if (!articleBlocksCache.blocks.length) return;
    if (annotationLayoutRaf != null) return;
    annotationLayoutRaf = requestAnimationFrame(() => {
        annotationLayoutRaf = null;
        applyAnnotationHighlights();
    });
}

function applyAnnotationHighlights() {
    const root = articleContentRoot();
    if (!root) return;
    clearAnnotationHighlights();
    const overlay = ensureAnnotationOverlayRoot();
    if (!annotationsState.length) {
        syncPendingAnnotationComposeChrome();
        return;
    }
    const sorted = sortAnnotationsLikeRenderer(annotationsState);
    sorted.forEach((item, idx) => {
        const tone = annotationSoftColor(item.id, idx);
        const range = rangeForAnnotation(root, item);
        if (!range) return;
        const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
        rects.forEach((rect) => {
            const box = document.createElement('button');
            box.type = 'button';
            box.className = 'annotation-highlight';
            box.dataset.annotationId = item.id;
            box.dataset.annotationIndex = String(idx + 1);
            box.style.left = `${window.scrollX + rect.left}px`;
            box.style.top = `${window.scrollY + rect.top}px`;
            box.style.width = `${rect.width}px`;
            box.style.height = `${rect.height}px`;
            box.style.setProperty('--ann-fill', tone.fill);
            box.style.setProperty('--ann-fill-active', tone.fillActive);
            box.style.setProperty('--ann-border', tone.border);
            box.style.setProperty('--ann-border-active', tone.borderActive);
            overlay.appendChild(box);
        });
    });
    syncPendingAnnotationComposeChrome();
}

function renderAnnotationList() {
    const host = ensureAnnotationCommentsHost();
    if (!host) return;
    host.innerHTML = '';
    const ordered = sortAnnotationsLikeRenderer(annotationsState);
    ordered.forEach((item, idx) => {
        const tone = annotationSoftColor(item.id, idx);
        const card = document.createElement('div');
        card.className = 'comment-card annotation-card';
        card.id = `annotation-item-${item.id}`;
        card.dataset.annotationId = item.id;
        card.style.setProperty('--ann-fill', tone.fill);
        card.style.setProperty('--ann-fill-active', tone.fillActive);
        card.style.setProperty('--ann-border', tone.border);
        card.style.setProperty('--ann-border-active', tone.borderActive);
        card.style.setProperty('--ann-badge', tone.badge);
        card.style.setProperty('--ann-badge-text', tone.badgeText);
        const userTag = String(item.user || 'anonymous').trim() || 'anonymous';
        const content = (item.commentText || '').trim();
        const quote = String(item.selectedText || '').trim();
        const quoteHtml = quote
            ? `<em class="annotation-quote">\u201c${formatCommentBodyHtml(quote)}\u201d</em>`
            : '';
        const bodyHtml = content
            ? `<span class="annotation-comment-body">${formatCommentBodyHtml(content)}</span>`
            : '';
        const commentInner = [quoteHtml, bodyHtml].filter(Boolean).join(' ');
        card.innerHTML = `
            <div class="comment-shell">
                <div class="comment-main">
                    <h1 class="user annotation-user">@${userTag}</h1>
                    <p class="comment-content annotation-comment">${commentInner}</p>
                </div>
                <div class="comment-actions">
                    <button class="reply" onclick="event.stopPropagation(); makeAnchor('${userTag}','${item.id}')">reply</button>
                </div>
            </div>
        `;
        host.appendChild(card);
    });
}

function scrollToAnnotationItem(annotationId) {
    const el = document.getElementById(`annotation-item-${annotationId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    el.classList.add('annotation-item-active');
    setTimeout(() => el.classList.remove('annotation-item-active'), 900);
}

function scrollToAnnotationHighlight(annotationId) {
    const el = document.querySelector(`.annotation-highlight[data-annotation-id="${annotationId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('annotation-highlight-active');
    setTimeout(() => el.classList.remove('annotation-highlight-active'), 900);
}

function bindAnnotationNavigation() {
    if (annotationHighlightNavBound) return;
    annotationHighlightNavBound = true;
    document.body.addEventListener('click', (e) => {
        const h = e.target.closest('#annotation-overlay-root .annotation-highlight');
        if (h) {
            e.preventDefault();
            const id = h.dataset.annotationId;
            if (id) scrollToAnnotationItem(id);
            return;
        }
        const item = e.target.closest('.annotation-card');
        if (item) {
            const id = item.dataset.annotationId;
            if (id) scrollToAnnotationHighlight(id);
        }
    });
}

function areNotesOpen() {
    return blogNotesOpen === true;
}

function syncNotesGateUi() {
    if (!areNotesOpen()) {
        hideAnnotationToolbar();
        if (pendingAnnotationDraft) exitAnnotationComposeMode();
    }
}

function bindAnnotationSelectionUi() {
    if (annotationSelectionBound) return;
    annotationSelectionBound = true;
    const root = articleContentRoot();
    if (!root) return;
    const toolbar = getAnnotationToolbar();

    document.addEventListener('selectionchange', () => {
        const sel = window.getSelection();
        if (!isSelectionInArticle(sel)) {
            pendingAnnotationRange = null;
            selectionSessionAnnotationIds = null;
            clearAnnotationToolbarSessionTone();
            scheduleHideAnnotationToolbar();
            return;
        }
        const range = sel.getRangeAt(0).cloneRange();
        const rect = range.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) {
            pendingAnnotationRange = null;
            selectionSessionAnnotationIds = null;
            clearAnnotationToolbarSessionTone();
            scheduleHideAnnotationToolbar();
            return;
        }

        // Readers: either annotate UI appears, or selection does nothing special.
        if (!areNotesOpen()) {
            pendingAnnotationRange = null;
            selectionSessionAnnotationIds = null;
            clearAnnotationToolbarSessionTone();
            scheduleHideAnnotationToolbar();
            return;
        }

        if (!selectionSessionAnnotationIds) {
            const createdAtMs = Date.now();
            selectionSessionAnnotationIds = {
                annotationId: `${blogId}_ann_${createdAtMs}_${Math.random().toString(36).slice(2, 7)}`,
                createdAtMs
            };
        }
        pendingAnnotationRange = range;
        // Cancel any pending hide (mousedown schedules one) so the button stays up.
        if (annotationToolbarHideTimer) {
            clearTimeout(annotationToolbarHideTimer);
            annotationToolbarHideTimer = null;
        }
        toolbar.hidden = false;
        applySelectionSessionToolbarToneOnly();
        const top = Math.max(8, window.scrollY + rect.top - 40);
        const left = Math.max(8, Math.min(window.scrollX + rect.left, window.scrollX + window.innerWidth - 150));
        toolbar.style.top = `${top}px`;
        toolbar.style.left = `${left}px`;
    });

    // Only dismiss when the press is outside a live selection gesture on the article.
    // Hiding on every article mousedown raced selectionchange and killed the button.
    document.addEventListener('mousedown', (e) => {
        if (toolbar.contains(e.target)) return;
        if (root.contains(e.target)) return;
        scheduleHideAnnotationToolbar();
    });
}

const DEFAULT_COMMENT_PLACEHOLDER = 'so what do you think?';
const ANNOTATION_COMMENT_PLACEHOLDER = 'Note on the highlighted passage…';

function exitAnnotationComposeMode() {
    clearPendingAnnotationHighlightPreview();
    clearComposeInputTone();
    pendingAnnotationDraft = null;
    const input = document.getElementById('commentInput');
    const form = document.getElementById('commentForm');
    if (input) {
        input.placeholder = DEFAULT_COMMENT_PLACEHOLDER;
        input.classList.remove('annotation-compose-input');
    }
    form?.classList.remove('annotation-compose');
}

async function saveAnnotationFromDraft(draft, commentTextTrimmed) {
    if (!areNotesOpen()) {
        throw new Error('Notes are not open on this article');
    }
    // Re-check live flag in case the author closed notes mid-compose.
    try {
        const live = await docRef.get();
        if (live.exists && live.data()?.notesOpen !== true) {
            blogNotesOpen = false;
            syncNotesGateUi();
            throw new Error('Notes are not open on this article');
        }
    } catch (err) {
        if (String(err?.message || '').includes('Notes are not open')) throw err;
        console.warn('Could not re-check notesOpen before save:', err);
    }
    if (!draft.annotationId || !Number.isFinite(draft.createdAtMs)) {
        throw new Error('Annotation draft missing id or timestamp');
    }
    const user = auth.currentUser?.email?.split('@')[0] || 'anonymous';
    const createdAtMs = draft.createdAtMs;
    const d = new Date(createdAtMs);
    const postedAt = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    await db.collection('annotations').doc(draft.annotationId).set({
        blogId,
        startOffset: draft.startOffset,
        endOffset: draft.endOffset,
        selectedText: draft.selectedText,
        commentText: commentTextTrimmed.trim(),
        user,
        postedAt,
        createdAtMs
    });
}

function beginAnnotationComposeFromSelection() {
    if (!areNotesOpen()) return;
    const root = articleContentRoot();
    if (!root || !pendingAnnotationRange) return;
    const offsets = serializeRangeOffsets(root, pendingAnnotationRange);
    if (!offsets) return;
    const selectedText = pendingAnnotationRange.toString().trim();
    if (!selectedText) return;

    const createdAtMs = selectionSessionAnnotationIds?.createdAtMs ?? Date.now();
    const annotationId =
        selectionSessionAnnotationIds?.annotationId ??
        `${blogId}_ann_${createdAtMs}_${Math.random().toString(36).slice(2, 7)}`;
    selectionSessionAnnotationIds = null;

    pendingAnnotationDraft = {
        startOffset: offsets.startOffset,
        endOffset: offsets.endOffset,
        selectedText,
        annotationId,
        createdAtMs
    };
    pendingAnnotationRange = null;
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    hideAnnotationToolbar();

    const input = document.getElementById('commentInput');
    const form = document.getElementById('commentForm');
    if (!input) return;
    input.removeAttribute('name');
    input.value = '';
    input.placeholder = ANNOTATION_COMMENT_PLACEHOLDER;
    input.classList.add('annotation-compose-input');
    form?.classList.add('annotation-compose');

    syncPendingAnnotationComposeChrome();

    (document.getElementById('comment-compose') || form || input)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
    });
    input.focus();
}

function attachAnnotationsListener() {
    if (annotationsListenerAttached) return;
    annotationsListenerAttached = true;
    db.collection('annotations')
        .where('blogId', '==', blogId)
        .onSnapshot((snapshot) => {
            const next = [];
            snapshot.forEach((doc) => {
                const d = doc.data() || {};
                next.push({
                    id: doc.id,
                    startOffset: Number(d.startOffset),
                    endOffset: Number(d.endOffset),
                    selectedText: String(d.selectedText || ''),
                    commentText: String(d.commentText || ''),
                    user: String(d.user || 'anonymous'),
                    createdAtMs: Number(d.createdAtMs || 0)
                });
            });
            annotationsState = next.filter((a) => Number.isFinite(a.startOffset) && Number.isFinite(a.endOffset) && a.endOffset > a.startOffset);
            applyAnnotationHighlights();
            renderAnnotationList();
            // On refresh, comments can load before annotations; rerender threads now that
            // annotation parent IDs are known, so annotation replies are nested correctly.
            renderThreadedComments();
            mountCommentScreenForLayout(lastArticlePageElForComments);
        });
}

function readReaderHandoffPayload() {
    try {
        const raw = sessionStorage.getItem(READER_HANDOFF_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (String(parsed.blogId || '') !== String(blogId || '')) return null;
        const ts = Number(parsed.ts || 0);
        if (!Number.isFinite(ts) || Date.now() - ts > READER_HANDOFF_MAX_AGE_MS) return null;
        return parsed;
    } catch (_) {
        return null;
    }
}

function clearReaderHandoffPayload() {
    try { sessionStorage.removeItem(READER_HANDOFF_KEY); } catch (_) {}
}

/** Reveal comments only after the final (non-provisional) article layout is ready. */
function ensureCommentsVisible() {
    if (!readerReady) return;
    document.body.classList.remove('reader-loading');
    const commentScreen = document.getElementById('comment-screen');
    if (commentScreen) commentScreen.style.removeProperty('display');
}

function renderReaderHandoffIfPresent() {
    const payload = readReaderHandoffPayload();
    if (!payload) return;
    const handoffHeight = Number(payload.previewPageHeight);
    if (Number.isFinite(handoffHeight) && handoffHeight > 100) {
        document.documentElement.style.setProperty('--readerHandoffPageHeight', `${Math.round(handoffHeight)}px`);
    }
    const handoffWidth = Number(payload.previewPageWidth);
    if (Number.isFinite(handoffWidth) && handoffWidth > 100) {
        document.documentElement.style.setProperty('--readerHandoffPageWidth', `${Math.round(handoffWidth)}px`);
    }
    const titleTag = document.querySelector('title');
    const title = payload.title || '';
    const publishedAt = payload.publishedAt || '';
    const author = payload.author || 'Anonymous';
    titleTag.textContent = title || 'Good People';
    currentBlogMeta = { title, publishedAt, author };
    if (typeof payload.article === 'string' && payload.article.trim()) {
        renderArticleBody(payload.article, { provisional: true });
    }
}

resolveBlogDocument(blogId)
    .then((doc) => {
        if (doc && doc.exists) {
            setupBlog(doc.data());
        } else {
            location.replace('/');
        }
    })
    .catch((err) => {
        console.error('Failed to load blog', err);
        location.replace('/');
    });

commentRef.get().then((comms) => {
    console.log(numberofcomments);
    commentsReady = true;
    if (!comms.exists) {
        console.log("no comments yet");
    }
    // Attach listener early; keep #comment-screen hidden until readerReady.
    setupCommentSection();
})


let pendingCommentDeleteId = null;

function currentCommentAuthorHandle() {
    return getAuthorIdFromUser(auth.currentUser);
}

function canDeleteComment(data) {
    const user = auth.currentUser;
    if (!user || !data) return false;
    const storedUid = String(data.uid || '').trim();
    if (storedUid) return storedUid === user.uid;
    const handle = currentCommentAuthorHandle();
    if (!handle || handle === 'Anonymous') return false;
    return String(data.user || '').toLowerCase() === handle.toLowerCase();
}

function parseCommentSubmitText(raw, replyTargetId) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return null;

    let responseUser = '';
    let content = trimmed;
    let replyId = '';

    if (trimmed.charAt(0) === '@') {
        const spaceIdx = trimmed.search(/\s/);
        if (spaceIdx === -1) {
            // Reply chip only ("@Anonymous") — don't post until there's a body.
            return null;
        }
        responseUser = trimmed.slice(0, spaceIdx);
        content = trimmed.slice(spaceIdx).trim();
        replyId = String(replyTargetId || '').trim();
        if (!content) return null;
    }

    return { responseUser, content, replyId };
}

function openCommentDeleteDialog(commentId) {
    const dialog = document.getElementById('comment-delete-dialog');
    if (!dialog || !commentId) return;
    pendingCommentDeleteId = commentId;
    dialog.hidden = false;
    dialog.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
        dialog.querySelector('[data-comment-delete-confirm]')?.focus();
    });
}

function closeCommentDeleteDialog() {
    const dialog = document.getElementById('comment-delete-dialog');
    pendingCommentDeleteId = null;
    if (!dialog) return;
    dialog.hidden = true;
    dialog.setAttribute('aria-hidden', 'true');
}

async function confirmCommentDelete() {
    const id = pendingCommentDeleteId;
    if (!id) {
        closeCommentDeleteDialog();
        return;
    }
    const data = commentsState.get(id);
    if (!canDeleteComment(data)) {
        closeCommentDeleteDialog();
        return;
    }
    try {
        await comments.doc(id).delete();
    } catch (err) {
        console.error('Failed to delete comment', err);
    }
    closeCommentDeleteDialog();
}

function bindCommentDeleteDialog() {
    const dialog = document.getElementById('comment-delete-dialog');
    if (!dialog || dialog.dataset.bound === '1') return;
    dialog.dataset.bound = '1';
    dialog.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.closest('[data-comment-delete-cancel]')) {
            e.preventDefault();
            closeCommentDeleteDialog();
            return;
        }
        if (t.closest('[data-comment-delete-confirm]')) {
            e.preventDefault();
            confirmCommentDelete();
        }
    });
}

function bindCommentFormSubmit() {
    const form = document.getElementById('commentForm');
    if (!form || form.dataset.submitBound === '1') return;
    form.dataset.submitBound = '1';
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        submitComment(numberofcomments);
    });
}

document.addEventListener('keydown', function (e) {
    const deleteDialog = document.getElementById('comment-delete-dialog');
    const deleteOpen = Boolean(deleteDialog && !deleteDialog.hidden);

    if (e.key === 'Enter') {
        if (deleteOpen) return;
        e.preventDefault();
        submitComment(numberofcomments);
        return;
    }

    if (e.key === 'Escape') {
        if (deleteOpen) {
            closeCommentDeleteDialog();
            e.preventDefault();
            return;
        }
        if (pendingAnnotationDraft) {
            const input = document.getElementById('commentInput');
            exitAnnotationComposeMode();
            if (input && document.activeElement === input) input.value = '';
            e.preventDefault();
        }
    }
});

bindCommentFormSubmit();
bindCommentDeleteDialog();

async function submitComment(commentindex) {
    const input = document.getElementById('commentInput');
    if (!input) return;
    let commentText = input.value.trim();

    if (pendingAnnotationDraft) {
        if (!commentText) {
            if (document.activeElement === input) exitAnnotationComposeMode();
            return;
        }
        try {
            await saveAnnotationFromDraft(pendingAnnotationDraft, commentText);
            exitAnnotationComposeMode();
            input.value = '';
        } catch (err) {
            console.error(err);
            if (String(err?.message || '').includes('Notes are not open')) {
                exitAnnotationComposeMode();
            }
        }
        return;
    }

    const parsed = parseCommentSubmitText(commentText, input.getAttribute('name'));
    if (!parsed) return;

    const date = new Date();
    const author = currentCommentAuthorHandle();
    const uid = auth.currentUser?.uid || null;

    comments
        .doc(blogId + '_' + commentindex)
        .set({
            content: parsed.content,
            postedAt: `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`,
            responseTo: parsed.responseUser,
            user: author,
            uid,
            replyId: parsed.replyId,
        })
        .then(() => {
            console.log('Document created');
        });

    numberofcomments++;
    docRef.update({
        numberofcomments: numberofcomments,
    });
    input.value = '';
    input.setAttribute('name', '');
}

const setupCommentSection = () => {
    if (commentsListenerAttached) return;
    commentsListenerAttached = true;
    db.collection("comments").onSnapshot((comments) => {
        const nextState = new Map();
        comments.forEach((comment) => {
            const id = comment.id;
            if (!id.startsWith(`${blogId}_`)) return;
            nextState.set(id, comment.data() || {});
        });
        commentsState = nextState;
        renderThreadedComments();
    })
}

const makeAnchor = (replyuser, commentid) => {
    exitAnnotationComposeMode();
    const input = document.getElementById('commentInput');
    if (!input) return;
    input.setAttribute('name', commentid);
    input.name = commentid;
    // Trailing space so Enter alone can't post a mention-only reply.
    input.value = `@${replyuser} `;
    input.focus();
    const caret = input.value.length;
    try {
        input.setSelectionRange(caret, caret);
    } catch (_) {}
};
const createComment = (comment, commentid) => {
    let data = comment.data();
    const input = document.getElementById("commentInput");
    const replycommentid = input.getAttribute("name");
    const commentList = document.getElementById("commentList");
    if (!commentList) return;
    console.log(data.replyId);
    input.setAttribute("name", "");
    const already = document.getElementById(commentid);
    if (already) return;
    if(data.responseTo == ''){
        commentList.insertAdjacentHTML('beforeend', `
        <li class="comment-card" id='${commentid}'>
            <h1 class="user">@${data.user}</h1>
            <div class="comment-meat">
                <p class="comment-content">${data.content}</p>
                <button class="reply" onclick="makeAnchor('${data.user}','${commentid}')">reply</button>
            </div>
        </li>
    `);
    }else{
        commentList.insertAdjacentHTML('beforeend', `
        <li class="comment-card" id='${commentid}'>
            <h1 class="user">@${data.user}</h1>
            <div class="comment-meat">
                <p class="comment-content"><a class="reply-user" href="#'${replycommentid}'" onclick="scrollToAnchor('${data.replyId}')">${data.responseTo}</a> ${data.content}</p>
                <button class="reply" onclick="makeAnchor('${data.user}','${commentid}')">reply</button>
            </div>
        </li>
    `);
    }

}

function commentNumericOrder(id) {
    const m = String(id || '').match(/_(\d+)$/);
    if (!m) return Number.MAX_SAFE_INTEGER;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function renderThreadedComments() {
    const commentList = document.getElementById("commentList");
    if (!commentList) return;
    commentList.innerHTML = '';
    document.querySelectorAll('.annotation-card > .comment-children').forEach((el) => el.remove());
    if (!commentsState.size) {
        // Back to last article page (input only) when the thread is empty again.
        mountCommentScreenForLayout(lastArticlePageElForComments);
        return;
    }

    const childrenByParent = new Map();
    const roots = [];
    const annotationIds = new Set(annotationsState.map((a) => a.id));
    const entries = Array.from(commentsState.entries());

    entries.forEach(([id, data]) => {
        const parentIdRaw = String(data.replyId || '').trim();
        const parentIsComment = parentIdRaw && commentsState.has(parentIdRaw);
        const parentIsAnnotation = parentIdRaw && annotationIds.has(parentIdRaw);
        if (!parentIsComment && !parentIsAnnotation) {
            roots.push({ id, data });
            return;
        }
        if (!childrenByParent.has(parentIdRaw)) childrenByParent.set(parentIdRaw, []);
        childrenByParent.get(parentIdRaw).push({ id, data });
    });

    const sortByOrder = (a, b) => commentNumericOrder(a.id) - commentNumericOrder(b.id);
    roots.sort(sortByOrder);
    childrenByParent.forEach((arr) => arr.sort(sortByOrder));

    const renderNode = (node, depth = 0) => {
        const { id, data } = node;
        const li = document.createElement('li');
        li.className = 'comment-card threaded-comment';
        li.id = id;
        li.style.setProperty('--thread-depth', String(depth));

        const user = String(data.user || 'anonymous');
        const content = String(data.content || '');
        const responseTo = String(data.responseTo || '').trim();

        let contentHtml = formatCommentBodyHtml(content);
        if (responseTo) {
            const replyLabel = formatCommentBodyHtml(responseTo);
            contentHtml = `<span class="reply-user">${replyLabel}</span> ${contentHtml}`;
        }

        li.innerHTML = `
            <div class="comment-shell">
                <div class="comment-main">
                    <h1 class="user">@${user}</h1>
                    <p class="comment-content">${contentHtml}</p>
                </div>
                <div class="comment-actions">
                    <button type="button" class="reply" onclick="event.stopPropagation(); makeAnchor('${user}','${id}')">reply</button>
                </div>
            </div>
        `;

        const actions = li.querySelector('.comment-actions');
        if (actions && canDeleteComment(data)) {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'reply comment-delete';
            delBtn.textContent = 'delete';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openCommentDeleteDialog(id);
            });
            actions.appendChild(delBtn);
        }

        const children = childrenByParent.get(id) || [];
        if (children.length) {
            const childList = document.createElement('ul');
            childList.className = 'comment-children';
            children.forEach((child) => childList.appendChild(renderNode(child, depth + 1)));
            li.appendChild(childList);
        }
        return li;
    };

    roots.forEach((rootNode) => {
        commentList.appendChild(renderNode(rootNode, 0));
    });

    // Attach comment threads that reply to annotation cards directly under those annotations.
    annotationIds.forEach((annId) => {
        const annCard = document.getElementById(`annotation-item-${annId}`);
        const annChildren = childrenByParent.get(annId) || [];
        if (!annCard || !annChildren.length) return;
        const childList = document.createElement('ul');
        childList.className = 'comment-children annotation-children';
        childList.style.setProperty('--ann-fill', annCard.style.getPropertyValue('--ann-fill'));
        childList.style.setProperty('--ann-fill-active', annCard.style.getPropertyValue('--ann-fill-active'));
        childList.style.setProperty('--ann-border', annCard.style.getPropertyValue('--ann-border'));
        childList.style.setProperty('--ann-border-active', annCard.style.getPropertyValue('--ann-border-active'));
        annChildren.forEach((child) => childList.appendChild(renderNode(child, 1)));
        annCard.appendChild(childList);
    });

    if (typeof ContentRefs !== 'undefined' && ContentRefs.enhanceAuthorRefs) {
        ContentRefs.enhanceAuthorRefs(commentList);
        annotationIds.forEach((annId) => {
            const annCard = document.getElementById(`annotation-item-${annId}`);
            if (annCard) ContentRefs.enhanceAuthorRefs(annCard);
        });
    }

    // First comment (or any non-empty thread) → own comments sheet.
    mountCommentScreenForLayout(lastArticlePageElForComments);
}

const setupBlog = (data) => {
    setupFootnoteRefNavigation();
    const titleTag = document.querySelector('title');
    const title = data.title || '';
    const publishedAt = data.publishedAt || '';
    const author = data.author || 'Anonymous';

    titleTag.textContent = title || 'Good People';
    blogNotesOpen = data.notesOpen === true;
    currentBlogMeta = { title, publishedAt, author, notesOpen: blogNotesOpen };

    numberofcomments = data.numberofcomments;

    const render = () => {
        renderArticleBody(data.article);
        syncNotesGateUi();
        setupCommentSection();
        setupCommentContentRefs();
        attachAnnotationsListener();
        bindAnnotationSelectionUi();
    };
    if (typeof ContentRefs !== 'undefined' && ContentRefs.ensureCatalog) {
        ContentRefs.ensureCatalog().finally(render);
    } else {
        render();
    }
    bindAnnotationNavigation();
    clearReaderHandoffPayload();
}


function mastheadAuthorColor(name) {
    const s = String(name);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const hue = (h >>> 0) % 360;
    return `hsl(${hue}, 66%, 42%)`;
}

const MONTH_NAMES_LONG = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function englishOrdinalDay(n) {
    const j = n % 10;
    const k = n % 100;
    if (k >= 11 && k <= 13) return `${n}th`;
    if (j === 1) return `${n}st`;
    if (j === 2) return `${n}nd`;
    if (j === 3) return `${n}rd`;
    return `${n}th`;
}

function parsePublishedToDate(raw) {
    const s = String(raw).trim();
    if (!s) return null;
    const m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
        const d = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
        if (!Number.isNaN(d.getTime())) return d;
    }
    const d2 = new Date(s);
    return Number.isNaN(d2.getTime()) ? null : d2;
}

function formatPublishedReadable(raw) {
    const d = parsePublishedToDate(raw);
    if (!d) return String(raw).trim();
    const day = englishOrdinalDay(d.getDate());
    const month = MONTH_NAMES_LONG[d.getMonth()];
    const year = d.getFullYear();
    return `${day} of ${month} ${year}`;
}

function createArticleByline(meta) {
    const author = String(meta?.author || 'Anonymous').trim().replace(/^@+/, '') || 'Anonymous';
    const publishedRaw = (meta?.publishedAt || '').trim();

    const byline = document.createElement('div');
    byline.className = 'article-byline';

    const byWord = document.createElement('span');
    byWord.className = 'article-byline-by';
    byWord.textContent = 'by';

    let authorEl;
    if (typeof ContentRefs !== 'undefined' && ContentRefs.htmlForSelection) {
        const tmp = document.createElement('span');
        tmp.innerHTML = ContentRefs.htmlForSelection('author', { id: author });
        authorEl = tmp.firstElementChild || document.createElement('a');
        authorEl.classList.add('article-byline-author');
    } else {
        authorEl = document.createElement('span');
        authorEl.className = 'article-byline-author';
        authorEl.textContent = author;
    }
    authorEl.style.color = mastheadAuthorColor(author);

    byline.appendChild(byWord);
    byline.appendChild(authorEl);
    if (typeof ContentRefs !== 'undefined' && ContentRefs.enhanceAuthorRefs) {
        ContentRefs.enhanceAuthorRefs(byline);
    }

    if (publishedRaw) {
        const onThe = document.createElement('span');
        onThe.className = 'article-byline-onthe';
        onThe.textContent = 'on the';

        const timeEl = document.createElement('time');
        timeEl.className = 'article-byline-date';
        const d = parsePublishedToDate(publishedRaw);
        if (d) {
            timeEl.dateTime = d.toISOString().slice(0, 10);
        }
        timeEl.textContent = formatPublishedReadable(publishedRaw);

        byline.appendChild(onThe);
        byline.appendChild(timeEl);
    }

    return byline;
}

/** Legacy top-of-page masthead (title + byline) when article HTML has no doc-title heading. */
function createInlineMasthead(meta) {
    const wrap = document.createElement('section');
    wrap.className = 'article-inline-masthead';

    const titleEl = document.createElement('h1');
    titleEl.className = 'title';
    titleEl.textContent = meta?.title || '';

    wrap.appendChild(titleEl);
    wrap.appendChild(createArticleByline(meta));
    return wrap;
}

function blockHtmlIsDocTitle(blockHtml) {
    const wrap = document.createElement('div');
    wrap.innerHTML = String(blockHtml || '').trim();
    const el = wrap.firstElementChild;
    if (!el || !/^H[1-3]$/.test(el.tagName)) return false;
    if (el.getAttribute('data-doc-title') === 'true') return true;
    return false;
}

function blocksIncludeDocTitle(blocks) {
    return (blocks || []).some((b) => blockHtmlIsDocTitle(b));
}

function blocksHaveHeadingMatchingTitle(blocks, title) {
    const metaTitle = String(title || '').replace(/\s+/g, ' ').trim();
    if (!metaTitle) return false;
    return (blocks || []).some((blockHtml) => {
        const wrap = document.createElement('div');
        wrap.innerHTML = String(blockHtml || '').trim();
        const el = wrap.firstElementChild;
        if (!el || !/^H[1-3]$/.test(el.tagName)) return false;
        return (el.textContent || '').replace(/\s+/g, ' ').trim() === metaTitle;
    });
}

/** Title heading + byline as one atomic block so they travel / paginate together. */
function createTitleBlockNode(blockHtml, meta) {
    const heading = createArticleNode(blockHtml);
    if (heading && /^H[1-3]$/.test(heading.tagName)) {
        heading.classList.add('title');
        heading.setAttribute('data-doc-title', 'true');
    }
    const wrap = document.createElement('header');
    wrap.className = 'article-title-block';
    wrap.appendChild(heading);
    wrap.appendChild(createArticleByline(meta));
    return wrap;
}

/** Cached for one pack pass — avoid re-probing CSS vars on every block. */
let cachedSpreadTargetHeight = 0;
let cachedSpreadTargetHeightAt = 0;

function getSpreadTargetHeight() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // Reuse within a short window (one renderArticleSpread + sibling calls).
    if (cachedSpreadTargetHeight > 100 && now - cachedSpreadTargetHeightAt < 2500) {
        return cachedSpreadTargetHeight;
    }
    const narrow = isReaderNarrow();
    /*
     * Mobile: measure the same --reader-page-height the CSS uses. Packing against
     * visualViewport while pages used a taller svh min-height left empty footers.
     */
    let measured = 0;
    if (narrow && typeof document !== 'undefined') {
        const probe = document.createElement('div');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText =
            'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;width:0;' +
            'height:var(--reader-page-height);';
        document.documentElement.appendChild(probe);
        measured = Math.floor(probe.getBoundingClientRect().height);
        probe.remove();
        if (measured > 100) {
            cachedSpreadTargetHeight = measured;
            cachedSpreadTargetHeightAt = now;
            return measured;
        }
    }
    const viewportH = window.visualViewport
        ? Math.floor(window.visualViewport.height)
        : window.innerHeight;
    const inset = narrow
        ? Math.max(16, Math.min(36, Math.round(viewportH * 0.028)))
        : Math.max(30, Math.min(52, Math.round(viewportH * 0.048)));
    measured = Math.max(viewportH - inset, 440);
    cachedSpreadTargetHeight = measured;
    cachedSpreadTargetHeightAt = now;
    return measured;
}

function createSpread() {
    const spread = document.createElement('section');
    spread.className = 'article-spread';

    const leftPage = document.createElement('div');
    leftPage.className = 'article-page article-page-left';

    const rightPage = document.createElement('div');
    rightPage.className = 'article-page article-page-right';

    spread.appendChild(leftPage);
    spread.appendChild(rightPage);

    return { spread, leftPage, rightPage };
}

function createArticleNode(line) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = line.trim();
    const node = wrapper.firstElementChild || document.createElement('p');
    if (typeof ContentRefs !== 'undefined' && ContentRefs.linkifyElement) {
        ContentRefs.linkifyElement(node);
    }
    return node;
}

function formatCommentBodyHtml(raw) {
    const text = String(raw || '');
    if (typeof ContentRefs !== 'undefined' && ContentRefs.linkifyPlainText) {
        return ContentRefs.linkifyPlainText(text);
    }
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function setupCommentContentRefs() {
    if (typeof ContentRefs === 'undefined' || !ContentRefs.attachToTextField) return;
    ContentRefs.ensureCatalog();
    const input = document.getElementById('commentInput');
    if (input) ContentRefs.attachToTextField(input);
}

function extractFootnoteDefinitionsFromHtml(html) {
    const defMap = new Map();
    const container = document.createElement('div');
    container.innerHTML = String(html || '').trim();
    container.querySelectorAll('p[data-variant="footnote"]').forEach((p) => {
        let id = p.getAttribute('data-footnote-id');
        if (!id) {
            const hid = p.getAttribute('id');
            if (hid && hid.startsWith('fn-')) id = hid.slice(3);
        }
        if (id) {
            defMap.set(id, p.outerHTML);
            p.remove();
        }
    });
    return { cleanedHtml: container.innerHTML, defMap };
}

/** Plain/markdown line → block HTML (older posts + handoff payloads). */
function formatLine(line) {
    // Handle headings
    if (line[0] == '#') {
        let hCount = 0;
        let i = 0;
        while (line[i] == '#') {
            hCount++;
            i++;
        }
        let tag = `h${hCount}`;
        return `<${tag}>${line.slice(hCount, line.length)}</${tag}>`;
    }
    // Handle images
    if (line[0] == '!' && line[1] == '[') {
        let seperator;
        for (let i = 0; i <= line.length; i++) {
            if (line[i] == ']' && line[i + 1] == '(' && line[line.length - 1] == ')') {
                seperator = i;
            }
        }
        let alt = line.slice(2, seperator);
        let src = line.slice(seperator + 2, line.length - 1);
        return `<img src="${src}" alt="${alt}" class="article-image">`;
    }
    // Handle regular text
    return `<p>${line}</p>`;
}

function parseArticleBlocks(articleData) {
    const raw = (articleData || '').trim();
    const footnoteDefs = new Map();
    if (!raw) return { blocks: [], footnoteDefs };

    let source = raw;
    if (raw.includes('<') && raw.includes('>')) {
        const { cleanedHtml, defMap } = extractFootnoteDefinitionsFromHtml(raw);
        defMap.forEach((v, k) => footnoteDefs.set(k, v));
        source = cleanedHtml;
    }

    if (source.includes('<') && source.includes('>')) {
        const container = document.createElement('div');
        container.innerHTML = source;
        const blocks = [];
        container.childNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                blocks.push(node.outerHTML);
            } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                blocks.push(`<p>${node.textContent.trim()}</p>`);
            }
        });
        if (blocks.length) return { blocks, footnoteDefs };
    }

    return {
        blocks: source.split('\n').filter((item) => item.length).map(formatLine),
        footnoteDefs
    };
}

function ensureArticlePageBody(pageEl) {
    let b = pageEl.querySelector('.article-page-body');
    if (b) return b;
    b = document.createElement('div');
    b.className = 'article-page-body';
    const mh = pageEl.querySelector('.article-inline-masthead');
    if (mh) mh.after(b);
    else pageEl.prepend(b);
    return b;
}

function collectFootnoteRefIdsFromNode(el) {
    if (!el || !el.querySelectorAll) return [];
    const ids = [];
    el.querySelectorAll('.footnote-ref[data-footnote-id]').forEach((ref) => {
        const id = ref.getAttribute('data-footnote-id');
        if (id && !ids.includes(id)) ids.push(id);
    });
    return ids;
}

function collectFootnoteRefIdsUnion(bodyEl, extraEl) {
    const out = [];
    const add = (el) => {
        collectFootnoteRefIdsFromNode(el).forEach((id) => {
            if (id && !out.includes(id)) out.push(id);
        });
    };
    if (bodyEl) add(bodyEl);
    if (extraEl) add(extraEl);
    return out;
}

function isReaderNarrow() {
    return (
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 900px)').matches
    );
}

/**
 * Max footnote band (px). Band sizes to notes that fit; anything past this spills
 * to the next page so a spam of notes cannot eat the whole sheet.
 */
function footnoteBandHeight(spreadHeight) {
    const h = Number(spreadHeight) || 0;
    const narrow = isReaderNarrow();
    if (h <= 0) return narrow ? 88 : 112;
    // Mobile: room for a short note + clearance (too-tight bands clipped off the sheet).
    if (narrow) return Math.min(132, Math.max(72, Math.round(h * 0.135)));
    return Math.min(168, Math.max(96, Math.round(h * 0.155)));
}

function footnoteQueueForPage(bodyEl, defMap, extraEl, carryIds, assignedAnchors) {
    const queue = [];
    const seen = new Set();
    const carry = Array.isArray(carryIds) ? carryIds : [];
    const assigned = assignedAnchors instanceof Set ? assignedAnchors : null;
    const enqueue = (id) => {
        if (!id || seen.has(id) || !defMap?.has(id)) return;
        if (assigned?.has(id) && !carry.includes(id)) return;
        seen.add(id);
        queue.push(id);
    };
    carry.forEach(enqueue);
    collectFootnoteRefIdsUnion(bodyEl, extraEl).forEach(enqueue);
    return queue;
}

/**
 * Append notes into a probe until max band is full. Returns fitted ids + measured height.
 * A single note taller than the max is kept (same as finalize) so we never loop empty pages.
 */
function measureFittedFootnoteBand(defMap, idList, maxBand, probeWidthPx) {
    const ids = Array.isArray(idList) ? idList.filter((id) => id && defMap?.has(id)) : [];
    if (!ids.length) return { fittedIds: [], height: 0 };

    const width = Math.max(120, Math.round(Number(probeWidthPx) || 520));
    const probe = document.createElement('div');
    probe.className = 'article-page-footnotes';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = [
        'position:absolute',
        'left:-99999px',
        'top:0',
        `width:${width}px`,
        'visibility:hidden',
        'pointer-events:none',
        'margin:0',
    ].join(';');
    document.body.appendChild(probe);

    const fittedIds = [];
    try {
        for (let i = 0; i < ids.length; i += 1) {
            const id = ids[i];
            const html = defMap.get(id);
            if (!html) continue;
            const temp = document.createElement('div');
            temp.innerHTML = html;
            const src = temp.firstElementChild;
            if (!src) continue;
            const clone = src.cloneNode(true);
            clone.setAttribute('data-footnote-n', String(i + 1));
            probe.appendChild(clone);
            void probe.offsetHeight;
            const used = elementOuterHeightWithMargins(probe);
            if (used > maxBand && fittedIds.length > 0) {
                probe.removeChild(clone);
                break;
            }
            fittedIds.push(id);
        }
        const height = fittedIds.length ? elementOuterHeightWithMargins(probe) : 0;
        return { fittedIds, height: Math.max(0, Math.round(height)) };
    } finally {
        probe.remove();
    }
}

function footnoteProbeWidth(pageEl) {
    const body = pageEl?.querySelector?.('.article-page-body');
    if (body?.clientWidth) return body.clientWidth;
    if (pageEl?.clientWidth) {
        const styles = window.getComputedStyle ? window.getComputedStyle(pageEl) : null;
        const pl = styles ? parseFloat(styles.paddingLeft) || 0 : 0;
        const pr = styles ? parseFloat(styles.paddingRight) || 0 : 0;
        return Math.max(120, pageEl.clientWidth - pl - pr);
    }
    return 520;
}

/** Breathing room between body and footnote rule on mobile (px). */
const MOBILE_BODY_FOOT_GAP = 12;

/**
 * Reserve footnote band height while packing body.
 * Mobile: carry-in (full) + a modest stub only for refs *already on this page*
 * (not extraEl — those may land on the next sheet after a split).
 * Notes that still don't fit spill to the next footnote section (Word/Docs-like).
 * Desktop keeps full measured reserve.
 */
function footnoteReserveForBody(bodyEl, defMap, spreadHeight, extraEl, carryIds, pageEl, assignedAnchors) {
    const narrow = isReaderNarrow();
    const carry = Array.isArray(carryIds) ? carryIds : [];
    const maxBand = footnoteBandHeight(spreadHeight);
    const probeW = footnoteProbeWidth(pageEl || bodyEl?.parentElement);

    if (narrow) {
        let reserve = 0;
        if (carry.length) {
            const { height } = measureFittedFootnoteBand(defMap, carry, maxBand, probeW);
            // Slightly under-reserve — post-seal backfill fills any leftover gap;
            // over-reserve + margin-top:auto left dead bands above the rule.
            reserve = height > 0 ? Math.max(40, Math.round(height * 0.9)) : 0;
        }
        // Refs already on this page — modest stub only (backfill / peel refine).
        const pageRefs = collectFootnoteRefIdsFromNode(bodyEl).filter(
            (id) => id && !carry.includes(id)
        );
        if (pageRefs.length) {
            reserve = Math.max(reserve, Math.min(64, Math.round(maxBand * 0.5)));
        }
        return reserve;
    }

    const queue = footnoteQueueForPage(bodyEl, defMap, extraEl, carryIds, assignedAnchors);
    if (!queue.length) return 0;
    const { height } = measureFittedFootnoteBand(defMap, queue, maxBand, probeW);
    return height;
}

function elementOuterHeightWithMargins(el) {
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const h = rect && Number.isFinite(rect.height) ? rect.height : el.offsetHeight || 0;
    const styles = window.getComputedStyle ? window.getComputedStyle(el) : null;
    const mt = styles ? parseFloat(styles.marginTop) || 0 : 0;
    const mb = styles ? parseFloat(styles.marginBottom) || 0 : 0;
    return h + mt + mb;
}

function pageVerticalInsets(pageEl) {
    if (!pageEl || !window.getComputedStyle) return 0;
    const styles = window.getComputedStyle(pageEl);
    const pt = parseFloat(styles.paddingTop) || 0;
    const pb = parseFloat(styles.paddingBottom) || 0;
    const bt = parseFloat(styles.borderTopWidth) || 0;
    const bb = parseFloat(styles.borderBottomWidth) || 0;
    return pt + pb + bt + bb;
}

function pageBodyHeightBudget(pageEl, bodyEl, spreadHeight, defMap, extraEl, carryIds, assignedAnchors) {
    const narrow = isReaderNarrow();
    /*
     * Mobile: prefer the live page box. Packing against a shorter probe than the
     * CSS min-height left large empty footers inside full-height sheets.
     */
    let pageH = spreadHeight;
    if (narrow && pageEl) {
        const live = Math.floor(pageEl.getBoundingClientRect().height || pageEl.clientHeight || 0);
        if (live > 100) pageH = Math.max(pageH, live);
    }
    const footReserve = footnoteReserveForBody(
        bodyEl,
        defMap,
        pageH,
        extraEl,
        carryIds,
        pageEl,
        assignedAnchors
    );
    const masthead = pageEl ? pageEl.querySelector('.article-inline-masthead') : null;
    const mastheadReserve = masthead ? elementOuterHeightWithMargins(masthead) : 0;
    const pageInsets = pageVerticalInsets(pageEl);
    const maxBody = Math.floor(pageH - pageInsets - footReserve - mastheadReserve);
    return Math.max(150, maxBody);
}

/**
 * Safety net: any footnote referenced in the packed article that never landed in a
 * footnote band gets appended (does not wipe existing bands).
 */
function ensureAllFootnotesRendered(articleBodyEl, defMap) {
    if (!articleBodyEl || !(defMap instanceof Map) || defMap.size === 0) return;

    const needed = [];
    articleBodyEl.querySelectorAll('.footnote-ref[data-footnote-id]').forEach((ref) => {
        const id = ref.getAttribute('data-footnote-id');
        if (id && defMap.has(id) && !needed.includes(id)) needed.push(id);
    });
    if (!needed.length) return;

    const present = new Set();
    articleBodyEl.querySelectorAll('.article-page-footnotes p[data-variant="footnote"]').forEach((p) => {
        let id = p.getAttribute('data-footnote-id');
        if (!id) {
            const hid = p.getAttribute('id');
            if (hid && hid.startsWith('fn-')) id = hid.slice(3);
        }
        if (id) present.add(id);
    });

    const missing = needed.filter((id) => !present.has(id));
    if (!missing.length) return;

    const fallbackPage =
        typeof lastArticleContentPage === 'function'
            ? lastArticleContentPage(articleBodyEl)
            : articleBodyEl.querySelector('.article-page-left:not(.article-page-comments)');

    missing.forEach((id) => {
        const html = defMap.get(id);
        if (!html) return;

        let esc = id;
        try {
            if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') esc = CSS.escape(id);
        } catch (_) {
            esc = String(id).replace(/"/g, '');
        }
        const ref = articleBodyEl.querySelector(`.footnote-ref[data-footnote-id="${esc}"]`);
        const page = (ref && ref.closest('.article-page')) || fallbackPage;
        if (!page) return;

        const body = ensureArticlePageBody(page);
        let foot = page.querySelector(':scope > .article-page-footnotes');
        if (!foot) {
            foot = document.createElement('div');
            foot.className = 'article-page-footnotes';
            body.after(foot);
        }

        const temp = document.createElement('div');
        temp.innerHTML = html;
        const src = temp.firstElementChild;
        if (!src) return;
        const clone = src.cloneNode(true);
        const n =
            footnoteSuperscriptNumberForId(body, id) ??
            footnoteSuperscriptNumberForId(articleBodyEl, id) ??
            foot.childElementCount + 1;
        clone.setAttribute('data-footnote-n', String(n));
        if (!clone.getAttribute('id')) clone.id = `fn-${id}`;
        if (typeof ContentRefs !== 'undefined' && ContentRefs.linkifyElement) {
            ContentRefs.linkifyElement(clone);
        }
        foot.appendChild(clone);
    });
}

function footnoteSuperscriptNumberForId(bodyRoot, id) {
    if (!id || !bodyRoot) return null;
    let esc = id;
    try {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') esc = CSS.escape(id);
    } catch (_) {
        esc = id.replace(/\\/g, '').replace(/"/g, '');
    }
    const ref = bodyRoot.querySelector(`.footnote-ref[data-footnote-id="${esc}"]`);
    if (!ref) return null;
    const sup = ref.querySelector('sup.footnote-ref-mark');
    const raw = (sup && sup.textContent) || ref.textContent || '';
    const n = parseInt(String(raw).trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * True when the footnote band is clipped by the page foot or crowds the body
 * (Word/Docs never paint notes into the bottom margin).
 */
function footnoteBandOverflowsPage(pageEl, footEl, bodyEl) {
    if (!pageEl || !footEl) return false;
    const pageBox = pageEl.getBoundingClientRect();
    const footBox = footEl.getBoundingClientRect();
    // During early layout a 0-size box is unreliable — caller still has bandMax.
    if (pageBox.height < 80 || footBox.height < 1) return false;
    const styles = window.getComputedStyle ? window.getComputedStyle(pageEl) : null;
    const pb = styles ? parseFloat(styles.paddingBottom) || 0 : 0;
    // Keep clear of padding + page-number zone.
    const safeBottom = pageBox.bottom - Math.max(pb, isReaderNarrow() ? 28 : 16);
    if (footBox.bottom > safeBottom + 1) return true;
    if (bodyEl) {
        const bodyBox = bodyEl.getBoundingClientRect();
        const gap = isReaderNarrow() ? MOBILE_BODY_FOOT_GAP : 6;
        if (bodyBox.bottom > footBox.top - gap) return true;
    }
    return false;
}

/**
 * Pack footnote defs into the page foot.
 * Extra notes that don't fit spill via carry to the *next content* page — never
 * onto blank footnote-only sheets. The first note on a page is always kept;
 * callers peel body if that note crowds the sheet.
 */
function finalizePageFootnotes(pageEl, defMap, assignedAnchors, carryIn, spreadHeight) {
    pageEl.querySelector('.article-page-footnotes')?.remove();
    const body = pageEl.querySelector('.article-page-body');
    const carry = Array.isArray(carryIn) ? carryIn.slice() : [];
    if (!body || !defMap || defMap.size === 0) return carry;

    const queue = footnoteQueueForPage(body, defMap, null, carry, assignedAnchors);
    if (!queue.length) return [];

    const bandMax = footnoteBandHeight(spreadHeight);
    const foot = document.createElement('div');
    foot.className = 'article-page-footnotes';
    // Page-level sibling of the body (not inside it) so CSS can pin the band
    // to the sheet foot — same visual as the editor footer zone.
    // Compose (and legacy comment-screen) sit above the footnote band when present.
    const composeDock = pageEl.querySelector(':scope > #comment-compose');
    const commentScreen = pageEl.querySelector(':scope > #comment-screen');
    if (composeDock) composeDock.after(foot);
    else if (commentScreen) commentScreen.after(foot);
    else body.after(foot);

    const carryOut = [];
    let accepting = true;
    queue.forEach((id, index) => {
        if (!accepting) {
            carryOut.push(id);
            return;
        }
        const html = defMap.get(id);
        if (!html) {
            carryOut.push(id);
            return;
        }
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const src = temp.firstElementChild;
        if (!src) {
            carryOut.push(id);
            return;
        }
        const clone = src.cloneNode(true);
        const articleRoot = document.getElementById('article-body');
        const n =
            footnoteSuperscriptNumberForId(body, id) ??
            footnoteSuperscriptNumberForId(articleRoot, id) ??
            index + 1;
        clone.setAttribute('data-footnote-n', String(n));
        if (!assignedAnchors.has(id)) {
            clone.id = `fn-${id}`;
        } else {
            clone.removeAttribute('id');
        }
        if (typeof ContentRefs !== 'undefined' && ContentRefs.linkifyElement) {
            ContentRefs.linkifyElement(clone);
        }
        foot.appendChild(clone);
        void foot.offsetHeight;
        const used = elementOuterHeightWithMargins(foot);
        const overBand = used > bandMax;
        const overPage = footnoteBandOverflowsPage(pageEl, foot, body);

        // Only spill *additional* notes. Never eject the first note onto an empty page.
        if ((overBand || overPage) && foot.childElementCount > 1) {
            foot.removeChild(clone);
            carryOut.push(id);
            accepting = false;
            return;
        }
        assignedAnchors.add(id);
    });

    if (!foot.childElementCount) {
        foot.remove();
    }
    return carryOut;
}

/** Mobile: px of empty air between body and footnote rule. */
function mobileBodyFootnoteGapPx(pageEl) {
    const body = pageEl?.querySelector?.('.article-page-body');
    const foot = pageEl?.querySelector?.('.article-page-footnotes');
    if (!body || !foot || !foot.childElementCount) return 0;
    return Math.max(
        0,
        Math.floor(foot.getBoundingClientRect().top - body.getBoundingClientRect().bottom)
    );
}

/** Ids currently sitting in a page's footnote band (incl. carry-in-only notes). */
function footnoteIdsPlacedOnPage(pageEl) {
    const ids = [];
    pageEl?.querySelectorAll?.('.article-page-footnotes p[data-variant="footnote"]').forEach((p) => {
        let id = p.getAttribute('data-footnote-id');
        if (!id) {
            const hid = p.getAttribute('id');
            if (hid && hid.startsWith('fn-')) id = hid.slice(3);
        }
        if (id && !ids.includes(id)) ids.push(id);
    });
    return ids;
}

/**
 * Mobile: pull lines from `fillNodes` into the gap above the footnote band.
 * Returns leftover nodes that did not fit. Preserves carry-in notes already on the page.
 */
function backfillMobileFootnoteGap(pageEl, fillNodes, defMap, assignedAnchors, spreadHeight) {
    const leftover = [];
    if (!isReaderNarrow() || !pageEl || !Array.isArray(fillNodes) || !fillNodes.length) {
        return fillNodes || [];
    }

    const minGap = MOBILE_BODY_FOOT_GAP + 22;
    const keepNotes = () => {
        const placed = footnoteIdsPlacedOnPage(pageEl);
        placed.forEach((id) => assignedAnchors.delete(id));
        finalizePageFootnotes(pageEl, defMap, assignedAnchors, placed, spreadHeight);
    };

    for (let guard = 0; guard < 16 && fillNodes.length; guard += 1) {
        const body = pageEl.querySelector('.article-page-body');
        const foot = pageEl.querySelector('.article-page-footnotes');
        if (!body || !foot || !foot.childElementCount) break;
        if (mobileBodyFootnoteGapPx(pageEl) < minGap) break;

        const node = fillNodes.shift();
        if (!node) break;

        const budget = Math.max(
            40,
            Math.floor(
                foot.getBoundingClientRect().top -
                    body.getBoundingClientRect().top -
                    MOBILE_BODY_FOOT_GAP
            )
        );
        const placedIds = footnoteIdsPlacedOnPage(pageEl);
        foot.remove();

        let didPlace = false;
        if (node.tagName === 'P') {
            const split = splitParagraphToFit(body, node, budget);
            if (split) {
                body.appendChild(split.leftPart);
                fillNodes.unshift(split.rightPart);
                didPlace = true;
            }
        }
        if (!didPlace) {
            body.appendChild(node);
            void body.offsetHeight;
            if (body.scrollHeight > budget + 6) {
                body.removeChild(node);
                leftover.push(node);
                leftover.push(...fillNodes);
                placedIds.forEach((id) => assignedAnchors.delete(id));
                finalizePageFootnotes(pageEl, defMap, assignedAnchors, placedIds, spreadHeight);
                return leftover;
            }
        }

        placedIds.forEach((id) => assignedAnchors.delete(id));
        finalizePageFootnotes(pageEl, defMap, assignedAnchors, placedIds, spreadHeight);
        if (footnoteBandOverflowsPage(pageEl, pageEl.querySelector('.article-page-footnotes'), body)) {
            const last = body.lastElementChild;
            if (last) {
                body.removeChild(last);
                leftover.unshift(last);
            }
            leftover.push(...fillNodes);
            keepNotes();
            return leftover;
        }
    }
    leftover.push(...fillNodes);
    return leftover;
}

/**
 * After placing footnotes: if the band crowds/clips, peel trailing body onto the
 * next page until notes fit beside remaining body. Then backfill any large gap
 * above the rule from what was peeled. No footnote-only pages.
 */
function sealPageFootnotesWithBodyPeel(pageEl, defMap, assignedAnchors, carryIn, spreadHeight) {
    const peeled = [];
    const spillOrphans = [];
    const carrySeed = Array.isArray(carryIn) ? carryIn.slice() : [];

    const mergeCarry = (carryOut) => {
        const next = Array.isArray(carryOut) ? carryOut.slice() : [];
        spillOrphans.forEach((id) => {
            if (id && !next.includes(id)) next.push(id);
        });
        return next;
    };

    let carry = mergeCarry(
        finalizePageFootnotes(pageEl, defMap, assignedAnchors, carrySeed, spreadHeight)
    );

    if (!isReaderNarrow()) {
        return { peeled, carry };
    }

    for (let guard = 0; guard < 20; guard += 1) {
        const body = pageEl.querySelector('.article-page-body');
        const foot = pageEl.querySelector('.article-page-footnotes');
        if (!body || !body.lastElementChild || !foot || !foot.childElementCount) break;
        if (!footnoteBandOverflowsPage(pageEl, foot, body)) break;
        // Keep at least one body block with the notes — never strip to footnote-only.
        if (body.childElementCount <= 1) break;

        const last = body.lastElementChild;
        let moved = last;
        const budget = Math.max(
            80,
            Math.floor(
                foot.getBoundingClientRect().top -
                    body.getBoundingClientRect().top -
                    MOBILE_BODY_FOOT_GAP
            )
        );
        foot.remove();
        body.removeChild(last);
        if (last.tagName === 'P') {
            const split = splitParagraphToFit(body, last, budget);
            if (split) {
                body.appendChild(split.leftPart);
                moved = split.rightPart;
            }
        }
        peeled.unshift(moved);

        const bodyRefs = new Set(collectFootnoteRefIdsFromNode(body));
        collectFootnoteRefIdsFromNode(moved).forEach((id) => {
            if (!id || bodyRefs.has(id)) return;
            assignedAnchors.delete(id);
            if (!spillOrphans.includes(id)) spillOrphans.push(id);
        });

        carry = mergeCarry(
            finalizePageFootnotes(pageEl, defMap, assignedAnchors, carrySeed, spreadHeight)
        );
    }

    // Pull over-peeled lines back so body meets the footnote rule.
    if (peeled.length && mobileBodyFootnoteGapPx(pageEl) >= MOBILE_BODY_FOOT_GAP + 22) {
        const left = backfillMobileFootnoteGap(
            pageEl,
            peeled.splice(0, peeled.length),
            defMap,
            assignedAnchors,
            spreadHeight
        );
        peeled.push(...left);
        const body = pageEl.querySelector('.article-page-body');
        const bodyRefs = new Set(collectFootnoteRefIdsFromNode(body));
        for (let i = spillOrphans.length - 1; i >= 0; i -= 1) {
            if (bodyRefs.has(spillOrphans[i])) spillOrphans.splice(i, 1);
        }
        carry = mergeCarry(carry.filter((id) => !bodyRefs.has(id)));
    }

    return { peeled, carry: mergeCarry(carry) };
}

/** Words for packer split — ignore footnote mark text so "breaking¹" stays one host. */
function paragraphSplitWords(paragraphEl) {
    const clone = paragraphEl.cloneNode(true);
    clone.querySelectorAll('.footnote-ref').forEach((el) => el.remove());
    return (clone.textContent || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

function textNodeInsideFootnoteRef(textNode) {
    let el = textNode && textNode.parentElement;
    while (el) {
        if (el.classList && el.classList.contains('footnote-ref')) return true;
        el = el.parentElement;
    }
    return false;
}

function isFootnoteRefElement(el) {
    return !!(el && el.nodeType === Node.ELEMENT_NODE && el.classList?.contains('footnote-ref'));
}

/**
 * If a page break left a footnote mark alone at the start of the right half,
 * move it back onto the left half so it stays glued to its host word.
 */
function glueLeadingFootnoteRefsToLeft(leftRoot, rightRoot) {
    if (!leftRoot || !rightRoot) return;
    while (rightRoot.firstChild) {
        const node = rightRoot.firstChild;
        if (node.nodeType === Node.TEXT_NODE && !String(node.textContent || '').trim()) {
            const next = node.nextSibling;
            if (isFootnoteRefElement(next)) {
                leftRoot.appendChild(node);
                continue;
            }
            break;
        }
        if (isFootnoteRefElement(node)) {
            leftRoot.appendChild(node);
            continue;
        }
        break;
    }
}

function splitParagraphToFit(pageBodyEl, paragraphEl, maxBodyScrollHeight) {
    if (!paragraphEl || paragraphEl.tagName !== 'P') return null;
    const words = paragraphSplitWords(paragraphEl);
    // Mobile: allow finer peels so we don't eject a whole short remnant and gap the page.
    const minWords = isReaderNarrow() ? 6 : 12;
    if (words.length < minWords) return null;

    let low = 1;
    let high = words.length - 1;
    let best = 0;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const probe = document.createElement('p');
        probe.textContent = words.slice(0, mid).join(' ');
        pageBodyEl.appendChild(probe);
        const fits = pageBodyEl.scrollHeight <= maxBodyScrollHeight;
        pageBodyEl.removeChild(probe);

        if (fits) {
            best = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    const edge = isReaderNarrow() ? 1 : 3;
    if (best <= edge || best >= words.length - edge) return null;

    const leftPart = paragraphEl.cloneNode(true);
    const rightPart = paragraphEl.cloneNode(true);
    splitNodeAtWordBoundary(leftPart, rightPart, best);
    glueLeadingFootnoteRefsToLeft(leftPart, rightPart);
    pruneEmptyInlineNodes(leftPart);
    pruneEmptyInlineNodes(rightPart);
    if (!(rightPart.textContent || '').trim()) return null;

    return { leftPart, rightPart };
}

function splitNodeAtWordBoundary(leftRoot, rightRoot, splitWordIndex) {
    const leftWalker = document.createTreeWalker(leftRoot, NodeFilter.SHOW_TEXT);
    const rightWalker = document.createTreeWalker(rightRoot, NodeFilter.SHOW_TEXT);
    let wordCount = 0;
    const leftNodes = [];
    const rightNodes = [];
    let node;
    while ((node = leftWalker.nextNode())) leftNodes.push(node);
    while ((node = rightWalker.nextNode())) rightNodes.push(node);

    let splitDone = false;
    // Side of the last real (non-footnote) word — marks glue to this side.
    let lastHostOnRight = false;
    for (let i = 0; i < leftNodes.length; i++) {
        const ln = leftNodes[i];
        const rn = rightNodes[i];
        if (splitDone) {
            // Footnote mark text after the split still follows its host word's side.
            if (textNodeInsideFootnoteRef(ln) && !lastHostOnRight) {
                rn.textContent = '';
                continue;
            }
            ln.textContent = '';
            continue;
        }
        const inFootnote = textNodeInsideFootnoteRef(ln);
        if (inFootnote) {
            // Never treat the superscript as its own split word — stay with host.
            if (lastHostOnRight) {
                ln.textContent = '';
            } else {
                rn.textContent = '';
            }
            continue;
        }
        const nodeWords = ln.textContent.split(/(\s+)/);
        let nodeWordIdx = 0;
        let leftText = '';
        let rightText = '';
        let inRight = false;
        for (const token of nodeWords) {
            if (/\S/.test(token)) {
                if (!inRight && wordCount + nodeWordIdx >= splitWordIndex) {
                    inRight = true;
                }
                nodeWordIdx++;
            }
            if (inRight) rightText += token;
            else leftText += token;
        }
        if (inRight) {
            ln.textContent = leftText;
            rn.textContent = rightText;
            splitDone = true;
            lastHostOnRight = true;
            wordCount += nodeWordIdx;
        } else {
            rn.textContent = '';
            lastHostOnRight = false;
            wordCount += nodeWordIdx;
        }
    }

    pruneEmptyInlineNodes(leftRoot);
    pruneEmptyInlineNodes(rightRoot);
    glueLeadingFootnoteRefsToLeft(leftRoot, rightRoot);
    pruneEmptyInlineNodes(leftRoot);
    pruneEmptyInlineNodes(rightRoot);
}

function pruneEmptyInlineNodes(root) {
    const inlineTags = new Set(['SPAN', 'A', 'EM', 'STRONG', 'B', 'I', 'SUP', 'SUB', 'MARK', 'S', 'U']);
    const walk = (el) => {
        for (let i = el.childNodes.length - 1; i >= 0; i--) {
            const child = el.childNodes[i];
            if (child.nodeType === Node.ELEMENT_NODE) {
                walk(child);
                if (inlineTags.has(child.tagName) && !child.textContent.trim()) {
                    child.remove();
                }
            }
        }
    };
    walk(root);
}

function applyPageNumbers(articleBodyEl) {
    if (!articleBodyEl) return;
    const pages = articleBodyEl.querySelectorAll('.article-page-left');
    pages.forEach((pageEl, index) => {
        pageEl.querySelector('.article-page-number')?.remove();
        const number = document.createElement('div');
        number.className = 'article-page-number';
        number.textContent = String(index + 1);
        pageEl.appendChild(number);
    });
}

function renderArticleSpread(blocks, footnoteDefMap) {
    const articleBody = document.getElementById('article-body');
    if (!articleBody) return;

    const defMap = footnoteDefMap instanceof Map ? footnoteDefMap : new Map();

    // Keep comment chrome alive across reflows (innerHTML would destroy it).
    const blogRoot = document.querySelector('.blog');
    if (blogRoot) {
        const composeDock = document.getElementById('comment-compose');
        if (composeDock) blogRoot.appendChild(composeDock);
        if (commentScreenEl) blogRoot.appendChild(commentScreenEl);
    }
    lastArticlePageElForComments = null;

    articleBody.innerHTML = '';

    // Force a fresh height measure for this pack (cache still helps mid-pass).
    cachedSpreadTargetHeight = 0;
    cachedSpreadTargetHeightAt = 0;
    const spreadHeight = getSpreadTargetHeight();
    const narrowPack = isReaderNarrow();

    let currentSpread = createSpread();
    articleBody.appendChild(currentSpread.spread);

    let currentPage = currentSpread.leftPage;
    currentPage.classList.add('article-page-first');

    // Legacy posts: title lives only in meta — keep top masthead.
    // New posts: title heading is in the body; byline travels with it.
    // Masthead MUST be inserted before the body (ensureArticlePageBody places
    // body after masthead). Appending masthead after body put the title at the
    // foot of page 1 and scrambled annotation offsets.
    const titleInBody =
        blocksIncludeDocTitle(blocks) ||
        blocksHaveHeadingMatchingTitle(blocks, currentBlogMeta?.title);
    if (!titleInBody) {
        currentPage.appendChild(createInlineMasthead(currentBlogMeta));
    }
    let currentPageBody = ensureArticlePageBody(currentPage);

    const assignedFootnoteAnchors = new Set();
    let footnoteCarry = [];
    let attachedDocTitle = false;
    /** Body peeled off a page so footnotes can sit with remaining content. */
    let pendingPeeled = [];

    const openFreshPage = () => {
        currentSpread = createSpread();
        articleBody.appendChild(currentSpread.spread);
        currentPage = currentSpread.leftPage;
        currentPageBody = ensureArticlePageBody(currentSpread.leftPage);
    };

    const flushPeeledOntoCurrentPage = () => {
        if (!pendingPeeled.length) return;
        pendingPeeled.forEach((node) => currentPageBody.appendChild(node));
        pendingPeeled = [];
    };

    /**
     * Place footnotes on this page; on mobile peel trailing body if notes crowd
     * the sheet. Peeled body (+ any overflow notes) continue on the next
     * *content* page — never open blank footnote-only sheets.
     */
    const sealCurrentPage = () => {
        if (narrowPack) {
            const result = sealPageFootnotesWithBodyPeel(
                currentPage,
                defMap,
                assignedFootnoteAnchors,
                footnoteCarry,
                spreadHeight
            );
            footnoteCarry = result.carry;
            if (result.peeled.length) {
                pendingPeeled = result.peeled.concat(pendingPeeled);
            }
        } else {
            footnoteCarry = finalizePageFootnotes(
                currentPage,
                defMap,
                assignedFootnoteAnchors,
                footnoteCarry,
                spreadHeight
            );
        }
    };

    const moveToNextPage = () => {
        sealCurrentPage();
        openFreshPage();
        flushPeeledOntoCurrentPage();
    };

    const isAuthorPageBreakHtml = (html) => {
        if (!html || typeof html !== 'string') return false;
        return (
            /\bdata-page-break\s*=\s*["']true["']/i.test(html) ||
            /\bdata-variant\s*=\s*["']page-break["']/i.test(html)
        );
    };

    blocks.forEach((blockHtml) => {
        // Author hard break — finish this page; do not render the sentinel.
        if (isAuthorPageBreakHtml(blockHtml)) {
            if (currentPageBody && currentPageBody.childElementCount > 0) {
                moveToNextPage();
            }
            return;
        }

        let node = createArticleNode(blockHtml);
        if (!attachedDocTitle) {
            const el = node;
            const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
            const metaTitle = String(currentBlogMeta?.title || '').replace(/\s+/g, ' ').trim();
            const looksLikeTitle =
                el &&
                /^H[1-3]$/.test(el.tagName) &&
                (el.getAttribute('data-doc-title') === 'true' ||
                    blockHtmlIsDocTitle(blockHtml) ||
                    (metaTitle && text === metaTitle));
            if (looksLikeTitle) {
                node = createTitleBlockNode(blockHtml, currentBlogMeta);
                attachedDocTitle = true;
            }
        }
        currentPageBody.appendChild(node);

        const heightBudget = pageBodyHeightBudget(
            currentPage,
            currentPageBody,
            spreadHeight,
            defMap,
            null,
            footnoteCarry,
            assignedFootnoteAnchors
        );
        if (currentPageBody.scrollHeight > heightBudget && currentPageBody.childElementCount > 1) {
            currentPageBody.removeChild(node);
            // Mobile: don't pass `node` into reserve — its footnote refs may land on
            // the right half after split; reserving for them ejects lines and gaps the page.
            const splitBudget = pageBodyHeightBudget(
                currentPage,
                currentPageBody,
                spreadHeight,
                defMap,
                narrowPack ? null : node,
                footnoteCarry,
                assignedFootnoteAnchors
            );
            const split = splitParagraphToFit(currentPageBody, node, splitBudget);
            if (split) {
                currentPageBody.appendChild(split.leftPart);
                if (narrowPack) {
                    // Seal notes, then absorb lines from rightPart into any gap above
                    // the footnote rule before starting the next sheet.
                    sealCurrentPage();
                    const fillLeft = backfillMobileFootnoteGap(
                        currentPage,
                        [split.rightPart, ...pendingPeeled.splice(0, pendingPeeled.length)],
                        defMap,
                        assignedFootnoteAnchors,
                        spreadHeight
                    );
                    openFreshPage();
                    fillLeft.forEach((n) => currentPageBody.appendChild(n));
                } else {
                    moveToNextPage();
                    currentPageBody.appendChild(split.rightPart);
                }
            } else {
                moveToNextPage();
                currentPageBody.appendChild(node);
            }
        }
    });

    sealCurrentPage();
    // Finish any body peeled for footnote room — still content pages, not empty ones.
    let peelGuard = 0;
    while (pendingPeeled.length && peelGuard < 20) {
        peelGuard += 1;
        openFreshPage();
        flushPeeledOntoCurrentPage();
        sealCurrentPage();
        if (!pendingPeeled.length) break;
    }
    if (pendingPeeled.length) {
        openFreshPage();
        flushPeeledOntoCurrentPage();
        footnoteCarry = finalizePageFootnotes(
            currentPage,
            defMap,
            assignedFootnoteAnchors,
            footnoteCarry,
            spreadHeight
        );
    }

    // Leftover carry / any missing notes → append on content pages (never blank sheets).
    ensureAllFootnotesRendered(articleBody, defMap);

    mountCommentScreenForLayout(lastArticleContentPage(articleBody) || currentPage);

    applyPageNumbers(articleBody);

    articleBody.dataset.lastPage = 'left';
}

const renderArticleBody = (articleData, options = {}) => {
    articleBlocksCache = parseArticleBlocks(articleData);
    renderArticleSpread(articleBlocksCache.blocks, articleBlocksCache.footnoteDefs);
    syncNotesGateUi();
    if (READER_EMBED) bindCommentInputEmbedFocusFix();
    applyAnnotationHighlights();
    renderAnnotationList();

    if (!spreadResizeBound) {
        spreadResizeBound = true;
        let lastSpreadWidth = window.innerWidth;
        window.addEventListener('resize', () => {
            const w = window.innerWidth;
            if (Math.abs(w - lastSpreadWidth) < 2) return;
            lastSpreadWidth = w;
            clearTimeout(spreadReflowTimer);
            spreadReflowTimer = setTimeout(() => {
                if (articleBlocksCache.blocks.length) {
                    renderArticleSpread(articleBlocksCache.blocks, articleBlocksCache.footnoteDefs);
                    applyAnnotationHighlights();
                }
            }, 140);
        });
    }

    if (!annotationLayoutListenersBound) {
        annotationLayoutListenersBound = true;
        const onLayoutScroll = () => scheduleAnnotationLayoutSync();
        window.addEventListener('scroll', onLayoutScroll, { passive: true });
        const vv = window.visualViewport;
        if (vv) {
            vv.addEventListener('scroll', onLayoutScroll, { passive: true });
            vv.addEventListener('resize', onLayoutScroll, { passive: true });
        }
    }

    if (options.provisional) return;

    readerReady = true;
    setupCommentSection();
    ensureCommentsVisible();
}

renderReaderHandoffIfPresent();

const addArticle = (ele, data) => {
    data = data.split("\n").filter(item => item.length);
    // console.log(data);

    data.forEach(item => {
        // check for heading
        if(item[0] == '#'){
            let hCount = 0;
            let i = 0;
            while(item[i] == '#'){
                hCount++;
                i++;
            }
            let tag = `h${hCount}`;
            ele.innerHTML += `<${tag}>${item.slice(hCount, item.length)}</${tag}>`
        } 
        //checking for image format
        else if(item[0] == "!" && item[1] == "["){
            let seperator;

            for(let i = 0; i <= item.length; i++){
                if(item[i] == "]" && item[i + 1] == "(" && item[item.length - 1] == ")"){
                    seperator = i;
                }
            }

            let alt = item.slice(2, seperator);
            let src = item.slice(seperator + 2, item.length - 1);
            ele.innerHTML += `
            <img src="${src}" alt="${alt}" class="article-image">
            `;
        }

        else{
            ele.innerHTML += `<p>${item}</p>`;
        }
    })
}

function scrollToAnchor(scrollid) {
    const target = document.getElementById(scrollid);
    const targetPosition = target.getBoundingClientRect().top + window.pageYOffset;

    var origcolor = target.style.backgroundColor
    target.style.backgroundColor = 'rgba(255, 251, 0, 0.431)';
    target.style.borderStyle = 'ridge';
    target.style.borderRadius = '10px';

    window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
    })
    setTimeout(function(){
        target.style.backgroundColor = origcolor;
        target.style.borderStyle = 'none';
        target.style.borderRadius = '0px';
    },(1500));
};

function bindRandomNavHover(selectors) {
    document.querySelectorAll(selectors).forEach((el) => {
        el.addEventListener('pointerenter', () => {
            const hue = Math.floor(Math.random() * 360);
            el.style.setProperty('color', `hsl(${hue} 72% 48%)`, 'important');
        });
        el.addEventListener('pointerleave', () => {
            el.style.removeProperty('color');
        });
    });
}

/** Dashboard corner control — authors only (`real person` claim). */
function setupReaderAuthorNav() {
    bindRandomNavHover('.reader-nav-wall, .reader-nav-dashboard');
    const dash = document.getElementById('reader-dashboard-btn');
    if (!dash || !window.auth) return;
    const setVisible = (on) => {
        if (on) dash.removeAttribute('hidden');
        else dash.setAttribute('hidden', '');
    };
    window.auth.onAuthStateChanged((user) => {
        // Own-comment delete buttons depend on auth; refresh the thread when it changes.
        if (commentsListenerAttached) renderThreadedComments();
        if (!user) {
            setVisible(false);
            return;
        }
        user.getIdTokenResult()
            .then((result) => {
                setVisible(result?.claims?.role === 'real person');
            })
            .catch(() => setVisible(false));
    });
}

setupReaderAuthorNav();

