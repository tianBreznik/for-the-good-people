const blogSection = document.querySelector('.blogs-section');
const topdiv = document.querySelector('#first-container');

/** Fixed sheet + display scale (see page-geometry.js). */
function applyHomeSheetScale() {
    const PG = window.PageGeometry;
    if (PG && typeof PG.applyCanonicalSheetCssVars === 'function') {
        PG.applyCanonicalSheetCssVars(document.documentElement);
        return;
    }
    const boot = window.PageGeometryBoot;
    if (boot && typeof boot.applyCanonicalSheetCssVars === 'function') {
        boot.applyCanonicalSheetCssVars();
        return;
    }
    document.documentElement.style.setProperty('--reader-page-width', '620px');
    document.documentElement.style.setProperty('--reader-page-height', '874px');
}

function canonicalHandoffPageSize() {
    const PG = window.PageGeometry;
    return {
        previewPageHeight: (PG && PG.CANONICAL_PAGE_HEIGHT) || 874,
        previewPageWidth: (PG && PG.CANONICAL_PAGE_WIDTH) || 620,
    };
}

applyHomeSheetScale();
window.addEventListener('resize', applyHomeSheetScale);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', applyHomeSheetScale);
}

/** Once the splash is dismissed, skip it when returning to home (shared across tabs). */
const HOME_ENTRY_DISMISSED_KEY = 'homeEntryDismissed';

function isHomeEntryDismissed() {
    try {
        // /?splash=1 forces the curtain for texture checks
        if (new URLSearchParams(window.location.search).get('splash') === '1') return false;
        if (localStorage.getItem(HOME_ENTRY_DISMISSED_KEY) === '1') return true;
        // Migrate older same-tab flag so prior sessions still skip splash.
        if (sessionStorage.getItem(HOME_ENTRY_DISMISSED_KEY) === '1') {
            localStorage.setItem(HOME_ENTRY_DISMISSED_KEY, '1');
            return true;
        }
    } catch (_) {}
    return false;
}

function persistHomeEntryDismissed() {
    try {
        localStorage.setItem(HOME_ENTRY_DISMISSED_KEY, '1');
        sessionStorage.setItem(HOME_ENTRY_DISMISSED_KEY, '1');
    } catch (_) {}
}

/** Hide splash on next paint (returning visits). Do NOT call during the slide-out animation. */
function applyHomeEntrySkipSplashPaint() {
    try {
        document.documentElement.classList.add('home-entry-skip-splash');
    } catch (_) {}
}

function markHomeEntryDismissed({ hideNow = false } = {}) {
    persistHomeEntryDismissed();
    if (hideNow) applyHomeEntrySkipSplashPaint();
}

function hasPendingAdminHomeAction() {
    try {
        const admin = new URLSearchParams(window.location.search).get('admin');
        return (
            admin === 'approve' ||
            admin === 'reject' ||
            admin === 'approved' ||
            admin === 'rejected' ||
            admin === 'error'
        );
    } catch (_) {
        return false;
    }
}
let titleEmergeClearTimer = null;

function parseCssDurationMs(value) {
    const v = String(value || '').trim();
    if (!v) return 680;
    const n = parseFloat(v);
    if (Number.isNaN(n)) return 680;
    if (v.endsWith('ms')) return Math.round(n);
    if (v.endsWith('s')) return Math.round(n * 1000);
    return Math.round(n);
}

/** Show column titles. Pass { instant: true } when skipping the splash motion. */
function revealHomeTitlesWithEmerge(options) {
    const instant = options && options.instant;
    if (instant) {
        document.body.classList.add('home-titles-instant');
    } else {
        document.body.classList.remove('home-titles-instant');
    }
    document.body.classList.add('home-titles-visible');
        document.body.classList.remove('home-titles-emerging');
    if (titleEmergeClearTimer) {
        clearTimeout(titleEmergeClearTimer);
        titleEmergeClearTimer = null;
    }
}

const JUST_LOGGED_IN_KEY = 'justLoggedIn';

function dismissSplashImmediately() {
    if (!topdiv) return;
        topdiv.style.transition = 'none';
        topdiv.classList.add('fade');
        topdiv.style.display = 'none';
    markHomeEntryDismissed({ hideNow: true });
    requestAnimationFrame(() => {
        if (topdiv) topdiv.style.transition = '';
    });
}

/** Splash + title reveal only after the column grid exists (avoids post-login flicker). */
function applyHomeEntryAfterGridReady() {
    let fromLogin = false;
    try {
        if (sessionStorage.getItem(JUST_LOGGED_IN_KEY) === '1') {
            sessionStorage.removeItem(JUST_LOGGED_IN_KEY);
            fromLogin = true;
    }
} catch (e) {}

    const entryDismissed = isHomeEntryDismissed() || hasPendingAdminHomeAction();

    if (topdiv && (fromLogin || entryDismissed) && !topdiv.classList.contains('fade')) {
        dismissSplashImmediately();
    }

    if (fromLogin) {
        revealHomeTitlesWithEmerge({ instant: true });
        revealHomeTextureSwitcher({ delayMs: 900 });
    } else if (entryDismissed || (topdiv && topdiv.classList.contains('fade'))) {
        document.body.classList.add('home-titles-instant');
        document.body.classList.add('home-titles-visible');
        revealHomeTextureSwitcher({ delayMs: entryDismissed ? 1000 : 700 });
    }

    syncAuthControls(auth.currentUser);
}

function homeAuthorQueryHandle() {
    try {
        const raw = new URLSearchParams(window.location.search).get('author');
        if (!raw) return '';
        return String(raw).trim().replace(/^@+/, '');
    } catch (_) {
        return '';
    }
}

function decodePathSegment(segment) {
    const raw = String(segment || '');
    try {
        return decodeURIComponent(raw);
    } catch (_) {
        try {
            return decodeURI(raw);
        } catch {
            return raw;
        }
    }
}

function ensureHomeBioPanel() {
    let panel = document.querySelector('.bio-panel');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.className = 'bio-panel';
    panel.innerHTML = `
        <div class="bio-panel-cards" id="bio-panel-cards">
            <div class="bio-panel-profile bio-identity-card" id="bio-panel-profile">
                <div class="bio-card-main">
                    <div class="bio-card-head">
                        <div class="bio-avatar-wrap" id="bio-avatar-wrap">
                            <img class="bio-avatar" id="bio-avatar" src="" alt="" width="168" height="168" decoding="async" />
                            <button type="button" class="bio-avatar-change bio-edit-only" id="bio-avatar-change" aria-haspopup="listbox" aria-expanded="false">Change</button>
                            <input type="hidden" id="bio-edit-avatar" value="" />
                            <div class="bio-avatar-menu" id="bio-avatar-menu" role="listbox" aria-label="Profile pictures" hidden></div>
                        </div>
                        <div class="bio-identity-row bio-view-only">
                            <p class="bio-author-name" id="bio-author-name"></p>
                        </div>
                        <div class="bio-identity-row bio-edit-identity bio-edit-only" hidden>
                            <p class="bio-author-name" id="bio-edit-handle"></p>
                        </div>
                    </div>
                    <div class="bio-actions bio-actions-edit bio-view-only">
                        <button type="button" class="bio-edit-btn" id="bio-edit-btn" hidden>Edit</button>
                    </div>
                    <div class="bio-actions bio-actions-save bio-edit-only" hidden>
                        <button type="button" class="bio-edit-save" id="bio-edit-save">Save</button>
                        <button type="button" class="bio-edit-cancel" id="bio-edit-cancel">Cancel</button>
                    </div>
                    <p class="bio-text bio-view-only" id="bio-text"></p>
                    <div class="bio-edit-only bio-edit-bottom" hidden>
                        <textarea class="bio-inline-input bio-inline-textarea" id="bio-edit-bio" rows="5" maxlength="${AUTHOR_PROFILE_BIO_MAX_LENGTH}" placeholder="Bio" aria-describedby="bio-edit-bio-hint"></textarea>
                        <p class="bio-edit-char-hint" id="bio-edit-bio-hint"></p>
                        <p class="bio-edit-error" id="bio-edit-error" hidden></p>
                    </div>
                    <div class="bio-card-foot bio-view-only" id="bio-view-block">
                        <ul class="bio-meta" id="bio-meta" hidden></ul>
                        <div class="bio-links" id="bio-links" hidden></div>
                    </div>
                    <div class="bio-card-foot bio-edit-only" id="bio-edit-layout" hidden>
                        <ul class="bio-meta bio-meta-edit">
                            <li class="bio-meta-item"><span class="bio-meta-icon" aria-hidden="true">📍</span><input type="text" id="bio-edit-location" maxlength="80" placeholder="Location" /></li>
                            <li class="bio-meta-item"><span class="bio-meta-icon" aria-hidden="true">🔗</span><input type="url" id="bio-edit-website" maxlength="200" placeholder="Website" /></li>
                        </ul>
                        <div class="bio-links bio-links-edit">
                            <input type="url" id="bio-edit-social-0" maxlength="200" placeholder="Social 1" />
                            <input type="url" id="bio-edit-social-1" maxlength="200" placeholder="Social 2" />
                            <input type="url" id="bio-edit-social-2" maxlength="200" placeholder="Social 3" />
                            <input type="url" id="bio-edit-social-3" maxlength="200" placeholder="Social 4" />
                        </div>
                    </div>
                </div>
            </div>
            <aside class="bio-latest-card bio-identity-card bio-view-only" id="bio-latest-card" hidden>
                <p class="bio-latest" id="bio-latest-single">
                    <span class="bio-latest-label">Latest</span>
                    <a class="bio-latest-link" id="bio-latest-link" href="#"></a>
                </p>
                <div class="bio-index" id="bio-index" hidden>
                    <ol class="bio-index-list" id="bio-index-list"></ol>
                </div>
            </aside>
            <aside class="bio-capture-card bio-identity-card" id="bio-capture-card" hidden>
                <div class="bio-capture-mount" id="bio-capture-mount" aria-label="Currently captured by"></div>
                <p class="bio-capture-empty bio-edit-only" id="bio-capture-empty">Paste any link — page, video, PDF…</p>
                <input
                    type="url"
                    class="bio-capture-input bio-edit-only"
                    id="bio-edit-capture-url"
                    maxlength="500"
                    placeholder="https://…"
                    autocomplete="off"
                    spellcheck="false"
                />
            </aside>
        </div>
        <form id="home-search-strip" class="home-search-strip" autocomplete="off" role="search">
            <input type="search" id="home-search-input" name="q" placeholder="Search titles and authors…" aria-label="Search titles and authors" />
        </form>
    `;
    document.body.appendChild(panel);
    bindAuthorBioEditor(panel);
    return panel;
}

const AUTHOR_AVATAR_FILES = Array.isArray(window.AUTHOR_AVATAR_FILES)
    ? window.AUTHOR_AVATAR_FILES
    : [
        'IMG_0633.jpg',
        'IMG_7131.jpg',
        'IMG_8737.jpg',
        'IMG_8739.JPG',
        'IMG_8740.JPG',
        'IMG_8741.JPG',
        'IMG_8743.JPG',
        'IMG_8744.JPG',
        'IMG_8745.PNG',
        'IMG_8747.JPG',
        'IMG_8748.jpg',
        'IMG_8749.jpg',
        'IMG_8750.jpg',
        'IMG_8751.jpg',
        'IMG_8753.jpg',
        'IMG_8755.jpg',
        'IMG_9128.jpg'
    ];

/** name → { latestTitle, latestId, latestMs } built while loading blogs. */
const authorHomeProfiles = Object.create(null);

/** name → avatar url for this page load only (reshuffled on every refresh). */
const authorAvatarByName = Object.create(null);

// Returning visitors / admin / author deep-links: skip splash immediately (don't wait for blogs).
if (hasPendingAdminHomeAction() || isHomeEntryDismissed() || homeAuthorQueryHandle()) {
    markHomeEntryDismissed({ hideNow: true });
    dismissSplashImmediately();
    revealHomeTitlesWithEmerge({ instant: true });
}

// First visit: keep splash as cover until the column grid exists.
// (Hiding it early left a blank page whenever Firestore was slow or stuck.)
const navbar = document.querySelector('.navbar');

let topfaded = false;
let uniqueAuthors = new Set(); // Track unique authors

// Physics system variables
let physicsObjects = []; // Array of all physics objects (cards + popup)
let popup = null; // The growing popup object
let physicsActive = false; // Whether physics simulation is running
let animationFrameId = null; // For the physics animation loop
let articlePreviewUiBound = false;
let bioHoverTimer = null; // Author tag click → bio strip (delay)
let aboutHoverTimer = null; // About card hover → floating card
/** Ignore hover open/close while deep-link bio settles (avoids close→reopen double paint). */
let bioHoverQuietUntil = 0;
/** Home author-tag click → bio strip (short beat after click). */
const AUTHOR_BIO_CLICK_DELAY_MS = 200;
/** @author link from article/comment → bio strip (after home is up). */
const AUTHOR_BIO_DEEP_LINK_DELAY_MS = 200;
/** About card hover. */
const PANEL_HOVER_DWELL_MS = 800;
/** Must match lib/author-profile-limits.js — five lines in the bio identity card. */
const AUTHOR_PROFILE_BIO_MAX_LENGTH = 220;

function isBioHoverQuiet() {
    return Date.now() < bioHoverQuietUntil;
}

function quietBioHover(ms = 700) {
    bioHoverQuietUntil = Date.now() + ms;
}

/** Desktop: close bio when the pointer leaves the strip for the stone wall. */
let bioMoveCloser = null;
let bioMoveCloserArmTimer = null;

function detachBioMoveCloser() {
    if (bioMoveCloserArmTimer) {
        clearTimeout(bioMoveCloserArmTimer);
        bioMoveCloserArmTimer = null;
    }
    if (!bioMoveCloser) return;
    document.removeEventListener('mousemove', bioMoveCloser, true);
    bioMoveCloser = null;
}

function clearAuthorBioHighlight() {
    document.querySelectorAll('.blog-card.author-bio-active').forEach((el) => {
        el.classList.remove('author-bio-active');
    });
    document.querySelectorAll('.blog-card.bio-dim').forEach((el) => {
        el.classList.remove('bio-dim');
    });
    document.querySelectorAll('.blog-card.link-glow, .blog-card.hover, .blog-card.tap-active').forEach((el) => {
        el.classList.remove('link-glow', 'hover', 'tap-active');
    });
}

/** Keep the same link-glow wash while the bio strip is open (no white-rim swap). */
function applyAuthorBioHighlight(authorName) {
    const name = String(authorName || '').trim();
    if (!name) {
        clearAuthorBioHighlight();
        return;
    }

    const tapMode = homeDirectArticleTapNav();

    // Apply in place (no clear-first frame) so the tapped author never blanks.
    document
        .querySelectorAll('.title-section .cardcontainer[data-author] .blog-card:not(.author-card)')
        .forEach((card) => {
            const cardAuthor = card.closest('.cardcontainer')?.getAttribute('data-author') || '';
            card.classList.remove('link-glow', 'bio-dim', 'hover', 'tap-active', 'author-bio-active');
            if (cardAuthor === name) card.classList.add('link-glow');
            else card.classList.add('bio-dim');
        });

    document.querySelectorAll('.blog-card.author-card').forEach((authorCard) => {
        const authorCardName = authorCard.getAttribute('data-author') || '';
        if (authorCardName.toLowerCase() === 'about') return;
        authorCard.classList.remove('link-glow', 'bio-dim', 'hover', 'tap-active', 'author-bio-active');
        if (authorCardName === name) {
            // Tap mode: tap-active only — link-glow’s transparent fill + hidden
            // ::before made the handle vanish for a frame on iOS.
            if (tapMode) authorCard.classList.add('tap-active');
            else authorCard.classList.add('link-glow');
        } else if (tapMode) {
            authorCard.classList.add('bio-dim');
        } else {
            authorCard.classList.add('hover');
        }
    });
}

let authorBioCloseTimer = null;
let authorBioCloseSeq = 0;
/** Resolves when the wall has finished sliding shut after a bio close. */
let authorBioClosePromise = null;
let authorBioCloseResolve = null;

/** Cancel an in-flight bio wall shut (e.g. reopening another author). */
function cancelAuthorBioClosing() {
    authorBioCloseSeq += 1;
    if (authorBioCloseTimer) {
        clearTimeout(authorBioCloseTimer);
        authorBioCloseTimer = null;
    }
    document.body.classList.remove('bio-closing');
    const resolve = authorBioCloseResolve;
    authorBioCloseResolve = null;
    authorBioClosePromise = null;
    if (resolve) resolve();
}

/**
 * Close the author bio strip. Uses `bio-closing` (like search) so translate stays
 * applied while Y animates to 0. Resolves only after the full --aboutDuration.
 */
function closeHomeAuthorBio() {
    if (document.body.classList.contains('bio-closing') && authorBioClosePromise) {
        return authorBioClosePromise;
    }
    if (!document.body.classList.contains('bio-open')) {
        return Promise.resolve();
    }

    exitAuthorBioEditMode();
    detachBioMoveCloser();

    // Keep translate rule live; drive --wallRevealY to 0 via bio-closing.
    document.body.classList.add('bio-closing');
    document.body.classList.remove('bio-open');
    // Flush so the browser commits open→closing as a real transition, not a snap.
    void document.querySelector('.column-section')?.offsetHeight;

    const mobileBio = homeDirectArticleTapNav();
    // Mobile tap mode: clear active/dim immediately and drop sticky :hover so the
    // emboss ::before isn’t left in a stripped/invisible state until the next tap.
    if (mobileBio) {
        clearAuthorBioHighlight();
        const stuck = document.querySelector('.blog-card.author-card:hover, .blog-card.author-card:focus');
        if (stuck && typeof stuck.blur === 'function') stuck.blur();
        if (document.activeElement && document.activeElement !== document.body) {
            try {
                document.activeElement.blur();
            } catch (_) {}
        }
    }

    const closeSeq = ++authorBioCloseSeq;
    if (authorBioCloseTimer) {
        clearTimeout(authorBioCloseTimer);
        authorBioCloseTimer = null;
    }
    // Same wall timing as desktop; only tap handling differs on mobile.
    const waitMs = getAboutDurationMs() + 60;
    authorBioClosePromise = new Promise((resolve) => {
        authorBioCloseResolve = resolve;
        authorBioCloseTimer = setTimeout(() => {
            if (closeSeq !== authorBioCloseSeq) return;
            authorBioCloseTimer = null;
            if (!mobileBio) document.body.classList.add('wall-hover-freeze');
            clearAuthorBioHighlight();
            document.body.classList.remove('bio-closing');
            if (!mobileBio) {
                setTimeout(() => {
                    document.body.classList.remove('wall-hover-freeze');
                }, 450);
            }
            authorBioCloseResolve = null;
            authorBioClosePromise = null;
            resolve();
        }, waitMs);
    });
    return authorBioClosePromise;
}

/** Wait until any open/closing author bio wall is fully shut. */
function ensureAuthorBioClosed() {
    if (document.body.classList.contains('bio-open')) {
        return closeHomeAuthorBio();
    }
    if (document.body.classList.contains('bio-closing') && authorBioClosePromise) {
        return authorBioClosePromise;
    }
    return Promise.resolve();
}

function attachBioMoveCloser() {
    if (!homeFinePointerHoverUi()) return;
    if (bioMoveCloser || bioMoveCloserArmTimer) return;
    bioMoveCloserArmTimer = setTimeout(() => {
        bioMoveCloserArmTimer = null;
        if (bioMoveCloser) return;
        bioMoveCloser = (e) => {
            if (isBioHoverQuiet()) return;
            if (e.target && e.target.closest && e.target.closest('.bio-panel')) return;
            closeHomeAuthorBio();
        };
        document.addEventListener('mousemove', bioMoveCloser, true);
    }, 120);
}
/** Keeps preview visible until column slabs finish sliding shut (matches --articlePreviewRevealDuration). */
let articlePreviewClosingTimer = null;
let articlePreviewCloseSeq = 0;
/** Resolves when the preview has finished sliding shut. */
let articlePreviewClosePromise = null;
let articlePreviewCloseResolve = null;
let articleExpandNavigateTimer = null;
let articleExpandInFlight = false;
const READER_HANDOFF_KEY = 'readerHandoffPayload';
const AUTHOR_BIO_HANDOFF_KEY = 'authorBioHandoffPayload';
const READER_EMBED_READY_TYPE = 'gpp-reader-embed-ready';
const READER_EMBED_HANDOFF_TYPE = 'gpp-reader-handoff';
const MOBILE_READER_REVEAL_FALLBACK_MS = 900;
const MOBILE_AUTHOR_REVEAL_FALLBACK_MS = 480;
let mobileReaderShellEl = null;
let mobileReaderFrameEl = null;
let mobileReaderHistoryPushed = false;
let mobileReaderClosingTimer = null;
let mobileReaderCloseSeq = 0;
let mobileReaderEmbedReadyBound = false;
/** { blogId, reveal } while warming under the wall */
let mobileReaderPendingOpen = null;
/** Lowercase author handle when the mobile shell shows /author/…; null for articles. */
let mobileReaderOpenAuthorHandle = null;
let mobileReaderOpenSeq = 0;
let authorBioHighlightClearTimer = null;

function isAuthorEmbedUrl(src) {
    const url = String(src || '');
    return /\/author\/[^/?#]+/.test(url) && url.includes('embed=1');
}

function authorEmbedReadyId(authorName) {
    return `author:${String(authorName || '').trim().toLowerCase()}`;
}

function isMobileAuthorReaderOpenFor(authorName) {
    if (!document.body.classList.contains('mobile-reader-open')) return false;
    const key = String(authorName || '').trim().toLowerCase();
    return key && mobileReaderOpenAuthorHandle === key;
}

/** Full-viewport panes on small screens; desktop keeps five columns inside the same wrapper. */
const HOME_NARROW_QUERY = '(max-width: 900px)';

/** Set in home bootstrap; used by updateAuthControls to reflow columns on narrow screens. */
let relayoutHomeSectionsRef = null;

/** Mobile: which .home-main-pane is most visible in the horizontal track (drives .home-column-active). */
let syncHomeActiveColumnRef = null;
let lastActiveHomePaneCol = null;
let lastHapticAtMs = 0;

function triggerMobileHaptic(kind = 'light') {
    if (!isHomeNarrowLayout()) return;
    const now = performance.now();
    if (now - lastHapticAtMs < 90) return;
    lastHapticAtMs = now;

    // Telegram WebApp bridge (if embedded there) supports real haptics on iOS/Android.
    const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp?.HapticFeedback : null;
    if (tg) {
        try {
            if (kind === 'preview-reveal') tg.impactOccurred('medium');
            else tg.impactOccurred('light');
            return;
        } catch (_) {}
    }

    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    if (kind === 'preview-reveal') navigator.vibrate([22, 28, 18]);
    else navigator.vibrate(18);
}

function clearMobileSectionTapLines() {
    document.querySelectorAll('.home-main-pane.home-column-lines').forEach((p) => {
        p.classList.remove('home-column-lines');
    });
}

/** Mobile: section edge lines only while a section title is tapped (not scroll-active). */
function initMobileSectionTitleTapLines() {
    if (typeof window.matchMedia === 'undefined' || !window.matchMedia(HOME_NARROW_QUERY).matches) {
        return;
    }
    document.querySelectorAll('.section-title-container').forEach((el) => {
        if (el.dataset.tapLinesBound === '1') return;
        el.dataset.tapLinesBound = '1';
        const card = el.querySelector('.section-heading-card');
        if (card) card.style.cursor = 'pointer';
        installTapNotSwipe(el);
        el.addEventListener('click', (e) => {
            if (!window.matchMedia(HOME_NARROW_QUERY).matches) return;
            if (homeFinePointerHoverUi()) return;
            if (tapWasSwipe(el)) return;
            e.preventDefault();
            e.stopPropagation();
            const pane = el.closest('.home-main-pane');
            if (!pane) return;
            const wasOn = pane.classList.contains('home-column-lines');
            clearMobileSectionTapLines();
            if (!wasOn) pane.classList.add('home-column-lines');
        });
    });
    if (!document.documentElement.dataset.sectionTapLinesDismissBound) {
        document.documentElement.dataset.sectionTapLinesDismissBound = '1';
        document.addEventListener(
            'click',
            (e) => {
                if (!window.matchMedia(HOME_NARROW_QUERY).matches) return;
                if (e.target.closest?.('.section-title-container')) return;
                clearMobileSectionTapLines();
            },
            true
        );
    }
}

function initHomeActiveColumnFromScroll(track) {
    const panes = () => Array.from(track.querySelectorAll('.home-main-pane'));

    const sync = () => {
        if (typeof window.matchMedia === 'undefined' || !window.matchMedia(HOME_NARROW_QUERY).matches) {
            panes().forEach((p) => p.classList.remove('home-column-active'));
            clearMobileSectionTapLines();
            lastActiveHomePaneCol = null;
            return;
        }
        const tr = track.getBoundingClientRect();
        const trackMidX = tr.left + tr.width / 2;
        let bestPane = null;
        let bestVis = -1;
        let bestDist = Infinity;
        for (const pane of panes()) {
            const pr = pane.getBoundingClientRect();
            const vis = Math.max(0, Math.min(pr.right, tr.right) - Math.max(pr.left, tr.left));
            if (vis <= 0) continue;
            const paneMidX = pr.left + pr.width / 2;
            const dist = Math.abs(paneMidX - trackMidX);
            if (vis > bestVis + 0.5 || (Math.abs(vis - bestVis) < 0.5 && dist < bestDist)) {
                bestVis = vis;
                bestDist = dist;
                bestPane = pane;
            }
        }
        if (bestPane) {
            // Keep home-column-active for haptics / scroll bookkeeping only —
            // vertical rails are tap-driven via .home-column-lines.
            panes().forEach((p) => p.classList.toggle('home-column-active', p === bestPane));
            const col = bestPane.dataset.col || null;
            if (lastActiveHomePaneCol && col && col !== lastActiveHomePaneCol) {
                triggerMobileHaptic('pane-snap');
                clearMobileSectionTapLines();
            }
            lastActiveHomePaneCol = col;
        }
    };

    syncHomeActiveColumnRef = sync;
    track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
    window.addEventListener('resize', () => requestAnimationFrame(sync));
    requestAnimationFrame(sync);
}

/** Fine pointer (mouse/trackpad). Used to distinguish desktop preview clicks from mobile tap-nav. */
function homeFinePointerHoverUi() {
    return typeof window.matchMedia !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/** Narrow layout without fine pointer: first tap on card opens in-app reader (iframe). */
function homeDirectArticleTapNav() {
    return typeof window.matchMedia !== 'undefined' && window.matchMedia(HOME_NARROW_QUERY).matches && !homeFinePointerHoverUi();
}

/** Ignore click after a finger drag (column swipe across a title/author hit target). */
const TAP_SWIPE_CANCEL_PX = 12;

function installTapNotSwipe(el) {
    if (!el || el.dataset.tapNotSwipeBound === '1') return;
    el.dataset.tapNotSwipeBound = '1';
    let startX = 0;
    let startY = 0;
    let armed = false;
    el.addEventListener(
        'pointerdown',
        (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            armed = true;
            startX = e.clientX;
            startY = e.clientY;
            el.dataset.swipeCancelTap = '0';
        },
        { passive: true }
    );
    const markIfMoved = (e) => {
        if (!armed) return;
        if (
            Math.abs(e.clientX - startX) > TAP_SWIPE_CANCEL_PX ||
            Math.abs(e.clientY - startY) > TAP_SWIPE_CANCEL_PX
        ) {
            el.dataset.swipeCancelTap = '1';
            armed = false;
        }
    };
    el.addEventListener('pointermove', markIfMoved, { passive: true });
    el.addEventListener(
        'pointerup',
        () => {
            armed = false;
        },
        { passive: true }
    );
    el.addEventListener(
        'pointercancel',
        () => {
            el.dataset.swipeCancelTap = '1';
            armed = false;
        },
        { passive: true }
    );
    // Capture: kill click before card/author/section handlers run.
    el.addEventListener(
        'click',
        (e) => {
            if (el.dataset.swipeCancelTap !== '1') return;
            el.dataset.swipeCancelTap = '0';
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        },
        true
    );
}

function tapWasSwipe(el) {
    if (!el || el.dataset.swipeCancelTap !== '1') return false;
    el.dataset.swipeCancelTap = '0';
    return true;
}

function ensureMobileReaderShell() {
    if (mobileReaderShellEl) return mobileReaderShellEl;
    const shell = document.createElement('div');
    shell.className = 'mobile-reader-shell';
    shell.hidden = true;
    shell.setAttribute('aria-hidden', 'true');
    shell.innerHTML = `
        <button type="button" class="mobile-reader-close" aria-label="Close article">×</button>
        <iframe class="mobile-reader-frame" title="Article reader" loading="eager"></iframe>
    `;
    document.body.appendChild(shell);
    mobileReaderShellEl = shell;
    mobileReaderFrameEl = shell.querySelector('.mobile-reader-frame');

    shell.querySelector('.mobile-reader-close')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeMobileInAppReader();
    });

    window.addEventListener('popstate', () => {
        if (mobileReaderHistoryPushed && document.body.classList.contains('mobile-reader-open')) {
            closeMobileInAppReader({ fromPopstate: true });
        }
    });

    bindMobileReaderEmbedReadyListener();
    return shell;
}

