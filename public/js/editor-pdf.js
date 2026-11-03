/**
 * PDF publish — upload native PDF, preview pages with pdf.js (vector render), publish pdfUrl.
 * Requires pdf.js (global pdfjsLib) on editor.html.
 */
(function (global) {
    /** @type {{ url: string, pageCount: number } | null} */
    let pdfSource = null;
    let processing = false;
    let dialogPendingFromUrl = false;
    /** @type {Promise<any> | null} */
    let docPromise = null;

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
        const btn = $('toolbar-pdf-btn');
        if (!btn) return;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
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

    async function getDocument() {
        if (!pdfSource?.url) return null;
        if (docPromise) return docPromise;
        const GPD = global.GppPdfDocument;
        if (!GPD) throw new Error('pdf_document_missing');
        docPromise = GPD.loadDocument(pdfSource.url);
        return docPromise;
    }

    async function renderPdfPagesInCanvas() {
        const mount = $('editor-pdf-pages');
        if (!mount || !pdfSource?.url) {
            if (mount) mount.innerHTML = '';
            return;
        }
        const GPD = global.GppPdfDocument;
        const Gpp = global.GppPdfPages;
        if (!GPD) return;

        mount.innerHTML = '';
        const doc = await getDocument();
        const count = pdfSource.pageCount || doc.numPages || 0;
        const metrics = [];

        for (let index = 0; index < count; index++) {
            const page = document.createElement('article');
            page.className =
                'article-page article-page-left article-page-pdf-sheet editor-pdf-sheet';
            const body = document.createElement('div');
            body.className = 'article-page-body';
            const wrap = document.createElement('div');
            wrap.className = 'article-pdf-page-wrap';
            body.appendChild(wrap);
            page.appendChild(body);
            mount.appendChild(page);

            const layout = await GPD.renderPageToWrap(wrap, doc, index + 1);
            if (layout) metrics.push({ url: pdfSource.url, width: layout.width, height: layout.height });
        }

        if (Gpp && metrics.length) {
            Gpp.applyReaderGeometryForPages(metrics);
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
            pdfSource?.url
                ? 'Choose a new PDF to replace, or keep the current file and update the title.'
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
        if (!pdfSource?.url) {
            setPdfMode(false);
        }
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

    async function uploadPdfFile(file) {
        const fd = new FormData();
        fd.append('pdf', file);
        const response = await fetch('/upload/pdf', { method: 'POST', body: fd });
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || 'upload_failed');
        const path = typeof data === 'string' ? data : data.url || data.path;
        if (typeof path !== 'string') throw new Error('upload_failed');
        return path.startsWith('/') ? path : `/${path}`;
    }

    async function ingestPdfFile(file, onProgress) {
        const GPD = global.GppPdfDocument;
        if (!GPD || !global.pdfjsLib) throw new Error('pdf_js_missing');
        onProgress('Reading PDF…');
        const buffer = await file.arrayBuffer();
        const doc = await GPD.loadDocumentFromData(buffer);
        const pageCount = doc.numPages || 0;
        if (!pageCount) throw new Error('empty_pdf');
        onProgress('Uploading PDF…');
        const url = await uploadPdfFile(file);
        docPromise = Promise.resolve(doc);
        return { url, pageCount };
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
        if (!file && !pdfSource?.url) {
            alert('Please choose a PDF file.');
            fileField?.focus();
            return;
        }
        if (!file) {
            syncHiddenTitle(title);
            await renderPdfPagesInCanvas();
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
        docPromise = null;
        try {
            pdfSource = await ingestPdfFile(file, setDialogStatus);
            setDialogStatus(`Ready — ${pdfSource.pageCount} page${pdfSource.pageCount === 1 ? '' : 's'}.`);
            syncHiddenTitle(title);
            setPdfMode(true);
            await renderPdfPagesInCanvas();
            closePdfUploadDialog();
            titleInputEl()?.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (err) {
            console.error(err);
            pdfSource = null;
            docPromise = null;
            setDialogStatus('');
            alert('Could not process PDF. Try a smaller file or different PDF.');
        } finally {
            processing = false;
            setDialogBusy(false);
        }
    }

    function handlePdfToolbarClick() {
        if (isPdfMode()) {
            closePdfUploadDialog();
            setPdfMode(false);
            return;
        }
        setPdfMode(true);
        if (!pdfSource?.url) {
            openPdfUploadDialog();
        }
    }

    function bindUi() {
        $('toolbar-pdf-btn')?.addEventListener('click', () => handlePdfToolbarClick());

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
        if (params.get('mode') === 'pdf' && !pdfSource?.url) {
            setPdfMode(true);
            dialogPendingFromUrl = true;
            requestAnimationFrame(() => {
                if (dialogPendingFromUrl) openPdfUploadDialog();
            });
        }
    }

    function getPublishPayload() {
        if (!pdfSource?.url) return null;
        return {
            pdfUrl: pdfSource.url,
            pdfPageCount: pdfSource.pageCount || 0,
        };
    }

    /** @deprecated legacy raster — use getPublishPayload */
    function getPageUrls() {
        const p = getPublishPayload();
        if (!p) return [];
        return [{ url: p.pdfUrl, width: 620, height: 0 }];
    }

    function loadExistingNative(pdfUrl, pageCount) {
        const url = String(pdfUrl || '').trim();
        if (!url) return;
        pdfSource = { url, pageCount: Number(pageCount) || 0 };
        docPromise = null;
        setPdfMode(true);
        void renderPdfPagesInCanvas();
    }

    function hasReadyPdf() {
        return Boolean(pdfSource?.url);
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
        getPublishPayload,
        getPageUrls,
        hasReadyPdf,
        loadExistingNative,
        renderPdfPagesInCanvas,
        openPdfUploadDialog,
        getTitle,
    };
})(typeof window !== 'undefined' ? window : globalThis);
