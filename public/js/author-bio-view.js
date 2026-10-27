/* View-only author bio cards (mobile author reader embed). */
(function (global) {
    function authorHandleKey(name) {
        return String(name || '')
            .trim()
            .replace(/^@+/, '')
            .toLowerCase();
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

    function normalizeClientAvatarPath(raw) {
        const path = String(raw || '').trim();
        if (/^\/?pfps\/[A-Za-z0-9_.-]+$/i.test(path)) {
            return path.startsWith('/') ? path : `/${path}`;
        }
        if (/^\/?uploads\/[A-Za-z0-9_.-]+$/i.test(path)) {
            return path.startsWith('/') ? path : `/${path}`;
        }
        return '';
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
            avatar: '',
        };
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

    function syncBioAvatarToHandleLine(panel, scale = 1) {
        if (!panel) return;
        const nameEl = document.getElementById('bio-author-name');
        const row = nameEl?.closest('.bio-identity-row');
        const wrap = document.getElementById('bio-avatar-wrap');
        if (!nameEl || !row || !wrap || nameEl.offsetParent === null) {
            panel.style.removeProperty('--bio-avatar-size');
            panel.style.removeProperty('--bio-handle-bottom');
            return;
        }

        const fontSize = parseFloat(getComputedStyle(nameEl).fontSize) || 56;
        const size = Math.max(24, Math.round(fontSize));
        panel.style.setProperty('--bio-avatar-size', `${size}px`);

        if (scale > 0 && scale < 0.999) {
            nameEl.style.transformOrigin = 'left bottom';
            nameEl.style.transform = `scale(${scale})`;
        } else {
            nameEl.style.removeProperty('transform');
        }

        panel.style.setProperty('--bio-handle-bottom', '0px');
        nameEl.offsetHeight;
        wrap.offsetHeight;

        const ascent = measureBioHandleAscent(nameEl);
        const nameTop = nameEl.getBoundingClientRect().top;
        const baselineY = nameTop + ascent * (scale > 0 && scale < 0.999 ? scale : 1);
        const avatarBottom = wrap.getBoundingClientRect().bottom;
        const dy = avatarBottom - baselineY;
        panel.style.setProperty('--bio-handle-bottom', `${-dy}px`);
    }

    /** Same fit as home wall bio strip (handle size + avatar baseline lock). */
    function fitBioPanelAuthorNames() {
        const panel = document.querySelector('.author-bio-embed .bio-panel');
        if (!panel) return;
        panel.querySelectorAll('.bio-author-name').forEach((el) => {
            if (!el || el.offsetParent === null) return;

            el.style.removeProperty('font-size');
            el.style.removeProperty('transform');
            el.style.whiteSpace = 'nowrap';
            el.style.overflow = 'visible';
            el.style.textOverflow = 'clip';
            el.offsetHeight;
            syncBioAvatarToHandleLine(panel, 1);

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
            syncBioAvatarToHandleLine(panel, scale);
        });
    }

    function applyAuthorBioView(authorName, profile, posts) {
        const name = authorName || 'Anonymous';
        const p = profile || emptyAuthorProfile(name);
        const social = global.GppBioSocial;
        const capture = global.GppBioCapture;

        const img = document.getElementById('bio-avatar');
        if (img) {
            const fromProfile = normalizeClientAvatarPath(p.avatar);
            const url = fromProfile || '';
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
                          href: p.website,
                      }
                    : null,
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
        if (linksEl && social) {
            linksEl.innerHTML = '';
            const socials = Array.isArray(p.socialLinks) ? p.socialLinks.filter(Boolean) : [];
            if (!socials.length) {
                linksEl.hidden = true;
                linksEl.setAttribute('hidden', '');
            } else {
                linksEl.hidden = false;
                linksEl.removeAttribute('hidden');
                socials.forEach((url) => {
                    const a = social.createSocialLinkEl(url);
                    if (a) linksEl.appendChild(a);
                });
            }
        }

        const latestCard = document.getElementById('bio-latest-card');
        const latestSingle = document.getElementById('bio-latest-single');
        const latestLink = document.getElementById('bio-latest-link');
        const indexEl = document.getElementById('bio-index');
        const indexList = document.getElementById('bio-index-list');
        const indexPosts = Array.isArray(posts) ? posts : [];

        if (latestCard) {
            if (indexPosts.length && indexEl && indexList) {
                const solo = indexPosts.length === 1;
                latestCard.hidden = false;
                latestCard.removeAttribute('hidden');
                latestCard.classList.add('is-index');
                latestCard.classList.toggle('is-solo', solo);
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
                    a.target = '_parent';
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
                if (indexList) indexList.innerHTML = '';
            }
        }

        if (capture) {
            const captureUrl = capture.normalizeCaptureUrlClient(p.captureUrl);
            capture.renderCaptureMedia(captureUrl, { editing: false });
            capture.syncCaptureCardVisibility(captureUrl, { editing: false });
        }

        requestAnimationFrame(() => fitBioPanelAuthorNames());
    }

    global.GppAuthorBioView = {
        authorHandleKey,
        emptyAuthorProfile,
        applyAuthorBioView,
        fitBioPanelAuthorNames,
    };
})(typeof window !== 'undefined' ? window : globalThis);