function bindMobileReaderEmbedReadyListener() {
    if (mobileReaderEmbedReadyBound) return;
    mobileReaderEmbedReadyBound = true;
    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || data.type !== READER_EMBED_READY_TYPE) return;
        const pending = mobileReaderPendingOpen;
        if (!pending) return;
        if (pending.openSeq !== mobileReaderOpenSeq) return;
        if (String(data.blogId || '') !== String(pending.blogId || '')) return;
        pending.reveal();
    });
}

function warmMobileReaderShellUnderWall() {
    const shell = ensureMobileReaderShell();
    shell.classList.add('mobile-reader-warming');
    shell.hidden = false;
    shell.setAttribute('aria-hidden', 'true');
    return shell;
}

function stopMobileReaderShellWarm() {
    if (!mobileReaderShellEl) return;
    mobileReaderShellEl.classList.remove('mobile-reader-warming');
}

async function writeMobileReaderHandoffFromCard(blogId, card) {
    if (!card) return null;
    await ensureBlogCardArticle(card);
    const payload = {
        blogId: String(blogId || ''),
        title: card.dataset.title || '',
        author: card.closest('.cardcontainer')?.getAttribute('data-author') || 'Anonymous',
        publishedAt: card.dataset.publishedAt || '',
        article: card.dataset.article || '',
        ...canonicalHandoffPageSize(),
        ts: Date.now(),
    };
    try {
        sessionStorage.setItem(READER_HANDOFF_KEY, JSON.stringify(payload));
    } catch (_) {}
    return payload;
}

function pushMobileReaderHandoffToEmbed(frame, payload) {
    if (!frame?.contentWindow || !payload) return false;
    try {
        frame.contentWindow.postMessage(
            { type: READER_EMBED_HANDOFF_TYPE, payload },
            window.location.origin
        );
        return true;
    } catch (_) {
        return false;
    }
}

function markMobileReaderFrameReady(frame) {
    if (!frame) return;
    frame.dataset.embedReady = '1';
}

function loadMobileReaderFrame(frame, embedUrl) {
    if (!frame || !embedUrl) return false;
    const current = frame.getAttribute('src') || '';
    if (current === embedUrl) return true;
    frame.dataset.embedReady = '0';
    frame.loading = 'eager';
    frame.src = embedUrl;
    frame.addEventListener(
        'load',
        () => {
            if (frame.getAttribute('src') === embedUrl) markMobileReaderFrameReady(frame);
        },
        { once: true }
    );
    return false;
}

function writeAuthorBioHandoffForOpen(handle) {
    const name = String(handle || '').trim();
    if (!name) return;
    const key = authorHandleKey(name);
    const profile = authorProfileCache[key] || emptyAuthorProfile(name);
    const posts = authorHomeProfiles[name]?.posts || [];
    try {
        sessionStorage.setItem(
            AUTHOR_BIO_HANDOFF_KEY,
            JSON.stringify({
                handle: name,
                profile,
                posts,
                ts: Date.now(),
            })
        );
    } catch (_) {}
}

function openMobileEmbedShell({
    embedUrl,
    readyId,
    seamIndex = 2,
    sourceCard = null,
    handoffPayload = null,
    historyState = {},
    revealFallbackMs = MOBILE_READER_REVEAL_FALLBACK_MS,
}) {
    if (!embedUrl || !readyId) return;
    if (mobileReaderClosingTimer) {
        clearTimeout(mobileReaderClosingTimer);
        mobileReaderClosingTimer = null;
    }

    const shell = warmMobileReaderShellUnderWall();
    const frame = mobileReaderFrameEl;
    if (!frame) return;

    const isAuthorShell = Boolean(historyState.author);
    if (isAuthorShell) {
        document.body.classList.remove('mobile-author-reader-open');
        document.documentElement.style.setProperty('--seamX', '100vw');
        document.body.setAttribute('data-open-seam', 'author-right');
    } else {
        document.body.classList.remove('mobile-author-reader-open');
        setActivePreviewSeam(seamIndex);
    }
    if (sourceCard) setPreviewSourceHighlight(sourceCard);

    const openSeq = ++mobileReaderOpenSeq;
    const prevSrc = frame.getAttribute('src') || '';
    const sameUrlAlready = prevSrc === embedUrl;
    if (isAuthorShell) {
        mobileReaderOpenAuthorHandle = String(historyState.author).trim().toLowerCase();
        /* Don’t part the wall over a stale article embed — blank first, then author URL. */
        if (prevSrc && !isAuthorEmbedUrl(prevSrc)) {
            try {
                frame.src = 'about:blank';
            } catch (_) {}
            frame.dataset.embedReady = '0';
        }
    } else {
        mobileReaderOpenAuthorHandle = null;
    }

    let opened = false;
    let fallbackTimer = null;
    const reveal = () => {
        if (opened || openSeq !== mobileReaderOpenSeq) return;
        if (isAuthorShell && frame.getAttribute('src') !== embedUrl) return;
        opened = true;
        mobileReaderPendingOpen = null;
        markMobileReaderFrameReady(frame);
        stopMobileReaderShellWarm();
        shell.hidden = false;
        shell.setAttribute('aria-hidden', 'false');
        shell.classList.remove('mobile-reader-closing');

        document.body.classList.remove('article-closing');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.body.classList.add('article-open', 'mobile-reader-open');
                if (isAuthorShell) {
                    document.body.classList.add('mobile-author-reader-open');
                }
                triggerMobileHaptic('preview-reveal');
            });
        });

        if (!mobileReaderHistoryPushed) {
            history.pushState({ mobileReader: true, ...historyState }, '', window.location.pathname);
            mobileReaderHistoryPushed = true;
        }
        if (fallbackTimer) {
            clearTimeout(fallbackTimer);
            fallbackTimer = null;
        }
    };

    mobileReaderPendingOpen = { blogId: String(readyId), reveal, openSeq };

    loadMobileReaderFrame(frame, embedUrl);
    if (handoffPayload && sameUrlAlready) {
        pushMobileReaderHandoffToEmbed(frame, handoffPayload);
    }

    if (isAuthorShell) {
        if (sameUrlAlready && frame.dataset.embedReady === '1') {
            requestAnimationFrame(() => reveal());
        }
        /* Author: wait for embed-ready (handoff paint) — not iframe load / 480ms fallback
           while the previous document was still an article. */
        fallbackTimer = setTimeout(() => {
            if (openSeq !== mobileReaderOpenSeq) return;
            if (frame.getAttribute('src') !== embedUrl) return;
            reveal();
        }, Math.max(revealFallbackMs, 3500));
    } else {
        frame.addEventListener('load', reveal, { once: true });
        fallbackTimer = setTimeout(reveal, revealFallbackMs);
    }
}

function openMobileInAppReader(blogId, seamIndex = 2, sourceCard = null, handoffPayload = null) {
    if (!blogId) return;
    openMobileEmbedShell({
        embedUrl: `/${blogId}?embed=1`,
        readyId: String(blogId),
        seamIndex,
        sourceCard,
        handoffPayload,
        historyState: { blogId: String(blogId) },
    });
}

function openMobileAuthorPage(authorName, sourceCard = null) {
    const handle = String(authorName || '').trim();
    if (!handle) return;
    void ensureAuthorBioClosed();
    void ensureArticlePreviewClosed();
    if (sourceCard) void anchorMobilePaneToViewport(sourceCard);
    writeAuthorBioHandoffForOpen(handle);
    void fetchAuthorProfile(handle).then((profile) => {
        const posts = authorHomeProfiles[handle]?.posts || [];
        try {
            sessionStorage.setItem(
                AUTHOR_BIO_HANDOFF_KEY,
                JSON.stringify({
                    handle,
                    profile,
                    posts,
                    ts: Date.now(),
                })
            );
        } catch (_) {}
    });
    openMobileEmbedShell({
        embedUrl: `/author/${encodeURIComponent(handle)}?embed=1`,
        readyId: authorEmbedReadyId(handle),
        seamIndex: SEAM_BY_SECTION[5] || 3,
        sourceCard,
        historyState: { author: handle },
        revealFallbackMs: MOBILE_AUTHOR_REVEAL_FALLBACK_MS,
    });
}

function clearAuthorMobileReaderSeam() {
    if (document.body.getAttribute('data-open-seam') === 'author-right') {
        document.body.removeAttribute('data-open-seam');
    }
}

function closeMobileInAppReader(options = {}) {
    const fromPopstate = Boolean(options.fromPopstate);
    if (!document.body.classList.contains('mobile-reader-open')) {
        mobileReaderHistoryPushed = false;
        return;
    }

    const closeSeq = ++mobileReaderCloseSeq;
    if (mobileReaderClosingTimer) {
        clearTimeout(mobileReaderClosingTimer);
        mobileReaderClosingTimer = null;
    }

    document.body.classList.add('article-closing');
    document.body.classList.remove('article-open');
    const closingAuthorReader = Boolean(mobileReaderOpenAuthorHandle);
    if (authorBioHighlightClearTimer) {
        clearTimeout(authorBioHighlightClearTimer);
        authorBioHighlightClearTimer = null;
    }
    if (closingAuthorReader && homeDirectArticleTapNav()) {
        authorBioHighlightClearTimer = setTimeout(() => {
            authorBioHighlightClearTimer = null;
            if (closeSeq !== mobileReaderCloseSeq) return;
            clearAuthorBioHighlight();
        }, getMobileAuthorCloseMs());
    }
    requestAnimationFrame(() => {
        if (closeSeq !== mobileReaderCloseSeq) return;
        if (closingAuthorReader) {
            clearAuthorMobileReaderSeam();
        } else {
            clearActivePreviewSeam();
        }
    });

    if (mobileReaderShellEl) {
        mobileReaderShellEl.classList.add('mobile-reader-closing');
    }

    mobileReaderClosingTimer = setTimeout(() => {
        if (closeSeq !== mobileReaderCloseSeq) return;
        mobileReaderClosingTimer = null;

        const hadAuthorReader = Boolean(mobileReaderOpenAuthorHandle);
        document.body.classList.remove(
            'article-closing',
            'mobile-reader-open',
            'mobile-author-reader-open'
        );
        mobileReaderPendingOpen = null;
        mobileReaderOpenAuthorHandle = null;
        if (mobileReaderShellEl) {
            stopMobileReaderShellWarm();
            mobileReaderShellEl.hidden = true;
            mobileReaderShellEl.setAttribute('aria-hidden', 'true');
            mobileReaderShellEl.classList.remove('mobile-reader-closing');
        }
        clearPreviewSourceHighlight();
        if (hadAuthorReader) {
            if (authorBioHighlightClearTimer) {
                clearTimeout(authorBioHighlightClearTimer);
                authorBioHighlightClearTimer = null;
            }
            clearAuthorBioHighlight();
        }
        // Keep src so a reopen of the same piece can paint immediately; blank only on leave.
        if (mobileReaderFrameEl && options.clearFrame) {
            mobileReaderFrameEl.removeAttribute('src');
        }

        const hadHistory = mobileReaderHistoryPushed;
        mobileReaderHistoryPushed = false;

        if (!fromPopstate && hadHistory) {
            history.back();
        }
    }, getArticlePreviewRevealMs());
}

const CONTENT_TYPES = ['scene_report', 'interview', 'opinion', 'ideas'];
const SEAM_BY_SECTION = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 };
const SECTION_LABELS = {
    1: '#SCENE',
    2: 'interview',
    3: 'opinion',
    4: 'ideas'
};

function englishOrdinalDay(n) {
    const j = n % 10;
    const k = n % 100;
    if (k >= 11 && k <= 13) return `${n}th`;
    if (j === 1) return `${n}st`;
    if (j === 2) return `${n}nd`;
    if (j === 3) return `${n}rd`;
    return `${n}th`;
}

function formatPublishedReadable(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    const month = d.toLocaleDateString('en-US', { month: 'long' });
    return `${englishOrdinalDay(d.getDate())} of ${month} ${d.getFullYear()}`;
}

function mastheadAuthorColor(name) {
    const s = String(name || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const hue = (h >>> 0) % 360;
    return `hsl(${hue}, 66%, 42%)`;
}

function createPreviewNodeFromLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('#')) {
        const marks = (trimmed.match(/^#+/) || [''])[0].length;
        const level = Math.min(6, Math.max(1, marks));
        const h = document.createElement(`h${level}`);
        h.textContent = trimmed.slice(marks).trim();
        return h;
    }
    // Legacy markdown image: ![alt](src)
    if (trimmed.startsWith('![')) {
        const close = trimmed.indexOf('](');
        if (close > 1 && trimmed.endsWith(')')) {
            const img = document.createElement('img');
            img.className = 'article-image';
            img.setAttribute('data-display', 'block');
            img.alt = trimmed.slice(2, close);
            img.src = trimmed.slice(close + 2, -1);
            return img;
        }
        return null;
    }
    const p = document.createElement('p');
    p.textContent = trimmed;
    return p;
}

function isPreviewImageBlock(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.tagName === 'IMG') return true;
    if (el.tagName === 'FIGURE' || el.tagName === 'P') {
        const imgs = el.querySelectorAll('img');
        return imgs.length > 0 && !(el.textContent || '').trim();
    }
    return false;
}

/** Shrink a block image so it can sit on the preview page instead of being dropped. */
function constrainPreviewImageToBudget(bodyEl, node, budget) {
    const img = node.tagName === 'IMG' ? node : node.querySelector('img');
    if (!img || !bodyEl) return false;
    bodyEl.appendChild(node);
    void bodyEl.offsetHeight;
    if (previewBodyFitsBudget(bodyEl, budget)) return true;

    bodyEl.removeChild(node);
    void bodyEl.offsetHeight;
    const remaining = budget - previewBodyContentExtent(bodyEl);
    if (remaining < 56) return false;

    img.style.maxHeight = `${Math.floor(remaining)}px`;
    img.style.width = 'auto';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.objectFit = 'contain';
    bodyEl.appendChild(node);
    void bodyEl.offsetHeight;
    if (previewBodyFitsBudget(bodyEl, budget)) return true;

    bodyEl.removeChild(node);
    return false;
}

function articleBlocksFromRaw(rawArticle) {
    const source = String(rawArticle || '').trim();
    if (!source) return [];

    if (source.includes('<') && source.includes('>')) {
        const container = document.createElement('div');
        container.innerHTML = source;
        const blocks = [];
        container.childNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node;
                if (el.matches('p[data-variant="footnote"]')) return;
                blocks.push(el.cloneNode(true));
            } else if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim()) {
                const p = document.createElement('p');
                p.textContent = node.textContent.trim();
                blocks.push(p);
            }
        });
        return blocks;
    }

    return source
        .split('\n')
        .map(createPreviewNodeFromLine)
        .filter(Boolean);
}

function copyPreviewElementShell(from, to) {
    if (!from || !to) return;
    if (from.className) to.className = from.className;
    for (let i = 0; i < from.attributes.length; i++) {
        const attr = from.attributes[i];
        if (attr.name === 'class' || attr.name === 'id') continue;
        to.setAttribute(attr.name, attr.value);
    }
}

function wrapSplitParagraphForPreview(p, sourceBlock) {
    if (!p) return null;
    if (!sourceBlock) return p;
    if (sourceBlock.tagName === 'BLOCKQUOTE') {
        const shell = sourceBlock.cloneNode(false);
        const modelP =
            sourceBlock.querySelector('p:not([data-variant="attribution"])') ||
            sourceBlock.querySelector('p');
        if (modelP) copyPreviewElementShell(modelP, p);
        shell.appendChild(p);
        return shell;
    }
    if (sourceBlock.tagName === 'P') {
        copyPreviewElementShell(sourceBlock, p);
    }
    return p;
}

/** Same band formula as blog.js footnoteBandHeight — reserve even though preview omits the strip. */
function previewFootnoteBandHeight(pageEl) {
    const h = pageEl ? pageEl.clientHeight : 0;
    if (h <= 0) return 112;
    return Math.min(168, Math.max(96, Math.round(h * 0.155)));
}

function previewPageHasFootnoteRefs(bodyEl, extraEl) {
    if (bodyEl && bodyEl.querySelector && bodyEl.querySelector('.footnote-ref')) return true;
    if (extraEl && extraEl.querySelector && extraEl.querySelector('.footnote-ref')) return true;
    return false;
}

/** Body height budget matching reader page-1 packing (flex leftover minus footnote band when needed). */
function previewBodyHeightBudget(bodyEl, extraEl) {
    if (!bodyEl) return 0;
    void bodyEl.offsetHeight;
    let budget = bodyEl.clientHeight;
    if (previewPageHasFootnoteRefs(bodyEl, extraEl)) {
        const pageEl = bodyEl.closest('.home-preview-page, .article-page');
        budget -= previewFootnoteBandHeight(pageEl);
    }
    return Math.max(32, budget);
}

/**
 * Laid-out content bottom inside the preview body.
 * Do not use scrollHeight: .home-preview-body is flex-stretched, so scrollHeight
 * stays ≈ clientHeight even when only a few lines of content are present — and
 * that falsely fails once the footnote band shrinks the budget below clientHeight.
 */
function previewBodyContentExtent(bodyEl) {
    if (!bodyEl || !bodyEl.children.length) return 0;
    void bodyEl.offsetHeight;
    let maxBottom = 0;
    for (const child of bodyEl.children) {
        const cs = getComputedStyle(child);
        const mb = parseFloat(cs.marginBottom) || 0;
        maxBottom = Math.max(maxBottom, child.offsetTop + child.offsetHeight + mb);
    }
    return maxBottom;
}

function previewBodyFitsBudget(bodyEl, budget) {
    return previewBodyContentExtent(bodyEl) <= budget + 1;
}

function pruneEmptyInlineNodesForPreview(root) {
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

/** Mirror blog.js splitNodeAtWordBoundary — keep inline markup on the left fragment. */
function splitPreviewNodeAtWordBoundary(leftRoot, rightRoot, splitWordIndex) {
    const leftWalker = document.createTreeWalker(leftRoot, NodeFilter.SHOW_TEXT);
    const rightWalker = document.createTreeWalker(rightRoot, NodeFilter.SHOW_TEXT);
    let wordCount = 0;
    const leftNodes = [];
    const rightNodes = [];
    let node;
    while ((node = leftWalker.nextNode())) leftNodes.push(node);
    while ((node = rightWalker.nextNode())) rightNodes.push(node);

    let splitDone = false;
    for (let i = 0; i < leftNodes.length; i++) {
        const ln = leftNodes[i];
        const rn = rightNodes[i];
        if (splitDone) {
            ln.textContent = '';
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
            wordCount += nodeWordIdx;
        } else {
            rn.textContent = '';
            wordCount += nodeWordIdx;
        }
    }

    pruneEmptyInlineNodesForPreview(leftRoot);
}

/**
 * Split a paragraph/blockquote like the reader: no ellipsis, same word thresholds,
 * probe with plain text then apply a markup-preserving cut.
 */
function splitPreviewBlockToFit(bodyEl, sourceBlock) {
    if (!bodyEl || !sourceBlock) return null;

    let paragraphEl = null;
    if (sourceBlock.tagName === 'P') {
        paragraphEl = sourceBlock;
    } else if (sourceBlock.tagName === 'BLOCKQUOTE') {
        paragraphEl =
            sourceBlock.querySelector('p:not([data-variant="attribution"])') ||
            sourceBlock.querySelector('p');
    }
    if (!paragraphEl || paragraphEl.tagName !== 'P') return null;

    const text = (paragraphEl.textContent || '').trim();
    if (!text) return null;
    const words = text.split(/\s+/);
    if (words.length < 12) return null;

    const budget = previewBodyHeightBudget(bodyEl, sourceBlock);
    if (budget < 32) return null;

    let low = 1;
    let high = words.length - 1;
    let best = 0;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const probe = document.createElement('p');
        probe.textContent = words.slice(0, mid).join(' ');
        const wrapped = wrapSplitParagraphForPreview(probe, sourceBlock);
        bodyEl.appendChild(wrapped);
        void bodyEl.offsetHeight;
        const fits = previewBodyFitsBudget(bodyEl, budget);
        bodyEl.removeChild(wrapped);
        if (fits) {
            best = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    if (best <= 3 || best >= words.length - 3) return null;

    if (sourceBlock.tagName === 'P') {
        const leftPart = sourceBlock.cloneNode(true);
        const rightPart = sourceBlock.cloneNode(true);
        splitPreviewNodeAtWordBoundary(leftPart, rightPart, best);
        return leftPart;
    }

    // Blockquote: cut the main paragraph; drop attribution on the preview fragment.
    const leftQuote = sourceBlock.cloneNode(false);
    const leftP = paragraphEl.cloneNode(true);
    const rightP = paragraphEl.cloneNode(true);
    splitPreviewNodeAtWordBoundary(leftP, rightP, best);
    leftQuote.appendChild(leftP);
    return leftQuote;
}

function isAuthorPageBreakElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.tagName !== 'HR') return false;
    return (
        el.getAttribute('data-page-break') === 'true' ||
        el.getAttribute('data-variant') === 'page-break'
    );
}

function fitPreviewBlocksToPage(bodyEl, blocks) {
    if (!bodyEl) return;
    bodyEl.innerHTML = '';
    void bodyEl.offsetHeight;

    for (let i = 0; i < blocks.length; i++) {
        const node = blocks[i].cloneNode(true);
        // First-page preview: stop at an author page break (later pages not shown).
        if (isAuthorPageBreakElement(node)) break;

        const budget = previewBodyHeightBudget(bodyEl, null);

        if (isPreviewImageBlock(node)) {
            // Images can't be word-split; scale to fit or skip and keep packing text.
            if (!constrainPreviewImageToBudget(bodyEl, node, budget)) continue;
            continue;
        }

        bodyEl.appendChild(node);
        void bodyEl.offsetHeight;
        if (previewBodyFitsBudget(bodyEl, budget)) continue;

        bodyEl.removeChild(node);
        const split = splitPreviewBlockToFit(bodyEl, blocks[i]);
        if (split) bodyEl.appendChild(split);
        break;
    }
}

function prefetchPreviewBlockImages(blocks) {
    const urls = new Set();
    (blocks || []).forEach((block) => {
        if (!block) return;
        if (block.tagName === 'IMG' && block.src) urls.add(block.src);
        else if (block.querySelectorAll) {
            block.querySelectorAll('img').forEach((img) => {
                if (img.src) urls.add(img.src);
            });
        }
    });
    if (!urls.size) return Promise.resolve();
    return Promise.all(
        [...urls].map(
            (src) =>
                new Promise((resolve) => {
                    const im = new Image();
                    im.onload = im.onerror = () => resolve();
                    im.src = src;
                })
        )
    );
}

function buildHomePreviewByline(author, published) {
    const byline = document.createElement('div');
    byline.className = 'article-byline home-preview-byline';

    const byWord = document.createElement('span');
    byWord.className = 'article-byline-by home-preview-byline-by';
    byWord.textContent = 'by';
    byline.appendChild(byWord);

    const handle = String(author || '').replace(/^@+/, '') || 'Anonymous';
    let authorEl;
    if (typeof ContentRefs !== 'undefined' && ContentRefs.htmlForSelection) {
        const tmp = document.createElement('span');
        tmp.innerHTML = ContentRefs.htmlForSelection('author', { id: handle });
        authorEl = tmp.firstElementChild || document.createElement('a');
        authorEl.classList.add('article-byline-author', 'home-preview-byline-author');
        const img = authorEl.querySelector('.content-ref-author-avatar');
        const fallback = avatarUrlForAuthor(handle);
        if (img && fallback && !img.getAttribute('src')) img.src = fallback;
        else if (!img && fallback) {
            const avatarImg = document.createElement('img');
            avatarImg.className = 'content-ref-author-avatar home-preview-byline-avatar';
            avatarImg.src = fallback;
            avatarImg.alt = '';
            avatarImg.width = 14;
            avatarImg.height = 14;
            avatarImg.decoding = 'async';
            authorEl.insertBefore(avatarImg, authorEl.firstChild);
        }
    } else {
        authorEl = document.createElement('span');
    authorEl.className = 'article-byline-author home-preview-byline-author';
        const avatarUrl = avatarUrlForAuthor(handle);
        if (avatarUrl) {
            const avatarImg = document.createElement('img');
            avatarImg.className = 'home-preview-byline-avatar';
            avatarImg.src = avatarUrl;
            avatarImg.alt = '';
            avatarImg.width = 14;
            avatarImg.height = 14;
            avatarImg.decoding = 'async';
            authorEl.appendChild(avatarImg);
        }
        const authorName = document.createElement('span');
        authorName.className = 'home-preview-byline-author-name';
        authorName.textContent = handle;
        authorEl.appendChild(authorName);
    }
    authorEl.style.color = mastheadAuthorColor(handle);
    byline.appendChild(authorEl);
    if (typeof ContentRefs !== 'undefined' && ContentRefs.enhanceAuthorRefs) {
        ContentRefs.enhanceAuthorRefs(byline);
    }

    if (published) {
        const onThe = document.createElement('span');
        onThe.className = 'article-byline-onthe home-preview-byline-onthe';
        onThe.textContent = 'on the';
        byline.appendChild(onThe);

        const dateEl = document.createElement('span');
        dateEl.className = 'article-byline-date home-preview-byline-date';
        dateEl.textContent = published;
        byline.appendChild(dateEl);
    }

    return byline;
}

function wrapHomePreviewTitleBlock(headingEl, author, published) {
    const wrap = document.createElement('header');
    wrap.className = 'article-title-block';
    headingEl.classList.add('title', 'home-preview-title');
    headingEl.setAttribute('data-doc-title', 'true');
    wrap.appendChild(headingEl);
    wrap.appendChild(buildHomePreviewByline(author, published));
    return wrap;
}

