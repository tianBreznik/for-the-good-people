/* Shared author bio social links (home + author reader). */
(function (global) {
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

    global.GppBioSocial = {
        parseSocialLink,
        createSocialLinkEl,
    };
})(typeof window !== 'undefined' ? window : globalThis);
