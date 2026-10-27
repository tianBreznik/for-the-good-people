/**
 * Sync boot — set canonical sheet + fit scale before first paint.
 * Keep in lockstep with page-geometry.js (620×874).
 */
(function (w) {
    var W = 620;
    var H = 874;

    function isNarrow() {
        return Boolean(w.matchMedia && w.matchMedia('(max-width: 900px)').matches);
    }

    function isEmbed() {
        try {
            return new URLSearchParams(w.location.search).get('embed') === '1';
        } catch (_) {
            return false;
        }
    }

    function viewportSize() {
        var vw = w.innerWidth || 1200;
        var vh = w.innerHeight || 800;
        if (w.visualViewport) {
            if (Number.isFinite(w.visualViewport.width)) vw = w.visualViewport.width;
            if (Number.isFinite(w.visualViewport.height)) vh = w.visualViewport.height;
        }
        return { vw: vw, vh: vh };
    }

    /**
     * Mobile / embed: hug the width (tiny side inset). Height may leave a
     * short gap — better than a tiny floating card or horizontal clip.
     */
    function fitScale(opts) {
        opts = opts || {};
        var narrow = isNarrow();
        var embed = isEmbed();
        var mx = Number.isFinite(opts.marginX)
            ? opts.marginX
            : embed
              ? 4
              : narrow
                ? 8
                : 48;
        var my = Number.isFinite(opts.marginY)
            ? opts.marginY
            : embed
              ? 8
              : narrow
                ? 12
                : 52;
        var size = viewportSize();
        var sx = Math.max(120, size.vw - mx) / W;
        var sy = Math.max(120, size.vh - my) / H;
        var s = Math.min(1, sx, sy);
        if (s < 0.35) s = 0.35;
        return Math.round(s * 1000) / 1000;
    }

    function apply(opts) {
        var s = fitScale(opts);
        var root = document.documentElement;
        root.style.setProperty('--reader-page-width', W + 'px');
        root.style.setProperty('--reader-page-height', H + 'px');
        root.style.setProperty('--reader-page-pad-inline', '40px');
        root.style.setProperty('--reader-page-pad-block', '34px');
        root.style.setProperty('--reader-page-pad-top', '30px');
        root.style.setProperty('--sheet-scale', String(s));
        return s;
    }

    w.PageGeometryBoot = {
        CANONICAL_PAGE_WIDTH: W,
        CANONICAL_PAGE_HEIGHT: H,
        getSheetFitScale: fitScale,
        applyCanonicalSheetCssVars: apply,
    };

    apply();
})(window);