function renderFirstPagePreview(panelEl, payload, onReady) {
    if (!panelEl) return;
    const mount = panelEl.querySelector('#article-first-page');
    if (!mount) return;

    const title = payload.title || '';
    const author = payload.author || 'Anonymous';
    const published = formatPublishedReadable(payload.publishedAt);
    const blocks = articleBlocksFromRaw(payload.article);
    const metaTitle = String(title || '').replace(/\s+/g, ' ').trim();
    let titleBlockIndex = blocks.findIndex(
        (el) => el && el.getAttribute && el.getAttribute('data-doc-title') === 'true'
    );
    if (titleBlockIndex < 0 && metaTitle) {
        titleBlockIndex = blocks.findIndex(
            (el) =>
                el &&
                /^H[1-3]$/.test(el.tagName) &&
                (el.textContent || '').replace(/\s+/g, ' ').trim() === metaTitle
        );
    }
    const titleTravelsInBody = titleBlockIndex >= 0;

    mount.innerHTML = '';

    const page = document.createElement('article');
    page.className = 'article-page article-page-left article-page-first home-preview-page';

    if (!titleTravelsInBody) {
        const masthead = document.createElement('section');
        masthead.className = 'article-inline-masthead home-preview-masthead';

        const h1 = document.createElement('h1');
        h1.className = 'title home-preview-title';
        h1.textContent = title;
        masthead.appendChild(h1);
        masthead.appendChild(buildHomePreviewByline(author, published));
    page.appendChild(masthead);
    } else {
        blocks[titleBlockIndex] = wrapHomePreviewTitleBlock(
            blocks[titleBlockIndex],
            author,
            published
        );
    }

    const body = document.createElement('div');
    body.className = 'article-page-body home-preview-body';
    page.appendChild(body);

    const pageNumber = document.createElement('div');
    pageNumber.className = 'article-page-number home-preview-page-number';
    pageNumber.textContent = '1';
    page.appendChild(pageNumber);

    if (typeof onReady === 'function') {
        panelEl.classList.add('article-preview-layout');
    }
    mount.appendChild(page);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            prefetchPreviewBlockImages(blocks).finally(() => {
            fitPreviewBlocksToPage(body, blocks);
                if (typeof ContentRefs !== 'undefined' && ContentRefs.linkifyElement) {
                    ContentRefs.linkifyElement(body);
                }
            if (typeof onReady === 'function') {
                requestAnimationFrame(() => {
                    void panelEl.offsetHeight;
                    panelEl.classList.remove('article-preview-layout');
                    onReady();
                });
            }
            });
        });
    });
}

// Physics object class for cards and popup
class PhysicsObject {
    constructor(element, x, y, width, height, mass = 1) {
        this.element = element; // DOM element
        this.x = x; // Current x position
        this.y = y; // Current y position
        this.width = width;
        this.height = height;
        this.mass = mass;
        this.vx = 0; // Velocity x
        this.vy = 0; // Velocity y
        this.restX = x; // Rest position x
        this.restY = y; // Rest position y
        this.isPopup = false; // Whether this is the popup
        this.isAttractedToRest = false; // Whether to attract to rest position
    }

    // Get current bounds
    getBounds() {
        // Use actual DOM element position for accurate collision detection
        const rect = this.element.getBoundingClientRect();
        return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom
        };
    }

    // Check collision with another object
    collidesWith(other) {
        const bounds1 = this.getBounds();
        const bounds2 = other.getBounds();
        
        // Add collision tolerance to prevent false positives from tiny overlaps
        const tolerance = 2; // 2px tolerance for collisions
        
        return !(bounds1.right + tolerance < bounds2.left || 
                bounds1.left > bounds2.right + tolerance || 
                bounds1.bottom + tolerance < bounds2.top || 
                bounds1.top > bounds2.bottom + tolerance);
    }

    // Update position based on velocity
    update(deltaTime) {
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        
        // Update DOM element position
        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
    }
}

// Physics simulation functions
function startPhysics() {
    if (physicsActive) return;
    physicsActive = true;
    physicsLoop();
}

function stopPhysics() {
    physicsActive = false;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function physicsLoop() {
    if (!physicsActive) return;
    
    const deltaTime = 1/60; // 60 FPS for smoother physics
    updatePhysics(deltaTime);
    
    animationFrameId = requestAnimationFrame(physicsLoop);
}

function updatePhysics(deltaTime) {
    // Handle growing popup
    if (popup && popup.growing) {
        // Grow the popup
        const growthAmount = popup.growthSpeed;
        popup.width += growthAmount;
        popup.height += growthAmount;
        
        // Cap the size to prevent growing too large
        if (popup.width > popup.finalWidth) {
            popup.width = popup.finalWidth;
        }
        if (popup.height > popup.finalHeight) {
            popup.height = popup.finalHeight;
        }
        
        // Keep centered by adjusting position
        const newX = window.innerWidth / 2 - popup.width / 2;
        const newY = window.innerHeight / 2 - popup.height / 2;
        popup.x = newX;
        popup.y = newY;
        
        // Update DOM element
        popup.element.style.width = `${popup.width}px`;
        popup.element.style.height = `${popup.height}px`;
        popup.element.style.left = `${popup.x}px`;
        popup.element.style.top = `${popup.y}px`;
        
        // Stop growing when reaching final size
        if (popup.width >= popup.finalWidth) {
            popup.growing = false;
            // When fully grown, stop pushing titles further
            popup.pushing = false;
            // Freeze residual motion immediately so titles stop
            physicsObjects.forEach(obj => {
                if (!obj.isPopup) {
                    obj.vx = 0;
                    obj.vy = 0;
                }
            });
            // Ensure popup stays fixed
            popup.vx = 0; popup.vy = 0;
            console.log('Popup finished growing at:', popup.width, 'x', popup.height);
        }
    }
    
    // Handle shrinking popup (triggered on hover-out)
    if (popup && popup.shrinking) {
        const shrinkAmount = popup.shrinkSpeed || 12;
        popup.width = Math.max(10, popup.width - shrinkAmount);
        popup.height = Math.max(10, popup.height - shrinkAmount);
        
        const newX = window.innerWidth / 2 - popup.width / 2;
        const newY = window.innerHeight / 2 - popup.height / 2;
        popup.x = newX;
        popup.y = newY;
        
        popup.element.style.width = `${popup.width}px`;
        popup.element.style.height = `${popup.height}px`;
        popup.element.style.left = `${popup.x}px`;
        popup.element.style.top = `${popup.y}px`;
        
        // When small enough, remove popup and let cards continue returning to rest
        if (popup.width <= 12 || popup.height <= 12) {
            // Remove popup element
            if (popup.element.parentNode) {
                popup.element.parentNode.removeChild(popup.element);
            }
            // Remove from physics array
            const idx = physicsObjects.indexOf(popup);
            if (idx > -1) physicsObjects.splice(idx, 1);
            popup = null;
            // Keep physics running until all cards reach their rest positions
        }
    }
    
    // Card-card collisions while moving (domino effect) ONLY while popup is pushing.
    // During return-to-rest, we disable card-card collisions so titles don't block each other.
    if (popup && popup.pushing) {
        for (let i = 0; i < physicsObjects.length; i++) {
            const obj = physicsObjects[i];
            if (!obj.isPopup && (Math.abs(obj.vx) > 0.1 || Math.abs(obj.vy) > 0.1)) {
                for (let j = 0; j < physicsObjects.length; j++) {
                    if (j === i) continue;
                    const otherObj = physicsObjects[j];
                    if (!otherObj.isPopup && obj.collidesWith(otherObj)) {
                        resolveCollision(obj, otherObj);
                    }
                }
            }
        }
    }

    // Repulsion system: popup creates a force field that pushes cards away from its edges
    if (popup && (popup.pushing || popup.growing)) {
        const popupBounds = popup.getBounds();
        
        let repulsionApplied = 0;
        physicsObjects.forEach(obj => {
            if (obj.isPopup) return;
            
            const objBounds = obj.getBounds();
            const objCenterX = objBounds.left + objBounds.width / 2;
            const objCenterY = objBounds.top + objBounds.height / 2;
            
            // Check if card is overlapping with popup or very close to it
            const overlapX = Math.min(objBounds.right, popupBounds.right) - Math.max(objBounds.left, popupBounds.left);
            const overlapY = Math.min(objBounds.bottom, popupBounds.bottom) - Math.max(objBounds.top, popupBounds.top);
            
            // If there's overlap or the card is very close, apply repulsion
            const minDistance = 20; // Minimum distance before repulsion kicks in
            const isOverlapping = overlapX > 0 && overlapY > 0;
            const isClose = (overlapX > -minDistance && overlapX < minDistance) || 
                          (overlapY > -minDistance && overlapY < minDistance);
            
            if (isOverlapping || isClose) {
                // Calculate repulsion direction based on which edge is closest
                const distances = {
                    left: Math.abs(objBounds.right - popupBounds.left),
                    right: Math.abs(objBounds.left - popupBounds.right),
                    top: Math.abs(objBounds.bottom - popupBounds.top),
                    bottom: Math.abs(objBounds.top - popupBounds.bottom)
                };
                
                const closestEdge = Object.keys(distances).reduce((a, b) => distances[a] < distances[b] ? a : b);
                
                let forceX = 0, forceY = 0;
                const repulsionStrength = 15.0; // Much stronger than card-to-card forces
                
                switch (closestEdge) {
                    case 'left':
                        forceX = -repulsionStrength; // Push left
                        break;
                    case 'right':
                        forceX = repulsionStrength; // Push right
                        break;
                    case 'top':
                        forceY = -repulsionStrength; // Push up
                        break;
                    case 'bottom':
                        forceY = repulsionStrength; // Push down
                        break;
                }
                
                // Apply the repulsion force
                obj.vx += forceX;
                obj.vy += forceY;
                repulsionApplied++;
            }
        });
        
        // Debug logging
        if (repulsionApplied > 0) {
            console.log(`Repulsion applied to ${repulsionApplied} cards from popup edges`);
        }
    }

    // Apply attraction to rest positions even if popup is gone
    physicsObjects.forEach(obj => {
        if (obj.isAttractedToRest && !obj.isPopup) {
            const dx = obj.restX - obj.x;
            const dy = obj.restY - obj.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) { // revert to earlier threshold
                const attractionForce = 0.1; // revert to earlier force
                obj.vx += (dx / distance) * attractionForce;
                obj.vy += (dy / distance) * attractionForce;
            } else {
                obj.x = obj.restX;
                obj.y = obj.restY;
                obj.vx = 0;
                obj.vy = 0;
            }
        }
    });

    // Update all objects every frame
    physicsObjects.forEach(obj => {
        // Add gentle damping to smooth out movement
        if (!obj.isPopup) {
            obj.vx *= 0.98; // Very light damping to allow movement
            obj.vy *= 0.98;
            
            // Cap speed to prevent cards from flying away
            const maxSpeed = 200; // Increased max speed
            const speed = Math.sqrt(obj.vx * obj.vx + obj.vy * obj.vy);
            if (speed > maxSpeed) {
                obj.vx = (obj.vx / speed) * maxSpeed;
                obj.vy = (obj.vy / speed) * maxSpeed;
            }
        }
        obj.update(deltaTime);
    });

    // If cards are returning to rest, stop physics only when all are settled
    const anyReturning = physicsObjects.some(o => !o.isPopup && o.isAttractedToRest);
    if (anyReturning) {
        const allSettled = physicsObjects.every(o => {
            if (o.isPopup) return true;
            const dx = Math.abs(o.restX - o.x);
            const dy = Math.abs(o.restY - o.y);
            const exactlyAtRest = dx === 0 && dy === 0;
            const stopped = Math.abs(o.vx) === 0 && Math.abs(o.vy) === 0;
            return exactlyAtRest && stopped;
        });
        if (allSettled) {
            physicsObjects.forEach(o => { if (!o.isPopup) o.isAttractedToRest = false; });
            stopPhysics();
        }
    }
}

function resolveCollision(obj1, obj2) {
    // Simple collision resolution - push objects apart
    const bounds1 = obj1.getBounds();
    const bounds2 = obj2.getBounds();
    
    // Calculate overlap
    const overlapX = Math.min(
        Math.max(0, bounds1.right - bounds2.left),
        Math.max(0, bounds2.right - bounds1.left)
    );
    const overlapY = Math.min(
        Math.max(0, bounds1.bottom - bounds2.top),
        Math.max(0, bounds2.bottom - bounds1.top)
    );
    
    // If either object is the popup, make the popup act as an immovable body
    const obj1IsPopup = !!obj1.isPopup;
    const obj2IsPopup = !!obj2.isPopup;

    // Softer impulse and popup attenuation
    const IMPULSE = 0.06; // was 0.12
    const popupAttenuation = (obj1IsPopup || obj2IsPopup) ? 0.6 : 1.0;
    const maxAxisSpeed = 180; // clamp per-axis speed

    // Push in the direction of least overlap
    if (overlapX < overlapY) {
        // Push horizontally
        if (bounds1.left < bounds2.left) {
            if (!obj1IsPopup) obj1.x -= overlapX * 0.5;
            if (!obj2IsPopup) obj2.x += overlapX * 0.5;
            if (!obj1IsPopup) obj1.vx -= Math.max(0.5, overlapX) * IMPULSE * popupAttenuation;
            if (!obj2IsPopup) obj2.vx += Math.max(0.5, overlapX) * IMPULSE * popupAttenuation;
        } else {
            if (!obj1IsPopup) obj1.x += overlapX * 0.5;
            if (!obj2IsPopup) obj2.x -= overlapX * 0.5;
            if (!obj1IsPopup) obj1.vx += Math.max(0.5, overlapX) * IMPULSE * popupAttenuation;
            if (!obj2IsPopup) obj2.vx -= Math.max(0.5, overlapX) * IMPULSE * popupAttenuation;
        }
    } else {
        // Push vertically
        if (bounds1.top < bounds2.top) {
            if (!obj1IsPopup) obj1.y -= overlapY * 0.5;
            if (!obj2IsPopup) obj2.y += overlapY * 0.5;
            if (!obj1IsPopup) obj1.vy -= Math.max(0.5, overlapY) * IMPULSE * popupAttenuation;
            if (!obj2IsPopup) obj2.vy += Math.max(0.5, overlapY) * IMPULSE * popupAttenuation;
        } else {
            if (!obj1IsPopup) obj1.y += overlapY * 0.5;
            if (!obj2IsPopup) obj2.y -= overlapY * 0.5;
            if (!obj1IsPopup) obj1.vy += Math.max(0.5, overlapY) * IMPULSE * popupAttenuation;
            if (!obj2IsPopup) obj2.vy -= Math.max(0.5, overlapY) * IMPULSE * popupAttenuation;
        }
    }
    
    // Clamp per-axis speeds to avoid blowouts
    [obj1, obj2].forEach(o => {
        if (!o.isPopup) {
            if (o.vx > maxAxisSpeed) o.vx = maxAxisSpeed;
            if (o.vx < -maxAxisSpeed) o.vx = -maxAxisSpeed;
            if (o.vy > maxAxisSpeed) o.vy = maxAxisSpeed;
            if (o.vy < -maxAxisSpeed) o.vy = -maxAxisSpeed;
        }
    });
    
    // Immediately update DOM positions to prevent overlapping
    if (!obj1IsPopup) {
        obj1.element.style.left = `${obj1.x}px`;
        obj1.element.style.top = `${obj1.y}px`;
    }
    if (!obj2IsPopup) {
        obj2.element.style.left = `${obj2.x}px`;
        obj2.element.style.top = `${obj2.y}px`;
    }
}

function createPopup(blogData) {
    console.log('createPopup called with:', blogData);
    // Create popup element
    const popupElement = document.createElement('div');
    popupElement.className = 'blog-popup';
    popupElement.innerHTML = `
        <div class="popup-content">
            <h2 class="popup-title">${blogData.title}</h2>
            <p class="popup-preview">${blogData.preview || 'Preview text not available'}</p>
        </div>
    `;
    
    // Style the popup - start small and centered
    const startSize = 50;
    const finalWidth = window.innerWidth * 0.6; // 60% width
    const finalHeight = window.innerHeight * 0.55; // 55% height
    const screenCenterX = window.innerWidth / 2;
    const screenCenterY = window.innerHeight / 2;
    
    console.log('Popup target size:', finalWidth, 'x', finalHeight);
    
    popupElement.style.cssText = `
        position: absolute;
        background: white;
        color: black;
        border-radius: 0;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 1000;
        overflow: hidden;
        cursor: pointer;
        left: ${screenCenterX - startSize/2}px;
        top: ${screenCenterY - startSize/2}px;
        width: ${startSize}px;
        height: ${startSize}px;
        clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 0, 100% calc(100% - 20px), 100% 100%, 20px 100%, 0 100%, 0 20px);
    `;
    
    // Add hover dismissal
    popupElement.addEventListener('mouseleave', () => {
        dismissPopup();
    });
    
    document.body.appendChild(popupElement);
    
    // Create physics object for popup - start small and grow
    popup = new PhysicsObject(popupElement, screenCenterX - startSize/2, screenCenterY - startSize/2, startSize, startSize, 10);
    popup.isPopup = true;
    popup.finalWidth = finalWidth;
    popup.finalHeight = finalHeight;
    popup.growing = true;
    popup.pushing = true; // while growing, affects titles
    popup.growthSpeed = 8; // restore earlier growth speed
    
    return popup;
}

function dismissPopup() {
    if (!popup) return;
    
    // Begin shrink instead of instant removal; attract cards back to rest
    popup.growing = false;
    popup.pushing = false;
    popup.shrinking = true;
    popup.shrinkSpeed = 20;
    
    physicsObjects.forEach(obj => {
        if (!obj.isPopup) {
            obj.isAttractedToRest = true;
        }
    });
}

const HOME_WALL_CACHE_KEY = 'homeWallBlogsV1';

function readHomeWallCache() {
    try {
        const raw = sessionStorage.getItem(HOME_WALL_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.blogs) || !parsed.blogs.length) return null;
        if (Date.now() - (parsed.savedAt || 0) > 45 * 60 * 1000) return null;
        return parsed.blogs.map((entry) => ({
            id: entry.id,
            data: () => entry.data || {},
        }));
    } catch (_) {
        return null;
    }
}

function writeHomeWallCache(snap) {
    try {
        const blogs = snap.docs.map((d) => {
            const data = d.data() || {};
            return {
                id: d.id,
                data: {
                    title: data.title || '',
                    author: data.author || '',
                    publishedAt: data.publishedAt || '',
                    lastModified: data.lastModified || '',
                    contentType: data.contentType || '',
                    preview:
                        typeof data.preview === 'string' ? data.preview.slice(0, 600) : '',
                    // Omit full article HTML from cache — fetch on preview click.
                },
            };
        });
        sessionStorage.setItem(
            HOME_WALL_CACHE_KEY,
            JSON.stringify({ savedAt: Date.now(), blogs })
        );
    } catch (_) {
        /* quota / private mode */
    }
}

async function ensureBlogCardArticle(card) {
    if (!card) return '';
    if (card.dataset.article) return card.dataset.article;
    const id = card.dataset.blogId;
    if (!id || !db) return '';
    try {
        const snap = await db.collection('blogs').doc(id).get();
        const article =
            snap.exists && typeof snap.data().article === 'string' ? snap.data().article : '';
        card.dataset.article = article;
        return article;
    } catch (_) {
        return '';
    }
}

let homeWallMounted = false;

function mountHomeWall(blogs) {
    const existingSection = document.querySelector('.blogs-section');
    if (existingSection) existingSection.remove();

    const stage = document.createElement('div');
    stage.className = 'home-main-stage';
    // Hide until cards are absolutely positioned — avoids a flow→absolute jump (titles “move up”).
    stage.style.visibility = 'hidden';
    const track = document.createElement('div');
    track.className = 'home-main-track';

    const sections = {};
    for (let i = 1; i <= 5; i++) {
        const section = document.createElement('div');
        section.className = `blogs-section column-section ${i === 5 ? 'author-section' : 'title-section'}`;
        section.dataset.col = String(i);
        section.style.cssText = `
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            width: 100%;
            box-sizing: border-box;
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
        `;
        const pane = document.createElement('div');
        pane.className = 'home-main-pane';
        pane.dataset.col = String(i);
        pane.appendChild(section);
        track.appendChild(pane);
        sections[i] = section;
    }
    stage.appendChild(track);
    // Returning visits: lock final stage pose before first paint of the grid.
    if (isHomeEntryDismissed() || hasPendingAdminHomeAction()) {
        document.body.classList.add('home-titles-instant');
        document.body.classList.add('home-titles-visible');
    }
    document.body.appendChild(stage);
    initHomeActiveColumnFromScroll(track);
    const authorSection = sections[5];
    for (let i = 1; i <= 4; i++) {
        createSectionTitleCard(sections[i], SECTION_LABELS[i]);
    }
    initMobileSectionTitleTapLines();
    
    const pathBlogId = decodePathSegment(location.pathname.split('/').filter(Boolean).pop() || '');
    blogs.forEach(blog => {
        if (blog.id != pathBlogId) {
            const doc = blog.data();
            const authorName = doc.author ? doc.author.split('@')[0] : 'Anonymous';
            noteAuthorLatestPost(authorName, blog, doc);
            const contentType = getContentTypeForDoc(blog.id, doc);
            const sectionIndex = contentTypeToSection(contentType);
            const card = createBlogCard(blog, sections[sectionIndex], sectionIndex);
            if (card && typeof doc.article === 'string') {
                const blogCardEl = card.querySelector('.blog-card');
                if (blogCardEl) blogCardEl.dataset.article = doc.article;
            }
        }
    });
    
    // New layout: auth/editor controls will live in the bottom-right of author section
    
    // Create author cards in the author section
    const uniqueAuthors = new Set();
    blogs.forEach(blog => {
        if (blog.id != pathBlogId) {
            const authorName = blog.data().author ? blog.data().author.split('@')[0] : 'Anonymous';
            if (!uniqueAuthors.has(authorName)) {
                uniqueAuthors.add(authorName);
                createAuthorCard(authorName, authorSection);
            }
        }
    });
    
    // Ensure Anonymous is always included
    if (!uniqueAuthors.has('Anonymous')) {
        createAuthorCard('Anonymous', authorSection);
        uniqueAuthors.add('Anonymous');
    }

    // Warm profiles after first paint — don’t block the wall on N author fetches.
    const warmAuthorProfiles = () => {
        Array.from(uniqueAuthors).forEach((name) => {
            fetchAuthorProfile(name).then((profile) => {
                syncAuthorCardEmoji(name);
                const avatar = normalizeClientAvatarPath(profile.avatar);
                if (avatar) {
                    authorAvatarByName[name] = avatar;
                    const panel = document.querySelector('.bio-panel');
                    if (panel && panel.dataset.author === name) {
                        const img = document.getElementById('bio-avatar');
                        if (img && img.getAttribute('src') !== avatar) img.src = avatar;
                    }
                }
            });
        });
    };
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(warmAuthorProfiles, { timeout: 2200 });
    } else {
        setTimeout(warmAuthorProfiles, 900);
    }

    // Desktop search control under author tags (hidden on mobile via CSS)
    createSearchCard(authorSection);
    
    // Add a static ABOUT card under authors
    createAboutCard(authorSection);

    // About floating card (bio-card look — hover open, drag, click-away close)
    const aboutPopup = document.createElement('aside');
    aboutPopup.className = 'about-popup';
    aboutPopup.id = 'about-popup';
    aboutPopup.hidden = true;
    aboutPopup.setAttribute('role', 'dialog');
    aboutPopup.setAttribute('aria-label', 'About');
    aboutPopup.innerHTML = `
        <div class="about-popup-crest" aria-hidden="true">
            <img src="/img/about-stamp-figures.png?v=outlines-restore-2" alt="" draggable="false" />
        </div>
        <p class="about-popup-lead">All you need is good people.</p>
        <p>Good People Posting is a platform for writing drawn from ordinary life. We publish short texts that bear the mark of a particular person: one who was there, or one who could not let a thought go unwritten.</p>
        <p>Reading is open to all. Writing is admitted by application. Our work is to recover what conversation carries and to leave it where others may find it.</p>`;
    document.body.appendChild(aboutPopup);
    setupAboutPopupInteractions(aboutPopup);

    // Create top bio / search strip (reuse if author deep-link mounted it early)
    const bioPanel = ensureHomeBioPanel();

    // Article preview: real stone columns slide apart to reveal panel underneath (see home.css)
    const articlePanel = document.createElement('section');
    articlePanel.className = 'article-panel';
    articlePanel.innerHTML = `
        <button type="button" class="article-panel-close" aria-label="Close preview">×</button>
        <div id="article-first-page"></div>
    `;
    document.body.appendChild(articlePanel);
    ensureMobileReaderShell();

    console.log('Created author cards for:', Array.from(uniqueAuthors));
    
    // Auth controls before first layout so author-column measure is final.
    createAuthControls(authorSection);

    const layoutHomeColumns = () => {
    for (let i = 1; i <= 4; i++) {
        positionCardsInSection(sections[i]);
    }
        positionCardsInSection(authorSection, { startY: getFirstContentRowTop(sections) });
        layoutAuthControls();
        syncHomeActiveColumnRef?.();
    };

    let stageRevealed = false;
    const revealLaidOutStage = () => {
        if (stageRevealed) {
            layoutHomeColumns();
            return;
        }
        stageRevealed = true;
        layoutHomeColumns();
        // Show underlay panels and the wall in the same turn so bio/about
        // card outlines never flash while the stage is still hidden.
        document.body.classList.add('home-wall-ready');
        stage.style.visibility = '';
        // Open author bio only once the grid is actually visible.
        consumeHomeAuthorQuery();
    };

    // Don’t wait on Google fonts (Literata etc.) — Impact/system metrics are enough
    // for first paint; a short race avoids a long blank while webfonts download.
    const fontsReady =
        document.fonts && document.fonts.ready
            ? document.fonts.ready.catch(() => {})
            : Promise.resolve();
    Promise.race([fontsReady, new Promise((r) => setTimeout(r, 80))]).then(() => {
        revealLaidOutStage();
        requestAnimationFrame(layoutHomeColumns);
    });
    setTimeout(revealLaidOutStage, 280);
    
    // Add hover interactions after positioning (disable popup/physics in new design)
    setupHoverInteractions();
    
    const authorCardsForBio = Array.from(document.querySelectorAll('.blog-card.author-card')).filter(
        card => (card.getAttribute('data-author') || '').toLowerCase() !== 'about'
    );
    const bioEl = document.querySelector('.bio-panel');
    if (bioEl && authorCardsForBio.length) {
        const openBioFromClick = (authorName) => {
            if (isBioHoverQuiet()) return;
            cancelAuthorBioClosing();
            closeHomeSearchStrip({ switchToBio: true });
            closeAboutPopup();
            fillAuthorBioPanel(authorName);
            clearColumnTransformTransitions();
            document.body.classList.add('bio-open');
            // Mobile: apply highlight after the tap/:active frame so the chrome
            // doesn’t flash a wash before the solid tap-active state settles.
            if (homeDirectArticleTapNav()) {
                requestAnimationFrame(() => applyAuthorBioHighlight(authorName));
            } else {
                applyAuthorBioHighlight(authorName);
            }
            detachBioMoveCloser();
            requestAnimationFrame(() => {
                const strip = document.querySelector('.bio-panel-cards');
                if (strip) strip.scrollLeft = 0;
            });
        };

        authorCardsForBio.forEach((card) => {
            const name = card.getAttribute('data-author');
            installTapNotSwipe(card);
            // iOS can still flash a tap wash on the title hit-target in some cases.
            card.addEventListener(
                'touchstart',
                () => {
                    card.style.webkitTapHighlightColor = 'transparent';
                },
                { passive: true }
            );
            card.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (tapWasSwipe(card)) return;
                if (isBioHoverQuiet()) return;
                clearBioHoverTimer();

                if (homeDirectArticleTapNav()) {
                    if (isMobileAuthorReaderOpenFor(name)) {
                        closeMobileInAppReader();
                        return;
                    }
                    requestAnimationFrame(() => applyAuthorBioHighlight(name));
                    openMobileAuthorPage(name, card);
                    return;
                }

                const openAuthor = String(bioEl.dataset.author || '');
                const alreadyOpen =
                    (document.body.classList.contains('bio-open') ||
                        document.body.classList.contains('bio-closing')) &&
                    openAuthor.toLowerCase() === String(name || '').toLowerCase();
                if (alreadyOpen) {
                    closeHomeAuthorBio();
                    return;
                }
                const delay = AUTHOR_BIO_CLICK_DELAY_MS;
                bioHoverTimer = setTimeout(() => {
                    bioHoverTimer = null;
                    openBioFromClick(name);
                }, delay);
            });
        });

        // Dismiss only on click/tap outside the strip (not on mouseleave).
        // Title cards own their own sequence (bio shut → then preview open).
        const dismissBioIfOutside = (e) => {
            if (!document.body.classList.contains('bio-open')) return;
            if (isBioHoverQuiet()) return;
            // Taps on empty bio chrome (not a card) count as outside — the tall
            // strip was eating dismiss taps in the gap above the wall.
            if (e.target.closest('.bio-identity-card')) return;
            if (e.target.closest('.author-card')) return;
            if (
                e.target.closest(
                    '.title-section .cardcontainer[data-author] .blog-card:not(.author-card)'
                )
            ) {
                return;
            }
            if (e.target.closest('#auth-controls')) return;
            if (e.target.closest('.home-texture-switcher')) return;
            closeHomeAuthorBio();
        };
        document.addEventListener('click', dismissBioIfOutside, true);
        if (homeDirectArticleTapNav()) {
            document.addEventListener('pointerup', dismissBioIfOutside, true);
        }
    }

    const searchCard = document.getElementById('search-card');
    const searchForm = document.getElementById('home-search-strip');
    const searchInput = document.getElementById('home-search-input');
    if (searchCard) {
        searchCard.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (document.body.classList.contains('search-open')) {
                closeHomeSearchStrip();
                return;
            }
            openHomeSearchStrip();
        });
        document.addEventListener(
            'click',
            (e) => {
                if (!document.body.classList.contains('search-open')) return;
                if (e.target.closest('.bio-panel') || e.target.closest('#search-card')) return;
                closeHomeSearchStrip();
            },
            true
        );
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (!document.body.classList.contains('search-open')) return;
            closeHomeSearchStrip();
        });
    }
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
        });
    }
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            applyHomeSearchFilter(searchInput.value);
        });
    }

    // (Reverted) remove title hover article preview behavior

    relayoutHomeSectionsRef = layoutHomeColumns;
    const onHomeResize = () => {
        layoutHomeColumns();
        if (document.body.classList.contains('bio-open')) fitBioPanelAuthorNames();
    };
    window.addEventListener('resize', onHomeResize);
    window.visualViewport?.addEventListener('resize', onHomeResize);

    applyHomeEntryAfterGridReady();
}

