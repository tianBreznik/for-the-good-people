/**
 * Shared article page geometry — reader, paginated editor, and home preview.
 * Sheets are a fixed canonical size; viewports scale the display, never the pack.
 */

/** Design sheet — matches prior desktop cap: width 620, height 620 × 1.41. */
export const CANONICAL_PAGE_WIDTH = 620;
export const CANONICAL_PAGE_HEIGHT = Math.round(CANONICAL_PAGE_WIDTH * 1.41); // 874

/** Fixed padding (px) — was viewport-clamped; freeze mid/desktop values. */
export const CANONICAL_PAD_INLINE = 40; // 2.5rem
export const CANONICAL_PAD_BLOCK_TOP = 30;
export const CANONICAL_PAD_BLOCK_BOTTOM = 34; // ~2.125rem
export const CANONICAL_PAGE_GAP = 36;

export function getViewportHeight() {
    if (window.visualViewport && Number.isFinite(window.visualViewport.height)) {
        return Math.floor(window.visualViewport.height);
    }
    return window.innerHeight || 800;
}

export function getViewportWidth() {
    if (window.visualViewport && Number.isFinite(window.visualViewport.width)) {
        return Math.floor(window.visualViewport.width);
    }
    return window.innerWidth || 1200;
}

export function isNarrowViewport() {
    return Boolean(window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
}

/** Outer page height (px) — always the canonical sheet. */
export function getSpreadTargetHeight() {
    return CANONICAL_PAGE_HEIGHT;
}

/**
 * Max footnote band (px). Band sizes to fitted notes up to this cap; overflow spills
 * to the next page (same as blog.js footnoteBandHeight).
 */
export function footnoteBandHeight(spreadHeight) {
    const h = Number(spreadHeight) || CANONICAL_PAGE_HEIGHT;
    if (h <= 0) return 112;
    return Math.min(168, Math.max(96, Math.round(h * 0.155)));
}

/**
 * How much to scale the fixed sheet so it fits the viewport (≤ 1).
 * @param {{ marginX?: number, marginY?: number }} [opts]
 */
function isReaderEmbed() {
    try {
        return new URLSearchParams(window.location.search).get('embed') === '1';
    } catch (_) {
        return false;
    }
}

export function getSheetFitScale(opts = {}) {
    if (typeof window !== 'undefined' && window.PageGeometryBoot?.getSheetFitScale && opts.marginX == null && opts.marginY == null) {
        return window.PageGeometryBoot.getSheetFitScale(opts);
    }
    const narrow = isNarrowViewport();
    const embed = isReaderEmbed();
    const marginX = Number.isFinite(opts.marginX)
        ? opts.marginX
        : embed
          ? 4
          : narrow
            ? 8
            : 48;
    const marginY = Number.isFinite(opts.marginY)
        ? opts.marginY
        : embed
          ? 8
          : narrow
            ? 12
            : 52;
    const availW = Math.max(120, getViewportWidth() - marginX);
    const availH = Math.max(120, getViewportHeight() - marginY);
    const sx = availW / CANONICAL_PAGE_WIDTH;
    const sy = availH / CANONICAL_PAGE_HEIGHT;
    const scale = Math.min(1, sx, sy);
    return Math.max(0.35, Math.round(scale * 1000) / 1000);
}

/**
 * Canonical pack metrics — identical on every screen.
 */
export function getReaderPageMetrics() {
    const pageHeight = CANONICAL_PAGE_HEIGHT;
    const pageWidth = CANONICAL_PAGE_WIDTH;
    const padInline = CANONICAL_PAD_INLINE;
    const padBlockTop = CANONICAL_PAD_BLOCK_TOP;
    const padBlockBottom = CANONICAL_PAD_BLOCK_BOTTOM;
    const pageGap = CANONICAL_PAGE_GAP;
    const footnoteBandMax = footnoteBandHeight(pageHeight);
    const pageInsets = padBlockTop + padBlockBottom + 2;
    const bodyBudgetFull = Math.max(150, Math.floor(pageHeight - pageInsets));
    const bodyBudget = Math.max(150, Math.floor(pageHeight - pageInsets - footnoteBandMax));

    return {
        pageHeight,
        pageWidth,
        padInline,
        padBlockTop,
        padBlockBottom,
        pageInsets,
        pageGap,
        footnoteBandMax,
        /** @deprecated alias — prefer footnoteBandMax + reactive reserve */
        footnoteBand: footnoteBandMax,
        bodyBudgetFull,
        bodyBudget,
        sheetScale: getSheetFitScale(),
    };
}

/** Apply pack metrics onto an element (editor canvas / ProseMirror host). */
export function applyPageMetricsCssVars(el, metrics = getReaderPageMetrics()) {
    if (!el) return metrics;
    el.style.setProperty('--editor-page-height', `${metrics.pageHeight}px`);
    el.style.setProperty('--editor-page-width', `${metrics.pageWidth}px`);
    el.style.setProperty('--editor-page-pad-inline', `${metrics.padInline}px`);
    el.style.setProperty('--editor-page-pad-top', `${metrics.padBlockTop}px`);
    el.style.setProperty('--editor-page-pad-bottom', `${metrics.padBlockBottom}px`);
    el.style.setProperty('--editor-page-gap', `${metrics.pageGap}px`);
    el.style.setProperty('--editor-footnote-band', `${metrics.footnoteBandMax}px`);
    return metrics;
}

/**
 * Publish canonical sheet size + fit scale on :root (reader / preview / editor).
 * Packing always uses 1:1 metrics; `--sheet-scale` is display-only.
 */
export function applyCanonicalSheetCssVars(root = document.documentElement, opts = {}) {
    const scale = getSheetFitScale(opts);
    root.style.setProperty('--reader-page-width', `${CANONICAL_PAGE_WIDTH}px`);
    root.style.setProperty('--reader-page-height', `${CANONICAL_PAGE_HEIGHT}px`);
    root.style.setProperty('--reader-page-pad-inline', `${CANONICAL_PAD_INLINE}px`);
    root.style.setProperty('--reader-page-pad-block', `${CANONICAL_PAD_BLOCK_BOTTOM}px`);
    root.style.setProperty('--reader-page-pad-top', `${CANONICAL_PAD_BLOCK_TOP}px`);
    root.style.setProperty('--sheet-scale', String(scale));
    return scale;
}

if (typeof window !== 'undefined') {
    window.PageGeometry = {
        CANONICAL_PAGE_WIDTH,
        CANONICAL_PAGE_HEIGHT,
        getSpreadTargetHeight,
        footnoteBandHeight,
        getReaderPageMetrics,
        applyPageMetricsCssVars,
        getSheetFitScale,
        applyCanonicalSheetCssVars,
    };
}
