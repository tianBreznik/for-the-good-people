/**
 * PDF publish — dialog (title + file), rasterize to sheet images, replace editor pages.
 * Requires pdf.js (global pdfjsLib) on editor.html.
 */
(function (global) {
    const PDF_RASTER_WIDTH = 620;

    let pageUrls = [];
    let processing = false;
    let dialogPendingFromUrl = false;

    function $(id) {
        return document.getElementById(id);
    }

    function titleInputEl() {
        return document.querySelector('.title-input');
    }

    function syncHiddenTitle(title) {
        const trimmed = String(title || '').replace(/\s+/g, ' ').trim();
        const input = titleInputEl();
        if (input) input.value = trimmed;
        return trimmed;
    }

    function getDisplayTitle() {
        const input = titleInputEl();
        return (input && input.value.trim()) || 'Untitled';
    }

    function isPdfMode() {
        return document.body.classList.contains('editor-pdf-mode');
    }

    function setPdfToolbarActive(on) {
        $('toolbar-pdf-btn')?.classList.toggle('is-active', on);
    }

    function setPdfMode(on) {
        document.body.classList.toggle('editor-pdf-mode', on);
        setPdfToolbarActive(on);
        const pdfMount = $('editor-pdf-pages');
        const tiptap = $('tiptap-editor');
        if (pdfMount) pdfMount.hidden = !on;
        if (tiptap) tiptap.hidden = on;
        try {
            const url = new URL(global.location.href);
            if (on) url.searchParams.set('mode', 'pdf');
            else url.searchParams.delete('mode');
            global.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        } catch (_) {}
    }

    function renderPdfPagesInCanvas() {
        const mount = $('editor-pdf-pages');
        if (!mount) return;
        mount.innerHTML = '';
        if (!pageUrls.length) return;

        const pages = global.GppPdfPages
            ? global.GppPdfPages.normalize(pageUrls)
            : pageUrls.map((u) => (typeof u === 'string' ? { url: u, width: PDF_RASTER_WIDTH, height: 0 } : u));

        pages.forEach((entry, index) => {
            const url = entry.url;
            const page = document.createElement('article');
            page.className =
                'article-page article-page-left article-page-pdf-sheet editor-pdf-sheet';

            const body = document.createElement('div');
            body.className = 'article-page-body';
            const wrap = document.createElement('div');
            wrap.className = 'article-pdf-page-wrap';
            const img = document.createElement('img');
            img.className = 'article-pdf-page';
            img.src = url;
            img.alt = `Page ${index + 1}`;
            img.decoding = 'async';
            if (index > 0) img.loading = 'lazy';
            wrap.appendChild(img);
            body.appendChild(wrap);
            page.appendChild(body);

            mount.appendChild(page);
        });
        if (global.GppPdfPages && isPdfMode()) {
            global.GppPdfPages.applySheetFitScaleForPages(pageUrls);
        }
    }

    function setDialogStatus(text) {
        const el = $('pdf-upload-status');
        if (el) el.textContent = text || '';
    }

    function openPdfUploadDialog() {
        const dialog = $('pdf-upload-dialog');
        if (!dialog || processing) return;
        const titleField = $('pdf-upload-title');
        const fileField = $('pdf-upload-file');
        if (titleField) {
            titleField.value = titleInputEl()?.value.trim() || '';
        }
        if (fileField) fileField.value = '';
        setDialogStatus(
            pageUrls.length
                ? 'Choose a new PDF to replace pages, or keep the current file and update the title.'
                : ''
        );
        dialog.hidden = false;
        dialog.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => titleField?.focus());
    }

    function closePdfUploadDialog() {
        const dialog = $('pdf-upload-dialog');
        if (!dialog) return;
        dialog.hidden = true;
        dialog.setAttribute('aria-hidden', 'true');
        setDialogStatus('');
        dialogPendingFromUrl = false;
    }

    function setDialogBusy(busy) {
        const dialog = $('pdf-upload-dialog');
        if (!dialog) return;
        dialog.querySelectorAll('[data-pdf-upload-submit], [data-pdf-upload-cancel]').forEach((btn) => {
            btn.disabled = busy;
        });
        $('pdf-upload-title') && ($('pdf-upload-title').disabled = busy);
        $('pdf-upload-file') && ($('pdf-upload-file').disabled = busy);
    }

    async function uploadBlob(blob, name) {
        const fd = new FormData();
        fd.append('image', blob, name);
        const response = await fetch('/upload', { method: 'POST', body: fd });
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || 'upload_failed');
        const path = typeof data === 'string' ? data : data.url || data.path;
        if (typeof path !== 'string') throw new Error('upload_failed');
        return path.startsWith('/') ? path : `/${path}`;
    }

    async function rasterizeAndUpload(file, onProgress) {
        if (!global.pdfjsLib) throw new Error('pdf_js_missing');
        const lib = global.pdfjsLib;
        if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
            lib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        onProgress('Reading PDF…');
        const data = await file.arrayBuffer();
        const pdf = await lib.getDocument({ data }).promise;
        const urls = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            onProgress(`Rendering page ${i} of ${pdf.numPages}…`);
            const page = await pdf.getPage(i);
            const baseViewport = page.getViewport({ scale: 1 });
            const scale = PDF_RASTER_WIDTH / baseViewport.width;
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('canvas_unavailable');
            await page.render({ canvasContext: ctx, viewport }).promise;
            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob(
                    (b) => (b ? resolve(b) : reject(new Error('encode_failed'))),
                    'image/webp',
                    0.9
                );
            });
            onProgress(`Uploading page ${i}…`);
            const url = await uploadBlob(blob, `pdf-p${i}-${Date.now()}.webp`);
            urls.push({
                url,
                width: canvas.width,
                height: canvas.height,
            });
        }
        return urls;
    }

    async function submitPdfUploadDialog() {
        if (processing) return;
        const titleField = $('pdf-upload-title');
        const fileField = $('pdf-upload-file');
        const title = syncHiddenTitle(titleField?.value || '');
        if (!title) {
            alert('Please add a title.');
            titleField?.focus();
            return;
        }
        const file = fileField?.files && fileField.files[0];
        if (!file && !pageUrls.length) {
            alert('Please choose a PDF file.');
            fileField?.focus();
            return;
        }
        if (!file) {
            syncHiddenTitle(title);
            renderPdfPagesInCanvas();
            setPdfMode(true);
            closePdfUploadDialog();
            titleInputEl()?.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
        if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) {
            alert('Please choose a PDF file.');
            return;
        }

        processing = true;
        setDialogBusy(true);
        pageUrls = [];
        try {
            pageUrls = await rasterizeAndUpload(file, setDialogStatus);
            setDialogStatus(`Ready — ${pageUrls.length} page${pageUrls.length === 1 ? '' : 's'}.`);
            syncHiddenTitle(title);
            setPdfMode(true);
            renderPdfPagesInCanvas();
            closePdfUploadDialog();
            titleInputEl()?.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (err) {
            console.error(err);
            setDialogStatus('');
            alert('Could not process PDF. Try a smaller file or different PDF.');
        } finally {
            processing = false;
            setDialogBusy(false);
        }
    }

    function bindUi() {
        $('toolbar-pdf-btn')?.addEventListener('click', () => openPdfUploadDialog());

        $('pdf-upload-dialog')?.querySelectorAll('[data-pdf-upload-cancel]').forEach((el) => {
            el.addEventListener('click', () => closePdfUploadDialog());
        });
        $('pdf-upload-dialog')
            ?.querySelector('[data-pdf-upload-submit]')
            ?.addEventListener('click', () => submitPdfUploadDialog());

        $('pdf-upload-title')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitPdfUploadDialog();
            }
        });

        const params = new URLSearchParams(global.location.search);
        if (params.get('mode') === 'pdf' && !pageUrls.length) {
            dialogPendingFromUrl = true;
            requestAnimationFrame(() => {
                if (dialogPendingFromUrl) openPdfUploadDialog();
            });
        }
    }

    function getPageUrls() {
        return pageUrls.slice();
    }

    function loadExistingPages(urls) {
        pageUrls = Array.isArray(urls) ? urls.filter(Boolean) : [];
        if (!pageUrls.length) return;
        setPdfMode(true);
        renderPdfPagesInCanvas();
    }

    function hasReadyPdf() {
        return pageUrls.length > 0;
    }

    function getTitle() {
        return getDisplayTitle() === 'Untitled' ? '' : getDisplayTitle();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindUi);
    } else {
        bindUi();
    }

    global.GppEditorPdf = {
        isPdfMode,
        setPdfMode,
        getPageUrls,
        hasReadyPdf,
        loadExistingPages,
        renderPdfPagesInCanvas,
        openPdfUploadDialog,
        getTitle,
    };
})(typeof window !== 'undefined' ? window : globalThis);