function tryMountHomeWall(blogs) {
    if (homeWallMounted || !blogs) return false;
    homeWallMounted = true;
    mountHomeWall(blogs);
    return true;
}

function bootHomeWall() {
    const cached = readHomeWallCache();
    if (cached && cached.length) tryMountHomeWall(cached);

    if (!db) {
        if (!homeWallMounted) showHomeBlogsLoadFailure(new Error('Firestore unavailable'));
        return;
    }
    db.collection('blogs')
        .get()
        .then((snap) => {
            writeHomeWallCache(snap);
            tryMountHomeWall(snap);
        })
        .catch((err) => {
            console.error('Failed to load home blogs', err);
            if (!homeWallMounted) showHomeBlogsLoadFailure(err);
        });
}

/** Drop stuck column `transform` transitions so they can’t pin the wall in place. */
function clearColumnTransformTransitions() {
    document.querySelectorAll('.column-section').forEach((el) => {
        try {
            el.getAnimations?.().forEach((anim) => {
                if (anim.transitionProperty === 'transform') anim.cancel();
            });
        } catch (_) {}
    });
}

/** Open author bio panel by handle (desktop uses hover, so deep-links cannot rely on click). */
function openAuthorBioByHandle(handle, { instant = false } = {}) {
    const name = String(handle || '').trim().replace(/^@+/, '');
    if (!name) return false;
    const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(name) : name.replace(/"/g, '');
    const authorCard =
        document.querySelector(`.author-section .blog-card.author-card[data-author="${esc}"]`) ||
        document.querySelector(`.blog-card.author-card[data-author="${esc}"]`);
    if (!authorCard) return false;
    const panel = document.querySelector('.bio-panel');
    if (
        document.body.classList.contains('bio-open') &&
        panel &&
        panel.dataset.author === name
    ) {
        return true;
    }
    cancelAuthorBioClosing();
    if (typeof closeHomeSearchStrip === 'function') {
        closeHomeSearchStrip({ switchToBio: true });
    }
    fillAuthorBioPanel(name);
    if (instant) quietBioHover(900);
    closeAboutPopup();
    clearColumnTransformTransitions();
    document.body.classList.add('bio-open');
    applyAuthorBioHighlight(name);
    detachBioMoveCloser();
    // Narrow strip is one-card snap — always start on the profile card.
    requestAnimationFrame(() => {
        const strip = document.querySelector('.bio-panel-cards');
        if (strip) strip.scrollLeft = 0;
    });
    return true;
}

/** Open author bio from /?author=handle (content-ref links). */
function consumeHomeAuthorQuery() {
    try {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get('author');
        if (!raw) return;
        const handle = String(raw).trim().replace(/^@+/, '');
        if (!handle) return;
        params.delete('author');
        const cleaned = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash || ''}`;
        window.history.replaceState({}, '', cleaned);
        // Short beat after home is up, then wall reveals the bio underneath.
        quietBioHover(AUTHOR_BIO_DEEP_LINK_DELAY_MS + 900);
        setTimeout(() => {
            openAuthorBioByHandle(handle, { instant: true });
        }, AUTHOR_BIO_DEEP_LINK_DELAY_MS);
    } catch (err) {
        console.warn('consumeHomeAuthorQuery', err);
    }
}

function showHomeBlogsLoadFailure(err) {
    if (document.getElementById('home-load-failure')) return;
    const note = document.createElement('div');
    note.id = 'home-load-failure';
    note.setAttribute('role', 'alert');
    note.style.cssText = [
        'position:fixed',
        'left:50%',
        'bottom:max(24px, env(safe-area-inset-bottom, 0px))',
        'transform:translateX(-50%)',
        'z-index:200',
        'max-width:min(420px, calc(100vw - 32px))',
        'padding:12px 14px',
        'background:rgba(255,255,255,0.94)',
        'color:#171717',
        'font:500 14px/1.4 Helvetica, Arial, sans-serif',
        'box-shadow:0 8px 24px rgba(0,0,0,0.18)',
        'text-align:center'
    ].join(';');
    const detail = err && err.message ? String(err.message) : 'Couldn’t load posts';
    note.innerHTML = `
        <p style="margin:0 0 8px">Couldn’t load posts.</p>
        <button type="button" id="home-load-retry" style="font:600 13px/1 Helvetica, Arial, sans-serif;padding:8px 12px;border:1px solid rgba(0,0,0,0.25);background:#fff;cursor:pointer">Retry</button>
        <p style="margin:8px 0 0;font-size:11px;opacity:0.55">${detail.replace(/[<>&]/g, '')}</p>
    `;
    document.body.appendChild(note);
    document.getElementById('home-load-retry')?.addEventListener('click', () => location.reload());
}

let firebaseUiLoadPromise = null;

function loadFirebaseUi() {
    if (typeof firebaseui !== 'undefined') return Promise.resolve();
    if (firebaseUiLoadPromise) return firebaseUiLoadPromise;
    firebaseUiLoadPromise = new Promise((resolve, reject) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://www.gstatic.com/firebasejs/ui/6.0.1/firebase-ui-auth.css';
        document.head.appendChild(css);
        const script = document.createElement('script');
        script.src = 'https://www.gstatic.com/firebasejs/ui/6.0.1/firebase-ui-auth.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load FirebaseUI'));
        document.body.appendChild(script);
    });
    return firebaseUiLoadPromise;
}

function getHomeLoginUi() {
    if (typeof firebaseui === 'undefined') return null;
    return firebaseui.auth.AuthUI.getInstance() || new firebaseui.auth.AuthUI(auth);
}

function closeHomeLoginOverlay() {
    const overlay = document.getElementById('home-login-overlay');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('home-login-open');
    if (typeof resetHomeLoginViews === 'function') resetHomeLoginViews();
    try {
        const ui = firebaseui.auth.AuthUI.getInstance();
        if (ui) ui.reset();
    } catch (e) {}
}

function applyHomeEntryAfterSignIn() {
    const gridReady = !!document.querySelector('.home-main-stage');
    markHomeEntryDismissed({ hideNow: true });
    try {
        if (!gridReady) sessionStorage.setItem(JUST_LOGGED_IN_KEY, '1');
    } catch (e) {}
    // Only drop splash once posts are on screen — otherwise login left a blank white page.
    if (gridReady) {
        if (topdiv && !topdiv.classList.contains('fade')) {
            dismissSplashImmediately();
        }
        revealHomeTitlesWithEmerge({ instant: true });
        revealHomeTextureSwitcher({ delayMs: 900 });
    }
}

function openHomeLoginOverlay() {
    const overlay = document.getElementById('home-login-overlay');
    if (!overlay || auth.currentUser) return;

    if (typeof showHomeSignInView === 'function') showHomeSignInView();

    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('home-login-open');

    loadFirebaseUi()
        .then(() => startHomeLoginUi())
        .catch((err) => console.warn('FirebaseUI load failed', err));
}

function openHomeAuthorApplyOverlay() {
    const overlay = document.getElementById('home-login-overlay');
    if (!overlay) return;

    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('home-login-open');

    if (typeof showHomeAuthorApplyView === 'function') showHomeAuthorApplyView();
}

function startHomeLoginUi() {
    const ui = getHomeLoginUi();
    if (!ui) return;

    ui.start(
        '#home-login-ui',
        getAuthUiConfig({
            callbacks: {
                signInSuccessWithAuthResult(authResult) {
                    const user = authResult.user;
                    if (user && typeof refreshAuthorIdFromToken === 'function') {
                        refreshAuthorIdFromToken(user);
                    }
                    let next = '';
                    try {
                        next = sessionStorage.getItem('homeLoginNext') || '';
                        sessionStorage.removeItem('homeLoginNext');
                        if (next !== '/editor' && next !== '/admin') next = '';
                    } catch (_) {
                        next = '';
                    }
                    closeHomeLoginOverlay();
                    applyHomeEntryAfterSignIn();
                    syncAuthControls(user);
                    if (next) {
                        window.location.assign(next);
                    }
                    return false;
                },
            },
        })
    );
}

function initHomeLoginOverlay() {
    const overlay = document.getElementById('home-login-overlay');
    if (!overlay) return;
    overlay.querySelectorAll('[data-home-login-close]').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            closeHomeLoginOverlay();
        });
    });

    if (typeof initHomeSignupForm === 'function') initHomeSignupForm();
}

/** Open overlay from /?login=1 (e.g. nav Login). Optional next=/editor|/admin. */
function consumeHomeLoginQuery() {
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('login') !== '1') return;

        const next = params.get('next') || '';
        if (next === '/editor' || next === '/admin') {
            try {
                sessionStorage.setItem('homeLoginNext', next);
            } catch (_) {}
        }

        params.delete('login');
        params.delete('next');
        const cleaned = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash || ''}`;
        window.history.replaceState({}, '', cleaned);

        // After splash skip / paint — open once auth helpers exist.
        const open = () => {
            if (typeof openHomeLoginOverlay === 'function') openHomeLoginOverlay();
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(open, 0));
        } else {
            setTimeout(open, 0);
        }
    } catch (_) {}
}

function formatTitleForCard(rawTitle) {
    if (!rawTitle) return '';
    const normalized = String(rawTitle).replace(/\s+/g, ' ').trim();
    const maxLen = 100;
    const trimmed = normalized.substring(0, maxLen);
    return normalized.length > maxLen ? trimmed + '...' : trimmed;
}

function getContentTypeForDoc(blogId, data) {
    if (data && typeof data.contentType === 'string' && CONTENT_TYPES.includes(data.contentType)) {
        return data.contentType;
    }
    const seeded = Array.from(blogId).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    return CONTENT_TYPES[seeded % CONTENT_TYPES.length];
}

function contentTypeToSection(contentType) {
    switch (contentType) {
        case 'scene_report': return 1;
        case 'interview': return 2;
        case 'opinion': return 3;
        case 'ideas': return 4;
        default: return 1;
    }
}

function setActivePreviewSeam(seamIndex) {
    const seamX = `${seamIndex * 20}vw`;
    document.documentElement.style.setProperty('--seamX', seamX);
    document.body.setAttribute('data-open-seam', String(seamIndex));
    const c = (seamIndex * 20) / 100;
    // Preview centered on seam: max width so both edges stay within the viewport
    const previewMaxVw = 200 * Math.min(c, 1 - c);
    document.documentElement.style.setProperty('--articlePreviewMaxWidth', `${previewMaxVw}vw`);
    // Fullscreen grow: exactly viewport width, centered (see .expanding-fullscreen)
    document.documentElement.style.setProperty('--articleExpandWidth', `100vw`);
}

function clearActivePreviewSeam() {
    document.body.removeAttribute('data-open-seam');
    document.documentElement.style.removeProperty('--articleExpandWidth');
    document.documentElement.style.removeProperty('--articlePreviewMaxWidth');
}

function isHomeNarrowLayout() {
    return typeof window.matchMedia !== 'undefined' && window.matchMedia(HOME_NARROW_QUERY).matches;
}

function anchorMobilePaneToViewport(card) {
    if (!isHomeNarrowLayout()) return Promise.resolve();
    const track = document.querySelector('.home-main-track');
    const pane = card?.closest('.home-main-pane');
    if (!track || !pane) return Promise.resolve();

    const targetLeft = pane.offsetLeft;
    const remaining = Math.abs(track.scrollLeft - targetLeft);
    if (remaining <= 1) return Promise.resolve();

    return new Promise((resolve) => {
        let settledTicks = 0;
        let rafId = 0;
        const startedAt = performance.now();
        const timeoutMs = 480;
        const tick = () => {
            const delta = Math.abs(track.scrollLeft - targetLeft);
            if (delta < 1.5) settledTicks += 1;
            else settledTicks = 0;
            if (settledTicks >= 2 || performance.now() - startedAt > timeoutMs) {
                track.scrollLeft = targetLeft;
                resolve();
                return;
            }
            rafId = requestAnimationFrame(tick);
        };
        track.scrollTo({ left: targetLeft, behavior: 'smooth' });
        rafId = requestAnimationFrame(tick);
        setTimeout(() => {
            if (rafId) cancelAnimationFrame(rafId);
            track.scrollLeft = targetLeft;
            resolve();
        }, timeoutMs + 40);
    });
}

function normalizeClientAvatarPath(raw) {
    const path = String(raw || '').trim();
    const preset = path.match(/^\/?pfps\/([A-Za-z0-9_.-]+)$/);
    if (preset) {
        if (!AUTHOR_AVATAR_FILES.includes(preset[1])) return '';
        return `/pfps/${preset[1]}`;
    }
    const uploaded = path.match(/^\/?uploads\/([A-Za-z0-9_.-]+)$/);
    if (uploaded) return `/uploads/${uploaded[1]}`;
    return '';
}

/** Saved profile avatar only — no random fallback. */
function avatarUrlForAuthor(authorName) {
    const name = authorName || 'Anonymous';
    const fromProfile = normalizeClientAvatarPath(authorProfileCache[authorHandleKey(name)]?.avatar);
    if (fromProfile) {
        authorAvatarByName[name] = fromProfile;
        return fromProfile;
    }
    const cached = normalizeClientAvatarPath(authorAvatarByName[name]);
    return cached || '';
}

async function uploadAvatarImage(file) {
    if (!file || !String(file.type || '').startsWith('image/')) {
        throw new Error('not_an_image');
    }
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch('/upload', { method: 'POST', body: formData });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error((data && data.error) || 'upload_failed');
    }
    const raw = typeof data === 'string' ? data : data.url || data.path || '';
    const path = normalizeClientAvatarPath(
        String(raw).startsWith('http') || String(raw).startsWith('/') ? raw : `/${raw}`
    );
    if (!path) throw new Error('invalid_avatar');
    return path;
}

function noteAuthorLatestPost(authorName, blog, doc) {
    const name = authorName || 'Anonymous';
    const ms =
        Date.parse(doc.lastModified || '') ||
        Date.parse(doc.publishedAt || '') ||
        0;
    const title = (doc.title || 'Untitled').trim() || 'Untitled';
    let prev = authorHomeProfiles[name];
    if (!prev) {
        prev = { posts: [], latestTitle: '', latestId: '', latestMs: 0 };
        authorHomeProfiles[name] = prev;
    }
    if (!Array.isArray(prev.posts)) prev.posts = [];
    if (!prev.posts.some((p) => p.id === blog.id)) {
        prev.posts.push({
            id: blog.id,
            title,
            ms,
            publishedAt: doc.publishedAt || doc.lastModified || ''
        });
    }
    prev.posts.sort((a, b) => (b.ms || 0) - (a.ms || 0));
    const top = prev.posts[0];
    if (top) {
        prev.latestTitle = top.title;
        prev.latestId = top.id;
        prev.latestMs = top.ms;
    }
}

/** handle(lower) → profile fields from /api/author-profile */
const authorProfileCache = Object.create(null);
let bioEditorBound = false;
let bioEditSaving = false;

function authorHandleKey(name) {
    return String(name || '')
        .trim()
        .replace(/^@+/, '')
        .toLowerCase();
}

function emptyAuthorProfile(name) {
    return {
        authorName: authorHandleKey(name),
        bio: '',
        location: '',
        website: '',
        socialLinks: [],
        captureUrl: '',
        statusEmoji: '',
        avatar: ''
    };
}

function normalizeCaptureUrlClient(raw) {
    const s = String(raw || '').trim();
    if (!s || s.length > 500) return '';
    const withProto = /^https?:\/\//i.test(s) ? s : /^[\w.-]+\.[\w.-]+/i.test(s) ? `https://${s}` : '';
    if (!withProto) return '';
    try {
        const u = new URL(withProto);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
        if (!u.hostname) return '';
        return u.toString().slice(0, 500);
    } catch (_) {
        return '';
    }
}

function youtubeIdFromCaptureUrl(href) {
    let u;
    try {
        u = new URL(href);
    } catch (_) {
        return '';
    }
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'youtu.be') return u.pathname.replace(/^\//, '').split('/')[0] || '';
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        if (u.pathname === '/watch') return u.searchParams.get('v') || '';
        if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || '';
        if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || '';
        if (u.pathname.startsWith('/live/')) return u.pathname.split('/')[2] || '';
    }
    return '';
}

/** Video / music / sound hosts that use a PLAY facade. Plain pages load the iframe immediately. */
function isCapturePlayableMediaUrl(href) {
    const clean = normalizeCaptureUrlClient(href);
    if (!clean) return false;
    if (youtubeIdFromCaptureUrl(clean)) return true;
    let u;
    try {
        u = new URL(clean);
    } catch (_) {
        return false;
    }
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'vimeo.com' || host === 'player.vimeo.com') return true;
    if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com')) return true;
    if (host === 'open.spotify.com' || host.endsWith('.spotify.com')) return true;
    if (host === 'music.apple.com' || host === 'bandcamp.com' || host.endsWith('.bandcamp.com')) {
        return true;
    }
    if (/\.(mp4|webm|ogg|mov|mp3|m4a|wav)(\?|$)/i.test(u.pathname)) return true;
    return false;
}

function isCaptureVideoUrl(href) {
    return isCapturePlayableMediaUrl(href);
}

/** Soft-rewrite hosts that refuse their normal URLs inside iframes. */
function iframeSrcForCaptureUrl(href, { autoplay = false } = {}) {
    let u;
    try {
        u = new URL(href);
    } catch (_) {
        return href;
    }
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const ytId = youtubeIdFromCaptureUrl(href);
    if (ytId && /^[\w-]{6,20}$/.test(ytId)) {
        return (
            `https://www.youtube-nocookie.com/embed/${ytId}` +
            `?rel=0&modestbranding=1&playsinline=1${autoplay ? '&autoplay=1' : ''}`
        );
    }

    if (host === 'vimeo.com') {
        const m = u.pathname.match(/^\/(\d+)/);
        if (m) {
            return `https://player.vimeo.com/video/${m[1]}${autoplay ? '?autoplay=1' : ''}`;
        }
    }

    if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com')) {
        return (
            `https://w.soundcloud.com/player/?url=${encodeURIComponent(href)}` +
            '&visual=true&buying=false&sharing=false&show_playcount=false&show_user=false'
        );
    }

    if (host === 'open.spotify.com') {
        const parts = u.pathname.split('/').filter(Boolean);
        if (
            parts.length >= 2 &&
            ['track', 'album', 'playlist', 'episode', 'artist'].includes(parts[0]) &&
            !parts.includes('embed')
        ) {
            return `https://open.spotify.com/embed/${parts[0]}/${parts[1]}`;
        }
    }

    return href;
}

let bioYoutubeApiPromise = null;
let bioYoutubePlayer = null;

function ensureYoutubeIframeApi() {
    if (typeof window.YT !== 'undefined' && window.YT.Player) {
        return Promise.resolve(window.YT);
    }
    if (bioYoutubeApiPromise) return bioYoutubeApiPromise;
    bioYoutubeApiPromise = new Promise((resolve, reject) => {
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (typeof prev === 'function') {
                try {
                    prev();
                } catch (_) {
                    /* ignore */
                }
            }
            resolve(window.YT);
        };
        if (!document.querySelector('script[data-bio-yt-api]')) {
            const s = document.createElement('script');
            s.src = 'https://www.youtube.com/iframe_api';
            s.async = true;
            s.dataset.bioYtApi = '1';
            s.onerror = () => reject(new Error('yt_api_failed'));
            document.head.appendChild(s);
        }
        const started = Date.now();
        const poll = setInterval(() => {
            if (typeof window.YT !== 'undefined' && window.YT.Player) {
                clearInterval(poll);
                resolve(window.YT);
            } else if (Date.now() - started > 8000) {
                clearInterval(poll);
                reject(new Error('yt_api_timeout'));
            }
        }, 50);
    });
    return bioYoutubeApiPromise;
}

function destroyBioYoutubePlayer() {
    if (bioYoutubePlayer && typeof bioYoutubePlayer.destroy === 'function') {
        try {
            bioYoutubePlayer.destroy();
        } catch (_) {
            /* ignore */
        }
    }
    bioYoutubePlayer = null;
}

function createCapturePlayButton() {
    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'bio-capture-play-btn';
    playBtn.textContent = 'PLAY';
    playBtn.setAttribute('aria-label', 'Play');
    return playBtn;
}

function mountCaptureIframe(wrap, href, { autoplay = false } = {}) {
    wrap.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.className = 'bio-capture-media';
    iframe.title = 'Captured link';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.allow =
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    wrap.appendChild(iframe);
    iframe.src = iframeSrcForCaptureUrl(href, { autoplay });
}

function mountYoutubeCapture(mount, href, ytId) {
    destroyBioYoutubePlayer();

    const wrap = document.createElement('div');
    wrap.className = 'bio-capture-shell bio-capture-yt';

    const playerHost = document.createElement('div');
    playerHost.className = 'bio-capture-yt-host';
    const playerEl = document.createElement('div');
    playerEl.id = `bio-yt-${ytId}-${Date.now()}`;
    playerHost.appendChild(playerEl);

    const facade = document.createElement('div');
    facade.className = 'bio-capture-facade';

    const img = document.createElement('img');
    img.className = 'bio-capture-poster';
    img.src = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.addEventListener(
        'error',
        () => {
            if (!img.dataset.fallback) {
                img.dataset.fallback = '1';
                img.src = `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`;
            }
        },
        { once: true }
    );

    const playBtn = createCapturePlayButton();
    playBtn.disabled = true;
    playBtn.classList.add('is-loading');

    facade.appendChild(img);
    facade.appendChild(playBtn);
    wrap.appendChild(playerHost);
    wrap.appendChild(facade);
    mount.appendChild(wrap);

    let ready = false;
    let useApi = true;

    const startPlayback = () => {
        if (!useApi || !bioYoutubePlayer) {
            wrap.classList.add('is-playing');
            facade.hidden = true;
            mountCaptureIframe(playerHost, href, { autoplay: true });
            return;
        }
        try {
            bioYoutubePlayer.unMute();
            bioYoutubePlayer.setVolume(100);
            bioYoutubePlayer.playVideo();
        } catch (_) {
            /* ignore */
        }
        wrap.classList.add('is-playing');
        facade.hidden = true;
    };

    playBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!ready) return;
        startPlayback();
    });

    ensureYoutubeIframeApi()
        .then((YT) => {
            if (!mount.contains(wrap)) return;
            bioYoutubePlayer = new YT.Player(playerEl.id, {
                videoId: ytId,
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: 0,
                    controls: 0,
                    disablekb: 1,
                    fs: 0,
                    iv_load_policy: 3,
                    modestbranding: 1,
                    playsinline: 1,
                    rel: 0,
                    origin: window.location.origin
                },
                events: {
                    onReady: () => {
                        ready = true;
                        playBtn.disabled = false;
                        playBtn.classList.remove('is-loading');
                    }
                }
            });
        })
        .catch(() => {
            useApi = false;
            ready = true;
            playBtn.disabled = false;
            playBtn.classList.remove('is-loading');
        });
}

function renderCaptureMedia(rawUrl, { editing = false } = {}) {
    const mount = document.getElementById('bio-capture-mount');
    const empty = document.getElementById('bio-capture-empty');
    const card = document.getElementById('bio-capture-card');
    if (!mount) return null;
    destroyBioYoutubePlayer();
    mount.innerHTML = '';
    const href = normalizeCaptureUrlClient(rawUrl);
    const isEditing = editing || document.body.classList.contains('bio-editing');
    const isVideo = isCaptureVideoUrl(href);
    if (card) card.classList.toggle('is-video', isVideo);
    if (!href) {
        if (empty) {
            empty.hidden = !isEditing;
            if (isEditing) empty.removeAttribute('hidden');
        }
        if (card) card.classList.remove('is-video');
        return null;
    }
    if (empty) {
        empty.hidden = true;
        empty.setAttribute('hidden', '');
    }

    const ytId = youtubeIdFromCaptureUrl(href);
    if (ytId && /^[\w-]{6,20}$/.test(ytId)) {
        mountYoutubeCapture(mount, href, ytId);
        return { href };
    }

    if (isCapturePlayableMediaUrl(href)) {
        // Other audio/video: PLAY facade, then load embed on click.
        const wrap = document.createElement('div');
        wrap.className = 'bio-capture-shell';
        const facade = document.createElement('div');
        facade.className = 'bio-capture-facade';
        const playBtn = createCapturePlayButton();
        playBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            mountCaptureIframe(wrap, href, { autoplay: true });
        });
        facade.appendChild(playBtn);
        wrap.appendChild(facade);
        mount.appendChild(wrap);
        return { href };
    }

    // Regular page / PDF / etc. — show the iframe immediately, no PLAY.
    const wrap = document.createElement('div');
    wrap.className = 'bio-capture-shell';
    mount.appendChild(wrap);
    mountCaptureIframe(wrap, href, { autoplay: false });
    return { href };
}

function syncCaptureCardVisibility(rawUrl, { editing = false } = {}) {
    const card = document.getElementById('bio-capture-card');
    if (!card) return;
    const href = normalizeCaptureUrlClient(rawUrl);
    const show = editing || Boolean(href);
    card.hidden = !show;
    if (show) card.removeAttribute('hidden');
    else card.setAttribute('hidden', '');
    card.classList.toggle('is-empty', !href);
    card.classList.toggle('is-video', Boolean(href) && isCaptureVideoUrl(href));
}

function closeBioAvatarMenu() {
    const menu = document.getElementById('bio-avatar-menu');
    const btn = document.getElementById('bio-avatar-change');
    const wrap = document.getElementById('bio-avatar-wrap');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (wrap) wrap.classList.remove('is-picking');
}

function setBioAvatarSelection(path, { preview = true } = {}) {
    const clean = normalizeClientAvatarPath(path);
    const hidden = document.getElementById('bio-edit-avatar');
    if (hidden) hidden.value = clean;
    if (preview && clean) {
        const img = document.getElementById('bio-avatar');
        if (img) img.src = clean;
    }
    const menu = document.getElementById('bio-avatar-menu');
    if (menu) {
        menu.querySelectorAll('.bio-avatar-option').forEach((el) => {
            if (el.classList.contains('bio-avatar-upload')) return;
            const on = Boolean(clean) && el.dataset.avatar === clean;
            el.classList.toggle('is-selected', on);
            el.setAttribute('aria-selected', on ? 'true' : 'false');
        });
    }
}

