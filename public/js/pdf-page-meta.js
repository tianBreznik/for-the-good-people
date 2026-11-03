/**
 * PDF page metadata — normalize Firestore/handoff entries, sheet heights, scale helpers.
 * Entry: string URL (legacy) or { url, width?, height? }.
 */
(function (global) {
    const CANONICAL_WIDTH = 620;
    const DEFAULT_HEIGHT = 874;

    function normalize(raw) {
        if (!Array.isArray(raw)) return [];
        const out = [];
        for (const item of raw) {
            if (typeof item === 'string' && item.trim()) {
                out.push({ url: item.trim(), width: CANONICAL_WIDTH, height: 0 });
                continue;
            }
            if (!item || typeof item !== 'object') continue;
            const url = String(item.url || item.u || '').trim();
            if (!url) continue;
            const width = Number(item.width ?? item.w) || CANONICAL_WIDTH;
            const height = Number(item.height ?? item.h) || 0;
            out.push({ url, width, height });
        }
        return out;
    }

    function sheetHeight(page) {
        if (!page) return DEFAULT_HEIGHT;
        const h = Number(page.height);
        if (Number.isFinite(h) && h > 0) return Math.round(h);
        return DEFAULT_HEIGHT;
    }

    function maxSheetHeight(pages) {
        const list = Array.isArray(pages) ? pages : [];
        if (!list.length) return DEFAULT_HEIGHT;
        let max = 0;
        for (const p of list) {
            max = Math.max(max, sheetHeight(p));
        }
        return max || DEFAULT_HEIGHT;
    }

    function measurePage(page) {
        const base = page && page.url ? { ...page } : null;
        if (!base) return Promise.resolve(null);
        if (base.height > 0) return Promise.resolve(base);
        return new Promise((resolve) => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => {
                const nw = img.naturalWidth || CANONICAL_WIDTH;
                const nh = img.naturalHeight || DEFAULT_HEIGHT;
                const scale = CANONICAL_WIDTH / nw;
                base.width = CANONICAL_WIDTH;
                base.height = Math.max(1, Math.round(nh * scale));
                resolve(base);
            };
            img.onerror = () => {
                base.height = DEFAULT_HEIGHT;
                resolve(base);
            };
            img.src = base.url;
        });
    }

    function ensureHeights(pages) {
        const list = normalize(pages);
        return Promise.all(list.map((p) => measurePage(p))).then((rows) => rows.filter(Boolean));
    }

    function snapshot(pages) {
        return JSON.stringify(normalize(pages));
    }

    function applySheetFitScaleForPages(pages, root) {
        const el = root || document.documentElement;
        const maxH = maxSheetHeight(normalize(pages));
        const PG = global.PageGeometry;
        const boot = global.PageGeometryBoot;
        let scale = 1;
        if (PG && typeof PG.getSheetFitScale === 'function') {
            scale = PG.getSheetFitScale({ pageHeight: maxH, pageWidth: CANONICAL_WIDTH });
        } else if (boot && typeof boot.getSheetFitScale === 'function') {
            scale = boot.getSheetFitScale({ pageHeight: maxH, pageWidth: CANONICAL_WIDTH });
        }
        el.style.setProperty('--sheet-scale', String(scale));
        return scale;
    }

    /** Scale to fit one preview page (wall / mobile handoff). */
    function applyPreviewScaleForFirstPage(pages, root) {
        const list = normalize(pages);
        const first = list[0];
        if (!first) return 1;
        return applySheetFitScaleForPages([first], root);
    }

    /** Match preview → reader: scale + --reader-page-height from page 1 (not max page). */
    function applyReaderGeometryForPages(pages, root) {
        const list = normalize(pages);
        const first = list[0];
        const el = root || document.documentElement;
        if (!first) {
            el.style.setProperty('--reader-page-width', CANONICAL_WIDTH + 'px');
            el.style.setProperty('--reader-page-height', DEFAULT_HEIGHT + 'px');
            el.style.setProperty('--sheet-scale', '1');
            return 1;
        }
        const h = sheetHeight(first);
        el.style.setProperty('--reader-page-width', CANONICAL_WIDTH + 'px');
        el.style.setProperty('--reader-page-height', String(h) + 'px');
        const PG = global.PageGeometry;
        const boot = global.PageGeometryBoot;
        let scale = 1;
        const fitOpts = { pageHeight: h, pageWidth: CANONICAL_WIDTH };
        if (PG && typeof PG.getSheetFitScale === 'function') {
            scale = PG.getSheetFitScale(fitOpts);
        } else if (boot && typeof boot.getSheetFitScale === 'function') {
            scale = boot.getSheetFitScale(fitOpts);
        }
        el.style.setProperty('--sheet-scale', String(scale));
        return scale;
    }

    /** Handoff reuse: URLs only so measured heights do not force a rebuild. */
    function handoffSnapshot(pages) {
        return JSON.stringify(normalize(pages).map((p) => p.url));
    }

    global.GppPdfPages = {
        CANONICAL_WIDTH,
        DEFAULT_HEIGHT,
        normalize,
        sheetHeight,
        maxSheetHeight,
        measurePage,
        ensureHeights,
        snapshot,
        handoffSnapshot,
        applySheetFitScaleForPages,
        applyPreviewScaleForFirstPage,
        applyReaderGeometryForPages,
    };
})(typeof window !== 'undefined' ? window : globalThis);
