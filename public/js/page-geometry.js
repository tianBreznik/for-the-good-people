/**
 * Shared article page geometry — reader and paginated editor must use the same math.
 * Mirrors public/js/blog.js getSpreadTargetHeight / footnoteBandHeight / page budgets
 * and public/css/blog.css --reader-page-* tokens.
 */

export function getViewportHeight() {
    if (window.visualViewport && Number.isFinite(window.visualViewport.height)) {
        return Math.floor(window.visualViewport.height);
    }
    return window.innerHeight || 800;
}

export function isNarrowViewport() {
    return Boolean(window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
}

/** Outer page height (px) — same as blog.js getSpreadTargetHeight. */
export function getSpreadTargetHeight() {
    const viewportH = getViewportHeight();
    const narrow = isNarrowViewport();
    const inset = narrow
        ? Math.max(16, Math.min(36, Math.round(viewportH * 0.028)))
        : Math.max(30, Math.min(52, Math.round(viewportH * 0.048)));
    return Math.max(viewportH - inset, 440);
}

/** Max footnote band (px) when a page has notes — same as blog.js footnoteBandHeight. */
export function footnoteBandHeight(spreadHeight) {
    const h = Number(spreadHeight) || 0;
    if (h <= 0) return 112;
    return Math.min(168, Math.max(96, Math.round(h * 0.155)));
}

function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

/**
 * Resolve CSS-like clamps used in blog.css for page chrome.
 */
export function getReaderPageMetrics() {
    const pageHeight = getSpreadTargetHeight();
    const viewportH = getViewportHeight();
    const vh = viewportH / 100;
    const vw = (window.innerWidth || 1200) / 100;

    const pageWidth = Math.min(620, pageHeight / 1.41);
    const padInline = clamp(3.3 * vw, 1.75 * 16, 2.5 * 16);
    const padBlockBottom = clamp(3 * vh, 1.5 * 16, 2.125 * 16);
    const padBlockTop = clamp(2.9 * vh, 24, 34);
    const pageGap = clamp(3.2 * vh, 24, 42);
    const footnoteBandMax = footnoteBandHeight(pageHeight);

    // Border 1px top+bottom on .article-page
    const pageInsets = padBlockTop + padBlockBottom + 2;

    /** Full column above bottom pad — footnote reserve applied per page when needed. */
    const bodyBudgetFull = Math.max(150, Math.floor(pageHeight - pageInsets));
    /** Legacy: body with max footnote band always subtracted (reader worst case). */
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
    };
}

/** Apply CSS variables onto an element (editor canvas / ProseMirror host). */
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

if (typeof window !== 'undefined') {
    window.PageGeometry = {
        getSpreadTargetHeight,
        footnoteBandHeight,
        getReaderPageMetrics,
        applyPageMetricsCssVars,
    };
}