function appendBioAvatarUploadCell(menu) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'bio-avatar-option bio-avatar-upload';
    cell.setAttribute('role', 'option');
    cell.setAttribute('aria-label', 'Upload a profile picture');
    cell.title = 'Upload';
    cell.innerHTML = '<span class="bio-avatar-upload-plus" aria-hidden="true">+</span>';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        cell.disabled = true;
        try {
            const path = await uploadAvatarImage(file);
            ensureBioAvatarCustomOption(menu, path);
            setBioAvatarSelection(path);
            closeBioAvatarMenu();
        } catch (err) {
            console.error('Avatar upload', err);
            alert('Failed to upload image. Please try again.');
        } finally {
            cell.disabled = false;
        }
    });

    cell.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileInput.click();
    });

    menu.appendChild(cell);
    menu.appendChild(fileInput);
}

function ensureBioAvatarCustomOption(menu, path) {
    const clean = normalizeClientAvatarPath(path);
    if (!menu || !clean || clean.startsWith('/pfps/')) return;
    let btn = menu.querySelector('.bio-avatar-option[data-avatar-custom="1"]');
    if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bio-avatar-option';
        btn.setAttribute('role', 'option');
        btn.dataset.avatarCustom = '1';
        btn.title = 'Uploaded';
        const img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        btn.appendChild(img);
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const p = normalizeClientAvatarPath(btn.dataset.avatar);
            if (!p) return;
            setBioAvatarSelection(p);
            closeBioAvatarMenu();
        });
        const uploadCell = menu.querySelector('.bio-avatar-upload');
        if (uploadCell && uploadCell.nextSibling) {
            menu.insertBefore(btn, uploadCell.nextSibling);
        } else {
            menu.appendChild(btn);
        }
    }
    btn.dataset.avatar = clean;
    const img = btn.querySelector('img');
    if (img) img.src = clean;
}

function ensureBioAvatarMenu() {
    const menu = document.getElementById('bio-avatar-menu');
    if (!menu) return null;
    if (menu.dataset.ready === '1') return menu;
    menu.innerHTML = '';
    appendBioAvatarUploadCell(menu);
    AUTHOR_AVATAR_FILES.forEach((file) => {
        const path = `/pfps/${file}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bio-avatar-option';
        btn.setAttribute('role', 'option');
        btn.dataset.avatar = path;
        btn.title = file;
        const img = document.createElement('img');
        img.src = path;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        btn.appendChild(img);
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setBioAvatarSelection(path);
            closeBioAvatarMenu();
        });
        menu.appendChild(btn);
    });
    menu.dataset.ready = '1';
    return menu;
}

function toggleBioAvatarMenu() {
    if (!document.body.classList.contains('bio-editing')) return;
    const menu = ensureBioAvatarMenu();
    const btn = document.getElementById('bio-avatar-change');
    const wrap = document.getElementById('bio-avatar-wrap');
    if (!menu) return;
    const open = menu.hidden;
    menu.hidden = !open;
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (wrap) wrap.classList.toggle('is-picking', open);
    if (open) {
        const current = document.getElementById('bio-edit-avatar')?.value || '';
        setBioAvatarSelection(current, { preview: false });
    }
}

function isViewingOwnAuthorBio(authorName) {
    const user = typeof auth !== 'undefined' ? auth.currentUser : null;
    if (!user || typeof getAuthorIdFromUser !== 'function') return false;
    const self = authorHandleKey(getAuthorIdFromUser(user));
    const target = authorHandleKey(authorName);
    return Boolean(self && target && self === target);
}

async function fetchAuthorProfile(authorName) {
    const key = authorHandleKey(authorName);
    if (!key || key === 'anonymous') return emptyAuthorProfile(authorName);
    if (authorProfileCache[key]) return authorProfileCache[key];
    try {
        const res = await fetch(`/api/author-profile/${encodeURIComponent(key)}`);
        if (!res.ok) {
            const fallback = emptyAuthorProfile(key);
            authorProfileCache[key] = fallback;
            return fallback;
        }
        const data = await res.json();
        const profile = { ...emptyAuthorProfile(key), ...(data.profile || {}) };
        authorProfileCache[key] = profile;
        return profile;
    } catch (_) {
        const fallback = emptyAuthorProfile(key);
        authorProfileCache[key] = fallback;
        return fallback;
    }
}

/** Parse a social URL into { platform, username, label } like GitHub profile links. */
function parseSocialLink(rawUrl) {
    let href = String(rawUrl || '').trim();
    if (!href) return null;
    if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
    let u;
    try {
        u = new URL(href);
    } catch (_) {
        return { href, platform: 'link', username: '', label: href };
    }
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const parts = u.pathname.split('/').filter(Boolean);
    const first = decodeURIComponent(parts[0] || '').replace(/^@/, '');

    if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
        const user = first && !['p', 'reel', 'reels', 'stories', 'explore', 'accounts'].includes(first.toLowerCase())
            ? first
            : '';
        return { href, platform: 'instagram', username: user, label: user || 'Instagram' };
    }
    if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.twitter.com')) {
        const user = first && !['i', 'home', 'explore', 'intent', 'share'].includes(first.toLowerCase())
            ? first
            : '';
        return { href, platform: 'x', username: user, label: user ? `@${user}` : 'X' };
    }
    if (host === 'github.com') {
        const user = first && !['features', 'topics', 'collections', 'events', 'sponsors'].includes(first.toLowerCase())
            ? first
            : '';
        return { href, platform: 'github', username: user, label: user || 'GitHub' };
    }
    if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
        let user = '';
        if (parts[0] === 'in' && parts[1]) user = decodeURIComponent(parts[1]);
        else if (parts[0] === 'company' && parts[1]) user = decodeURIComponent(parts[1]);
        return { href, platform: 'linkedin', username: user, label: user || 'LinkedIn' };
    }
    if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) {
        let user = '';
        if (host === 'youtu.be') user = first || '';
        else if (first.startsWith('@')) user = first.slice(1);
        else if (first === 'c' || first === 'user' || first === 'channel') user = decodeURIComponent(parts[1] || '');
        return { href, platform: 'youtube', username: user, label: user ? `@${user}` : 'YouTube' };
    }
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
        const user = first.replace(/^@/, '');
        return { href, platform: 'tiktok', username: user, label: user ? `@${user}` : 'TikTok' };
    }
    if (host === 'bsky.app') {
        const user = parts[0] === 'profile' ? decodeURIComponent(parts[1] || '') : first;
        return { href, platform: 'bluesky', username: user, label: user || 'Bluesky' };
    }
    if (host === 'threads.net' || host.endsWith('.threads.net')) {
        const user = first.replace(/^@/, '');
        return { href, platform: 'threads', username: user, label: user ? `@${user}` : 'Threads' };
    }
    if (host === 'facebook.com' || host === 'fb.com' || host.endsWith('.facebook.com')) {
        const user = first && !['profile.php', 'pages', 'groups', 'watch', 'share'].includes(first.toLowerCase())
            ? first
            : '';
        return { href, platform: 'facebook', username: user, label: user || 'Facebook' };
    }
    // Mastodon: /@user on instance hosts (incl. mastodon.social and most *.social)
    const mastodonUser = (parts[0] || '').startsWith('@')
        ? decodeURIComponent(parts[0]).replace(/^@/, '')
        : '';
    if (
        mastodonUser &&
        (host.includes('mastodon') ||
            host.endsWith('.social') ||
            host.endsWith('.club') ||
            host === 'mas.to' ||
            host === 'mstdn.social' ||
            host === 'fosstodon.org' ||
            host === 'hachyderm.io')
    ) {
        return {
            href,
            platform: 'mastodon',
            username: mastodonUser,
            label: `@${mastodonUser}`
        };
    }

    return { href, platform: 'link', username: '', label: host };
}

function socialPlatformIconSvg(platform) {
    const common = 'width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
    switch (platform) {
        case 'instagram':
            // Classic 2010–2016 Instagram camera mark
            return `<img class="bio-social-icon-img" src="/icons/instagram-classic.png" alt="" width="18" height="18" decoding="async" />`;
        case 'x':
            return `<svg ${common} fill="#0f1419"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>`;
        case 'github':
            return `<svg ${common} fill="#24292f"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 10.0.1.3 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 10.20.0.2.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .10.0.1.5.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`;
        case 'linkedin':
            return `<svg ${common} fill="#0a66c2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`;
        case 'youtube':
            return `<svg ${common} fill="#ff0000"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
        case 'tiktok':
            return `<svg ${common}><path fill="#25F4EE" d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.49v-6.96a8.2 8.2 0 004.74 1.5V6.79c.34.06.68.1 1 .1z" transform="translate(1.2 0)"/><path fill="#000" d="M16.82 7.44a8.2 8.2 0 01-4.74-1.5v9.75a6.34 6.34 0 01-10.86-4.49 6.34 6.34 0 016.34-6.34c.27 0 .53.02.79.05v3.5a2.87 2.87 0 00-.79-.1 2.89 2.89 0 100 5.78 2.89 2.89 0 002.88-2.5V2h3.45v.44a4.83 4.83 0 003.77 4.25c.34.06.68.1 1 .1v3.44a8.16 8.16 0 01-1.84-.79z"/></svg>`;
        case 'bluesky':
            return `<svg ${common} fill="#1185fe"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.136.02-.275.037-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013.5 6.737-4.02 7.823-6.016.996 1.829 2.43 6.674 7.736 6.016 4.275-1.54 1.367-6.498-2.744-7.078a8.741 8.741 0 01-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/></svg>`;
        case 'mastodon':
            return `<svg ${common} fill="#6364ff"><path d="M23.268 6.087c-.222-1.676-1.634-3.006-3.33-3.278C18.1 2.526 15.287 2.3 12.002 2.3S5.9 2.526 4.063 2.81C2.367 3.08.955 4.41.733 6.087.533 7.606.4 9.328.4 11.176v.855c0 3.633.465 6.46 1.747 8.4 1.324 2.004 3.375 2.95 6.1 3.117 1.462.09 2.77.1 4.035.025v-2.35c-.108.01-.226.02-.348.028-1.97.13-3.747-.168-4.45-1.28-.47-.75-.628-1.96-.628-3.948V11.3h3.51v7.93H15.2V11.3h3.51v5.698c0 1.988-.158 3.198-.628 3.948-.703 1.112-2.48 1.41-4.45 1.28a12.4 12.4 0 01-.348-.028v2.35c1.265.075 2.573.065 4.035-.025 2.725-.167 4.776-1.113 6.1-3.117 1.282-1.94 1.747-4.767 1.747-8.4v-.855c0-1.848-.133-3.57-.333-5.089z"/></svg>`;
        case 'threads':
            return `<svg ${common} fill="#000"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.313-8.184-3.83C2.35 18.05 1.49 15.036 1.5 11.34c.01-3.686.87-6.69 2.555-8.92C5.9 1.12 8.622-.05 12.185 0h.014c3.563.05 6.276 1.22 8.066 3.48 1.67 2.11 2.52 5.04 2.53 8.71-.01 3.68-.87 6.69-2.545 8.91C18.51 22.68 15.79 23.97 12.2 24zm3.53-10.64c.12-.14.23-.3.33-.45.72-1.15.97-2.56.7-3.95-.4-2.08-1.86-3.48-4.09-3.92-.56-.11-1.14-.17-1.72-.17h-.04c-2.88.04-4.85 1.7-5.15 4.33-.12 1.05.05 2.07.5 2.96.5.98 1.3 1.74 2.33 2.2-.1.3-.16.6-.18.9-.06.82.14 1.58.58 2.2.68.96 1.85 1.48 3.37 1.5h.05c1.78-.03 3.05-.74 3.78-2.1.28-.53.45-1.14.5-1.8.35.22.67.48.96.78 1.02 1.07 1.53 2.43 1.53 4.05 0 .28-.02.56-.05.84-.5 3.84-3.23 5.9-7.48 5.65-3.6-.22-5.96-2.2-6.42-5.4-.08-.55-.1-1.1-.08-1.65.02-.48.06-.96.14-1.43l-1.8-.28c-.1.55-.15 1.12-.17 1.68-.03.68 0 1.36.1 2.03.58 4.03 3.55 6.52 8.05 6.8h.2c.1 0 .2 0 .3-.01 4.95-.3 8.1-2.9 8.68-7.42.04-.35.06-.7.06-1.05 0-2.05-.68-3.78-2.02-5.16-.5-.52-.98-.9-1.48-1.17z"/></svg>`;
        case 'facebook':
            return `<svg ${common} fill="#1877f2"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>`;
        default:
            return `<svg ${common} fill="#444"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm0-8h-2V7h2v2zm6 8h-2v-2.5c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5V17h-2v-2.5c0-1.93 1.57-3.5 3.5-3.5s3.5 1.57 3.5 3.5V17z"/></svg>`;
    }
}

/** Favicon for arbitrary pasted hosts (known platforms keep curated marks). */
function faviconUrlForHref(href) {
    try {
        const host = new URL(href).hostname.replace(/^www\./i, '');
        if (!host) return '';
        return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
    } catch (_) {
        return '';
    }
}

function createSocialIconEl(parsed) {
    const icon = document.createElement('span');
    icon.className = 'bio-social-icon';
    const useFavicon = parsed.platform === 'link';
    const fav = useFavicon ? faviconUrlForHref(parsed.href) : '';
    if (fav) {
        const img = document.createElement('img');
        img.className = 'bio-social-icon-img';
        img.src = fav;
        img.alt = '';
        img.width = 18;
        img.height = 18;
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener(
            'error',
            () => {
                icon.innerHTML = socialPlatformIconSvg('link');
            },
            { once: true }
        );
        icon.appendChild(img);
        return icon;
    }
    icon.innerHTML = socialPlatformIconSvg(parsed.platform);
    return icon;
}

function createSocialLinkEl(rawUrl) {
    const parsed = parseSocialLink(rawUrl);
    if (!parsed) return null;
    const a = document.createElement('a');
    a.className = `bio-social-link bio-social-${parsed.platform}`;
    a.dataset.platform = parsed.platform;
    a.href = parsed.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = parsed.href;

    a.appendChild(createSocialIconEl(parsed));

    const label = document.createElement('span');
    label.className = 'bio-social-label';
    label.textContent = parsed.label;
    a.appendChild(label);
    return a;
}

function clampAuthorBioText(raw) {
    return String(raw ?? '').slice(0, AUTHOR_PROFILE_BIO_MAX_LENGTH);
}

function updateBioEditCharHint() {
    const ta = document.getElementById('bio-edit-bio');
    const hint = document.getElementById('bio-edit-bio-hint');
    if (!hint) return;
    if (!ta) {
        hint.textContent = '';
        hint.classList.remove('is-at-limit');
        return;
    }
    const n = ta.value.length;
    hint.textContent = `${n} / ${AUTHOR_PROFILE_BIO_MAX_LENGTH}`;
    hint.classList.toggle('is-at-limit', n >= AUTHOR_PROFILE_BIO_MAX_LENGTH);
}

function exitAuthorBioEditMode() {
    document.body.classList.remove('bio-editing');
    closeBioAvatarMenu();
    const err = document.getElementById('bio-edit-error');
    if (err) {
        err.hidden = true;
        err.textContent = '';
    }
    updateBioEditCharHint();
    const editBtn = document.getElementById('bio-edit-btn');
    const panel = document.querySelector('.bio-panel');
    if (editBtn && panel) {
        editBtn.hidden = !isViewingOwnAuthorBio(panel.dataset.author || '');
    }
}

function enterAuthorBioEditMode(profile) {
    const panel = document.querySelector('.bio-panel');
    const author = panel?.dataset.author || '';
    // Never open editors on someone else's panel.
    if (!isViewingOwnAuthorBio(author)) {
        exitAuthorBioEditMode();
        return;
    }
    const p = profile || emptyAuthorProfile('');
    const setVal = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.value = v || '';
    };
    const handleEl = document.getElementById('bio-edit-handle');
    if (handleEl) {
        const color = mastheadAuthorColor(author);
        handleEl.textContent = author;
        handleEl.style.setProperty('--bio-author-color', color);
        handleEl.style.color = color;
    }
    setVal('bio-edit-bio', clampAuthorBioText(p.bio));
    updateBioEditCharHint();
    setVal('bio-edit-location', p.location);
    setVal('bio-edit-website', p.website);
    const links = Array.isArray(p.socialLinks) ? p.socialLinks : [];
    for (let i = 0; i < 4; i++) setVal(`bio-edit-social-${i}`, links[i] || '');
    const captureUrl = normalizeCaptureUrlClient(p.captureUrl);
    setVal('bio-edit-capture-url', captureUrl);

    const menu = ensureBioAvatarMenu();
    const currentAvatar =
        normalizeClientAvatarPath(p.avatar) ||
        normalizeClientAvatarPath(document.getElementById('bio-avatar')?.getAttribute('src')) ||
        avatarUrlForAuthor(author);
    if (menu && currentAvatar) ensureBioAvatarCustomOption(menu, currentAvatar);
    setBioAvatarSelection(currentAvatar);
    closeBioAvatarMenu();

    document.body.classList.add('bio-editing');
    renderCaptureMedia(captureUrl, { editing: true });
    syncCaptureCardVisibility(captureUrl, { editing: true });
    requestAnimationFrame(() => fitBioPanelAuthorNames());
    document.getElementById('bio-edit-bio')?.focus();
}

function readBioEditFormValues() {
    const val = (id) => String(document.getElementById(id)?.value || '').trim();
    const socialLinks = [0, 1, 2, 3].map((i) => val(`bio-edit-social-${i}`)).filter(Boolean);
    const captureUrl = normalizeCaptureUrlClient(val('bio-edit-capture-url'));
    const avatar = normalizeClientAvatarPath(val('bio-edit-avatar'));
    const out = {
        statusEmoji: '',
        bio: clampAuthorBioText(val('bio-edit-bio')),
        location: val('bio-edit-location'),
        website: val('bio-edit-website'),
        socialLinks,
        captureUrl
    };
    if (avatar) out.avatar = avatar;
    return out;
}

async function saveAuthorBioEdits(panel) {
    if (bioEditSaving) return;
    const errEl = document.getElementById('bio-edit-error');
    const saveBtn = document.getElementById('bio-edit-save');
    const user = typeof auth !== 'undefined' ? auth.currentUser : null;
    if (!user) {
        if (errEl) {
            errEl.hidden = false;
            errEl.textContent = 'Sign in to save your profile.';
        }
        return;
    }
    bioEditSaving = true;
    if (saveBtn) saveBtn.disabled = true;
    if (errEl) {
        errEl.hidden = true;
        errEl.textContent = '';
    }
    try {
        const idToken = await user.getIdToken();
        const profile = readBioEditFormValues();
        const res = await fetch('/api/author-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken, profile })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || 'save_failed');
        }
        const name = panel.dataset.author || '';
        const key = authorHandleKey(name);
        const saved = { ...emptyAuthorProfile(key), ...(data.profile || profile) };
        authorProfileCache[key] = saved;
        const savedAvatar = normalizeClientAvatarPath(saved.avatar);
        if (savedAvatar) authorAvatarByName[name] = savedAvatar;
        exitAuthorBioEditMode();
        applyAuthorProfileToPanel(name, saved);
        syncAuthorCardEmoji(name);
    } catch (err) {
        if (errEl) {
            errEl.hidden = false;
            errEl.textContent =
                err && err.message === 'forbidden'
                    ? 'Only authors can edit their profile.'
                    : 'Could not save profile. Try again.';
        }
    } finally {
        bioEditSaving = false;
        if (saveBtn) saveBtn.disabled = false;
    }
}

function bindAuthorBioEditor(panel) {
    if (bioEditorBound || !panel) return;
    bioEditorBound = true;

    const bioTa = document.getElementById('bio-edit-bio');
    if (bioTa) {
        bioTa.maxLength = AUTHOR_PROFILE_BIO_MAX_LENGTH;
        if (!bioTa.dataset.bioLimitBound) {
            bioTa.dataset.bioLimitBound = '1';
            bioTa.addEventListener('input', updateBioEditCharHint);
        }
    }

    document.getElementById('bio-edit-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const name = panel.dataset.author || '';
        if (!isViewingOwnAuthorBio(name)) return;
        const profile = await fetchAuthorProfile(name);
        enterAuthorBioEditMode(profile);
    });

    document.getElementById('bio-edit-cancel')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const name = panel.dataset.author || '';
        exitAuthorBioEditMode();
        applyAuthorProfileToPanel(
            name,
            authorProfileCache[authorHandleKey(name)] || emptyAuthorProfile(name)
        );
    });

    document.getElementById('bio-edit-save')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        saveAuthorBioEdits(panel);
    });

    const avatarChange = document.getElementById('bio-avatar-change');
    const avatarImg = document.getElementById('bio-avatar');
    const openPicker = (e) => {
        if (!document.body.classList.contains('bio-editing')) return;
        e.preventDefault();
        e.stopPropagation();
        toggleBioAvatarMenu();
    };
    avatarChange?.addEventListener('click', openPicker);
    avatarImg?.addEventListener('click', openPicker);

    const captureInput = document.getElementById('bio-edit-capture-url');
    const refreshCapturePreview = () => {
        if (!document.body.classList.contains('bio-editing')) return;
        const url = normalizeCaptureUrlClient(captureInput?.value || '');
        renderCaptureMedia(url, { editing: true });
        syncCaptureCardVisibility(url, { editing: true });
    };
    captureInput?.addEventListener('input', refreshCapturePreview);
    captureInput?.addEventListener('change', refreshCapturePreview);

    document.addEventListener(
        'click',
        (e) => {
            const wrap = document.getElementById('bio-avatar-wrap');
            if (!wrap || !wrap.classList.contains('is-picking')) return;
            if (e.target.closest && e.target.closest('#bio-avatar-wrap')) return;
            closeBioAvatarMenu();
        },
        true
    );
}

/** Author-column tags stay plain (@handle / me) — status emoji is bio-panel only. */
function syncAuthorCardEmoji(authorName) {
    const key = authorHandleKey(authorName);
    document.querySelectorAll('.blog-card.author-card').forEach((card) => {
        const name = authorHandleKey(card.getAttribute('data-author') || '');
        if (name !== key) return;
        const title = card.querySelector('.blog-title');
        if (!title) return;
        const handle = card.getAttribute('data-author') || name;
        const label = card.classList.contains('author-card-self') ? 'me' : `@${handle}`;
        title.textContent = label;
        title.setAttribute('data-text', label);
    });
}

function visibleBioHandleEl() {
    const editing = document.body.classList.contains('bio-editing');
    const nameEl = document.getElementById(editing ? 'bio-edit-handle' : 'bio-author-name');
    if (!nameEl || nameEl.offsetParent === null) return null;
    return nameEl;
}

function measureBioHandleAscent(nameEl) {
    const fontSize = parseFloat(getComputedStyle(nameEl).fontSize) || 56;
    let ascent = fontSize * 0.8;
    try {
        const cs = getComputedStyle(nameEl);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            const m = ctx.measureText(nameEl.textContent || 'Hg');
            if (typeof m.fontBoundingBoxAscent === 'number' && m.fontBoundingBoxAscent > 0) {
                ascent = m.fontBoundingBoxAscent;
            } else if (typeof m.actualBoundingBoxAscent === 'number' && m.actualBoundingBoxAscent > 0) {
                ascent = m.actualBoundingBoxAscent;
            }
        }
    } catch (_) {
        /* keep fallback */
    }
    return Math.max(1, ascent);
}

/**
 * Photo edge = handle font-size. Handle sits 4px to the right; its alphabetic
 * baseline is pinned to the photo’s bottom edge via --bio-handle-bottom.
 */
function syncBioAvatarToHandleLine(scale = 1) {
    const panel = document.querySelector('.bio-panel');
    if (!panel) return;

    const nameEl = visibleBioHandleEl();
    const row = nameEl?.closest('.bio-identity-row');
    const wrap = document.getElementById('bio-avatar-wrap');
    if (!nameEl || !row || !wrap) {
        panel.style.removeProperty('--bio-avatar-size');
        panel.style.removeProperty('--bio-handle-bottom');
        return;
    }

    nameEl.style.removeProperty('top');
    nameEl.style.removeProperty('position');

    const fontSize = parseFloat(getComputedStyle(nameEl).fontSize) || 56;
    const size = Math.max(24, Math.round(fontSize));
    panel.style.setProperty('--bio-avatar-size', `${size}px`);

    if (scale > 0 && scale < 0.999) {
        nameEl.style.transformOrigin = 'left bottom';
        nameEl.style.transform = `scale(${scale})`;
    } else {
        nameEl.style.removeProperty('transform');
    }

    // Reset bottom, measure baseline, then shift so baseline == photo bottom.
    panel.style.setProperty('--bio-handle-bottom', '0px');
    nameEl.offsetHeight;
    wrap.offsetHeight;

    const ascent = measureBioHandleAscent(nameEl);
    const nameTop = nameEl.getBoundingClientRect().top;
    const baselineY = nameTop + ascent * (scale > 0 && scale < 0.999 ? scale : 1);
    const avatarBottom = wrap.getBoundingClientRect().bottom;
    // CSS `bottom` grows upward; positive dy (baseline above photo) → negative bottom.
    const dy = avatarBottom - baselineY;
    panel.style.setProperty('--bio-handle-bottom', `${-dy}px`);
}

