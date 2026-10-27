const READER_EMBED = new URLSearchParams(location.search).get('embed') === '1';
const READER_EMBED_READY_TYPE = 'gpp-reader-embed-ready';
const AUTHOR_BIO_HANDOFF_KEY = 'authorBioHandoffPayload';
const AUTHOR_BIO_HANDOFF_MAX_AGE_MS = 90 * 1000;

function authorHandleFromPath() {
    const parts = location.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('author');
    if (idx >= 0 && parts[idx + 1]) {
        try {
            return decodeURIComponent(parts[idx + 1]);
        } catch (_) {
            return parts[idx + 1];
        }
    }
    return '';
}

function authorEmbedReadyId(handle) {
    return `author:${String(handle || '').trim().toLowerCase()}`;
}

if (READER_EMBED) {
    document.documentElement.classList.add('reader-embed');
    document.body.classList.add('reader-embed');
}

const handle = authorHandleFromPath();
const readyId = authorEmbedReadyId(handle);

function readAuthorBioHandoff() {
    try {
        const raw = sessionStorage.getItem(AUTHOR_BIO_HANDOFF_KEY);
        if (!raw) return null;
        const payload = JSON.parse(raw);
        if (!payload || !payload.handle) return null;
        if (Date.now() - Number(payload.ts || 0) > AUTHOR_BIO_HANDOFF_MAX_AGE_MS) return null;
        const fromHandoff = String(payload.handle || '').trim().toLowerCase();
        const pageHandle = String(handle || '').trim().toLowerCase();
        if (fromHandoff !== pageHandle) return null;
        return payload;
    } catch (_) {
        return null;
    }
}

async function fetchAuthorProfileRemote(name) {
    const view = window.GppAuthorBioView;
    const key = view?.authorHandleKey(name);
    if (!key || key === 'anonymous') return view.emptyAuthorProfile(name);
    try {
        const res = await fetch(`/api/author-profile/${encodeURIComponent(key)}`);
        if (!res.ok) return view.emptyAuthorProfile(key);
        const data = await res.json();
        return { ...view.emptyAuthorProfile(key), ...(data.profile || {}) };
    } catch (_) {
        return view.emptyAuthorProfile(key);
    }
}

async function fetchAuthorPostsRemote(name) {
    const view = window.GppAuthorBioView;
    const key = view?.authorHandleKey(name);
    if (!key || typeof db === 'undefined') return [];
    try {
        const snap = await db.collection('blogs').get();
        const posts = [];
        snap.docs.forEach((doc) => {
            const data = doc.data() || {};
            const author = data.author ? String(data.author).split('@')[0] : 'Anonymous';
            if (view.authorHandleKey(author) !== key) return;
            const ms =
                Date.parse(data.lastModified || '') ||
                Date.parse(data.publishedAt || '') ||
                0;
            posts.push({
                id: doc.id,
                title: (data.title || 'Untitled').trim() || 'Untitled',
                ms,
                publishedAt: data.publishedAt || data.lastModified || '',
            });
        });
        posts.sort((a, b) => (b.ms || 0) - (a.ms || 0));
        return posts;
    } catch (_) {
        return [];
    }
}

function notifyEmbedParentReady() {
    if (!READER_EMBED) return;
    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(
                { type: READER_EMBED_READY_TYPE, blogId: readyId },
                window.location.origin
            );
        }
    } catch (_) {}
}

function scheduleEmbedParentReadyAfterPaint() {
    requestAnimationFrame(() => notifyEmbedParentReady());
}

async function bootstrapAuthorBio() {
    const view = window.GppAuthorBioView;
    if (!handle || !view) return;

    const handoff = readAuthorBioHandoff();
    let paintedReady = false;
    const finishPaint = () => {
        document.body.classList.remove('reader-loading');
        scheduleEmbedParentReadyAfterPaint();
        paintedReady = true;
    };

    if (handoff?.profile) {
        view.applyAuthorBioView(
            handle,
            handoff.profile,
            Array.isArray(handoff.posts) ? handoff.posts : []
        );
        finishPaint();
    }

    const profile = handoff?.profile || (await fetchAuthorProfileRemote(handle));
    const posts = Array.isArray(handoff?.posts)
        ? handoff.posts
        : await fetchAuthorPostsRemote(handle);

    view.applyAuthorBioView(handle, profile, posts);
    if (!paintedReady) {
        finishPaint();
    }
}

bootstrapAuthorBio().finally(() => {
    if (document.body.classList.contains('reader-loading')) {
        document.body.classList.remove('reader-loading');
        scheduleEmbedParentReadyAfterPaint();
    }
});

const reflowAuthorBioLayout = () => {
    window.GppAuthorBioView?.fitBioPanelAuthorNames?.();
};
window.addEventListener('resize', reflowAuthorBioLayout);
window.visualViewport?.addEventListener('resize', reflowAuthorBioLayout);
document.getElementById('bio-avatar')?.addEventListener('load', reflowAuthorBioLayout, { once: true });
