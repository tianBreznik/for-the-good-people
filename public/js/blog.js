let blogId = decodeURI(location.pathname.split("/").pop());
const commentSection = document.querySelector('.comment-section');
const commentScreenEl = document.getElementById('comment-screen');

let docRef = db.collection("blogs").doc(blogId);
let commentRef = db.collection("comments").doc(blogId+'_'+0);
let comments = db.collection("comments");

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
let currentBlogMeta = null;
let footnoteNavAttached = false;
let annotationsListenerAttached = false;
let annotationSelectionBound = false;
let annotationHighlightNavBound = false;
let annotationsState = [];
let pendingAnnotationRange = null;
let annotationToolbar = null;
let annotationToolbarHideTimer = null;
let annotationOverlayRoot = null;
const annotationColorSeed = Math.floor(Date.now() / 1000);
const READER_HANDOFF_KEY = 'readerHandoffPayload';
const READER_HANDOFF_MAX_AGE_MS = 90 * 1000;

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
    toolbar.innerHTML = `<button type="button" class="annotation-add-btn">Add annotation</button>`;
    document.body.appendChild(toolbar);
    toolbar.querySelector('.annotation-add-btn')?.addEventListener('click', createAnnotationFromSelection);
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
    return {
        fill: `hsla(${hue}, ${sat}%, ${light}%, 0.42)`,
        fillActive: `hsla(${hue}, ${sat}%, ${Math.max(74, light - 8)}%, 0.62)`,
        border: `hsla(${hue}, 46%, ${Math.max(56, light - 22)}%, 0.33)`,
        borderActive: `hsla(${hue}, 52%, ${Math.max(48, light - 30)}%, 0.52)`,
        badge: `hsla(${hue}, 44%, ${Math.max(62, light - 14)}%, 0.28)`,
        badgeText: `hsla(${hue}, 38%, 30%, 0.95)`
    };
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
            if (parentEl.closest('#comment-screen')) return NodeFilter.FILTER_REJECT;
            if (parentEl.closest('.annotation-highlight')) return NodeFilter.FILTER_REJECT;
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

function unwrapNode(el) {
    if (!el || !el.parentNode) return;
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    parent.normalize();
}

function clearAnnotationHighlights() {
    const overlay = ensureAnnotationOverlayRoot();
    overlay.innerHTML = '';
}