/** Scale the identity-card handle so the full tag fits on one line (no ellipsis / wrap). */
function fitBioPanelAuthorNames() {
    const panel = document.querySelector('.bio-panel');
    if (!panel) return;
    panel.querySelectorAll('.bio-author-name').forEach((el) => {
        if (!el || el.offsetParent === null) return;

        el.style.removeProperty('font-size');
        el.style.removeProperty('transform');
        el.style.whiteSpace = 'nowrap';
        el.style.overflow = 'visible';
        el.style.textOverflow = 'clip';
        el.offsetHeight;
        syncBioAvatarToHandleLine(1);

        const head = el.closest('.bio-card-head');
        const headW = head?.clientWidth || 0;
        if (!(headW > 0)) return;

        const avatarSize =
            parseFloat(panel.style.getPropertyValue('--bio-avatar-size')) ||
            parseFloat(getComputedStyle(panel).getPropertyValue('--bio-avatar-size')) ||
            56;
        const maxW = Math.max(24, headW - avatarSize - 4);

        el.style.width = 'max-content';
        el.style.maxWidth = 'none';
        el.offsetHeight;

        let width = el.scrollWidth || el.getBoundingClientRect().width;
        let scale = 1;
        if (width > maxW) {
            const base = parseFloat(getComputedStyle(el).fontSize) || 56;
            let lo = 10;
            let hi = base;
            let best = lo;
            for (let i = 0; i < 14; i++) {
                const mid = (lo + hi) / 2;
                el.style.fontSize = `${mid}px`;
                el.offsetHeight;
                width = el.scrollWidth || el.getBoundingClientRect().width;
                if (width <= maxW) {
                    best = mid;
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            el.style.fontSize = `${best}px`;
            el.offsetHeight;
            width = el.scrollWidth || el.getBoundingClientRect().width;
            if (width > maxW) scale = Math.max(0.4, maxW / width);
        }
        el.style.removeProperty('width');
        el.style.maxWidth = '100%';
        syncBioAvatarToHandleLine(scale);
    });
}

function applyAuthorProfileToPanel(authorName, profile) {
    const panel = document.querySelector('.bio-panel');
    if (!panel) return;
    const name = authorName || 'Anonymous';
    const p = profile || emptyAuthorProfile(name);
    const isSelf = isViewingOwnAuthorBio(name);

    // Hard gate: edit UI only while viewing your own panel and explicitly editing.
    if (!isSelf || panel.dataset.author !== name) {
        document.body.classList.remove('bio-editing');
    }

    const img = document.getElementById('bio-avatar');
    if (img) {
        const fromProfile = normalizeClientAvatarPath(p.avatar);
        if (fromProfile) authorAvatarByName[name] = fromProfile;
        const url = fromProfile || avatarUrlForAuthor(name);
        if (url) {
            if (img.getAttribute('src') !== url) img.src = url;
            img.removeAttribute('hidden');
        } else {
            img.removeAttribute('src');
            img.setAttribute('hidden', '');
        }
        img.alt = `@${name}`;
    }

    const nameEl = document.getElementById('bio-author-name');
    if (nameEl) {
        const color = mastheadAuthorColor(name);
        nameEl.textContent = name;
        nameEl.style.setProperty('--bio-author-color', color);
        nameEl.style.color = color;
    }

    const textEl = document.getElementById('bio-text');
    const profileCard = document.getElementById('bio-panel-profile');
    const bio = String(p.bio || '').trim();
    if (textEl) {
        textEl.textContent = bio;
        textEl.hidden = !bio;
        if (typeof GppBioTextScale !== 'undefined') {
            GppBioTextScale.applyBioTextLengthScale(textEl, bio);
        }
    }
    if (profileCard) {
        profileCard.classList.toggle('bio-no-bio', !bio);
    }

    const metaEl = document.getElementById('bio-meta');
    if (metaEl) {
        metaEl.innerHTML = '';
        const rows = [
            p.location ? { icon: '📍', text: p.location } : null,
            p.website
                ? {
                      icon: '🔗',
                      text: p.website.replace(/^https?:\/\//i, ''),
                      href: p.website
                  }
                : null
        ].filter(Boolean);
        if (!rows.length) {
            metaEl.hidden = true;
            metaEl.setAttribute('hidden', '');
        } else {
            metaEl.hidden = false;
            metaEl.removeAttribute('hidden');
            rows.forEach((row) => {
                const li = document.createElement('li');
                li.className = 'bio-meta-item';
                const icon = document.createElement('span');
                icon.className = 'bio-meta-icon';
                icon.textContent = row.icon;
                li.appendChild(icon);
                if (row.href) {
                    const a = document.createElement('a');
                    a.className = 'bio-website-link';
                    a.href = row.href;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.textContent = row.text;
                    li.appendChild(a);
                } else {
                    const span = document.createElement('span');
                    span.textContent = row.text;
                    li.appendChild(span);
                }
                metaEl.appendChild(li);
            });
        }
    }

    const linksEl = document.getElementById('bio-links');
    if (linksEl) {
        linksEl.innerHTML = '';
        const socials = Array.isArray(p.socialLinks) ? p.socialLinks.filter(Boolean) : [];
        if (!socials.length) {
            linksEl.hidden = true;
            linksEl.setAttribute('hidden', '');
        } else {
            linksEl.hidden = false;
            linksEl.removeAttribute('hidden');
            socials.forEach((url) => {
                const a = createSocialLinkEl(url);
                if (a) linksEl.appendChild(a);
            });
        }
    }

    const latestCard = document.getElementById('bio-latest-card');
    const latestSingle = document.getElementById('bio-latest-single');
    const latestLink = document.getElementById('bio-latest-link');
    const indexEl = document.getElementById('bio-index');
    const indexList = document.getElementById('bio-index-list');
    const latest = authorHomeProfiles[name];
    const posts = Array.isArray(latest?.posts) ? latest.posts : [];
    if (latestCard) {
        let indexPosts = posts;
        if (!indexPosts.length && latest?.latestId) {
            indexPosts = [{
                id: latest.latestId,
                title: latest.latestTitle || 'Untitled',
                publishedAt: latest.latestPublishedAt,
                ms: latest.latestMs
            }];
        }
        if (indexPosts.length && indexEl && indexList) {
            const solo = indexPosts.length === 1;
            latestCard.hidden = false;
            latestCard.removeAttribute('hidden');
            latestCard.classList.add('is-index');
            latestCard.classList.toggle('is-solo', solo);
            latestCard.classList.remove('is-latest');
            if (latestSingle) {
                latestSingle.hidden = true;
                latestSingle.setAttribute('hidden', '');
            }
            indexEl.hidden = false;
            indexEl.removeAttribute('hidden');
            indexList.innerHTML = '';
            indexPosts.forEach((post, i) => {
                const li = document.createElement('li');
                li.className = 'bio-index-item' + (i === 0 ? ' is-latest' : '');
                const meta = document.createElement('span');
                meta.className = 'bio-index-meta';
                const d = new Date(post.publishedAt || post.ms || 0);
                if (!Number.isNaN(d.getTime())) {
                    const dd = String(d.getDate()).padStart(2, '0');
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    meta.textContent = `${dd}.${mm}.${d.getFullYear()}`;
                }
                const a = document.createElement('a');
                a.className = 'bio-index-link';
                a.href = `/${post.id}`;
                a.textContent = post.title || 'Untitled';
                if (meta.textContent) li.appendChild(meta);
                li.appendChild(a);
                indexList.appendChild(li);
            });
            if (latestLink) {
                latestLink.removeAttribute('href');
                latestLink.textContent = '';
            }
        } else {
            latestCard.hidden = true;
            latestCard.setAttribute('hidden', '');
            latestCard.classList.remove('is-index', 'is-solo', 'is-latest');
            if (latestLink) {
                latestLink.removeAttribute('href');
                latestLink.textContent = '';
            }
            if (indexList) indexList.innerHTML = '';
        }
    }

    const captureUrl = normalizeCaptureUrlClient(p.captureUrl);
    const captureInput = document.getElementById('bio-edit-capture-url');
    if (captureInput && !document.body.classList.contains('bio-editing')) {
        captureInput.value = captureUrl;
    }
    renderCaptureMedia(captureUrl);
    syncCaptureCardVisibility(captureUrl, {
        editing: document.body.classList.contains('bio-editing') && isSelf
    });

    const editBtn = document.getElementById('bio-edit-btn');
    if (editBtn) editBtn.hidden = !isSelf;

    syncAuthorCardEmoji(name);
    requestAnimationFrame(() => fitBioPanelAuthorNames());
}

function fillAuthorBioPanel(authorName) {
    const panel = ensureHomeBioPanel();
    const name = authorName || 'Anonymous';
    // Always leave edit mode when switching authors / reopening.
    document.body.classList.remove('bio-editing');
    panel.dataset.author = name;
    exitAuthorBioEditMode();
    applyAuthorProfileToPanel(name, authorProfileCache[authorHandleKey(name)] || emptyAuthorProfile(name));
    fetchAuthorProfile(name).then((profile) => {
        if (panel.dataset.author !== name) return;
        // Keep editors closed if this isn't your panel (or you weren't editing).
        if (!isViewingOwnAuthorBio(name)) {
            document.body.classList.remove('bio-editing');
        }
        applyAuthorProfileToPanel(name, profile);
    });
}

function createBlogCard(blog, section, sectionIndex) {
    const data = blog.data();
    const authorName = data.author ? data.author.split('@')[0] : 'Anonymous';
    const titleText = formatTitleForCard(data.title || '');

    const container = document.createElement('div');
    container.className = 'cardcontainer';
    container.setAttribute('data-author', authorName);

    const card = document.createElement('div');
    card.className = 'blog-card';
    card.style.cursor = 'pointer';
    // Store blog ID for navigation
    card.dataset.blogId = blog.id;
    card.dataset.sectionIndex = String(sectionIndex);
    installTapNotSwipe(card);
    card.onclick = (e) => {
        e.stopPropagation();
        if (tapWasSwipe(card)) return;
        // Mobile narrow: one tap → handoff + warm embed + slab reveal.
        if (homeDirectArticleTapNav()) {
        expandArticlePanelAndNavigate(blog.id, card);
            return;
        }
        // Desktop: click opens preview; click same title again closes it. Preview click opens article.
        const panel = document.querySelector('.article-panel');
        const previewOpen =
            document.body.classList.contains('article-open') &&
            !document.body.classList.contains('article-closing') &&
            panel &&
            !panel.classList.contains('expanding-fullscreen');
        if (previewOpen && panel.dataset.blogId === blog.id) {
            closeArticlePreview();
            return;
        }
        const sectionIndex = Number(card.dataset.sectionIndex || 1);
        const seamIndex = SEAM_BY_SECTION[sectionIndex] || 2;
        applyArticlePreviewFromBlogCard(card, seamIndex);
    };
    // Persist preview data for the hover preview panel
    if (typeof data.preview === 'string' && data.preview.length) {
        card.dataset.preview = data.preview;
    }
    card.dataset.title = data.title || '';
    card.dataset.publishedAt = data.publishedAt || '';

    // optional banner kept commented in markup previously
    const titleEl = document.createElement('h1');
    titleEl.className = 'blog-title';
    titleEl.setAttribute('data-text', titleText);
    titleEl.textContent = titleText;

    card.appendChild(titleEl);
    container.appendChild(card);
    section.appendChild(container);
    return container;
}

function createSectionTitleCard(section, titleText) {
    const container = document.createElement('div');
    container.className = 'cardcontainer section-title-container';

    const card = document.createElement('div');
    card.className = 'blog-card section-heading-card';
    card.style.cursor = 'default';

    const titleEl = document.createElement('h1');
    titleEl.className = 'blog-title';
    titleEl.setAttribute('data-text', titleText);
    titleEl.textContent = titleText;

    card.appendChild(titleEl);
    container.appendChild(card);
    section.appendChild(container);
}

/** Last signed-in author handle — paint "me" on first wall paint (no @handle → me flicker). */
const HOME_SELF_AUTHOR_KEY = 'homeSelfAuthorHandle';

function rememberedSelfAuthorHandle() {
    try {
        return authorHandleKey(sessionStorage.getItem(HOME_SELF_AUTHOR_KEY) || '');
    } catch (_) {
        return '';
    }
}

function rememberSelfAuthorHandle(handle) {
    try {
        const key = authorHandleKey(handle);
        if (key) sessionStorage.setItem(HOME_SELF_AUTHOR_KEY, key);
        else sessionStorage.removeItem(HOME_SELF_AUTHOR_KEY);
    } catch (_) {
        /* private mode */
    }
}

function createAuthorCard(authorName, section) {
    const self = rememberedSelfAuthorHandle();
    const isSelf = Boolean(self) && authorHandleKey(authorName) === self;
    const label = isSelf ? 'me' : `@${authorName}`;
    const selfClass = isSelf ? ' author-card-self' : '';
    const safeName = String(authorName || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
    section.innerHTML += `
        <div class="cardcontainer">
            <div class="blog-card author-card${selfClass}" data-author="${safeName}" style="cursor: pointer;">
                <h1 class="blog-title" id="${safeName}" data-text="${label}">${label}</h1>
            </div>
        </div>
    `;
}

function createAboutCard(section) {
    section.innerHTML += `
        <div class="cardcontainer">
            <div class="blog-card author-card" data-author="about" id="about-card" style="cursor: pointer;">
                <h1 class="blog-title" id="about" data-text="about">about</h1>
            </div>
        </div>
    `;
}

function createSearchCard(section) {
    section.innerHTML += `
        <div class="cardcontainer">
            <div class="blog-card" id="search-card" data-action="search" style="cursor: pointer;">
                <h1 class="blog-title" data-text="search">search</h1>
            </div>
        </div>
    `;
}

function getAboutDurationMs() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--aboutDuration').trim();
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return 800;
    if (raw.endsWith('ms')) return n;
    if (raw.endsWith('s')) return n * 1000;
    return n;
}

let searchStripCloseTimer = null;
let searchStripCloseSeq = 0;

function closeHomeSearchStrip(options = {}) {
    const { switchToBio = false } = options;
    const wasOpen =
        document.body.classList.contains('search-open') ||
        document.body.classList.contains('search-closing');
    document.body.classList.remove('search-open');
    const input = document.getElementById('home-search-input');
    if (input) input.value = '';
    applyHomeSearchFilter('');

    if (!wasOpen || switchToBio) {
        document.body.classList.remove('search-closing');
        if (searchStripCloseTimer) {
            clearTimeout(searchStripCloseTimer);
            searchStripCloseTimer = null;
        }
        return;
    }

    // Keep search UI painted while the wall slides shut (bio profile stays hidden).
    const closeSeq = ++searchStripCloseSeq;
    document.body.classList.add('search-closing');
    const wallEl = document.querySelector('.column-section');
    const finish = () => {
        if (closeSeq !== searchStripCloseSeq) return;
        document.body.classList.remove('search-closing');
        searchStripCloseTimer = null;
        if (wallEl) wallEl.removeEventListener('transitionend', onEnd);
    };
    const onEnd = (e) => {
        if (e.target !== wallEl) return;
        if (e.propertyName !== 'translate' && e.propertyName !== 'transform') return;
        finish();
    };
    if (wallEl) wallEl.addEventListener('transitionend', onEnd);
    if (searchStripCloseTimer) clearTimeout(searchStripCloseTimer);
    searchStripCloseTimer = setTimeout(finish, getAboutDurationMs() + 80);
}

function placeAboutPopupNearCard(popup, aboutCard) {
    if (!popup || !aboutCard) return;
    const rect = aboutCard.getBoundingClientRect();
    const pad = 12;
    const width = Math.min(340, window.innerWidth - pad * 2);
    let left = rect.left - width - 16;
    if (left < pad) left = Math.max(pad, rect.right + 16);
    left = Math.min(left, window.innerWidth - width - pad);
    let top = Math.max(pad, Math.min(rect.top, window.innerHeight - 120));
    popup.style.width = `${width}px`;
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
    popup.style.right = 'auto';
    popup.style.bottom = 'auto';
}

function openAboutPopup({ reposition = true } = {}) {
    clearAboutHoverTimer();
    const popup = document.getElementById('about-popup');
    if (!popup) return;
    const aboutCard = document.getElementById('about-card');
    if (reposition || !popup.style.left) {
        placeAboutPopupNearCard(popup, aboutCard);
    }
    popup.hidden = false;
    closeHomeSearchStrip();
}

function closeAboutPopup() {
    clearAboutHoverTimer();
    const popup = document.getElementById('about-popup');
    if (!popup || popup.hidden) return;
    popup.hidden = true;
    popup.classList.remove('is-dragging');
}

function setupAboutPopupInteractions(popup) {
    if (!popup) return;
    const aboutCard = () => document.getElementById('about-card');

    const scheduleOpen = () => {
        if (!popup.hidden) return;
        clearAboutHoverTimer();
        aboutHoverTimer = setTimeout(() => {
            if (popup.hidden) openAboutPopup({ reposition: true });
        }, PANEL_HOVER_DWELL_MS);
    };

    // Hover (fine pointer) opens; click also opens on touch / as a fallback.
    document.addEventListener(
        'pointerover',
        (e) => {
            if (!homeFinePointerHoverUi()) return;
            if (e.target.closest('#about-card') || e.target.closest('#about-popup')) {
                scheduleOpen();
            }
        },
        true
    );
    document.addEventListener(
        'pointerout',
        (e) => {
            if (!homeFinePointerHoverUi()) return;
            const next = e.relatedTarget;
            if (next && (next.closest?.('#about-card') || next.closest?.('#about-popup'))) return;
            if (e.target.closest('#about-card') || e.target.closest('#about-popup')) {
                clearAboutHoverTimer();
            }
        },
        true
    );

    document.addEventListener(
        'click',
        (e) => {
            const card = aboutCard();
            if (card && (e.target === card || card.contains(e.target))) {
                e.preventDefault();
                e.stopPropagation();
                if (popup.hidden) openAboutPopup({ reposition: true });
                return;
            }
            if (popup.hidden) return;
            if (e.target.closest('#about-popup')) return;
            closeAboutPopup();
        },
        true
    );

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (popup.hidden) return;
        closeAboutPopup();
    });

    // Drag anywhere on the card (ignore text selection drags that start on a long-press select).
    let drag = null;
    popup.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        if (e.target.closest('a, button, input, textarea')) return;
        const r = popup.getBoundingClientRect();
        drag = {
            pointerId: e.pointerId,
            offsetX: e.clientX - r.left,
            offsetY: e.clientY - r.top,
            moved: false
        };
        popup.classList.add('is-dragging');
        try {
            popup.setPointerCapture(e.pointerId);
        } catch (_) {}
        e.preventDefault();
    });
    popup.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        drag.moved = true;
        const width = popup.offsetWidth;
        const height = popup.offsetHeight;
        const pad = 8;
        let left = e.clientX - drag.offsetX;
        let top = e.clientY - drag.offsetY;
        left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
        top = Math.max(pad, Math.min(top, window.innerHeight - height - pad));
        popup.style.left = `${Math.round(left)}px`;
        popup.style.top = `${Math.round(top)}px`;
    });
    const endDrag = (e) => {
        if (!drag || (e && e.pointerId !== drag.pointerId)) return;
        drag = null;
        popup.classList.remove('is-dragging');
    };
    popup.addEventListener('pointerup', endDrag);
    popup.addEventListener('pointercancel', endDrag);
}

function openHomeSearchStrip() {
    document.body.classList.remove('bio-open');
    closeAboutPopup();
    document.body.classList.remove('search-closing');
    if (searchStripCloseTimer) {
        clearTimeout(searchStripCloseTimer);
        searchStripCloseTimer = null;
    }
    searchStripCloseSeq += 1;
    document.body.classList.add('search-open');
    const input = document.getElementById('home-search-input');
    if (input) {
        requestAnimationFrame(() => {
            input.focus();
            input.select();
        });
    }
}

function applyHomeSearchFilter(query) {
    const q = String(query || '').trim().toLowerCase();
    document.querySelectorAll('.title-section .cardcontainer[data-author]').forEach((el) => {
        if (el.classList.contains('section-title-container')) return;
        const card = el.querySelector('.blog-card');
        if (!card) return;
        const title = (card.dataset.title || '').toLowerCase();
        const author = (el.getAttribute('data-author') || '').toLowerCase();
        const match = !q || title.includes(q) || author.includes(q);
        card.classList.toggle('search-miss', !match);
    });
    if (q) {
        scrollHomeSearchMatchesIntoView();
    }
}

function scrollHomeSearchMatchesIntoView() {
    document.querySelectorAll('.title-section').forEach((section) => {
        const matches = Array.from(section.querySelectorAll('.cardcontainer[data-author]')).filter((el) => {
            if (el.classList.contains('section-title-container')) return false;
            const card = el.querySelector('.blog-card');
            return card && !card.classList.contains('search-miss');
        });
        if (!matches.length) return;

        const viewTop = section.scrollTop;
        const viewBottom = viewTop + section.clientHeight;
        const pad = 12;
        const anyVisible = matches.some((el) => {
            const top = el.offsetTop;
            const bottom = top + el.offsetHeight;
            return bottom > viewTop + pad && top < viewBottom - pad;
        });
        if (anyVisible) return;

        const first = matches[0];
        const targetTop = Math.max(0, first.offsetTop - pad);
        section.scrollTo({ top: targetTop, behavior: 'smooth' });
    });
}

function createActionCard(actionText, section) {
    const cardId = actionText.replace(/\s+/g, '-');
    section.innerHTML += `
        <div class="cardcontainer" data-action="${cardId}">
            <div class="blog-card" onclick="handleActionCard('${cardId}')" style="cursor: pointer;">
                <h1 class="blog-title" data-text="${actionText.toUpperCase()}">${actionText.toUpperCase()}</h1>
            </div>
        </div>
    `;
}

function createLoginCard(section) {
    section.innerHTML += `
        <div class="cardcontainer" data-action="login" id="login-card">
            <div class="blog-card" onclick="handleActionCard('login')" style="cursor: pointer;">
                <h1 class="blog-title" data-text="LOGIN" id="login-text">LOGIN</h1>
            </div>
        </div>
    `;
}

function createNavCard(navType, section) {
    const displayText = navType.toUpperCase();
    section.innerHTML += `
        <div class="cardcontainer" data-action="${navType}" id="${navType}-card" style="display: none;">
            <div class="blog-card" onclick="handleActionCard('${navType}')" style="cursor: pointer;">
                <h1 class="blog-title" data-text="${displayText}">${displayText}</h1>
            </div>
        </div>
    `;
}

function createWriteBlogCard(section) {
    section.innerHTML += `
        <div class="cardcontainer" data-action="write-a-blog" id="write-blog-card" style="display: none;">
            <div class="blog-card" onclick="handleActionCard('write-a-blog')" style="cursor: pointer;">
                <h1 class="blog-title" data-text="WRITE A BLOG">WRITE A BLOG</h1>
            </div>
        </div>
    `;
}

function layoutAuthControlTitle(titleEl, { align = 'left' } = {}) {
    if (!titleEl) return;
    const probe = titleEl.cloneNode(true);
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'nowrap';
    probe.style.width = 'auto';
    document.body.appendChild(probe);
    // Extra slack for Impact emboss (::before + text-shadow) so the last glyph
    // isn't clipped by the author column's overflow-x: hidden.
    const narrow =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 900px)').matches;
    const embossSlack = align === 'right' ? (narrow ? 18 : 12) : narrow ? 12 : 8;
    const w = Math.ceil(probe.getBoundingClientRect().width + embossSlack);
    const h = Math.ceil(probe.getBoundingClientRect().height + 2);
    document.body.removeChild(probe);
    const card = titleEl.closest('.blog-card');
    const container = titleEl.closest('.cardcontainer');
    if (card) {
        card.style.position = 'relative';
        card.style.width = `${w}px`;
        card.style.height = `${h + 4}px`;
        card.style.overflow = 'visible';
        card.style.flexShrink = '0';
        card.style.padding = '0';
        // Default .blog-card is flex-centered — that left a gap beside right-rail LOGIN.
        card.style.justifyContent = align === 'right' ? 'flex-end' : 'flex-start';
        card.style.alignItems = 'center';
    }
    if (container) {
        container.style.flexShrink = '0';
        container.style.width = 'auto';
        container.style.minWidth = '0';
    }
    titleEl.style.position = 'relative';
    titleEl.style.left = '0';
    titleEl.style.top = '0';
    titleEl.style.textAlign = align;
    titleEl.style.whiteSpace = 'nowrap';
    titleEl.style.width = `${w}px`;
    titleEl.style.display = 'block';
    titleEl.style.overflow = 'visible';
    if (align === 'right' && narrow) {
        titleEl.style.paddingRight = '3px';
        titleEl.style.boxSizing = 'content-box';
    }
}

const AUTH_FOLDER_CLOSED = '📁';
const AUTH_FOLDER_OPEN = '📂';

/**
 * Spacer under author tags for flat LOGIN/APPLY only.
 * Author folder is a popup — it overlays content and does not reserve space.
 */
function measureAuthChromeClearancePx() {
    const controls = document.getElementById('auth-controls');
    if (!controls || controls.offsetParent === null) return 0;
    const menu = document.getElementById('auth-menu');
    if (menu && !menu.hidden) return 0;
    const bottomPad = 14;
    return Math.ceil(bottomPad + (controls.getBoundingClientRect().height || 36));
}

function syncAuthorAuthClearance() {
    const section = document.querySelector('.author-section');
    if (!section) return;
    const clearance = measureAuthChromeClearancePx();
    section.style.setProperty('--author-auth-clearance', `${clearance}px`);

    const spacer = section.querySelector(':scope > .column-scroll-spacer');
    if (spacer) {
        const base = Number(spacer.dataset.baseHeight);
        const baseH = Number.isFinite(base) ? base : parseFloat(spacer.style.height) || 0;
        spacer.dataset.baseHeight = String(baseH);
        spacer.style.height = `${baseH + clearance}px`;
    }
}

let authMenuCloseTimer = 0;

function setAuthMenuOpen(open) {
    const menu = document.getElementById('auth-menu');
    const toggle = document.getElementById('auth-menu-toggle');
    const icon = document.getElementById('auth-menu-icon');
    const stack = document.getElementById('auth-menu-stack');
    if (!menu || !toggle || !icon) return;
    const next = Boolean(open);
    if (authMenuCloseTimer) {
        window.clearTimeout(authMenuCloseTimer);
        authMenuCloseTimer = 0;
    }

    if (next) {
        menu.classList.add('is-open');
        toggle.setAttribute('aria-expanded', 'true');
        icon.textContent = AUTH_FOLDER_OPEN;
        if (stack) stack.setAttribute('aria-hidden', 'false');
        // Panel first (closed eyes), then wake open.
        menu.classList.remove('is-eyes-open');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (menu.classList.contains('is-open')) menu.classList.add('is-eyes-open');
            });
        });
        return;
    }

    // Close: eyelids shut while the square still clips them, then collapse.
    menu.classList.remove('is-eyes-open');
    toggle.setAttribute('aria-expanded', 'false');
    icon.textContent = AUTH_FOLDER_CLOSED;
    if (stack) stack.setAttribute('aria-hidden', 'true');
    authMenuCloseTimer = window.setTimeout(() => {
        authMenuCloseTimer = 0;
        // Drop open state with no fade-out spill — panel overflow clips leftovers.
        menu.classList.remove('is-open');
    }, 380);
}

/** Random hue on LOGOUT / DASHBOARD / EDITOR — same idea as editor/reader nav. */
function bindAuthMenuRandomHover() {
    const stack = document.getElementById('auth-menu-stack');
    if (!stack || stack.dataset.randomHoverBound === '1') return;
    stack.dataset.randomHoverBound = '1';
    stack.querySelectorAll('.blog-card .blog-title').forEach((title) => {
        const card = title.closest('.blog-card') || title;
        card.addEventListener('pointerenter', () => {
            const hue = Math.floor(Math.random() * 360);
            title.style.setProperty('--auth-ink', `hsl(${hue} 72% 42%)`);
        });
        card.addEventListener('pointerleave', () => {
            title.style.removeProperty('--auth-ink');
        });
    });
}

function closeAuthMenu() {
    setAuthMenuOpen(false);
}

function layoutAuthControls() {
    // LOGIN / APPLY stay on the right rail; folder-popup items are left-padded.
    layoutAuthControlTitle(document.getElementById('auth-login-text'), { align: 'right' });
    layoutAuthControlTitle(document.getElementById('auth-menu-logout-text'), { align: 'left' });
    ['auth-editor-card', 'auth-dashboard-card'].forEach((id) => {
        const card = document.getElementById(id);
        if (!card || card.style.display === 'none' || card.hidden) return;
        layoutAuthControlTitle(card.querySelector('.blog-title'), { align: 'left' });
    });
    const applyCard = document.getElementById('auth-apply-card');
    if (applyCard && applyCard.style.display !== 'none' && !applyCard.hidden) {
        layoutAuthControlTitle(applyCard.querySelector('.blog-title'), { align: 'right' });
    }
}

