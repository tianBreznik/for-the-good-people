/* Shared author bio capture embed (home + author reader). */
(function (global) {
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


    global.GppBioCapture = {
        normalizeCaptureUrlClient,
        renderCaptureMedia,
        syncCaptureCardVisibility,
        destroyBioYoutubePlayer,
    };
})(typeof window !== 'undefined' ? window : globalThis);