function applyAnnotationHighlights() {
    const root = articleContentRoot();
    if (!root || !annotationsState.length) return;
    clearAnnotationHighlights();
    const overlay = ensureAnnotationOverlayRoot();
    const sorted = [...annotationsState].sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
    sorted.forEach((item, idx) => {
        const tone = annotationSoftColor(item.id, idx);
        if (!Number.isFinite(item.startOffset) || !Number.isFinite(item.endOffset)) return;
        const range = rangeFromOffsets(root, item.startOffset, item.endOffset);
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
}

function renderAnnotationList() {
    const host = ensureAnnotationCommentsHost();
    if (!host) return;
    host.innerHTML = '';
    const ordered = [...annotationsState].sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
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
        card.innerHTML = `
            <div class="comment-shell">
                <div class="comment-main">
                    <h1 class="user annotation-user">@${userTag}</h1>
                    <p class="comment-content annotation-comment">${content}</p>
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
            scheduleHideAnnotationToolbar();
            return;
        }
        const range = sel.getRangeAt(0).cloneRange();
        const rect = range.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return;
        pendingAnnotationRange = range;
        toolbar.hidden = false;
        const top = Math.max(8, window.scrollY + rect.top - 40);
        const left = Math.max(8, Math.min(window.scrollX + rect.left, window.scrollX + window.innerWidth - 150));
        toolbar.style.top = `${top}px`;
        toolbar.style.left = `${left}px`;
    });

    root.addEventListener('mousedown', () => {
        scheduleHideAnnotationToolbar();
    });
}

async function createAnnotationFromSelection() {
    const root = articleContentRoot();
    if (!root || !pendingAnnotationRange) return;
    const offsets = serializeRangeOffsets(root, pendingAnnotationRange);
    if (!offsets) return;
    const selectedText = pendingAnnotationRange.toString().trim();
    if (!selectedText) return;
    const commentText = window.prompt('Add annotation comment');
    if (!commentText || !commentText.trim()) return;

    const user = auth.currentUser?.email?.split('@')[0] || 'anonymous';
    const createdAtMs = Date.now();
    const d = new Date(createdAtMs);
    const postedAt = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const docId = `${blogId}_ann_${createdAtMs}_${Math.random().toString(36).slice(2, 7)}`;
    await db.collection('annotations').doc(docId).set({
        blogId,
        startOffset: offsets.startOffset,
        endOffset: offsets.endOffset,
        selectedText,
        commentText: commentText.trim(),
        user,
        postedAt,
        createdAtMs
    });
    pendingAnnotationRange = null;
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    hideAnnotationToolbar();
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

function ensureCommentsVisible() {
    document.body.classList.remove('reader-loading');
    const commentScreen = document.getElementById('comment-screen');
    if (commentScreen) commentScreen.style.display = 'block';
}

function renderReaderHandoffIfPresent() {
    const payload = readReaderHandoffPayload();
    if (!payload) return;
    const handoffHeight = Number(payload.previewPageHeight);
    if (Number.isFinite(handoffHeight) && handoffHeight > 100) {
        document.documentElement.style.setProperty('--readerHandoffPageHeight', `${Math.round(handoffHeight)}px`);
    }
    const titleTag = document.querySelector('title');
    const title = payload.title || '';
    const publishedAt = payload.publishedAt || '';
    const author = payload.author || 'Anonymous';
    titleTag.textContent = title ? `Blog : ${title}` : 'Blog';
    currentBlogMeta = { title, publishedAt, author };
    if (typeof payload.article === 'string' && payload.article.trim()) {
        renderArticleBody(payload.article, { provisional: true });
    }
}

docRef.get().then((doc) => {
    if(doc.exists){
        setupBlog(doc.data());
    } else{
        location.replace("/");
    }
})

commentRef.get().then((comms) => {
    console.log(numberofcomments);
    commentsReady = true;
    if (!comms.exists) {
        console.log("no comments yet");
    }
    setupCommentSection();
    ensureCommentsVisible();
})


document.addEventListener("keydown", function(e) {
    if(e.key === "Enter"){
        e.preventDefault();
        submitComment(numberofcomments);
    }
})

function submitComment(commentindex) {
    const input = document.getElementById("commentInput");
    let commentText = input.value.trim();
    let responseUser = '';
    let responseId = '';
    let date = new Date();

    if (commentText) {
        const commentList = document.getElementById("commentList");
        const newComment = document.createElement("li");
        newComment.textContent = commentText;
        //commentList.appendChild(newComment);
        if(commentText[0] == '@'){
            responseUser = commentText.substring(0, commentText.indexOf(' '));
            commentText = commentText.substring(commentText.indexOf(' '));
            responseId = input.getAttribute("name");
            console.log(responseId)
            console.log(responseUser);
            console.log(commentText)
        }

        comments
            .doc(blogId + '_' + commentindex)
            .set({
                content: commentText,
                postedAt: `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`,
                responseTo: responseUser,
                user: auth.currentUser.email.split("@")[0],
                replyId: responseId,
            })
            .then(() => {
                console.log("Document created");
        });

        numberofcomments++;
        docRef.update({
            numberofcomments: numberofcomments,
        })
        console.log(numberofcomments);
        input.value = ""; // Clear input field
    }
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
    const input = document.getElementById("commentInput");
    console.log("reply user: " + replyuser);
    console.log("on comment: " + commentid);
    //sem daj se comment id in extract it out of the
    console.log(commentid);
    input.setAttribute("name", commentid);
    input.name = commentid;
    input.value = "@" + replyuser;


}
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
    if (!commentsState.size) return;

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

        let contentHtml = content;
        if (responseTo) {
            contentHtml = `<span class="reply-user">${responseTo}</span> ${content}`;
        }

        li.innerHTML = `
            <div class="comment-shell">
                <div class="comment-main">
                    <h1 class="user">@${user}</h1>
                    <p class="comment-content">${contentHtml}</p>
                </div>
                <div class="comment-actions">
                    <button class="reply" onclick="event.stopPropagation(); makeAnchor('${user}','${id}')">reply</button>
                </div>
            </div>
        `;

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
}

const setupBlog = (data) => {
    setupFootnoteRefNavigation();
    const titleTag = document.querySelector('title');
    const title = data.title || '';
    const publishedAt = data.publishedAt || '';
    const author = data.author || 'Anonymous';

    titleTag.textContent = title ? `Blog : ${title}` : 'Blog';
    currentBlogMeta = { title, publishedAt, author };

    numberofcomments = data.numberofcomments;

    try {
        renderArticleBody(data.article);
        setupCommentSection();
        attachAnnotationsListener();
        bindAnnotationSelectionUi();
        bindAnnotationNavigation();
        clearReaderHandoffPayload();
    } finally {
        ensureCommentsVisible();
    }
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

function createInlineMasthead(meta) {
    const wrap = document.createElement('section');
    wrap.className = 'article-inline-masthead';

    const titleEl = document.createElement('h1');
    titleEl.className = 'title';
    titleEl.textContent = meta?.title || '';

    const author = (meta?.author || 'Anonymous').trim() || 'Anonymous';
    const publishedRaw = (meta?.publishedAt || '').trim();

    const byline = document.createElement('div');
    byline.className = 'article-byline';

    const byWord = document.createElement('span');
    byWord.className = 'article-byline-by';
    byWord.textContent = 'by';

    const authorEl = document.createElement('span');
    authorEl.className = 'article-byline-author';
    authorEl.textContent = `@${author}`;
    authorEl.style.color = mastheadAuthorColor(author);

    byline.appendChild(byWord);
    byline.appendChild(authorEl);

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

    wrap.appendChild(titleEl);
    wrap.appendChild(byline);
    return wrap;
}

function getSpreadTargetHeight() {
    const viewportH = window.visualViewport
        ? Math.floor(window.visualViewport.height)
        : window.innerHeight;
    const inset = Math.max(30, Math.min(52, Math.round(viewportH * 0.048)));
    return Math.max(viewportH - inset, 440);
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
    return wrapper.firstElementChild || document.createElement('p');
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
        blocks: source.split("\n").filter(item => item.length).map(formatLine),
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

/**
 * Footnote strip uses much smaller type (~10–12px); using the body chars/line value
 * massively over-counts lines and steals body space (worse with several notes).
 */
function estimateFootnoteStripCharsPerLine() {
    const root = document.getElementById('article-body');
    const vw = window.innerWidth || 800;
    const w = root && root.clientWidth > 80 ? root.clientWidth : Math.min(1340, vw - 40);
    const gap = Math.min(100, Math.max(40, Math.round(w * 0.055)));
    const colPx = Math.max(220, (w - gap) * 0.5 - 20);
    const approxCharPxFoot = 3.92;
    return Math.max(48, Math.floor(colPx / approxCharPxFoot));
}

/**
 * Vertical space to reserve for the footnote strip on this page: depends on how many distinct
 * refs appear on the page and the stored definition HTML length (per note, then summed).
 */
function footnoteReserveForBody(bodyEl, defMap, spreadHeight, extraEl) {
    const ids = collectFootnoteRefIdsUnion(bodyEl, extraEl);
    if (!ids.length || !defMap || defMap.size === 0) return 0;
    const ruleGap = 30;
    const charsPerLine = estimateFootnoteStripCharsPerLine();
    const lineH = 13;
    const perNotePad = 3;
    let totalLines = 0;
    ids.forEach((id) => {
        const html = defMap.get(id);
        if (!html) return;
        const d = document.createElement('div');
        d.innerHTML = html;
        const len = (d.textContent || '').length;
        totalLines += Math.max(1, Math.ceil(len / charsPerLine));
    });
    const textBlock = totalLines * lineH + ids.length * perNotePad;
    const raw = ruleGap + textBlock;
    const floor = Math.max(38, Math.round(20 + ids.length * 8));
    const minBody = 200;
    const maxReserve = Math.max(floor, spreadHeight - minBody);
    const padded = Math.ceil(raw * 1.02);
    const capByViewport = Math.floor(spreadHeight * 0.23);
    return Math.min(maxReserve, capByViewport, Math.max(floor, padded));
}

function footnoteHeightBudget(spreadHeight, bodyEl, defMap, extraEl) {
    const r = footnoteReserveForBody(bodyEl, defMap, spreadHeight, extraEl);
    if (r <= 0) return spreadHeight;
    return Math.max(180, spreadHeight - r);
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

function pageBodyHeightBudget(pageEl, bodyEl, spreadHeight, defMap, extraEl) {
    const footReserve = footnoteReserveForBody(bodyEl, defMap, spreadHeight, extraEl);
    const masthead = pageEl ? pageEl.querySelector('.article-inline-masthead') : null;
    const mastheadReserve = masthead ? elementOuterHeightWithMargins(masthead) : 0;
    const pageInsets = pageVerticalInsets(pageEl);
    const maxBody = Math.floor(spreadHeight - pageInsets - footReserve - mastheadReserve);
    return Math.max(150, maxBody);
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

function finalizePageFootnotes(pageEl, defMap, assignedAnchors) {
    pageEl.querySelector('.article-page-footnotes')?.remove();
    const body = pageEl.querySelector('.article-page-body');
    if (!body) return;
    const orderedIds = collectFootnoteRefIdsFromNode(body);
    if (!orderedIds.length || !defMap || defMap.size === 0) return;
    const foot = document.createElement('div');
    foot.className = 'article-page-footnotes';
    orderedIds.forEach((id, index) => {
        const html = defMap.get(id);
        if (!html) return;
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const src = temp.firstElementChild;
        if (!src) return;
        const clone = src.cloneNode(true);
        const n = footnoteSuperscriptNumberForId(body, id) ?? index + 1;
        clone.setAttribute('data-footnote-n', String(n));
        if (!assignedAnchors.has(id)) {
            clone.id = `fn-${id}`;
            assignedAnchors.add(id);
        } else {
            clone.removeAttribute('id');
        }
        foot.appendChild(clone);
    });
    if (!foot.childElementCount) return;
    body.appendChild(foot);
}

function splitParagraphToFit(pageBodyEl, paragraphEl, maxBodyScrollHeight) {
    if (!paragraphEl || paragraphEl.tagName !== 'P') return null;
    const text = (paragraphEl.textContent || '').trim();
    if (!text) return null;
    const words = text.split(/\s+/);
    if (words.length < 12) return null;

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

    if (best <= 3 || best >= words.length - 3) return null;

    const leftPart = document.createElement('p');
    leftPart.textContent = words.slice(0, best).join(' ');

    const rightPart = document.createElement('p');
    rightPart.textContent = words.slice(best).join(' ');

    return { leftPart, rightPart };
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

    articleBody.innerHTML = '';

    const spreadHeight = getSpreadTargetHeight();

    let currentSpread = createSpread();
    articleBody.appendChild(currentSpread.spread);

    let currentPage = currentSpread.leftPage;
    currentPage.classList.add('article-page-first');
    currentPage.appendChild(createInlineMasthead(currentBlogMeta));
    let currentPageBody = ensureArticlePageBody(currentPage);

    const assignedFootnoteAnchors = new Set();

    const moveToNextPage = () => {
        finalizePageFootnotes(currentPage, defMap, assignedFootnoteAnchors);
        currentSpread = createSpread();
        articleBody.appendChild(currentSpread.spread);
        currentPage = currentSpread.leftPage;
        currentPageBody = ensureArticlePageBody(currentSpread.leftPage);
    };

    blocks.forEach((blockHtml) => {
        const node = createArticleNode(blockHtml);
        currentPageBody.appendChild(node);

        const heightBudget = pageBodyHeightBudget(currentPage, currentPageBody, spreadHeight, defMap);
        if (currentPageBody.scrollHeight > heightBudget && currentPageBody.childElementCount > 1) {
            currentPageBody.removeChild(node);
            const splitBudget = pageBodyHeightBudget(currentPage, currentPageBody, spreadHeight, defMap, node);
            const split = splitParagraphToFit(currentPageBody, node, splitBudget);
            if (split) {
                currentPageBody.appendChild(split.leftPart);
                moveToNextPage();
                currentPageBody.appendChild(split.rightPart);
            } else {
                moveToNextPage();
                currentPageBody.appendChild(node);
            }
        }
    });

    finalizePageFootnotes(currentPage, defMap, assignedFootnoteAnchors);

    if (commentScreenEl) {
        currentPage.appendChild(commentScreenEl);
    }

    applyPageNumbers(articleBody);

    articleBody.dataset.lastPage = 'left';
}

const renderArticleBody = (articleData, options = {}) => {
    articleBlocksCache = parseArticleBlocks(articleData);
    renderArticleSpread(articleBlocksCache.blocks, articleBlocksCache.footnoteDefs);
    applyAnnotationHighlights();
    renderAnnotationList();

    if (!spreadResizeBound) {
        spreadResizeBound = true;
        window.addEventListener('resize', () => {
            clearTimeout(spreadReflowTimer);
            spreadReflowTimer = setTimeout(() => {
                if (articleBlocksCache.blocks.length) {
                    renderArticleSpread(articleBlocksCache.blocks, articleBlocksCache.footnoteDefs);
                }
            }, 140);
        });
    }

    if (options.provisional) return;

    readerReady = true;
    setupCommentSection();
    ensureCommentsVisible();
}

renderReaderHandoffIfPresent();

const formatLine = (line) => {
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
    else if (line[0] == "!" && line[1] == "[") {
        let seperator;
        for (let i = 0; i <= line.length; i++) {
            if (line[i] == "]" && line[i + 1] == "(" && line[line.length - 1] == ")") {
                seperator = i;
            }
        }
        let alt = line.slice(2, seperator);
        let src = line.slice(seperator + 2, line.length - 1);
        return `<img src="${src}" alt="${alt}" class="article-image">`;
    }
    // Handle regular text
    else {
        return `<p>${line}</p>`;
    }
}

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