function createAuthControls(section) {
    // Pinned to bottom-right. Authors get a folder popup; guests / applicants stay flat.
    const wrapper = document.createElement('div');
    wrapper.id = 'auth-controls';
    wrapper.style.cssText = `
        position: absolute;
        right: var(--author-rail-inset);
        bottom: 10px;
        display: flex;
        gap: 8px;
        align-items: flex-end;
        z-index: 10;
    `;

    const menu = document.createElement('div');
    menu.id = 'auth-menu';
    menu.className = 'auth-menu';
    menu.hidden = true;

    // White grain panel: items on the left, folder emoji anchored on the right.
    const panel = document.createElement('div');
    panel.id = 'auth-menu-panel';
    panel.className = 'auth-menu-panel';

    const stack = document.createElement('div');
    stack.id = 'auth-menu-stack';
    stack.className = 'auth-menu-stack';
    stack.setAttribute('role', 'menu');
    stack.setAttribute('aria-hidden', 'true');

    const logoutInMenu = document.createElement('div');
    logoutInMenu.className = 'cardcontainer';
    logoutInMenu.id = 'auth-menu-logout-card';
    logoutInMenu.setAttribute('role', 'menuitem');
    logoutInMenu.innerHTML = `
        <div class="blog-card auth-plain" id="auth-menu-logout-btn" data-logout="true" style="cursor: pointer;">
            <h1 class="blog-title" id="auth-menu-logout-text" data-text="LOGOUT">LOGOUT</h1>
        </div>
    `;
    logoutInMenu.onclick = () => {
        closeAuthMenu();
        handleActionCard('login');
    };

    const dashboard = document.createElement('div');
    dashboard.className = 'cardcontainer';
    dashboard.id = 'auth-dashboard-card';
    dashboard.setAttribute('role', 'menuitem');
    dashboard.innerHTML = `
        <div class="blog-card auth-plain" style="cursor: pointer;">
            <h1 class="blog-title" data-text="DASHBOARD">DASHBOARD</h1>
        </div>
    `;
    dashboard.onclick = () => {
        closeAuthMenu();
        window.location.href = '/admin';
    };

    const editor = document.createElement('div');
    editor.className = 'cardcontainer';
    editor.id = 'auth-editor-card';
    editor.setAttribute('role', 'menuitem');
    editor.innerHTML = `
        <div class="blog-card auth-plain" style="cursor: pointer;">
            <h1 class="blog-title" data-text="EDITOR">EDITOR</h1>
        </div>
    `;
    editor.onclick = () => {
        closeAuthMenu();
        window.location.href = '/editor';
    };

    // Top→bottom: LOGOUT, DASHBOARD, EDITOR (EDITOR nearest the folder).
    stack.appendChild(logoutInMenu);
    stack.appendChild(dashboard);
    stack.appendChild(editor);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'auth-menu-toggle';
    toggle.className = 'auth-menu-toggle';
    toggle.setAttribute('aria-label', 'Author menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'auth-menu-stack');
    toggle.innerHTML = `<span id="auth-menu-icon" class="auth-menu-icon" aria-hidden="true">${AUTH_FOLDER_CLOSED}</span>`;
    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setAuthMenuOpen(!menu.classList.contains('is-open'));
    });

    const crest = document.createElement('div');
    crest.className = 'auth-menu-crest';
    crest.setAttribute('aria-hidden', 'true');
    crest.innerHTML = `
        <img class="auth-menu-eyes auth-menu-eyes-closed" src="/img/auth-menu-eyes-closed.png?v=ink-mid-1" alt="" draggable="false" />
        <img class="auth-menu-eyes auth-menu-eyes-open" src="/img/auth-menu-eyes-open.png?v=ink-mid-1" alt="" draggable="false" />
    `;

    const tagline = document.createElement('p');
    tagline.className = 'auth-menu-tagline';
    tagline.textContent = 'keep posting...';

    panel.appendChild(crest);
    panel.appendChild(stack);
    panel.appendChild(tagline);
    panel.appendChild(toggle);
    menu.appendChild(panel);

    const apply = document.createElement('div');
    apply.className = 'cardcontainer';
    apply.id = 'auth-apply-card';
    apply.style.display = 'none';
    apply.innerHTML = `
        <div class="blog-card auth-plain" style="cursor: pointer;">
            <h1 class="blog-title" data-text="APPLY">APPLY</h1>
        </div>
    `;
    apply.onclick = () => openHomeAuthorApplyOverlay();

    const login = document.createElement('div');
    login.className = 'cardcontainer';
    login.id = 'auth-login-wrap';
    login.innerHTML = `
        <div class="blog-card auth-plain" id="auth-login-card" style="cursor: pointer;">
            <h1 class="blog-title" id="auth-login-text" data-text="LOGIN">LOGIN</h1>
        </div>
    `;
    login.onclick = () => handleActionCard('login');

    wrapper.appendChild(menu);
    wrapper.appendChild(apply);
    wrapper.appendChild(login);
    section.appendChild(wrapper);

    if (!wrapper.dataset.menuOutsideBound) {
        wrapper.dataset.menuOutsideBound = '1';
        document.addEventListener(
            'click',
            (e) => {
                if (!menu.classList.contains('is-open')) return;
                if (e.target.closest('#auth-menu')) return;
                closeAuthMenu();
            },
            true
        );
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAuthMenu();
        });
    }

    layoutAuthControls();
    bindAuthMenuRandomHover();
}

function updateAuthControls(user, isRealPerson) {
    const loginText = document.getElementById('auth-login-text');
    const loginWrap = document.getElementById('auth-login-wrap');
    const applyCard = document.getElementById('auth-apply-card');
    const authMenu = document.getElementById('auth-menu');
    const controls = document.getElementById('auth-controls');
    if (!loginText || !authMenu || !controls) return;

    closeAuthMenu();

    if (user && isRealPerson) {
        controls.classList.add('is-author-menu');
        authMenu.hidden = false;
        if (loginWrap) loginWrap.style.display = 'none';
        if (applyCard) applyCard.style.display = 'none';
    } else if (user) {
        controls.classList.remove('is-author-menu');
        authMenu.hidden = true;
        if (loginWrap) loginWrap.style.display = '';
        loginText.textContent = 'LOGOUT';
        loginText.setAttribute('data-text', 'LOGOUT');
        const loginCard = document.getElementById('auth-login-card');
        if (loginCard) loginCard.setAttribute('data-logout', 'true');
        if (applyCard) applyCard.style.display = 'block';
    } else {
        controls.classList.remove('is-author-menu');
        authMenu.hidden = true;
        if (loginWrap) loginWrap.style.display = '';
        loginText.textContent = 'LOGIN';
        loginText.setAttribute('data-text', 'LOGIN');
        const loginCard = document.getElementById('auth-login-card');
        if (loginCard) loginCard.removeAttribute('data-logout');
        if (applyCard) applyCard.style.display = 'none';
    }

    syncSelfAuthorTagLabel(user, isRealPerson);
    layoutAuthControls();
    syncAuthorAuthClearance();
    // Relayout after @handle → "me" so the tag keeps the right rail (desktop too).
    relayoutHomeSectionsRef?.();
}

/** Signed-in authors see their own column tag as "me" (data-author stays the real handle). */
function syncSelfAuthorTagLabel(user, isRealPerson) {
    const selfId =
        isRealPerson && user && typeof getAuthorIdFromUser === 'function'
            ? authorHandleKey(getAuthorIdFromUser(user) || '')
            : '';

    if (selfId) rememberSelfAuthorHandle(selfId);
    else if (!user) rememberSelfAuthorHandle('');

    document.querySelectorAll('.blog-card.author-card').forEach((card) => {
        const name = (card.getAttribute('data-author') || '').trim();
        if (!name || name.toLowerCase() === 'about') return;
        const title = card.querySelector('.blog-title');
        if (!title) return;

        const isSelf = Boolean(selfId) && authorHandleKey(name) === selfId;
        if (isSelf) {
            title.textContent = 'me';
            title.setAttribute('data-text', 'me');
            card.classList.add('author-card-self');
        } else {
            const label = `@${name}`;
            title.textContent = label;
            title.setAttribute('data-text', label);
            card.classList.remove('author-card-self');
        }
    });
}

/** Keep author-column LOGIN / EDITOR in sync with Firebase (incl. return from /admin on mobile). */
function syncAuthControls(user) {
    if (!document.getElementById('auth-login-text')) return;

    if (user) {
        const tokenPromise = typeof refreshAuthorIdFromToken === 'function'
            ? refreshAuthorIdFromToken(user)
            : Promise.resolve();
        tokenPromise
            .then(() => user.getIdTokenResult())
            .then((idTokenResult) => {
                const isRealPerson = idTokenResult.claims.role === 'real person';
                updateAuthControls(user, isRealPerson);
                const panel = document.querySelector('.bio-panel');
                if (panel && document.body.classList.contains('bio-open') && panel.dataset.author) {
                    applyAuthorProfileToPanel(
                        panel.dataset.author,
                        authorProfileCache[authorHandleKey(panel.dataset.author)] ||
                            emptyAuthorProfile(panel.dataset.author)
                    );
                }
            })
            .catch(() => updateAuthControls(user, false));
    } else {
        updateAuthControls(null, false);
        exitAuthorBioEditMode();
        const panel = document.querySelector('.bio-panel');
        if (panel && document.body.classList.contains('bio-open') && panel.dataset.author) {
            applyAuthorProfileToPanel(
                panel.dataset.author,
                authorProfileCache[authorHandleKey(panel.dataset.author)] ||
                    emptyAuthorProfile(panel.dataset.author)
            );
        }
    }
}

auth.onAuthStateChanged((user) => syncAuthControls(user));

window.addEventListener('pageshow', () => {
    syncAuthControls(auth.currentUser);
});

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function randomizeTitles() {
    const blogCards = document.querySelectorAll('.blog-card');
    const cardInnerPadding = 10;

    blogCards.forEach(card => {
        const title = card.querySelector('.blog-title');
        const author = card.querySelector('.blog-author');

        if (title) {
            const cardClientWidth = card.clientWidth;
            const cardClientHeight = card.clientHeight;
            const titleInitialRect = title.getBoundingClientRect();
            const availableWidthForTitle = card.offsetWidth - titleInitialRect.width - (2 * cardInnerPadding);
            const availableHeightForTitle = card.offsetHeight - titleInitialRect.height - (2 * cardInnerPadding);
            const randomTitleLeft = cardInnerPadding + (Math.random() * Math.max(0, availableWidthForTitle));
            const randomTitleTop = cardInnerPadding + (Math.random() * Math.max(0, availableHeightForTitle));

            title.style.top = `${randomTitleTop}px`;
            title.style.left = `${randomTitleLeft}px`;

            if (author) {
                const authorInitialRect = author.getBoundingClientRect();
                const verticalOffsetBelowTitle = 0;
                const horizontalOffsetFromTitleMidpoint = 5;

                let authorTop = randomTitleTop + titleInitialRect.height + verticalOffsetBelowTitle;
                let authorLeft = randomTitleLeft + (titleInitialRect.width / 2) + horizontalOffsetFromTitleMidpoint;

                authorTop = Math.min(authorTop, card.offsetHeight - authorInitialRect.height - cardInnerPadding);
                authorTop = Math.max(cardInnerPadding, authorTop);
                authorLeft = Math.min(authorLeft, card.offsetWidth - authorInitialRect.width - cardInnerPadding);
                authorLeft = Math.max(cardInnerPadding, authorLeft);

                author.style.top = `${authorTop}px`;
                author.style.left = `${authorLeft}px`;
                author.style.color = getRandomColor(); // Set random color
            }
        }
    });
}

function getFirstContentRowTop(sections) {
    const tops = [];
    for (let i = 1; i <= 4; i++) {
        const firstContentCard = sections[i]?.querySelector('.cardcontainer:not(.section-title-container)');
        if (firstContentCard && firstContentCard.style.top) {
            tops.push(parseFloat(firstContentCard.style.top));
        }
    }
    return tops.length ? Math.min(...tops) : 12;
}

function positionCardsInSection(section, options = {}) {
    const cards = Array.from(section.querySelectorAll('.cardcontainer')).filter(
        (c) => !c.closest('#auth-controls')
    );
    const isTitleSection = section.classList.contains('title-section');
    const isMultiColumn = section.classList.contains('column-section');
    const columnPadding = 12;
    const startY = typeof options.startY === 'number' ? options.startY : columnPadding;
    let y = startY;

    cards.forEach(card => {
        const title = card.querySelector('.blog-title');
        if (!title) return;
        const normalizedTitle = (title.textContent || '').replace(/\s+/g, ' ').trim();
        if (title.textContent !== normalizedTitle) {
            title.textContent = normalizedTitle;
            title.setAttribute('data-text', normalizedTitle);
        }
        title.style.margin = '0';
        title.style.padding = '0';
        title.style.boxSizing = 'border-box';

        title.style.width = 'auto';
        title.style.removeProperty('position');
        title.style.removeProperty('left');
        title.style.removeProperty('right');
        title.style.removeProperty('max-width');
        title.style.whiteSpace = 'nowrap';
        title.style.wordBreak = 'normal';
        title.style.overflowWrap = 'normal';
        title.style.removeProperty('overflow');
        title.style.removeProperty('text-overflow');
        title.style.removeProperty('-webkit-line-clamp');
        title.style.removeProperty('display');
        title.style.removeProperty('font-size');
        const deskCard = title.closest('.blog-card');
        if (deskCard) {
            deskCard.style.removeProperty('box-sizing');
            deskCard.style.removeProperty('width');
            deskCard.style.removeProperty('min-width');
            deskCard.style.removeProperty('max-width');
            deskCard.style.removeProperty('position');
            deskCard.style.removeProperty('font-size');
        }
        card.style.removeProperty('box-sizing');
        card.style.removeProperty('min-width');
        card.style.removeProperty('margin');
        card.style.removeProperty('max-width');
        card.style.removeProperty('height');
        card.style.removeProperty('right');
        card.style.removeProperty('left');
        card.style.removeProperty('top');
        card.style.removeProperty('width');
        title.offsetHeight;

        let rect = title.getBoundingClientRect();
        const siteWidth = window.innerWidth;
        const colInner = section.clientWidth || 0;
        const maxWrapWidth = isMultiColumn ? Math.max(64, colInner - 24) : siteWidth * 0.3;
        const stripW = Math.floor(maxWrapWidth);
        let titleUsesFullStrip = false;

        if (isTitleSection && rect.width > maxWrapWidth) {
            titleUsesFullStrip = true;
            title.style.whiteSpace = 'normal';
            title.style.wordBreak = 'break-word';
            title.style.overflowWrap = 'anywhere';
            title.style.lineHeight = '1.1';
            title.style.maxWidth = `${stripW}px`;
            if (isMultiColumn) {
                title.style.display = 'block';
                title.style.boxSizing = 'border-box';
                title.style.width = `${stripW}px`;
                title.style.removeProperty('-webkit-line-clamp');
                title.style.removeProperty('-webkit-box-orient');
            } else {
                title.style.display = '-webkit-box';
                title.style.webkitBoxOrient = 'vertical';
                title.style.webkitLineClamp = '2';
            }
            title.offsetHeight;
            rect = title.getBoundingClientRect();
        } else if (isTitleSection && isMultiColumn) {
            /* Short titles: shrink hit box to glyphs (width auto), not full column strip. */
            title.style.boxSizing = 'border-box';
            title.style.display = 'block';
            title.style.maxWidth = `${stripW}px`;
            title.style.width = 'auto';
            title.style.removeProperty('left');
            title.style.removeProperty('top');
            title.offsetHeight;
            rect = title.getBoundingClientRect();
        }

        const isSectionHeading = card.classList.contains('section-title-container');
        const isAuthorSection = section.classList.contains('author-section');

        // Author rail: keep one line, shrink type to fit the column; ellipsis only if still too wide.
        if (isAuthorSection && !isSectionHeading) {
            const narrow =
                typeof window.matchMedia === 'function' &&
                window.matchMedia('(max-width: 900px)').matches;
            // Mobile needs extra slack for Impact emboss + safe-area so tags aren't clipped.
            const railPad = narrow ? 16 : 8;
            const maxTagW = Math.max(48, Math.floor(colInner - railPad * 2));
            title.style.textAlign = 'right';
            title.style.whiteSpace = 'nowrap';
            title.style.display = 'inline-block';
            title.style.boxSizing = 'border-box';
            // Measure unconstrained width first — max-width would hide overflow and skip shrink.
            title.style.removeProperty('max-width');
            title.style.removeProperty('width');
            title.style.removeProperty('overflow');
            title.style.removeProperty('text-overflow');
            title.offsetHeight;
            let naturalW = title.getBoundingClientRect().width;

            if (naturalW > maxTagW + 0.5) {
                const base = parseFloat(getComputedStyle(title).fontSize) || 28;
                const minPx = Math.max(11, Math.round(base * 0.55));
                let lo = minPx;
                let hi = base;
                let best = minPx;
                for (let i = 0; i < 14; i++) {
                    const mid = (lo + hi) / 2;
                    title.style.fontSize = `${mid}px`;
                    title.offsetHeight;
                    const w = title.getBoundingClientRect().width;
                    if (w <= maxTagW) {
                        best = mid;
                        lo = mid;
                    } else {
                        hi = mid;
                    }
                }
                title.style.fontSize = `${best}px`;
                title.offsetHeight;
                naturalW = title.getBoundingClientRect().width;
                if (naturalW > maxTagW + 0.5) {
                    title.style.display = 'block';
                    title.style.width = `${maxTagW}px`;
                    title.style.maxWidth = `${maxTagW}px`;
                    title.style.overflow = 'hidden';
                    title.style.textOverflow = 'ellipsis';
                    title.offsetHeight;
                    naturalW = title.getBoundingClientRect().width;
                }
            }

            title.style.maxWidth = `${maxTagW}px`;
            rect = title.getBoundingClientRect();
            const tagW = Math.min(maxTagW, Math.ceil(Math.max(naturalW, rect.width)) + 4);
            const tagH = Math.ceil(rect.height) + 2;
            card.style.position = 'absolute';
            card.style.top = `${y}px`;
            card.style.width = `${tagW}px`;
            card.style.height = `${tagH}px`;
            card.style.right = 'var(--author-rail-inset)';
            card.style.left = 'auto';
            y += tagH + 4;
            return;
        }

        const width =
            isTitleSection && isMultiColumn
                ? (titleUsesFullStrip ? stripW : Math.ceil(rect.width)) + 4
                : rect.width + 4;
        const height = rect.height + 2;

        if (isTitleSection && isSectionHeading) {
            // In-flow sticky: pins at column top; articles stay absolutely positioned below.
            card.style.position = 'sticky';
            card.style.top = '0';
            card.style.zIndex = '6';
            card.style.left = '0';
            card.style.right = 'auto';
            /*
             * Keep the sticky chrome full-bleed for the stone cover, but size the
             * inner heading card to the glyph box so column swipes don’t hit empty
             * title-bar width (see mobile pointer-events on .blog-title).
             */
            card.style.width = '100%';
            const headingCard = card.querySelector('.section-heading-card');
            if (headingCard) {
                headingCard.style.width = 'fit-content';
                headingCard.style.maxWidth = '100%';
            }
            card.style.removeProperty('height');
            title.style.textAlign = 'left';
            card.offsetHeight;
            // Same 4px stack gap as between article cards — don't add extra air under the label.
            y = card.offsetHeight + 4;
            return;
        }

        card.style.position = 'absolute';
        card.style.top = `${y}px`;
        card.style.width = `${width}px`;
        card.style.height = `${height}px`;
        if (isTitleSection) {
            card.style.left = '8px';
            card.style.right = 'auto';
            title.style.textAlign = 'left';
        } else {
            // Same rail as #auth-controls (--author-rail-inset).
            card.style.right = 'var(--author-rail-inset)';
            card.style.left = 'auto';
            title.style.textAlign = 'right';
            title.style.whiteSpace = 'nowrap';
            title.style.maxWidth = 'none';
        }

        y += height + 4;
    });

    // Absolute cards don't extend scrollHeight — keep a flow spacer so columns can scroll.
    let spacer = section.querySelector(':scope > .column-scroll-spacer');
    if (!spacer) {
        spacer = document.createElement('div');
        spacer.className = 'column-scroll-spacer';
        spacer.setAttribute('aria-hidden', 'true');
        spacer.style.cssText = 'position:relative;width:1px;pointer-events:none;visibility:hidden;';
        section.appendChild(spacer);
    }
    const baseH = Math.max(y, startY);
    // Sticky section titles already contribute their height in normal flow — don't double-count.
    const stickyTitle = isTitleSection
        ? section.querySelector(':scope > .section-title-container')
        : null;
    const stickyH = stickyTitle ? stickyTitle.offsetHeight : 0;
    const spacerH = Math.max(0, baseH - stickyH);
    spacer.dataset.baseHeight = String(baseH);
    if (section.classList.contains('author-section')) {
        const clearance = measureAuthChromeClearancePx();
        section.style.setProperty('--author-auth-clearance', `${clearance}px`);
        spacer.style.height = `${spacerH + clearance}px`;
    } else {
        spacer.style.height = `${spacerH}px`;
    }
}

function getArticlePreviewRevealMs() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--articlePreviewRevealDuration').trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 2200;
}

function getMobileAuthorCloseMs() {
    const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--mobileAuthorCloseDuration')
        .trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 840;
}

function clearWallLinkHighlight() {
    document.querySelectorAll('.blog-card.link-glow, .blog-card.hover').forEach((el) => {
        el.classList.remove('link-glow', 'hover');
    });
}

function clearPreviewSourceHighlight() {
    document.querySelectorAll('.blog-card.preview-source').forEach((el) => {
        el.classList.remove('preview-source');
    });
}

function setPreviewSourceHighlight(card) {
    clearPreviewSourceHighlight();
    // Drop author↔title cross-glow so only the locked white preview highlight remains.
    clearWallLinkHighlight();
    if (card) card.classList.add('preview-source');
}

function closeArticlePreview() {
    if (document.body.classList.contains('mobile-reader-open')) {
        closeMobileInAppReader();
        return Promise.resolve();
    }
    if (document.body.classList.contains('article-closing') && articlePreviewClosePromise) {
        return articlePreviewClosePromise;
    }
    if (!document.body.classList.contains('article-open')) {
        return Promise.resolve();
    }
    const closeSeq = ++articlePreviewCloseSeq;
    if (articleExpandNavigateTimer) {
        clearTimeout(articleExpandNavigateTimer);
        articleExpandNavigateTimer = null;
    }
    articleExpandInFlight = false;
    clearPreviewSourceHighlight();
    // Cross-glow was frozen while preview was open — clear so it doesn’t stick after close.
    clearWallLinkHighlight();
    document.body.classList.add('article-closing');
    document.body.classList.remove('article-open');
    // Keep seam for one frame in closing state so slabs have a concrete shifted state to animate back from.
    requestAnimationFrame(() => {
        if (closeSeq !== articlePreviewCloseSeq) return;
    clearActivePreviewSeam();
    });
    const panel = document.querySelector('.article-panel');
    if (panel) {
        delete panel.dataset.blogId;
        panel.classList.remove('expanding-fullscreen');
        panel.classList.remove('article-expand-run');
        panel.style.removeProperty('--articlePreviewLockWidth');
        panel.style.removeProperty('--articleExpandClipLeft');
        panel.style.removeProperty('--articleExpandClipRight');
        panel.style.removeProperty('--articleExpandPanelShiftX');
        panel.classList.add('article-preview-closing');
    }
        if (articlePreviewClosingTimer) clearTimeout(articlePreviewClosingTimer);
    articlePreviewClosePromise = new Promise((resolve) => {
        articlePreviewCloseResolve = resolve;
        articlePreviewClosingTimer = setTimeout(() => {
            if (closeSeq !== articlePreviewCloseSeq) return;
            articlePreviewClosingTimer = null;
            if (panel) {
            panel.classList.remove('article-preview-closing');
                delete panel.dataset.handoffTitle;
                delete panel.dataset.handoffAuthor;
                delete panel.dataset.handoffPublishedAt;
                delete panel.dataset.handoffArticle;
                const mount = panel.querySelector('#article-first-page');
                if (mount) mount.innerHTML = '';
            }
            document.body.classList.remove('article-closing');
            articlePreviewCloseResolve = null;
            articlePreviewClosePromise = null;
            resolve();
        }, getArticlePreviewRevealMs());
    });
    return articlePreviewClosePromise;
}

/** Wait until any open/closing article preview is fully shut. */
function ensureArticlePreviewClosed() {
    if (document.body.classList.contains('article-open')) {
        return closeArticlePreview();
    }
    if (document.body.classList.contains('article-closing') && articlePreviewClosePromise) {
        return articlePreviewClosePromise;
    }
    return Promise.resolve();
}

/** Click preview panel → reader; click outside panel (not on a title card) → close preview. */
function ensureArticlePreviewUi() {
    if (articlePreviewUiBound) return;
    const articlePanel = document.querySelector('.article-panel');
    if (!articlePanel) return;
    articlePreviewUiBound = true;
    const closeBtn = articlePanel.querySelector('.article-panel-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeArticlePreview();
        });
    }

    articlePanel.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = articlePanel.dataset.blogId;
        if (!id) return;
        if (homeDirectArticleTapNav()) {
            // Mobile: preview is already full-screen; navigate directly for a seamless transition.
            try {
                const payload = {
                    blogId: id,
                    title: articlePanel.dataset.handoffTitle || '',
                    author: articlePanel.dataset.handoffAuthor || 'Anonymous',
                    publishedAt: articlePanel.dataset.handoffPublishedAt || '',
                    article: articlePanel.dataset.handoffArticle || '',
                    ...canonicalHandoffPageSize(),
                    ts: Date.now()
                };
                sessionStorage.setItem(READER_HANDOFF_KEY, JSON.stringify(payload));
            } catch (_) {}
            location.href = `/${id}`;
            return;
        }
        playExpandFullscreenThenNavigate(id);
    });

    document.addEventListener(
        'click',
        (e) => {
            if (!document.body.classList.contains('article-open')) return;
            if (e.target.closest('.article-panel')) return;
            if (e.target.closest('.mobile-reader-shell')) return;
            if (e.target.closest('.blog-card')) return;
            if (document.body.classList.contains('mobile-reader-open')) {
                closeMobileInAppReader();
                return;
            }
                        closeArticlePreview();
        },
        true
    );
}

function clearBioHoverTimer() {
    if (bioHoverTimer) {
        clearTimeout(bioHoverTimer);
        bioHoverTimer = null;
    }
}

function clearAboutHoverTimer() {
    if (aboutHoverTimer) {
        clearTimeout(aboutHoverTimer);
        aboutHoverTimer = null;
    }
}

let articlePreviewOpenSeq = 0;

async function applyArticlePreviewFromBlogCard(card, seamIndex) {
    const articleEl = document.querySelector('.article-panel');
    if (!articleEl) return;

    const title = card.dataset.title || '';
    await ensureBlogCardArticle(card);
    const rawArticle = card.dataset.article || '';
    const publishedAt = card.dataset.publishedAt || '';
    const author = card.closest('.cardcontainer')?.getAttribute('data-author') || 'Anonymous';
    const blogId = card.dataset.blogId || '';

    // Same seam + already open: swap page content in place (no close/reopen churn).
    // interview/opinion both use seam 2 — this is the common in-gap switch.
    const previewSettledOpen =
        document.body.classList.contains('article-open') &&
        !document.body.classList.contains('article-closing') &&
        !articleEl.classList.contains('expanding-fullscreen');
    const currentSeam = Number(document.body.getAttribute('data-open-seam') || 0);
    if (
        previewSettledOpen &&
        currentSeam === Number(seamIndex) &&
        blogId &&
        articleEl.dataset.blogId !== blogId
    ) {
        const swapSeq = ++articlePreviewOpenSeq;
        articleEl.dataset.blogId = blogId;
    articleEl.dataset.handoffTitle = title;
    articleEl.dataset.handoffAuthor = author;
    articleEl.dataset.handoffPublishedAt = publishedAt;
    articleEl.dataset.handoffArticle = rawArticle;
        setPreviewSourceHighlight(card);
        renderFirstPagePreview(articleEl, { title, article: rawArticle, author, publishedAt }, () => {
            if (swapSeq !== articlePreviewOpenSeq) return;
            setPreviewSourceHighlight(card);
        });
        return;
    }

    const openSeq = ++articlePreviewOpenSeq;
    const hadBioWall =
        document.body.classList.contains('bio-open') ||
        document.body.classList.contains('bio-closing');
    const hadPreview =
        document.body.classList.contains('article-open') ||
        document.body.classList.contains('article-closing');
    // Author wall must finish shutting before slabs part for the preview.
    await ensureAuthorBioClosed();
    if (openSeq !== articlePreviewOpenSeq) return;
    // Hard gate: never start slab motion while bio-closing is still on the body.
    if (document.body.classList.contains('bio-closing') || document.body.classList.contains('bio-open')) {
        return;
    }
    // Different seam: close fully first, then open from a settled wall.
    await ensureArticlePreviewClosed();
    if (openSeq !== articlePreviewOpenSeq) return;

    articleEl.classList.remove('article-preview-closing');
    articleEl.dataset.blogId = blogId;
    articleEl.dataset.handoffTitle = title;
    articleEl.dataset.handoffAuthor = author;
    articleEl.dataset.handoffPublishedAt = publishedAt;
    articleEl.dataset.handoffArticle = rawArticle;
    document.body.classList.remove('article-closing');
    setPreviewSourceHighlight(card);

    const startPreview = () => {
        if (openSeq !== articlePreviewOpenSeq) return;
    setActivePreviewSeam(seamIndex);
    renderFirstPagePreview(articleEl, { title, article: rawArticle, author, publishedAt }, () => {
            if (openSeq !== articlePreviewOpenSeq) return;
            if (document.body.classList.contains('bio-closing') || document.body.classList.contains('bio-open')) {
                return;
            }
        document.body.classList.add('article-open');
            document.body.classList.remove('wall-hover-freeze');
            setPreviewSourceHighlight(card);
        });
    };

    // After a bio/preview shut, settle one beat so transforms are at rest before slabs move.
    if (hadBioWall || hadPreview) {
        requestAnimationFrame(() => {
            requestAnimationFrame(startPreview);
        });
        return;
    }
    startPreview();
}

