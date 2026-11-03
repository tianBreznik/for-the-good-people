/**
 * Native PDF — load with pdf.js, render pages to canvas at layout width (sharp DPR).
 * Shared by editor, reader, and home preview. Legacy raster pdfPages stay in pdf-page-meta.
 */
(function (global) {
    const LAYOUT_WIDTH = 620;
    const WORKER =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    let workerReady = false;

    function ensureWorker() {
        const lib = global.pdfjsLib;
        if (!lib) return false;
        if (!workerReady && lib.GlobalWorkerOptions) {
            lib.GlobalWorkerOptions.workerSrc = WORKER;
            workerReady = true;
        }
        return true;
    }

    function absoluteUrl(path) {
        const s = String(path || '').trim();
        if (!s) return '';
        if (/^https?:\/\//i.test(s)) return s;
        try {
            return new URL(s.startsWith('/') ? s : `/${s}`, global.location.origin).href;
        } catch (_) {
            return s;
        }
    }

    function layoutDpr() {
        const d = global.devicePixelRatio;
        return Number.isFinite(d) && d > 0 ? Math.min(3, d) : 1;
    }

    async function loadDocument(pdfUrl) {
        if (!ensureWorker()) throw new Error('pdf_js_missing');
        const url = absoluteUrl(pdfUrl);
        if (!url) throw new Error('pdf_url_missing');
        return global.pdfjsLib.getDocument({ url, withCredentials: false }).promise;
    }

    async function loadDocumentFromData(arrayBuffer) {
        if (!ensureWorker()) throw new Error('pdf_js_missing');
        return global.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    }

    /** CSS layout size for one page at LAYOUT_WIDTH. */
    async function measurePageLayout(doc, pageNumber) {
        const page = await doc.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const scale = LAYOUT_WIDTH / base.width;
        const vp = page.getViewport({ scale });
        return {
            width: LAYOUT_WIDTH,
            height: Math.max(1, Math.round(vp.height)),
        };
    }

    async function buildLayoutMetrics(doc) {
        const n = doc.numPages || 0;
        const pages = [];
        for (let i = 1; i <= n; i++) {
            pages.push(await measurePageLayout(doc, i));
        }
        return pages;
    }

    async function renderPageToWrap(wrapEl, doc, pageNumber, layoutWidth) {
        if (!wrapEl || !doc) return null;
        const lw = Number(layoutWidth) > 0 ? layoutWidth : LAYOUT_WIDTH;
        const page = await doc.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const scale = lw / base.width;
        const vp = page.getViewport({ scale });
        const dpr = layoutDpr();
        const handoffRaster = wrapEl.querySelector('img.article-pdf-handoff-raster');
        let canvas = wrapEl.querySelector('canvas.article-pdf-page');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.className = 'article-pdf-page';
            canvas.setAttribute('role', 'img');
            canvas.setAttribute('aria-label', `Page ${pageNumber}`);
            if (handoffRaster) {
                wrapEl.appendChild(canvas);
            } else {
                wrapEl.innerHTML = '';
                wrapEl.appendChild(canvas);
            }
        }
        canvas.width = Math.max(1, Math.floor(vp.width * dpr));
        canvas.height = Math.max(1, Math.floor(vp.height * dpr));
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (handoffRaster && handoffRaster.parentElement === wrapEl) {
            handoffRaster.remove();
        }
        return { width: lw, height: Math.round(vp.height) };
    }

    global.GppPdfDocument = {
        LAYOUT_WIDTH,
        absoluteUrl,
        loadDocument,
        loadDocumentFromData,
        measurePageLayout,
        buildLayoutMetrics,
        renderPageToWrap,
    };
})(typeof window !== 'undefined' ? window : globalThis);