function setupHoverInteractions() {
    // Cross-highlight author ↔ titles on desktop. Preview still opens on click only.
    // Wash unrelated; faint glow on the related side. Frozen while bio strip is open.
    const blogCards = document.querySelectorAll('.title-section .cardcontainer[data-author] .blog-card:not(.author-card)');
    const authorCards = document.querySelectorAll('.blog-card.author-card');
    const bioInteractionsLocked = () =>
        document.body.classList.contains('bio-open') ||
        document.body.classList.contains('bio-closing') ||
        document.body.classList.contains('wall-hover-freeze') ||
        document.body.classList.contains('article-open');

    const clearCrossHighlight = () => {
        authorCards.forEach((authorCard) => {
            authorCard.classList.remove('hover', 'link-glow');
        });
        blogCards.forEach((card) => {
            card.classList.remove('hover', 'link-glow');
        });
    };

    // Leave often hits the wall between tags before the next enter — defer clear so
    // a quick A→B switch can cancel it and swap filters without an “all on” flash.
    const CROSS_HIGHLIGHT_CLEAR_MS = 50;
    let crossHighlightClearTimer = null;
    const cancelScheduledCrossHighlightClear = () => {
        if (crossHighlightClearTimer) {
            clearTimeout(crossHighlightClearTimer);
            crossHighlightClearTimer = null;
        }
    };
    const scheduleCrossHighlightClear = () => {
        cancelScheduledCrossHighlightClear();
        crossHighlightClearTimer = setTimeout(() => {
            crossHighlightClearTimer = null;
            if (bioInteractionsLocked()) return;
            clearCrossHighlight();
        }, CROSS_HIGHLIGHT_CLEAR_MS);
    };

    /**
     * Cross-highlight in one pass — no blank “all titles on” frame.
     * washOthers: only when hovering an author (not a post title).
     */
    const applyCrossHighlight = (authorName, { washOthers = false } = {}) => {
        cancelScheduledCrossHighlightClear();
        const name = String(authorName || '');
        authorCards.forEach((authorCard) => {
            const authorCardName = authorCard.getAttribute('data-author') || '';
            if (authorCardName.toLowerCase() === 'about' || authorCard.id === 'search-card') {
                authorCard.classList.remove('hover', 'link-glow');
                return;
            }
            const match = authorCardName === name;
            authorCard.classList.toggle('link-glow', match);
            authorCard.classList.toggle('hover', washOthers && !match);
        });
        blogCards.forEach((card) => {
            const cardAuthorName = card.closest('.cardcontainer')?.getAttribute('data-author') || '';
            const match = cardAuthorName === name;
            card.classList.toggle('link-glow', match);
            card.classList.toggle('hover', washOthers && !match);
        });
    };

    if (homeFinePointerHoverUi()) {
        blogCards.forEach((card) => {
            const authorName = card.closest('.cardcontainer').getAttribute('data-author');

            card.addEventListener('mouseenter', () => {
                if (bioInteractionsLocked()) return;
                // Title hover: pair-glow only — do not wash the rest of the wall.
                applyCrossHighlight(authorName, { washOthers: false });
            });

            card.addEventListener('mouseleave', () => {
                if (bioInteractionsLocked()) return;
                scheduleCrossHighlightClear();
        });
    });

        authorCards.forEach((authorCard) => {
        const authorName = authorCard.getAttribute('data-author');
        
        authorCard.addEventListener('mouseenter', () => {
                if (bioInteractionsLocked()) return;
            if ((authorName || '').toLowerCase() === 'about') return;
                if (authorCard.id === 'search-card') return;
                applyCrossHighlight(authorName, { washOthers: true });
        });
        
        authorCard.addEventListener('mouseleave', () => {
                if (bioInteractionsLocked()) return;
                scheduleCrossHighlightClear();
        });
    });
    }

    ensureArticlePreviewUi();
}

// Create a short preview from a full article string (markdown-like)
function derivePreviewFromArticle(articleText) {
    if (!articleText) return '';
    // Split into lines, drop images and headings, keep first 2-3 paragraphs
    const lines = articleText.split('\n').filter(Boolean);
    const paragraphs = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('![')) continue; // image
        if (trimmed.startsWith('#')) continue; // heading
        paragraphs.push(trimmed);
        if (paragraphs.length >= 3) break;
    }
    let text = paragraphs.join(' ');
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();
    // Truncate to ~260 chars at sentence boundary
    const limit = 260;
    if (text.length > limit) {
        const cut = text.slice(0, limit);
        const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
        text = (lastStop > 120 ? cut.slice(0, lastStop + 1) : cut) + (text.length > cut.length ? '…' : '');
    }
    return text;
}

/** Full-width grow animation, then navigate to blog reader (matches --aboutDuration). */
function getCssMsVar(name, fallbackMs) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return fallbackMs;
    if (raw.endsWith('ms')) return n;
    if (raw.endsWith('s')) return n * 1000;
    return n;
}

function getExpandNavigateMs() {
    const clipMs = getCssMsVar('--articleExpandDuration', 1100);
    const shiftMs = getCssMsVar('--articleExpandShiftDuration', clipMs);
    const shiftDelayMs = getCssMsVar('--articleExpandShiftDelay', 0);
    return Math.max(clipMs, shiftMs + shiftDelayMs);
}

function getSeamXPx(viewportWidth) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--seamX').trim();
    if (!raw) return viewportWidth / 2;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return viewportWidth / 2;
    if (raw.endsWith('vw') || raw.endsWith('%')) return (n / 100) * viewportWidth;
    if (raw.endsWith('px')) return n;
    return n;
}

function playExpandFullscreenThenNavigate(blogId) {
    const articlePanel = document.querySelector('.article-panel');
    if (!articlePanel) {
        location.href = `/${blogId}`;
        return;
    }

    const writeHandoffAndGo = () => {
        try {
            const payload = {
                blogId,
                title: articlePanel.dataset.handoffTitle || '',
                author: articlePanel.dataset.handoffAuthor || 'Anonymous',
                publishedAt: articlePanel.dataset.handoffPublishedAt || '',
                article: articlePanel.dataset.handoffArticle || '',
                ...canonicalHandoffPageSize(),
                ts: Date.now()
            };
            sessionStorage.setItem(READER_HANDOFF_KEY, JSON.stringify(payload));
        } catch (_) {}
        location.href = `/${blogId}`;
    };

    if (
        articlePanel.dataset.blogId === blogId &&
        articlePanel.classList.contains('expanding-fullscreen') &&
        articlePanel.classList.contains('article-expand-run') &&
        !articleExpandInFlight
    ) {
        writeHandoffAndGo();
        return;
    }

    if (articleExpandInFlight) return;
    articleExpandInFlight = true;
    if (articleExpandNavigateTimer) {
        clearTimeout(articleExpandNavigateTimer);
        articleExpandNavigateTimer = null;
    }
    const previewPage = articlePanel.querySelector('.home-preview-page');
    if (previewPage) {
        /* offsetWidth is pre-zoom layout width; getBoundingClientRect would double-scale. */
        const lockWidthPx = Math.round(previewPage.offsetWidth)
            || canonicalHandoffPageSize().previewPageWidth;
        articlePanel.style.setProperty('--articlePreviewLockWidth', `${lockWidthPx}px`);
    }
    const panelRect = articlePanel.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || panelRect.width;
    const seamXPx = getSeamXPx(viewportWidth);
    // In expanding-fullscreen, element becomes 100vw wide and remains centered on seamX first.
    // Clip insets must therefore be computed in that element's own coordinate system.
    const expandedLeft = seamXPx - (viewportWidth / 2);
    const expandedRight = expandedLeft + viewportWidth;
    const clipLeft = Math.max(0, panelRect.left - expandedLeft);
    const clipRight = Math.max(0, expandedRight - panelRect.right);
    const panelCenterX = panelRect.left + (panelRect.width / 2);
    const viewportCenterX = viewportWidth / 2;
    const panelShiftX = viewportCenterX - panelCenterX;

    articlePanel.style.setProperty('--articleExpandClipLeft', `${clipLeft.toFixed(2)}px`);
    articlePanel.style.setProperty('--articleExpandClipRight', `${clipRight.toFixed(2)}px`);
    articlePanel.style.setProperty('--articleExpandPanelShiftX', `${panelShiftX.toFixed(2)}px`);
    articlePanel.classList.remove('expanding-fullscreen');
    articlePanel.classList.remove('article-expand-run');
    // Commit the clipped “slit at the seam” while the panel is still hidden (no article-open), so we never
    // paint one frame of the full-width preview slab before the grow runs.
    articlePanel.classList.add('expanding-fullscreen');
    void articlePanel.offsetHeight;
    if (!document.body.classList.contains('article-open')) {
        document.body.classList.add('article-open');
    }
    void articlePanel.offsetHeight;
    const onExpandComplete = () => {
        if (!articleExpandInFlight) return;
        articleExpandInFlight = false;
        if (articleExpandNavigateTimer) {
            clearTimeout(articleExpandNavigateTimer);
            articleExpandNavigateTimer = null;
        }
        writeHandoffAndGo();
    };
    requestAnimationFrame(() => {
        // Start grow on the earliest painted frame after article-open to avoid a visible dead interval.
            void articlePanel.offsetHeight;
                articlePanel.classList.add('article-expand-run');
            const expandMs = getExpandNavigateMs();
            const onTransitionEnd = (e) => {
                if (e.target !== articlePanel) return;
                if (e.propertyName !== 'clip-path' && e.propertyName !== 'transform') return;
                articlePanel.removeEventListener('transitionend', onTransitionEnd);
            onExpandComplete();
            };
            articlePanel.addEventListener('transitionend', onTransitionEnd);
            // Fallback in case transitionend does not fire.
            articleExpandNavigateTimer = setTimeout(() => {
                articlePanel.removeEventListener('transitionend', onTransitionEnd);
            onExpandComplete();
            }, expandMs + 80);
    });
}

async function expandArticlePanelAndNavigate(blogId, card) {
    const narrowTapFlow = homeDirectArticleTapNav();
    if (narrowTapFlow) {
        if (
            document.body.classList.contains('bio-open') ||
            document.body.classList.contains('bio-closing')
        ) {
            await ensureAuthorBioClosed();
        }
        const handoffPayload = await writeMobileReaderHandoffFromCard(blogId, card);
        const sectionIndex = Number(card.dataset.sectionIndex || 1);
        const seamIndex = SEAM_BY_SECTION[sectionIndex] || 2;
        openMobileInAppReader(blogId, seamIndex, card, handoffPayload);
        void anchorMobilePaneToViewport(card);
        return;
    }

    await ensureAuthorBioClosed();
    const title = card.dataset.title || '';
    await ensureBlogCardArticle(card);
    const rawArticle = card.dataset.article || '';
    const publishedAt = card.dataset.publishedAt || '';
    const author = card.closest('.cardcontainer')?.getAttribute('data-author') || 'Anonymous';

    const articlePanel = document.querySelector('.article-panel');
    if (!articlePanel) {
        location.href = `/${blogId}`;
        return;
    }
    if (articlePreviewClosingTimer) {
        clearTimeout(articlePreviewClosingTimer);
        articlePreviewClosingTimer = null;
    }
    articlePanel.classList.remove('article-preview-closing');
    articlePanel.dataset.blogId = blogId;

    const sectionIndex = Number(card.dataset.sectionIndex || 1);
    const seamIndex = SEAM_BY_SECTION[sectionIndex] || 2;
    articlePanel.dataset.handoffTitle = title;
    articlePanel.dataset.handoffAuthor = author;
    articlePanel.dataset.handoffPublishedAt = publishedAt;
    articlePanel.dataset.handoffArticle = rawArticle;

    setActivePreviewSeam(seamIndex);
    renderFirstPagePreview(articlePanel, { title, article: rawArticle, author, publishedAt }, () => {
        playExpandFullscreenThenNavigate(blogId);
    });
}

function updateLoginButton(user) {
    const loginText = document.getElementById('login-text');
    const loginCard = document.getElementById('login-card');
    
    if (loginText && loginCard) {
        // Decide label
        const label = user ? 'LOGOUT' : 'LOGIN';
        loginText.textContent = label;
        loginText.setAttribute('data-text', label);
        
        // Ensure constant width: use max of 'LOGIN' vs 'LOGOUT' rendered width
        const computeTextWidth = (text) => {
            const probe = loginText.cloneNode(true);
            probe.style.position = 'absolute';
            probe.style.visibility = 'hidden';
            probe.style.width = 'auto';
            probe.textContent = text;
            probe.setAttribute('data-text', text);
            document.body.appendChild(probe);
            const w = probe.getBoundingClientRect().width;
            document.body.removeChild(probe);
            return w;
        };
        const maxLabelWidth = Math.max(computeTextWidth('LOGIN'), computeTextWidth('LOGOUT'));
        // Add a tiny padding buffer to avoid hairline overlaps
        const fixedWidth = Math.ceil(maxLabelWidth) + 6;
        loginText.style.width = `${fixedWidth}px`;
        loginText.style.textAlign = 'center';
        
        // Update container and physics width to match
        const titleRect = loginText.getBoundingClientRect();
        const newWidth = Math.ceil(titleRect.width) + 4;
        const newHeight = Math.ceil(titleRect.height) + 2;
        loginCard.style.width = `${newWidth}px`;
        loginCard.style.height = `${newHeight}px`;
        
        const phys = physicsObjects.find(o => o.element === loginCard);
        if (phys) {
            phys.width = newWidth;
            phys.height = newHeight;
        }
    }
}

function updateWriteBlogCard(isRealPerson) {
    const writeBlogCard = document.getElementById('write-blog-card');
    const homeCard = document.getElementById('home-card');
    const editorCard = document.getElementById('editor-card');
    const dashboardCard = document.getElementById('dashboard-card');
    
    const navCards = [writeBlogCard, homeCard, editorCard, dashboardCard];
    
    navCards.forEach(card => {
        if (card) {
            if (isRealPerson) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
                removeCardFromLayout(card);
            }
        }
    });
    
    if (isRealPerson) {
        addNavCardsToLayout();
    }
}

function recalculateCardDimensions(card) {
    const title = card.querySelector('.blog-title');
    
    // Use a fixed width to prevent the card from changing size
    // This keeps the card consistent regardless of text content
    const fixedWidth = 120; // Increased width for better text fit
    title.style.width = `${fixedWidth}px`;
    title.style.textAlign = 'center';
    
    const titleRect = title.getBoundingClientRect();
    const newWidth = titleRect.width + 4;
    const newHeight = titleRect.height + 2;
    
    // Update card dimensions
    card.style.width = `${newWidth}px`;
    card.style.height = `${newHeight}px`;
    
    // Find and update the corresponding physics object
    const physicsObj = physicsObjects.find(obj => obj.element === card);
    if (physicsObj) {
        physicsObj.width = newWidth;
        physicsObj.height = newHeight;
        // Update rest position to match new dimensions
        physicsObj.restX = parseFloat(card.style.left);
        physicsObj.restY = parseFloat(card.style.top);
    }
}

function addNavCardsToLayout() {
    // Reposition all cards to include the navigation cards
    const titleSection = document.querySelector('.title-section');
    if (titleSection) {
        positionCardsInSection(titleSection);
    }
}

function removeCardFromLayout(card) {
    if (card) {
        // Remove from physics objects
        const physicsObj = physicsObjects.find(obj => obj.element === card);
        if (physicsObj) {
            const index = physicsObjects.indexOf(physicsObj);
            physicsObjects.splice(index, 1);
        }
    }
}

function handleActionCard(cardId) {
    if (cardId === 'write-a-blog') {
        window.location.href = '/editor';
    } else if (cardId === 'home') {
        window.location.href = '/';
    } else if (cardId === 'editor') {
        window.location.href = '/editor';
    } else if (cardId === 'dashboard') {
        window.location.href = '/admin';
    } else if (cardId === 'login') {
        if (auth.currentUser) {
            logoutUser();
        } else {
            openHomeLoginOverlay();
        }
    }
}

/** Hard break before THROUGH so wrap doesn’t drift with viewport/type size. */
const SPLASH_MID_LINE = 'HAVE GOOD PERSPECTIVES, LETS LINK AND BUILD\nTHROUGH';

function runSplashMidTypewriter(midEl) {
    return new Promise((resolve) => {
        if (!midEl) {
            resolve();
            return;
        }
        let i = 0;
        const step = () => {
            i += 1;
            const slice = SPLASH_MID_LINE.slice(0, i);
            midEl.textContent = slice;
            midEl.setAttribute('data-text', slice);
            if (i >= SPLASH_MID_LINE.length) {
                resolve();
                return;
            }
            const ch = SPLASH_MID_LINE[i - 1];
            const delay = ch === ',' ? 520 : ch === '\n' ? 280 : ch === ' ' ? 210 : 140;
            setTimeout(step, delay);
        };
        midEl.textContent = '';
        midEl.setAttribute('data-text', '');
        setTimeout(step, 320);
    });
}

function beginSplashCurtain() {
    if (!topdiv || topdiv.classList.contains('fade')) return;
    if (!document.querySelector('.home-main-stage')) return;
    document.body.classList.add('splash-sliding');
    if (navbar) navbar.style.position = 'relative';
    revealHomeTitlesWithEmerge();
    topdiv.classList.add('fade');
}

if (topdiv) {
    topdiv.addEventListener('animationend', (e) => {
        if (e.target !== topdiv || e.animationName !== 'home-wall-splash') return;
        if (!topdiv.classList.contains('fade')) return;
        topdiv.style.display = 'none';
        document.body.classList.remove('splash-sliding');
        const stage = document.querySelector('.home-main-stage');
        if (stage) stage.style.willChange = 'auto';
        // Persist + skip-on-reload only after the curtain finishes.
        markHomeEntryDismissed({ hideNow: true });
        revealHomeTextureSwitcher({ delayMs: 650 });
    });

    topdiv.onclick = () => {
        if (topdiv.classList.contains('fade') || topdiv.classList.contains('splash-typing')) return;
        // Wait for posts — dismissing early left a blank page when the blogs request hung.
        if (!document.querySelector('.home-main-stage')) return;
        // Remember for next visit once the user commits to leaving the splash.
        persistHomeEntryDismissed();
        const midEl = document.getElementById('mid-text');
        topdiv.classList.add('splash-typing');
        runSplashMidTypewriter(midEl).then(() => {
            setTimeout(() => {
                beginSplashCurtain();
            }, 1800);
        });
    };
}

initHomeLoginOverlay();
consumeHomeLoginQuery();

const HOME_TEXTURE_KEY = 'homeTextureId';
const HOME_TEXTURES = {
    grycon: '/img/stone-grycon7.jpg',
    stucco: '/img/STUCCO.JPG',
    stucco8: '/img/STUCCO8.JPG',
};

const SPLASH_CARVE_REFLOW_SEL =
    '.column-section, #first-container-hold, #top-text, #mid-text, #bottom-text, .blog-title, .blog-overview';

/** Force carve layers to repaint — Safari keeps stale background-clip bitmaps after resize/url change. */
function reflowHomeCarveLayers() {
    document.documentElement.classList.add('home-texture-reflow');
    document.querySelectorAll(SPLASH_CARVE_REFLOW_SEL).forEach((el) => {
        el.style.backgroundImage = 'none';
    });
    void document.documentElement.offsetHeight;
    document.querySelectorAll(SPLASH_CARVE_REFLOW_SEL).forEach((el) => {
        el.style.backgroundImage = '';
    });
    document.documentElement.classList.remove('home-texture-reflow');
}

/**
 * Splash type: desktop sizes from line-count × height; mobile stays width-led
 * with open leading (see #first-container-hold mobile vars).
 */
function syncSplashTypeSize() {
    const hold = document.getElementById('first-container-hold');
    if (!hold) return;
    const narrow = window.matchMedia('(max-width: 900px)').matches;
    const widthFracRaw = getComputedStyle(hold).getPropertyValue('--splash-type-width-cap').trim();
    let widthFrac = narrow ? 0.148 : 0.106;
    const vwMatch = /^([\d.]+)vw$/i.exec(widthFracRaw);
    if (vwMatch) widthFrac = parseFloat(vwMatch[1]) / 100;
    const fromWidth = hold.clientWidth * widthFrac;
    if (!(fromWidth > 0)) return;

    if (narrow) {
        // Match CSS: min(widthCap, 12.5vh) — leading opens the block; don’t shrink glyphs.
        const fromVh = hold.clientHeight * 0.125;
        if (!(fromVh > 0)) return;
        hold.style.setProperty('--splash-type-size', `${Math.min(fromWidth, fromVh)}px`);
        return;
    }

    const leading =
        parseFloat(getComputedStyle(hold).getPropertyValue('--splash-type-leading')) || 0.95;
    const lines =
        parseFloat(getComputedStyle(hold).getPropertyValue('--splash-line-count')) || 6;
    const fromHeight = hold.clientHeight / (lines * leading);
    if (!(fromHeight > 0)) return;
    hold.style.setProperty('--splash-type-size', `${Math.min(fromHeight, fromWidth)}px`);
}

let splashTypeResizeTimer = null;
function onSplashTypeResize() {
    if (splashTypeResizeTimer) cancelAnimationFrame(splashTypeResizeTimer);
    splashTypeResizeTimer = requestAnimationFrame(() => {
        splashTypeResizeTimer = null;
        syncSplashTypeSize();
        reflowHomeCarveLayers();
    });
}

function applyHomeTexture(textureId, { persist = true } = {}) {
    const id = HOME_TEXTURES[textureId] ? textureId : 'grycon';
    const path = HOME_TEXTURES[id];
    const cssUrl = `url(${path})`;

    document.documentElement.setAttribute('data-home-texture', id);
    document.documentElement.style.setProperty('--bg-image', cssUrl);

    // Compositor layers (will-change + filtered background-clip:text) keep stale bitmaps
    // after url changes. Briefly clear backgrounds / filters so paint rebuilds.
    reflowHomeCarveLayers();

    if (persist) {
        try {
            localStorage.setItem(HOME_TEXTURE_KEY, id);
        } catch (_) {}
    }
    document.querySelectorAll('.home-texture-swatch').forEach((btn) => {
        const on = btn.dataset.texture === id;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
}

let homeTextureSwitcherRevealTimer = null;

/** Fade the texture picker in after splash / titles settle — not the instant the curtain lifts. */
function revealHomeTextureSwitcher({ delayMs = 850 } = {}) {
    const root = document.getElementById('home-texture-switcher');
    if (!root || root.classList.contains('is-revealed')) return;
    if (homeTextureSwitcherRevealTimer) {
        clearTimeout(homeTextureSwitcherRevealTimer);
        homeTextureSwitcherRevealTimer = null;
    }
    homeTextureSwitcherRevealTimer = setTimeout(() => {
        homeTextureSwitcherRevealTimer = null;
        root.classList.add('is-revealed');
        root.removeAttribute('aria-hidden');
    }, Math.max(0, delayMs));
}

function initHomeTextureSwitcher() {
    const root = document.getElementById('home-texture-switcher');
    if (!root) return;

    root.setAttribute('aria-hidden', 'true');

    let saved = 'grycon';
    try {
        const raw = localStorage.getItem(HOME_TEXTURE_KEY);
        if (raw && HOME_TEXTURES[raw]) saved = raw;
    } catch (_) {}
    applyHomeTexture(saved, { persist: false });

    root.addEventListener('click', (e) => {
        const btn = e.target.closest('.home-texture-swatch');
        if (!btn || !root.contains(btn)) return;
        const id = btn.dataset.texture;
        if (!id || !HOME_TEXTURES[id]) return;
        applyHomeTexture(id);
    });
}

initHomeTextureSwitcher();
syncSplashTypeSize();
window.addEventListener('resize', onSplashTypeResize);

function clearAdminActionQuery(extraKeys = ['admin', 'token', 'reason', 'handle']) {
    try {
        const params = new URLSearchParams(window.location.search);
        extraKeys.forEach((key) => params.delete(key));
        const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash || ''}`;
        window.history.replaceState({}, '', next);
    } catch (_) {}
}

function formatAdminHandle(raw) {
    const cleaned = String(raw || '')
        .trim()
        .replace(/^@+/, '')
        .toLowerCase();
    if (!cleaned) return '';
    return `@${cleaned}`;
}

function ensureHomeAdminBanner() {
    let banner = document.querySelector('.home-admin-banner');
    if (banner) return banner;
    banner = document.createElement('div');
    banner.className = 'home-admin-banner';
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = '<p class="home-admin-banner-text"></p>';
    document.body.appendChild(banner);
    return banner;
}

function setHomeAdminBannerText(text) {
    const banner = ensureHomeAdminBanner();
    const label = banner.querySelector('.home-admin-banner-text');
    if (label) {
        label.textContent = text;
        label.setAttribute('data-text', text);
        label.style.animation = 'none';
        // retrigger enter animation on state change
        void label.offsetWidth;
        label.style.animation = '';
    }
    banner.classList.add('is-visible');
    return banner;
}

function hideHomeAdminBanner(delayMs = 0) {
    const banner = document.querySelector('.home-admin-banner');
    if (!banner) return;
    window.setTimeout(() => {
        banner.classList.remove('is-visible');
        window.setTimeout(() => banner.remove(), 420);
    }, delayMs);
}

async function runHomeAdminAction({ action, token, handle }) {
    const who = formatAdminHandle(handle);
    const pending = who
        ? action === 'reject'
            ? `rejecting ${who}...`
            : `approving ${who}...`
        : action === 'reject'
          ? 'rejecting...'
          : 'approving...';
    const done = action === 'reject' ? 'rejected' : 'approved';
    setHomeAdminBannerText(pending);
    clearAdminActionQuery();

    try {
        const body = new URLSearchParams();
        body.set('token', token);
        const res = await fetch('/api/admin/author-application', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'fetch',
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            },
            body: body.toString(),
            credentials: 'same-origin',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            setHomeAdminBannerText('failed');
            hideHomeAdminBanner(2200);
            return;
        }
        setHomeAdminBannerText(done);
        if (data && data.setPasswordUrl) {
            // Rare: welcome mail failed — keep approved on screen a bit longer.
            hideHomeAdminBanner(3200);
        } else {
            hideHomeAdminBanner(1800);
        }
    } catch (_) {
        setHomeAdminBannerText('failed');
        hideHomeAdminBanner(2200);
    }
}

(function consumeAdminActionQuery() {
    try {
        const params = new URLSearchParams(window.location.search);
        const admin = params.get('admin');
        if (!admin) return;

        if (admin === 'error') {
            setHomeAdminBannerText('failed');
            clearAdminActionQuery();
            hideHomeAdminBanner(2200);
            return;
        }

        if (admin === 'approved' || admin === 'rejected') {
            setHomeAdminBannerText(admin === 'approved' ? 'approved' : 'rejected');
            clearAdminActionQuery();
            hideHomeAdminBanner(1800);
            return;
        }

        if (admin === 'approve' || admin === 'reject') {
            const token = params.get('token') || '';
            const handle = params.get('handle') || '';
            if (!token) {
                setHomeAdminBannerText('failed');
                clearAdminActionQuery();
                hideHomeAdminBanner(2200);
                return;
            }
            runHomeAdminAction({ action: admin, token, handle });
        }
    } catch (_) {}
})();

// After all lets/consts in this file exist — cache mount is sync and would
// otherwise hit TDZ (bioEditorBound / authorProfileCache) on second refresh.
bootHomeWall();
