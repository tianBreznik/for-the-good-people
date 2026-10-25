import { Editor, Extension, Node } from 'https://esm.sh/@tiptap/core@2.11.5';
import { Plugin, PluginKey, TextSelection, NodeSelection } from 'https://esm.sh/@tiptap/pm@2.11.5/state';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.11.5';
import Underline from 'https://esm.sh/@tiptap/extension-underline@2.11.5';
import Image from 'https://esm.sh/@tiptap/extension-image@2.11.5';
import Placeholder from 'https://esm.sh/@tiptap/extension-placeholder@2.11.5';
import Paragraph from 'https://esm.sh/@tiptap/extension-paragraph@2.11.5';
import Blockquote from 'https://esm.sh/@tiptap/extension-blockquote@2.11.5';
import HorizontalRule from 'https://esm.sh/@tiptap/extension-horizontal-rule@2.11.5';
import TextAlign from 'https://esm.sh/@tiptap/extension-text-align@2.11.5';
import Link from 'https://esm.sh/@tiptap/extension-link@2.11.5';
import TextStyle from 'https://esm.sh/@tiptap/extension-text-style@2.11.5';
import Subscript from 'https://esm.sh/@tiptap/extension-subscript@2.11.5';
import Superscript from 'https://esm.sh/@tiptap/extension-superscript@2.11.5';
import Color from 'https://esm.sh/@tiptap/extension-color@2.11.5';
import Highlight from 'https://esm.sh/@tiptap/extension-highlight@2.11.5';
import {
    createEditorPaginationExtension,
    requestEditorPaginationRefresh,
    handleEditorPageScrollToSelection,
    resetEditorPageScrollMemory,
} from './editor-pagination.js';
import {
    StyledHeading,
    createTitleBylineExtension,
    ensureDocTitleHeading,
} from './title-byline.js';
// Editor functionality with Tiptap and auto-save

/** Preserve @author / #article ref attributes on links. */
const ContentRefLink = Link.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            class: {
                default: null,
                parseHTML: (el) => el.getAttribute('class'),
                renderHTML: (attrs) => (attrs.class ? { class: attrs.class } : {}),
            },
            'data-ref': {
                default: null,
                parseHTML: (el) => el.getAttribute('data-ref'),
                renderHTML: (attrs) => (attrs['data-ref'] ? { 'data-ref': attrs['data-ref'] } : {}),
            },
            'data-ref-id': {
                default: null,
                parseHTML: (el) => el.getAttribute('data-ref-id'),
                renderHTML: (attrs) => (attrs['data-ref-id'] ? { 'data-ref-id': attrs['data-ref-id'] } : {}),
            },
        };
    },
});

const contentRefSuggestKey = new PluginKey('contentRefSuggest');

function createContentRefSuggestExtension() {
    const CR = typeof window !== 'undefined' ? window.ContentRefs : null;
    if (!CR) return Extension.create({ name: 'contentRefSuggest' });

    return Extension.create({
        name: 'contentRefSuggest',
        addProseMirrorPlugins() {
            let selectedIndex = 0;
            let items = [];
            let active = null;

            const close = () => {
                CR.destroyMenu();
                active = null;
                items = [];
                selectedIndex = 0;
            };

            const refresh = (view) => {
                const { state } = view;
                const { from } = state.selection;
                if (!state.selection.empty) {
                    close();
                    return;
                }
                const scanFrom = Math.max(0, from - 80);
                const slice = state.doc.textBetween(scanFrom, from, ' ', ' ');
                const detected = CR.detectQuery(slice, slice.length);
                if (!detected) {
                    close();
                    return;
                }
                const absStart = scanFrom + detected.start;
                const absEnd = scanFrom + detected.end;
                active = { ...detected, absStart, absEnd };
                items =
                    detected.type === 'author'
                        ? CR.filterAuthors(detected.query)
                        : CR.filterArticles(detected.query);
                if (!items.length) {
                    CR.destroyMenu();
                    return;
                }
                selectedIndex = Math.min(selectedIndex, items.length - 1);
                const coords = view.coordsAtPos(from);
                CR.destroyMenu();
                const wrap = document.createElement('div');
                wrap.className = 'content-ref-menu';
                wrap.setAttribute('role', 'listbox');
                const esc = (s) =>
                    String(s || '')
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;');
                items.forEach((item, i) => {
                    const row = document.createElement('button');
                    row.type = 'button';
                    row.className = 'content-ref-menu-item' + (i === selectedIndex ? ' is-active' : '');
                    if (detected.type === 'author') {
                        row.innerHTML = `<span class="content-ref-menu-primary">@${esc(item)}</span>`;
                    } else {
                        row.innerHTML =
                            `<span class="content-ref-menu-primary">${esc(item.title)}</span>` +
                            `<span class="content-ref-menu-meta">@${esc(item.author)}</span>`;
                    }
                    row.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        applyItem(view, detected.type === 'author' ? { id: item } : item);
                    });
                    wrap.appendChild(row);
                });
                document.body.appendChild(wrap);
                CR.setActiveMenu(wrap);
                const pad = 6;
                const vw = window.innerWidth || 800;
                const vh = window.innerHeight || 600;
                let left = coords.left;
                let top = coords.bottom + 4;
                const rect = wrap.getBoundingClientRect();
                if (left + rect.width > vw - pad) left = Math.max(pad, vw - rect.width - pad);
                if (top + rect.height > vh - pad) top = Math.max(pad, coords.top - rect.height - 4);
                wrap.style.left = `${Math.round(left)}px`;
                wrap.style.top = `${Math.round(top)}px`;
            };

            const applyItem = (view, item) => {
                if (!active) return;
                const html = CR.htmlForSelection(active.type, item) + ' ';
                const { absStart, absEnd } = active;
                editor
                    .chain()
                    .focus()
                    .deleteRange({ from: absStart, to: absEnd })
                    .insertContent(html)
                    .run();
                close();
            };

            return [
                new Plugin({
                    key: contentRefSuggestKey,
                    view(view) {
                        CR.ensureCatalog();
                        return {
                            update(v) {
                                refresh(v);
                            },
                            destroy() {
                                close();
                            },
                        };
                    },
                    props: {
                        handleKeyDown(view, event) {
                            if (!active || !items.length) return false;
                            if (event.key === 'ArrowDown') {
                                event.preventDefault();
                                selectedIndex = (selectedIndex + 1) % items.length;
                                refresh(view);
                                return true;
                            }
                            if (event.key === 'ArrowUp') {
                                event.preventDefault();
                                selectedIndex = (selectedIndex - 1 + items.length) % items.length;
                                refresh(view);
                                return true;
                            }
                            if (event.key === 'Enter' || event.key === 'Tab') {
                                event.preventDefault();
                                const item =
                                    active.type === 'author'
                                        ? { id: items[selectedIndex] }
                                        : items[selectedIndex];
                                applyItem(view, item);
                                return true;
                            }
                            if (event.key === 'Escape') {
                                event.preventDefault();
                                close();
                                return true;
                            }
                            return false;
                        },
                    },
                }),
            ];
        },
    });
}

const CONTENT_TYPES = ['scene_report', 'interview', 'opinion', 'ideas'];

const titleInput = document.querySelector('.title-input');
const publishBtn = document.querySelector('.publish-btn');
const contentTypeSelect = document.querySelector('#content-type-select');
const imageUpload = document.querySelector('#image-upload');
const autosaveStatus = document.querySelector('#autosave-status');

let editor = null;
let autoSaveTimeout;
let isAutoSaving = false;
let isHydratingEditor = false;
let isResolvingDraft = false;
let hasUnsavedChanges = false;
let draftResolveAttempted = false;
let allowImmediateNavigation = false;
let pendingNavigationAction = null;
let pendingImageMode = 'block';
const AUTO_SAVE_DELAY = 2000;

/** Author / date shown in the byline that travels with the doc-title heading. */
let editorArticleMeta = { author: '', publishedAt: '' };

/** Cursor position when the footnote dialog opens (dialog focus would otherwise clear PM selection). */
let footnoteDialogInsertAnchor = null;

let blogID = location.pathname.split("/");
blogID.shift();
const isEditing = blogID[0] !== "editor";
/** When set, Publish updates this blog id (edit URL, or draft continued on /editor). */
let publishTargetBlogId = isEditing ? decodePathSegment(blogID[0]) : null;

function decodePathSegment(segment) {
    const raw = String(segment || '');
    try {
        return decodeURIComponent(raw);
    } catch (_) {
        try {
            return decodeURI(raw);
        } catch {
            return raw;
        }
    }
}

function inferContentTypeFromBlogId(blogId) {
    const seeded = Array.from(String(blogId || '')).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    return CONTENT_TYPES[seeded % CONTENT_TYPES.length];
}

function normalizeContentType(value) {
    return typeof value === 'string' && CONTENT_TYPES.includes(value) ? value : '';
}

function getSelectedContentType() {
    return normalizeContentType(contentTypeSelect?.value);
}

function setContentTypeSelect(value, blogIdForFallback) {
    if (!contentTypeSelect) return;
    const normalized = normalizeContentType(value)
        || (blogIdForFallback ? inferContentTypeFromBlogId(blogIdForFallback) : '');
    contentTypeSelect.value = normalized || '';
}

function closePoetryDialog() {
    const dialog = document.getElementById('poetry-dialog');
    if (!dialog) return;
    dialog.hidden = true;
    dialog.setAttribute('aria-hidden', 'true');
}

function openPoetryDialog() {
    const dialog = document.getElementById('poetry-dialog');
    const bodyEl = document.getElementById('poetry-dialog-body');
    const authorEl = document.getElementById('poetry-dialog-author');
    const italicEl = document.getElementById('poetry-dialog-italic');
    if (!dialog || !bodyEl || !authorEl || !italicEl) return;
    bodyEl.value = '';
    authorEl.value = '';
    italicEl.checked = false;
    dialog.hidden = false;
    dialog.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => bodyEl.focus());
}

function setupPoetryDialog() {
    const dialog = document.getElementById('poetry-dialog');
    const bodyEl = document.getElementById('poetry-dialog-body');
    const authorEl = document.getElementById('poetry-dialog-author');
    const italicEl = document.getElementById('poetry-dialog-italic');
    if (!dialog || !bodyEl || !authorEl || !italicEl) return;

    dialog.querySelector('[data-poetry-cancel]')?.addEventListener('click', closePoetryDialog);
    dialog.querySelector('.editor-dialog-backdrop')?.addEventListener('click', closePoetryDialog);
    dialog.querySelector('[data-poetry-insert]')?.addEventListener('click', () => {
        if (!editor) return;
        const raw = bodyEl.value.replace(/\r\n/g, '\n');
        if (!raw.trim()) {
            bodyEl.focus();
            return;
        }
        const author = authorEl.value.trim();
        const italic = italicEl.checked;
        const poemAttrs = { variant: 'poetry' };
        if (italic) poemAttrs.poetryItalic = true;
        const nodes = [
            {
                type: 'paragraph',
                attrs: poemAttrs,
                content: [{ type: 'text', text: raw }]
            }
        ];
        if (author) {
            nodes.push({
                type: 'paragraph',
                attrs: { variant: 'poetry-author' },
                content: [{ type: 'text', text: `- ${author}` }]
            });
        }
        editor.chain().focus().insertContent(nodes).run();
        closePoetryDialog();
        triggerAutoSave();
    });

}

function closeBlockquoteDialog() {
    const el = document.getElementById('blockquote-dialog');
    if (!el) return;
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
}

function openBlockquoteDialog() {
    const dialog = document.getElementById('blockquote-dialog');
    const bodyEl = document.getElementById('blockquote-dialog-body');
    const authorEl = document.getElementById('blockquote-dialog-author');
    if (!dialog || !bodyEl || !authorEl) return;
    bodyEl.value = '';
    authorEl.value = '';
    dialog.hidden = false;
    dialog.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => bodyEl.focus());
}

function setupBlockquoteDialog() {
    const bq = document.getElementById('blockquote-dialog');
    const bqBody = document.getElementById('blockquote-dialog-body');
    const bqAuthor = document.getElementById('blockquote-dialog-author');
    if (!bq || !bqBody || !bqAuthor) return;

        bq.querySelector('[data-bq-cancel]')?.addEventListener('click', closeBlockquoteDialog);
        bq.querySelector('.editor-dialog-backdrop')?.addEventListener('click', closeBlockquoteDialog);
        bq.querySelector('[data-bq-insert]')?.addEventListener('click', () => {
            if (!editor) return;
            const raw = bqBody.value.replace(/\r\n/g, '\n');
            if (!raw.trim()) {
                bqBody.focus();
                return;
            }
            const author = bqAuthor.value.trim();
            const inner = [{ type: 'paragraph', content: [{ type: 'text', text: raw }] }];
            if (author) {
                inner.push({
                    type: 'paragraph',
                    attrs: { variant: 'attribution' },
                content: [{ type: 'text', text: `- ${author}` }],
                });
            }
            editor.chain().focus().insertContent({ type: 'blockquote', content: inner }).run();
            closeBlockquoteDialog();
            triggerAutoSave();
        });
    }

function setupInsertDialogEscape() {
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const closers = [
            ['poetry-dialog', closePoetryDialog],
            ['blockquote-dialog', closeBlockquoteDialog],
            ['epigraph-dialog', closeEpigraphDialog],
            ['footnote-dialog', closeFootnoteDialog],
            ['link-dialog', closeLinkDialog],
            ['leave-confirm-dialog', closeLeaveConfirmDialog],
            ['publish-confirm-dialog', closePublishConfirmDialog],
        ];
        for (const [id, close] of closers) {
            const el = document.getElementById(id);
            if (el && !el.hidden) {
                e.preventDefault();
                close();
                return;
            }
        }
    });
}

function closeLinkDialog() {
    const dialog = document.getElementById('link-dialog');
    if (!dialog) return;
    dialog.hidden = true;
    dialog.setAttribute('aria-hidden', 'true');
}

function openLinkDialog() {
    const dialog = document.getElementById('link-dialog');
    const urlEl = document.getElementById('link-dialog-url');
    if (!dialog || !urlEl || !editor) return;
    urlEl.value = editor.getAttributes('link').href || '';
    dialog.hidden = false;
    dialog.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
        urlEl.focus();
        urlEl.select();
    });
}

function setupLinkDialog() {
    const dialog = document.getElementById('link-dialog');
    const urlEl = document.getElementById('link-dialog-url');
    if (!dialog || !urlEl) return;

    const applyLink = (href) => {
        if (!editor) return;
        const trimmed = String(href || '').trim();
        const chain = editor.chain().focus();
        if (!trimmed) {
            chain.extendMarkRange('link').unsetLink().run();
        } else {
            chain.extendMarkRange('link').setLink({ href: trimmed }).run();
        }
        closeLinkDialog();
        triggerAutoSave();
    };

    dialog.querySelector('[data-link-cancel]')?.addEventListener('click', () => {
        closeLinkDialog();
        editor?.chain().focus().run();
    });
    dialog.querySelector('.editor-dialog-backdrop')?.addEventListener('click', closeLinkDialog);
    dialog.querySelector('[data-link-remove]')?.addEventListener('click', () => applyLink(''));
    dialog.querySelector('[data-link-apply]')?.addEventListener('click', () => applyLink(urlEl.value));
    urlEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyLink(urlEl.value);
        }
    });
}

function closeEpigraphDialog() {
    const el = document.getElementById('epigraph-dialog');
    if (!el) return;
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
}

function openEpigraphDialog() {
    const dialog = document.getElementById('epigraph-dialog');
    const bodyEl = document.getElementById('epigraph-dialog-body');
    const authorEl = document.getElementById('epigraph-dialog-author');
    if (!dialog || !bodyEl || !authorEl) return;
    bodyEl.value = '';
    authorEl.value = '';
    dialog.hidden = false;
    dialog.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => bodyEl.focus());
}

function setupEpigraphDialog() {
    const dialog = document.getElementById('epigraph-dialog');
    const bodyEl = document.getElementById('epigraph-dialog-body');
    const authorEl = document.getElementById('epigraph-dialog-author');
    if (!dialog || !bodyEl || !authorEl) return;

    dialog.querySelector('[data-epigraph-cancel]')?.addEventListener('click', closeEpigraphDialog);
    dialog.querySelector('.editor-dialog-backdrop')?.addEventListener('click', closeEpigraphDialog);
    dialog.querySelector('[data-epigraph-insert]')?.addEventListener('click', () => {
        if (!editor) return;
        const raw = bodyEl.value.replace(/\r\n/g, '\n');
        if (!raw.trim()) {
            bodyEl.focus();
            return;
        }
        const nodes = [
            {
                type: 'paragraph',
                attrs: { variant: 'epigraph' },
                content: [{ type: 'text', text: raw.trim() }],
            },
        ];
        const author = authorEl.value.trim();
        if (author) {
            nodes.push({
                type: 'paragraph',
                attrs: { variant: 'attribution' },
                content: [{ type: 'text', text: `- ${author}` }],
            });
        }
        editor.chain().focus().insertContent(nodes).run();
        closeEpigraphDialog();
        triggerAutoSave();
    });
}

/** Strip foreign presentation from clipboard HTML; keep structure TipTap understands. */
function sanitizePastedHtml(html) {
    if (!html || typeof html !== 'string') return html;
    let doc;
    try {
        doc = new DOMParser().parseFromString(html, 'text/html');
    } catch (_) {
        return html;
    }
    if (!doc?.body) return html;

    const DROP_ATTRS = [
        'style',
        'class',
        'color',
        'face',
        'size',
        'bgcolor',
        'background',
        'align',
        'width',
        'height',
        'valign',
        'border',
        'cellpadding',
        'cellspacing',
    ];
    // Keep our own semantic data-* when pasting within/from the app.
    const KEEP_DATA = new Set([
        'data-variant',
        'data-doc-title',
        'data-display',
        'data-align',
        'data-width',
        'data-indent',
        'data-footnote-id',
        'data-poetry-italic',
        'data-page-break',
        'data-ref',
        'data-ref-id',
    ]);

    const unwrap = (el) => {
        const parent = el.parentNode;
        if (!parent) return;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
    };

    doc.body.querySelectorAll('style, script, meta, link, xml, o\\:p').forEach((el) => el.remove());
    // Word leftovers
    doc.body.querySelectorAll('*').forEach((el) => {
        if (/^O:/i.test(el.tagName) || el.tagName.includes(':')) unwrap(el);
    });
    doc.body.querySelectorAll('font').forEach(unwrap);

    const walk = (el) => {
        if (!(el instanceof Element)) return;
        DROP_ATTRS.forEach((name) => el.removeAttribute(name));
        [...el.attributes].forEach((attr) => {
            const n = attr.name.toLowerCase();
            if (n.startsWith('on')) el.removeAttribute(attr.name);
            if (n.startsWith('data-') && !KEEP_DATA.has(n)) el.removeAttribute(attr.name);
        });
        [...el.children].forEach(walk);
    };
    walk(doc.body);

    return doc.body.innerHTML;
}

function rgbToHex(color) {
    if (!color) return null;
    if (color.startsWith('#')) {
        if (color.length === 4) {
            return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase();
        }
        return color.toLowerCase();
    }
    const match = color.match(/^rgb\s*\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/i);
    if (!match) return null;
    const toHex = (n) => Number(n).toString(16).padStart(2, '0');
    return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}

function selectedImageAlignForToolbar() {
    if (!editor) return null;
    const { selection } = editor.state;
    if (selection instanceof NodeSelection && selection.node?.type?.name === 'image') {
        return selection.node.attrs.align || 'center';
    }
    if (editor.isActive('image')) {
        return editor.getAttributes('image').align || 'center';
    }
    return null;
}

function syncToolbarFromSelection() {
    if (!editor) return;
    const textColorInput = document.querySelector('[data-action="text-color"]');
    const highlightColorInput = document.querySelector('[data-action="highlight-color"]');
    const highlightWrap = document.querySelector('.toolbar-color-wrap');

    const textColorAttr = editor.getAttributes('textStyle').color;
    const highlightAttr = editor.getAttributes('highlight').color;

    const textColor = rgbToHex(textColorAttr) || '#171717';
    const highlightColor = rgbToHex(highlightAttr) || '#fff59d';

    if (textColorInput) textColorInput.value = textColor;
    if (highlightColorInput) highlightColorInput.value = highlightColor;
    if (highlightWrap) highlightWrap.style.setProperty('--highlight-label-color', textColor);

    const paraVariant = editor.getAttributes('paragraph').variant || null;
    const bqVariant = editor.isActive('blockquote')
        ? editor.getAttributes('blockquote').variant || null
        : null;
    const imageAlign = selectedImageAlignForToolbar();
    const inDocTitle =
        editor.isActive('heading') &&
        Boolean(editor.getAttributes('heading').docTitle);
    const inSubheading =
        editor.isActive('heading', { level: 2 }) && !inDocTitle;

    /** Only stateful / toggleable actions — not one-shot inserts (dinkus, footnote, …). */
    const activeByAction = {
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        strikethrough: editor.isActive('strike'),
        underline: editor.isActive('underline'),
        subscript: editor.isActive('subscript'),
        superscript: editor.isActive('superscript'),
        'bullet-list': editor.isActive('bulletList'),
        'ordered-list': editor.isActive('orderedList'),
        'align-left': editor.isActive({ textAlign: 'left' }),
        'align-center': editor.isActive({ textAlign: 'center' }),
        'align-right': editor.isActive({ textAlign: 'right' }),
        'align-justify': editor.isActive({ textAlign: 'justify' }),
        link: editor.isActive('link'),
        subheading: inSubheading,
        blockquote: editor.isActive('blockquote') && bqVariant !== 'quote',
        poetry: paraVariant === 'poetry' || paraVariant === 'poetry-author',
        'intro-paragraph': paraVariant === 'intro',
        'whisper-paragraph': paraVariant === 'whisper',
        'paragraph-epigraph': paraVariant === 'epigraph',
        smallcaps: paraVariant === 'smallcaps',
        dropcap: paraVariant === 'dropcap',
        'image-align-left': imageAlign === 'left',
        'image-align-center': imageAlign === 'center',
        'image-align-right': imageAlign === 'right',
    };

    document.querySelectorAll('.toolbar-btn[data-action]').forEach((btn) => {
        const action = btn.dataset.action;
        if (!Object.prototype.hasOwnProperty.call(activeByAction, action)) {
            btn.classList.remove('active');
            return;
        }
        btn.classList.toggle('active', Boolean(activeByAction[action]));
    });
}

const BLOCK_INDENT_MAX = 4;

function parseBlockIndent(element) {
    const raw = element?.getAttribute?.('data-indent');
    const n = parseInt(raw || '0', 10);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(BLOCK_INDENT_MAX, n);
}

function renderBlockIndent(attributes) {
    const n = Number(attributes.indent) || 0;
    return n > 0 ? { 'data-indent': String(n) } : {};
}

/** List nest when in a list; otherwise nudge paragraph/heading margin. */
function adjustBlockIndent(delta) {
    if (!editor || !delta) return false;
    if (editor.isActive('listItem')) {
        if (delta > 0) return editor.chain().focus().sinkListItem('listItem').run();
        return editor.chain().focus().liftListItem('listItem').run();
    }

    const { state } = editor;
    const { from, to } = state.selection;
    let tr = state.tr;
    let changed = false;
    state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return;
        if (node.attrs?.variant === 'footnote') return;
        const cur = Number(node.attrs.indent) || 0;
        const next = Math.min(BLOCK_INDENT_MAX, Math.max(0, cur + delta));
        if (next === cur) return;
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
        changed = true;
    });
    if (changed) {
        editor.view.dispatch(tr);
        return true;
    }

    const typeName = editor.isActive('heading') ? 'heading' : 'paragraph';
    if (!editor.isActive(typeName) && !editor.isActive('paragraph')) return false;
    const cur = Number(editor.getAttributes(typeName).indent) || 0;
    const next = Math.min(BLOCK_INDENT_MAX, Math.max(0, cur + delta));
    if (next === cur) return false;
    return editor.chain().focus().updateAttributes(typeName, { indent: next }).run();
}

const StyledParagraph = Paragraph.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            variant: {
                default: null,
                parseHTML: element => element.getAttribute('data-variant') || null,
                renderHTML: attributes => (attributes.variant ? { 'data-variant': attributes.variant } : {})
            },
            indent: {
                default: 0,
                parseHTML: (element) => parseBlockIndent(element),
                renderHTML: (attributes) => renderBlockIndent(attributes),
            },
            poetryItalic: {
                default: false,
                parseHTML: element => element.getAttribute('data-poetry-italic') === 'true',
                renderHTML: attributes => (attributes.poetryItalic ? { 'data-poetry-italic': 'true' } : {})
            },
            footnoteId: {
                default: null,
                parseHTML: element => element.getAttribute('data-footnote-id') || null,
                renderHTML: attributes => {
                    if (!attributes.footnoteId) return {};
                    const out = { 'data-footnote-id': attributes.footnoteId };
                    if (attributes.variant === 'footnote') {
                        out.id = `fn-${attributes.footnoteId}`;
                    }
                    return out;
                }
            }
        };
    }
});

const StyledBlockquote = Blockquote.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            variant: {
                default: null,
                parseHTML: element => element.getAttribute('data-variant') || null,
                renderHTML: attributes => (attributes.variant ? { 'data-variant': attributes.variant } : {})
            }
        };
    }
});

const StyledHorizontalRule = HorizontalRule.extend({
    addAttributes() {
        return {
            variant: {
                default: null,
                parseHTML: (element) => {
                    if (!(element instanceof HTMLElement)) return null;
                    if (element.getAttribute('data-page-break') === 'true') return 'page-break';
                    return element.getAttribute('data-variant') || null;
                },
                renderHTML: (attributes) => {
                    if (!attributes.variant) return {};
                    if (attributes.variant === 'page-break') {
                        return { 'data-variant': 'page-break', 'data-page-break': 'true' };
                    }
                    return { 'data-variant': attributes.variant };
                },
            },
        };
    },
});


/**
 * Persist align + data-display. align left/right = float wrap; center/null = block.
 * NodeView adds a drag handle so authors can reorder images in the flow.
 */
/** Normalize stored image width to a CSS length (prefer % of column). */
function normalizeImageWidthAttr(raw) {
    if (raw == null || raw === '') return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (/^\d+(\.\d+)?%$/.test(s)) return s;
    if (/^\d+(\.\d+)?px$/i.test(s)) return s;
    if (/^\d+(\.\d+)?$/.test(s)) return `${s}px`;
    return null;
}

/** Wrap side from pointer X within the editor column (left / center / right thirds). */
function imageAlignFromClientX(view, clientX) {
    const rect = view.dom.getBoundingClientRect();
    const ratio = (clientX - rect.left) / Math.max(1, rect.width);
    if (ratio < 0.34) return 'left';
    if (ratio > 0.66) return 'right';
    return 'center';
}

/**
 * Vertical drop slot among top-level blocks (skips the image being dragged).
 * Returns a doc position to insert before/after a neighbor by pointer Y.
 */
function resolveImageDropInsertPos(view, clientY, fromPos) {
    const doc = view.state.doc;
    const slots = [];
    doc.forEach((child, offset) => {
        if (offset === fromPos) return;
        const dom = view.nodeDOM(offset);
        if (!dom || dom.nodeType !== Node.ELEMENT_NODE) return;
        if (dom.classList?.contains('editor-page-break')) return;
        if (dom.classList?.contains('editor-page-top-inset')) return;
        if (dom.classList?.contains('editor-title-byline')) return;
        const r = dom.getBoundingClientRect();
        if (!r.height && !r.width) return;
        slots.push({
            before: offset,
            after: offset + child.nodeSize,
            mid: r.top + r.height / 2,
        });
    });
    if (!slots.length) return fromPos;
    for (let i = 0; i < slots.length; i += 1) {
        if (clientY < slots[i].mid) return slots[i].before;
    }
    return slots[slots.length - 1].after;
}

function ensureImageDropIndicator(view) {
    const host = view.dom.parentElement || view.dom;
    let el = host.querySelector(':scope > .editor-image-drop-indicator');
    if (!el) {
        el = document.createElement('div');
        el.className = 'editor-image-drop-indicator';
        el.setAttribute('aria-hidden', 'true');
        host.style.position = host.style.position || 'relative';
        host.appendChild(el);
    }
    return el;
}

function placeImageDropIndicator(view, insertPos, fromPos, nodeSize) {
    const el = ensureImageDropIndicator(view);
    const host = el.parentElement;
    if (!host) return;
    const hostRect = host.getBoundingClientRect();
    let y = null;
    const doc = view.state.doc;

    if (insertPos <= 0) {
        const first = view.nodeDOM(0) || view.dom.firstElementChild;
        if (first?.getBoundingClientRect) y = first.getBoundingClientRect().top;
    } else if (insertPos >= doc.content.size) {
        const last = view.dom.lastElementChild;
        if (last?.getBoundingClientRect) y = last.getBoundingClientRect().bottom;
    } else {
        // Prefer the top of the block at insertPos; if between nodes, use after previous.
        let dom = view.nodeDOM(insertPos);
        if (dom?.getBoundingClientRect) {
            y = dom.getBoundingClientRect().top;
        } else {
            try {
                const $p = doc.resolve(insertPos);
                const before = $p.nodeBefore;
                if (before) {
                    const prevPos = insertPos - before.nodeSize;
                    const prevDom = view.nodeDOM(prevPos);
                    if (prevDom?.getBoundingClientRect) y = prevDom.getBoundingClientRect().bottom;
                }
            } catch (_) { /* ignore */ }
        }
    }

    // Same slot as current home → hide
    if (insertPos === fromPos || insertPos === fromPos + nodeSize || y == null) {
        el.classList.remove('is-visible');
        return;
    }

    el.style.top = `${y - hostRect.top + host.scrollTop}px`;
    el.classList.add('is-visible');
}

function hideImageDropIndicator(view) {
    const host = view.dom.parentElement || view.dom;
    const el = host.querySelector(':scope > .editor-image-drop-indicator');
    if (el) el.classList.remove('is-visible');
}

/**
 * Reorder image by drop Y and/or set wrap align from X.
 * Vertical = document order among blocks; horizontal = float wrap (not free x/y pixels).
 */
function relocateEditorImage(editor, fromPos, clientY, align, { move = true } = {}) {
    const { state, view } = editor;
    const node = state.doc.nodeAt(fromPos);
    if (!node || node.type.name !== 'image') return false;

    const attrs = {
        ...node.attrs,
        align: align || null,
        display: 'block',
    };

    if (!move) {
        editor.chain().setNodeSelection(fromPos).updateAttributes('image', attrs).run();
        return true;
    }

    const insertPos = resolveImageDropInsertPos(view, clientY, fromPos);
    const sameSpot =
        insertPos === fromPos || insertPos === fromPos + node.nodeSize;

    if (sameSpot) {
        editor.chain().setNodeSelection(fromPos).updateAttributes('image', attrs).run();
        return true;
    }

    const fresh = node.type.create(attrs, node.content, node.marks);
    const size = node.nodeSize;
    // Moving down: delete first so insertPos shifts left by `size`.
    // Moving up: insertPos is unchanged by the later delete.
    const finalPos = insertPos < fromPos ? insertPos : insertPos - size;
    let tr = state.tr.delete(fromPos, fromPos + size);
    const at = Math.max(0, Math.min(finalPos, tr.doc.content.size));
    tr = tr.insert(at, fresh);
    if (tr.doc.nodeAt(at)?.type.name === 'image') {
        tr = tr.setSelection(NodeSelection.create(tr.doc, at));
    }
    view.dispatch(tr);
    return true;
}

const StyledImage = Image.extend({
    draggable: true,

    addAttributes() {
        return {
            ...this.parent?.(),
            align: {
                default: null,
                parseHTML: (element) => {
                    const el = element instanceof HTMLElement ? element : null;
                    if (!el) return null;
                    const raw =
                        el.getAttribute('align') ||
                        el.getAttribute('data-align') ||
                        el.closest?.('[data-align]')?.getAttribute('data-align');
                    return raw === 'left' || raw === 'center' || raw === 'right' ? raw : null;
                },
                renderHTML: (attributes) => (attributes.align ? { align: attributes.align } : {}),
            },
            display: {
                default: null,
                parseHTML: (element) => {
                    const el = element instanceof HTMLElement ? element : null;
                    if (!el) return null;
                    return (
                        el.getAttribute('data-display') ||
                        el.closest?.('[data-display]')?.getAttribute('data-display') ||
                        null
                    );
                },
                renderHTML: (attributes) => (
                    attributes.display ? { 'data-display': attributes.display } : {}
                ),
            },
            // Column-relative width from live resize (e.g. "42%"). Distinct from HTML width=px.
            width: {
                default: null,
                parseHTML: (element) => {
                    const el = element instanceof HTMLElement ? element : null;
                    if (!el) return null;
                    const fromData =
                        el.getAttribute('data-width') ||
                        el.closest?.('[data-width]')?.getAttribute('data-width');
                    const fromStyle = el.style?.width || el.closest?.('[style]')?.style?.width;
                    return normalizeImageWidthAttr(fromData || fromStyle || null);
                },
                renderHTML: (attributes) => {
                    const w = normalizeImageWidthAttr(attributes.width);
                    if (!w) return {};
                    return { 'data-width': w, style: `width: ${w}` };
                },
            },
        };
    },

    // @author avatars are plain <img> inside links — must not become TipTap Image nodes
    // (those render at natural/full size and blow up the editor).
    parseHTML() {
        return [
            {
                tag: 'img[src]',
                getAttrs: (element) => {
                    if (!(element instanceof HTMLElement)) return false;
                    if (element.classList.contains('content-ref-author-avatar')) return false;
                    if (element.closest('a.content-ref-author')) return false;
                    return {};
                },
            },
        ];
    },

    addNodeView() {
        return ({ node, editor, getPos }) => {
            const figure = document.createElement('div');
            figure.className = 'editor-image-figure';
            figure.contentEditable = 'false';
            figure.title = 'Drag up/down to move in the text; left/right to wrap. Corner: resize.';

            const resizeHandle = document.createElement('span');
            resizeHandle.className = 'editor-image-resize-handle';
            resizeHandle.title = 'Drag to resize';
            resizeHandle.setAttribute('aria-label', 'Resize image');
            resizeHandle.draggable = false;

            const img = document.createElement('img');
            img.alt = node.attrs.alt || '';
            img.draggable = false;

            let resizing = false;
            let dragging = false;

            const syncAttrs = (n) => {
                if (resizing || dragging) return;
                img.src = n.attrs.src || '';
                img.alt = n.attrs.alt || '';
                if (n.attrs.title) img.title = n.attrs.title;
                else img.removeAttribute('title');
                const align = n.attrs.align || '';
                const display = n.attrs.display || 'block';
                const width = normalizeImageWidthAttr(n.attrs.width);
                figure.dataset.align = align;
                figure.dataset.display = display;
                if (align) figure.setAttribute('align', align);
                else figure.removeAttribute('align');
                if (width) {
                    figure.dataset.width = width;
                    figure.style.width = width;
                } else {
                    delete figure.dataset.width;
                    figure.style.width = '';
                }
            };
            syncAttrs(node);

            figure.appendChild(img);
            figure.appendChild(resizeHandle);

            const selectImageSync = () => {
                if (typeof getPos !== 'function') return false;
                const pos = getPos();
                if (typeof pos !== 'number') return false;
                const { view } = editor;
                const sel = NodeSelection.create(view.state.doc, pos);
                view.dispatch(view.state.tr.setSelection(sel));
                return true;
            };

            const applyPreviewAlign = (align) => {
                figure.dataset.align = align || '';
                if (align) figure.setAttribute('align', align);
                else figure.removeAttribute('align');
            };

            // Drag: vertical → reorder among blocks; horizontal → wrap left/center/right.
            figure.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                if (e.target === resizeHandle || resizeHandle.contains(e.target)) return;
                e.preventDefault();
                e.stopPropagation();
                selectImageSync();

                const startX = e.clientX;
                const startY = e.clientY;
                const fromPos = typeof getPos === 'function' ? getPos() : null;
                const startNode =
                    typeof fromPos === 'number' ? editor.state.doc.nodeAt(fromPos) : null;
                const startAlign = startNode?.attrs?.align ?? null;
                let moved = false;

                const onMove = (ev) => {
                    const dx = ev.clientX - startX;
                    const dy = ev.clientY - startY;
                    if (!moved && dx * dx + dy * dy < 36) return;
                    if (!moved) {
                        moved = true;
                        dragging = true;
                        figure.classList.add('is-dragging');
                    }
                    const horizontal = Math.abs(dx) > 28 && Math.abs(dx) >= Math.abs(dy);
                    if (horizontal) {
                        applyPreviewAlign(imageAlignFromClientX(editor.view, ev.clientX));
                    }
                    if (typeof fromPos === 'number' && Math.abs(dy) > 12) {
                        const insertPos = resolveImageDropInsertPos(editor.view, ev.clientY, fromPos);
                        const n = editor.state.doc.nodeAt(fromPos);
                        placeImageDropIndicator(
                            editor.view,
                            insertPos,
                            fromPos,
                            n?.nodeSize || 1
                        );
                    }
                };

                const onUp = (ev) => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    figure.classList.remove('is-dragging');
                    hideImageDropIndicator(editor.view);
                    if (!moved) {
                        dragging = false;
                        editor.view.focus();
                        return;
                    }
                    const dx = ev.clientX - startX;
                    const dy = ev.clientY - startY;
                    const horizontal = Math.abs(dx) > 28 && Math.abs(dx) >= Math.abs(dy);
                    const vertical = Math.abs(dy) > 28;
                    const align = horizontal
                        ? imageAlignFromClientX(editor.view, ev.clientX)
                        : startAlign;
                    const pos = typeof getPos === 'function' ? getPos() : fromPos;
                    dragging = false;
                    if (typeof pos === 'number' && (vertical || horizontal)) {
                        relocateEditorImage(editor, pos, ev.clientY, align, {
                            move: vertical,
                        });
                        triggerAutoSave();
                        requestEditorPaginationRefresh(editor);
                    }
                };

                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });

            resizeHandle.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                selectImageSync();

                const parent = editor.view.dom;
                const parentW = Math.max(1, parent.clientWidth || figure.parentElement?.clientWidth || 1);
                const startX = e.clientX;
                const startW = figure.getBoundingClientRect().width;
                const align = figure.dataset.align || '';
                resizing = true;
                figure.classList.add('is-resizing');

                const onMove = (ev) => {
                    const dx = ev.clientX - startX;
                    const delta = align === 'right' ? -dx : dx;
                    let pct = ((startW + delta) / parentW) * 100;
                    pct = Math.round(Math.min(100, Math.max(12, pct)) * 10) / 10;
                    const next = `${pct}%`;
                    figure.style.width = next;
                    figure.dataset.width = next;
                };

                const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    figure.classList.remove('is-resizing');
                    const w = normalizeImageWidthAttr(figure.style.width || figure.dataset.width);
                    resizing = false;
                    if (typeof getPos === 'function') {
                        const pos = getPos();
                        if (typeof pos === 'number' && w) {
                            editor
                                .chain()
                                .setNodeSelection(pos)
                                .updateAttributes('image', { width: w })
                                .run();
                            triggerAutoSave();
                            requestEditorPaginationRefresh(editor);
                        }
                    }
                };

                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });

            return {
                dom: figure,
                ignoreMutation: () => true,
                selectNode: () => {
                    figure.classList.add('is-selected');
                },
                deselectNode: () => {
                    figure.classList.remove('is-selected');
                },
                update: (updated) => {
                    if (updated.type.name !== 'image') return false;
                    syncAttrs(updated);
                    return true;
                },
                destroy: () => {},
            };
        };
    },
});

const PageBreakShortcut = Extension.create({
    name: 'pageBreakShortcut',
    addKeyboardShortcuts() {
        return {
            // Word-style: Ctrl/Cmd+Enter inserts an author page break.
            'Mod-Enter': () =>
                this.editor
                    .chain()
                    .focus()
                    .insertContent({ type: 'horizontalRule', attrs: { variant: 'page-break' } })
                    .run(),
        };
    },
});

function newFootnoteId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `fn${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

const FOOTNOTE_NOTE_MAX_LEN = 6000;

function sanitizeFootnoteNoteText(raw) {
    let s = String(raw || '').replace(/\r\n/g, '\n');
    s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
    s = s.replace(/<[^>]{0,2000}>/g, '');
    if (s.length > FOOTNOTE_NOTE_MAX_LEN) s = s.slice(0, FOOTNOTE_NOTE_MAX_LEN);
    s = s.trim();
    return s || '\u00a0';
}

function resolveFootnoteRefInsertPos(state, storedAnchor) {
    const size = state.doc.content.size;
    if (size < 2) return Math.min(state.selection.from, Math.max(1, size));
    const fallback = Math.max(1, Math.min(state.selection.anchor, size - 1));
    if (typeof storedAnchor !== 'number' || !Number.isFinite(storedAnchor)) return fallback;
    let pos = Math.max(1, Math.min(storedAnchor, size - 1));
    try {
        const $pos = state.doc.resolve(pos);
        if ($pos.parent.inlineContent) return pos;
    } catch (_) {
        return fallback;
    }
    for (let d = 1; d <= 4; d += 1) {
        const tryPos = Math.max(1, Math.min(pos - d, size - 1));
        try {
            if (state.doc.resolve(tryPos).parent.inlineContent) return tryPos;
        } catch (_) { /* continue */ }
    }
    return fallback;
}

function runInsertFootnote(noteText, storedInsertAnchor) {
    if (!editor) return false;
    const raw = sanitizeFootnoteNoteText(noteText);
    const id = newFootnoteId();
    const { state } = editor.view;
    const refFrom = resolveFootnoteRefInsertPos(state, storedInsertAnchor);
    const ref = state.schema.nodes.footnoteRef.create({ id, n: 1 });
    const text = state.schema.text(raw);
    const para = state.schema.nodes.paragraph.create({ variant: 'footnote', footnoteId: id }, text);
    const tr = state.tr;
    tr.insert(refFrom, ref);
    const afterRef = refFrom + ref.nodeSize;
    tr.insert(tr.doc.content.size, para);
    try {
        tr.setSelection(TextSelection.create(tr.doc, afterRef));
    } catch (_) {
        try {
            const end = Math.max(1, tr.doc.content.size - 1);
            tr.setSelection(TextSelection.create(tr.doc, end));
        } catch (_) { /* keep editor default selection */ }
    }
    editor.view.dispatch(tr);
    return true;
}

const footnoteRenumberKey = new PluginKey('footnoteRenumber');

const FootnoteRef = Node.create({
    name: 'footnoteRef',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,

    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-footnote-id'),
                renderHTML: attributes => (attributes.id ? { 'data-footnote-id': attributes.id } : {})
            },
            n: {
                default: 1,
                parseHTML: element => {
                    const sup = element.querySelector && element.querySelector('sup.footnote-ref-mark');
                    const raw = (sup && sup.textContent) || element.textContent || '';
                    const num = parseInt(String(raw).trim(), 10);
                    return Number.isFinite(num) && num > 0 ? num : 1;
                },
                renderHTML: () => ({})
            }
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span.footnote-ref',
                getAttrs: el => {
                    const id = el.getAttribute('data-footnote-id');
                    if (!id) return false;
                    const sup = el.querySelector('sup.footnote-ref-mark');
                    const raw = (sup && sup.textContent) || '';
                    const num = parseInt(String(raw).trim(), 10);
                    return { id, n: Number.isFinite(num) && num > 0 ? num : 1 };
                }
            },
            {
                tag: 'a.footnote-ref[href]',
                getAttrs: el => {
                    const href = el.getAttribute('href') || '';
                    const id = href.startsWith('#fn-') ? href.slice(4) : el.getAttribute('data-footnote-id');
                    if (!id) return false;
                    const sup = el.querySelector('sup.footnote-ref-mark');
                    const raw = (sup && sup.textContent) || el.textContent || '';
                    const num = parseInt(String(raw).trim(), 10);
                    return { id, n: Number.isFinite(num) && num > 0 ? num : 1 };
                }
            }
        ];
    },

    renderHTML({ node }) {
        const { id, n } = node.attrs;
        if (!id) return ['span', { class: 'footnote-ref' }, ['sup', { class: 'footnote-ref-mark' }, '?']];
        return [
            'span',
            {
                class: 'footnote-ref',
                id: `fnref-${id}`,
                'data-footnote-id': id,
                contenteditable: 'false'
            },
            ['sup', { class: 'footnote-ref-mark' }, String(n)]
        ];
    }
});

const FootnoteRenumber = Extension.create({
    name: 'footnoteRenumber',
    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: footnoteRenumberKey,
                appendTransaction(_trs, _oldState, newState) {
                    if (!newState.schema.nodes.footnoteRef) return null;
                    const fixes = [];
                    let n = 1;
                    newState.doc.descendants((node, pos) => {
                        if (node.type.name === 'footnoteRef') {
                            if (node.attrs.n !== n) {
                                fixes.push({ pos, attrs: { ...node.attrs, n } });
                            }
                            n += 1;
                        }
                    });
                    if (!fixes.length) return null;
                    const tr = newState.tr;
                    fixes.forEach(({ pos, attrs }) => {
                        tr.setNodeMarkup(pos, undefined, attrs);
                    });
                    return tr;
                }
            })
        ];
    }
});

function closeFootnoteDialog() {
    const el = document.getElementById('footnote-dialog');
    if (!el) return;
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    footnoteDialogInsertAnchor = null;
}

function openFootnoteDialog() {
    const dialog = document.getElementById('footnote-dialog');
    const body = document.getElementById('footnote-dialog-body');
    if (!dialog || !body) return;
    if (editor) {
        const { anchor } = editor.state.selection;
        footnoteDialogInsertAnchor = anchor;
    } else {
        footnoteDialogInsertAnchor = null;
    }
    body.value = '';
    dialog.hidden = false;
    dialog.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => body.focus());
}

function setupFootnoteDialog() {
    const dialog = document.getElementById('footnote-dialog');
    const body = document.getElementById('footnote-dialog-body');
    if (!dialog || !body) return;
    dialog.querySelector('[data-footnote-cancel]')?.addEventListener('click', closeFootnoteDialog);
    dialog.querySelector('.editor-dialog-backdrop')?.addEventListener('click', closeFootnoteDialog);
    dialog.querySelector('[data-footnote-insert]')?.addEventListener('click', () => {
        if (!editor) return;
        const raw = body.value.replace(/\r\n/g, '\n');
        if (!raw.trim()) {
            body.focus();
            return;
        }
        const anchor = footnoteDialogInsertAnchor;
        if (runInsertFootnote(raw, anchor)) {
            closeFootnoteDialog();
            triggerAutoSave();
            editor.chain().focus().run();
        }
    });
    if (typeof window.ContentRefs !== 'undefined' && window.ContentRefs.attachToTextField) {
        window.ContentRefs.ensureCatalog();
        window.ContentRefs.attachToTextField(body);
    }
}

const EDITOR_NARROW_QUERY = '(max-width: 900px)';

function setupMobileEditorLayout() {
    // Narrow layout is CSS-driven. Do not scroll the caret into view on focus —
    // pages stay put; the user scrolls the document to move between sheets.
    if (!window.matchMedia(EDITOR_NARROW_QUERY).matches) return;
}

function bindRandomNavHover(selectors) {
    document.querySelectorAll(selectors).forEach((el) => {
        el.addEventListener('pointerenter', () => {
            const hue = Math.floor(Math.random() * 360);
            el.style.setProperty('color', `hsl(${hue} 72% 48%)`, 'important');
        });
        el.addEventListener('pointerleave', () => {
            el.style.removeProperty('color');
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initializeEditor();
    setupMobileEditorLayout();
    setupAutoSave();
    setupToolbar();
    setupPoetryDialog();
    setupBlockquoteDialog();
    setupEpigraphDialog();
    setupFootnoteDialog();
    setupLinkDialog();
    setupInsertDialogEscape();
    setupLeaveConfirmDialog();
    setupPublishConfirmDialog();
    setupEventListeners();
    bindRandomNavHover('.editor-nav-wall, .editor-nav-dashboard, .publish-btn');
    // New-post drafts: apply local immediately; reconcile with Firestore once auth is ready.
    if (!isEditing) {
        applyDraftToEditor(readLocalDraft(), { statusText: 'Draft loaded' });
    }
});

function closeLeaveConfirmDialog() {
    const dialog = document.getElementById('leave-confirm-dialog');
    if (!dialog) return;
    dialog.hidden = true;
    dialog.setAttribute('aria-hidden', 'true');
}

function openLeaveConfirmDialog(navigateAction) {
    const dialog = document.getElementById('leave-confirm-dialog');
    if (!dialog) return;
    pendingNavigationAction = navigateAction;
    dialog.hidden = false;
    dialog.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => dialog.querySelector('[data-leave-confirm]')?.focus());
}

function proceedWithNavigation() {
    const action = pendingNavigationAction;
    pendingNavigationAction = null;
    closeLeaveConfirmDialog();
    if (typeof action !== 'function') return;
    allowImmediateNavigation = true;
    action();
}

function attemptEditorNavigation(navigateAction) {
    if (!hasUnsavedChanges) {
        navigateAction();
        return;
    }
    openLeaveConfirmDialog(navigateAction);
}

function setupLeaveConfirmDialog() {
    const dialog = document.getElementById('leave-confirm-dialog');
    if (!dialog) return;

    dialog.querySelector('[data-leave-cancel]')?.addEventListener('click', () => {
        pendingNavigationAction = null;
        closeLeaveConfirmDialog();
    });
    dialog.querySelector('[data-leave-confirm]')?.addEventListener('click', proceedWithNavigation);
    dialog.querySelector('.editor-dialog-backdrop')?.addEventListener('click', () => {
        pendingNavigationAction = null;
        closeLeaveConfirmDialog();
    });

    // Intercept internal links (Dashboard/Home/etc.) so we can show custom copy.
    document.addEventListener('click', (e) => {
        const anchor = e.target.closest('a[href]');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#')) return;
        if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (!hasUnsavedChanges) return;
        e.preventDefault();
        attemptEditorNavigation(() => { location.href = url.href; });
    }, true);

    // Intercept browser Back/gesture while staying on the same document.
    history.pushState({ editorLeaveGuard: true }, '', location.href);
    window.addEventListener('popstate', () => {
        if (allowImmediateNavigation || !hasUnsavedChanges) return;
        history.pushState({ editorLeaveGuard: true }, '', location.href);
        attemptEditorNavigation(() => history.back());
    });
}

/** Remove top-level Image nodes that are leftover @author avatars (full-size blow-ups). */
function stripOrphanAuthorAvatarImages() {
    if (!editor || editor.isDestroyed) return;
    const { state } = editor;
    let tr = state.tr;
    let changed = false;
    const victims = [];
    state.doc.forEach((node, pos) => {
        if (node.type.name !== 'image') return;
        const cls = String(node.attrs?.class || '');
        const src = String(node.attrs?.src || '');
        if (cls.includes('content-ref-author-avatar') || /avatar/i.test(src)) {
            victims.push({ pos, size: node.nodeSize });
        }
    });
    for (let i = victims.length - 1; i >= 0; i -= 1) {
        const { pos, size } = victims[i];
        tr = tr.delete(pos, pos + size);
        changed = true;
    }
    if (changed) {
        editor.view.dispatch(tr.setMeta('addToHistory', false));
    }
}

function getEditorHTML() {
    return editor ? editor.getHTML().trim() : '';
}

function getEditorText() {
    return editor ? editor.getText().trim() : '';
}

/** Doc-title heading text (data-doc-title), else first h1–h3. */
function extractTitleFromEditor() {
    if (!editor) return '';
    let titled = '';
    let fallback = '';
    editor.state.doc.forEach((node) => {
        if (node.type.name !== 'heading' || node.attrs?.level < 1 || node.attrs.level > 3) return;
        const text = node.textContent.replace(/\s+/g, ' ').trim();
        if (node.attrs?.docTitle && !titled) titled = text;
        if (!fallback) fallback = text;
    });
    return titled || fallback;
}

/** Body text excluding the doc-title heading (for publish validation). */
function getBodyTextExcludingTitle() {
    if (!editor) return '';
    let hasMarked = false;
    editor.state.doc.forEach((n) => {
        if (n.type.name === 'heading' && n.attrs?.docTitle) hasMarked = true;
    });
    const parts = [];
    let skippedFallback = false;
    editor.state.doc.forEach((node) => {
        if (node.type.name === 'heading' && node.attrs?.docTitle) return;
        if (
            !hasMarked &&
            !skippedFallback &&
            node.type.name === 'heading' &&
            node.attrs?.level >= 1 &&
            node.attrs.level <= 3
        ) {
            skippedFallback = true;
            return;
        }
        const t = node.textContent.replace(/\s+/g, ' ').trim();
        if (t) parts.push(t);
    });
    return parts.join(' ').trim();
}

/** Article HTML for publish — keeps the title heading (byline attaches in the reader). */
function getArticleHTMLForPublish() {
    return getEditorHTML();
}

function authorIdFromAuth() {
    const user = window.auth?.currentUser;
    if (!user) return '';
    const fn = window.getAuthorIdFromUser;
    if (typeof fn !== 'function') return '';
    const id = String(fn(user) || '').trim().replace(/^@+/, '');
    // getAuthorIdFromUser returns "Anonymous" when logged out — ignore that here.
    if (!id || id === 'Anonymous') return '';
    return id;
}

function bumpTitleBylineDecoration() {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false));
}

function refreshEditorArticleMetaFromAuth() {
    const apply = (name) => {
        if (!name) return;
        if (editorArticleMeta.author === name) {
            bumpTitleBylineDecoration();
            return;
        }
        editorArticleMeta = { ...editorArticleMeta, author: name };
        bumpTitleBylineDecoration();
    };

    const user = window.auth?.currentUser;
    if (!user) return;

    // Prefer claim handle; fall back to displayName / email via getAuthorIdFromUser.
    const tokenPromise =
        typeof window.refreshAuthorIdFromToken === 'function'
            ? window.refreshAuthorIdFromToken(user)
            : Promise.resolve();

    tokenPromise
        .then(() => user.getIdTokenResult())
        .then((result) => {
            const claim = result?.claims?.authorName;
            const fromClaim = claim ? String(claim).trim().replace(/^@+/, '') : '';
            apply(fromClaim || authorIdFromAuth());
        })
        .catch(() => {
            apply(authorIdFromAuth());
        });
}

/** Keep hidden title input in sync with the in-page heading. */
function syncTitleFromEditor() {
    if (!titleInput || !editor) return;
    const title = extractTitleFromEditor();
    if (titleInput.value !== title) {
        titleInput.value = title;
    }
}

function markUnsavedChanges() {
    hasUnsavedChanges = true;
}

function markChangesSaved() {
    hasUnsavedChanges = false;
}

function initializeEditor() {
    editor = new Editor({
        element: document.querySelector('#tiptap-editor'),
        extensions: [
            StarterKit.configure({
                paragraph: false,
                blockquote: false,
                horizontalRule: false,
                heading: false,
            }),
            StyledHeading.configure({ levels: [1, 2, 3] }),
            StyledParagraph,
            StyledBlockquote,
            StyledHorizontalRule,
            Underline,
            StyledImage,
            FootnoteRef,
            FootnoteRenumber,
            TextStyle,
            Color,
            Highlight.configure({ multicolor: true }),
            Subscript,
            Superscript,
            TextAlign.configure({
                types: ['heading', 'paragraph'],
                alignments: ['left', 'center', 'right', 'justify'],
                defaultAlignment: null,
            }),
            ContentRefLink.configure({
                openOnClick: false,
                autolink: true,
            }),
            createContentRefSuggestExtension(),
            Placeholder.configure({
                showOnlyWhenEditable: true,
                showOnlyCurrent: false,
                placeholder: ({ node }) => {
                    if (node.type.name === 'heading') {
                        return node.attrs?.docTitle ? 'Title' : 'Subheading';
                    }
                    return '#IKFLY';
                },
            }),
            createTitleBylineExtension({
                getMeta: () => ({
                    author: editorArticleMeta.author || authorIdFromAuth() || '',
                    publishedAt: editorArticleMeta.publishedAt || '',
                }),
                isHydrating: () => isHydratingEditor,
            }),
            PageBreakShortcut,
            createEditorPaginationExtension({
                getTitle: () => extractTitleFromEditor() || (titleInput ? titleInput.value : ''),
            }),
        ],
        content: '<h1 data-doc-title="true"></h1><p></p>',
        editorProps: {
            attributes: {
                class: 'ProseMirror'
            },
            // Stay put while typing on the same sheet; jump when the caret
            // crosses onto another page.
            handleScrollToSelection: (view) => handleEditorPageScrollToSelection(view),
            transformPastedHTML: (html) => sanitizePastedHtml(html),
        },
        onCreate: () => {
            if (!isEditing) {
                isHydratingEditor = true;
                ensureDocTitleHeading(editor, titleInput?.value || '');
                isHydratingEditor = false;
                refreshEditorArticleMetaFromAuth();
                // Caret in the title so a new article has an obvious place to type.
                requestAnimationFrame(() => {
                    try {
                        editor.chain().focus('start').run();
                    } catch (_) { /* ignore */ }
                });
            }
            syncTitleFromEditor();
            syncToolbarFromSelection();
            requestEditorPaginationRefresh(editor);
        },
        onSelectionUpdate: () => {
            syncToolbarFromSelection();
        },
        onUpdate: () => {
            if (isHydratingEditor) return;
            syncTitleFromEditor();
            syncToolbarFromSelection();
            markUnsavedChanges();
            triggerAutoSave();
        }
    });

    if (window.auth?.onAuthStateChanged) {
        window.auth.onAuthStateChanged(() => {
            refreshEditorArticleMetaFromAuth();
        });
    } else {
        refreshEditorArticleMetaFromAuth();
    }

    if (isEditing) {
        loadBlogData();
    }
}

function closePublishConfirmDialog() {
    const dialog = document.getElementById('publish-confirm-dialog');
    if (!dialog) return;
    dialog.hidden = true;
    dialog.setAttribute('aria-hidden', 'true');
}

function positionPublishConfirmPopover() {
    const dialog = document.getElementById('publish-confirm-dialog');
    const panel = dialog?.querySelector('.publish-confirm-panel');
    if (!dialog || !panel || dialog.hidden || !publishBtn) return;
    const rect = publishBtn.getBoundingClientRect();
    const pad = 8;
    const popW = dialog.offsetWidth || 320;
    const popH = dialog.offsetHeight || 80;
    const btnCenterX = rect.left + rect.width / 2;
    // Center the popover on Publish; clamp to viewport; keep caret aimed at the button.
    let left = btnCenterX - popW / 2;
    let top = rect.bottom + 2;
    left = Math.min(left, window.innerWidth - popW - pad);
    left = Math.max(pad, left);
    if (top + popH > window.innerHeight - pad) {
        top = Math.max(pad, rect.top - popH - 2);
    }
    const caretLeft = Math.min(popW - 14, Math.max(14, btnCenterX - left));
    dialog.style.left = `${Math.round(left)}px`;
    dialog.style.top = `${Math.round(top)}px`;
    panel.style.setProperty('--publish-caret-left', `${Math.round(caretLeft)}px`);
}

function openPublishConfirmDialog() {
    const dialog = document.getElementById('publish-confirm-dialog');
    if (!dialog) return;
    dialog.hidden = false;
    dialog.setAttribute('aria-hidden', 'false');
    positionPublishConfirmPopover();
    requestAnimationFrame(() => {
        positionPublishConfirmPopover();
        dialog.querySelector('[data-publish-open-notes]')?.focus();
    });
}

function setupPublishConfirmDialog() {
    const dialog = document.getElementById('publish-confirm-dialog');
    if (!dialog) return;
    dialog.querySelector('[data-publish-cancel]')?.addEventListener('click', closePublishConfirmDialog);
    dialog.querySelector('[data-publish-open-notes]')?.addEventListener('click', () => {
        closePublishConfirmDialog();
        commitPublish({ openNotes: true });
    });
    dialog.querySelector('[data-publish-draft]')?.addEventListener('click', () => {
        closePublishConfirmDialog();
        // TODO: persist as dashboard draft (hidden from home). See EDITOR_AUDIT §5.
        commitPublish({ openNotes: false });
    });
    document.addEventListener('mousedown', (e) => {
        if (dialog.hidden) return;
        if (dialog.contains(e.target) || publishBtn?.contains(e.target)) return;
        closePublishConfirmDialog();
    });
    window.addEventListener('resize', () => {
        if (!dialog.hidden) positionPublishConfirmPopover();
    });
    window.addEventListener('scroll', () => {
        if (!dialog.hidden) positionPublishConfirmPopover();
    }, true);
}

/** Validate + show publish confirmation (final / open notes). */
function requestPublish() {
    syncTitleFromEditor();
    if (!extractTitleFromEditor() || !getBodyTextExcludingTitle()) {
        alert('Please fill in both title and content');
        return;
    }
    const contentType = getSelectedContentType();
    if (!contentType) {
        alert('Please choose which section this article belongs to');
        contentTypeSelect?.focus();
        return;
    }
    openPublishConfirmDialog();
}

function setupEventListeners() {
    publishBtn.addEventListener('click', requestPublish);
    imageUpload.addEventListener('change', handleImageUpload);
    titleInput.addEventListener('input', triggerAutoSave);
    if (contentTypeSelect) {
        contentTypeSelect.addEventListener('change', () => {
            markUnsavedChanges();
            triggerAutoSave();
        });
    }
}

function setupAutoSave() {
    titleInput.addEventListener('input', () => {
        markUnsavedChanges();
        requestEditorPaginationRefresh(editor);
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(saveDraft, AUTO_SAVE_DELAY);
    });
}

function triggerAutoSave() {
    if (!isAutoSaving) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(saveDraft, AUTO_SAVE_DELAY);
    }
}

function currentDraftBlogId() {
    if (isEditing) return decodePathSegment(blogID[0]) || null;
    return publishTargetBlogId || null;
}

function formatPublishedAt(date = new Date()) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

async function saveDraft() {
    if (isAutoSaving || isResolvingDraft || !editor) return;
    
    isAutoSaving = true;
    updateAutosaveStatus('Saving...', 'saving');
    
    try {
        const draftData = {
            title: extractTitleFromEditor() || titleInput.value,
            // Drafts keep the in-page title heading so position survives reload.
            contentHtml: getEditorHTML(),
            contentText: getEditorText(),
            contentType: getSelectedContentType() || null,
            lastSaved: new Date().toISOString(),
            isDraft: true,
            // Tag edit drafts so Publish from /editor updates the same doc (no duplicates).
            blogId: currentDraftBlogId()
        };
        
        await mirrorDraft(draftData);
        
        markChangesSaved();
        updateAutosaveStatus('Saved', 'saved');
        setTimeout(() => updateAutosaveStatus('Ready', ''), 2000);
    } catch (error) {
        console.error('Auto-save error:', error);
        updateAutosaveStatus('Error saving', 'error');
    } finally {
        isAutoSaving = false;
    }
}

function updateAutosaveStatus(text, className) {
    autosaveStatus.textContent = text;
    autosaveStatus.className = `autosave-status ${className}`;
}

function setupToolbar() {
    const toolbarBtns = document.querySelectorAll('.toolbar-btn');
    const textColorInput = document.querySelector('[data-action="text-color"]');
    const highlightColorInput = document.querySelector('[data-action="highlight-color"]');
    const highlightWrap = document.querySelector('.toolbar-color-wrap');
    
    toolbarBtns.forEach(btn => {
        // Preserve editor selection — mousedown on a button would otherwise blur
        // the editor and drop the range before click handlers run (breaks align, etc.).
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const action = btn.dataset.action;
            
            if (!editor) return;
            if (action === 'image-block') {
                pendingImageMode = 'block';
                imageUpload.click();
                return;
            }

            if (action === 'image-inline') {
                pendingImageMode = 'inline';
                imageUpload.click();
                return;
            }

            if (action === 'poetry') {
                openPoetryDialog();
                return;
            }

            if (action === 'blockquote') {
                openBlockquoteDialog();
                return;
            }

            if (action === 'paragraph-epigraph') {
                openEpigraphDialog();
                return;
            }

            if (action === 'footnote') {
                openFootnoteDialog();
                return;
            }

            const chain = editor.chain().focus();
            switch (action) {
        case 'bold':
                    chain.toggleBold().run();
            break;
        case 'italic':
                    chain.toggleItalic().run();
            break;
        case 'strikethrough':
                    chain.toggleStrike().run();
            break;
        case 'underline':
                    chain.toggleUnderline().run();
                    break;
                case 'line-break':
                    chain.setHardBreak().run();
                    break;
                case 'subheading': {
                    // Don't convert the article title — marker is required.
                    if (editor.isActive('heading') && editor.getAttributes('heading').docTitle) {
                        break;
                    }
                    if (editor.isActive('heading', { level: 2 })) {
                        chain.setParagraph().run();
                    } else {
                        chain
                            .setHeading({ level: 2 })
                            .updateAttributes('heading', { docTitle: false })
                            .run();
                    }
                    break;
                }
                case 'align-left':
                    chain.setTextAlign('left').run();
                    break;
                case 'align-center':
                    chain.setTextAlign('center').run();
                    break;
                case 'align-right':
                    chain.setTextAlign('right').run();
                    break;
                case 'align-justify':
                    chain.setTextAlign('justify').run();
                    break;
                case 'bullet-list':
                    chain.toggleBulletList().run();
                    break;
                case 'ordered-list':
                    chain.toggleOrderedList().run();
                    break;
                case 'subscript':
                    chain.toggleSubscript().run();
                    break;
                case 'superscript':
                    chain.toggleSuperscript().run();
                    break;
                case 'indent':
                    adjustBlockIndent(1);
                    break;
                case 'outdent':
                    adjustBlockIndent(-1);
                    break;
                case 'clear-format':
                    chain.clearNodes().unsetAllMarks().run();
                    break;
                case 'image-align-left':
                    setActiveImageAlign('left');
                    break;
                case 'image-align-center':
                    setActiveImageAlign('center');
                    break;
                case 'image-align-right':
                    setActiveImageAlign('right');
                    break;
                case 'link':
                    openLinkDialog();
                    return;
                case 'dinkus':
                    chain.insertContent({ type: 'horizontalRule', attrs: { variant: 'dinkus' } }).run();
                    break;
                case 'page-break':
                    chain
                        .insertContent({ type: 'horizontalRule', attrs: { variant: 'page-break' } })
                        .run();
                    requestEditorPaginationRefresh(editor);
                    break;
                case 'dropcap':
                    toggleParagraphVariant('dropcap');
                    break;
                case 'smallcaps':
                    toggleParagraphVariant('smallcaps');
                    break;
                case 'intro-paragraph':
                    toggleParagraphVariant('intro');
                    break;
                case 'whisper-paragraph':
                    toggleParagraphVariant('whisper');
                    break;
                case 'undo':
                    chain.undo().run();
                    break;
                case 'redo':
                    chain.redo().run();
            break;
                case 'close':
                    attemptEditorNavigation(() => history.back());
            break;
    }
    
            triggerAutoSave();
        });
    });

    if (textColorInput) {
        if (highlightWrap) {
            highlightWrap.style.setProperty('--highlight-label-color', textColorInput.value || '#1f1f1f');
        }
        textColorInput.addEventListener('input', (e) => {
            if (!editor) return;
            if (highlightWrap) {
                highlightWrap.style.setProperty('--highlight-label-color', e.target.value);
            }
            editor.chain().focus().setColor(e.target.value).run();
            triggerAutoSave();
        });
    }

    if (highlightColorInput) {
        highlightColorInput.addEventListener('input', (e) => {
            if (!editor) return;
            editor.chain().focus().setHighlight({ color: e.target.value }).run();
    triggerAutoSave();
        });
    }

}

/** Toggle a paragraph `data-variant` on/off (second click clears). */
function toggleParagraphVariant(variant) {
    if (!editor || !variant) return false;
    const { state } = editor;
    const { from, to } = state.selection;
    let saw = false;
    let allOn = true;
    state.doc.nodesBetween(from, to, (node) => {
        if (node.type.name !== 'paragraph') return;
        saw = true;
        if (node.attrs.variant !== variant) allOn = false;
    });
    if (!saw) {
        // Caret inside a paragraph — nodesBetween may still miss empty ranges on atoms.
        allOn = editor.getAttributes('paragraph').variant === variant;
    }
    if (allOn) {
        return editor.chain().focus().updateAttributes('paragraph', { variant: null }).run();
    }
    return editor.chain().focus().setNode('paragraph', { variant }).run();
}

function setActiveImageAlign(align) {
    if (!editor) return;
    if (align !== 'left' && align !== 'center' && align !== 'right') return;

    const { state } = editor.view;
    const { from, to } = state.selection;
    let applied = false;

    const wrapAttrs = {
        align,
        // Wrap modes are block floats / centered block — not text-align and not inline.
        display: 'block',
    };

    state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === 'image') {
            editor.chain().focus().setNodeSelection(pos).updateAttributes('image', wrapAttrs).run();
            applied = true;
        }
    });

    // If the caret sits next to an image (common after click), still apply.
    if (!applied) {
        const $from = state.selection.$from;
        const before = $from.nodeBefore;
        const after = $from.nodeAfter;
        if (before?.type.name === 'image') {
            const pos = $from.pos - before.nodeSize;
            editor.chain().focus().setNodeSelection(pos).updateAttributes('image', wrapAttrs).run();
            applied = true;
        } else if (after?.type.name === 'image') {
            editor.chain().focus().setNodeSelection($from.pos).updateAttributes('image', wrapAttrs).run();
            applied = true;
        }
    }

    // NodeSelection on the image itself
    if (!applied && state.selection instanceof NodeSelection && state.selection.node?.type?.name === 'image') {
        editor.chain().focus().updateAttributes('image', wrapAttrs).run();
        applied = true;
    }

    if (!applied) {
        updateAutosaveStatus('Select an image to set wrap', 'error');
    } else {
        triggerAutoSave();
        requestEditorPaginationRefresh(editor);
    }
}

async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file || !file.type.includes("image")) {
        alert("Please select an image file");
        return;
    }
    
    try {
        updateAutosaveStatus('Uploading image...', 'saving');
        
        const formData = new FormData();
        formData.append('image', file);
        
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // /upload returns "/uploads/…" (or legacy "uploads/…" without a slash).
        const imageSrc =
            typeof data === 'string' && !data.startsWith('http') && !data.startsWith('/')
                ? `/${data}`
                : data;

        if (editor) {
            const display = pendingImageMode === 'inline' ? 'inline' : 'block';
            editor.chain().focus().setImage({
                src: imageSrc,
                alt: file.name || '',
                display,
            }).run();
            triggerAutoSave();
        }
        
        updateAutosaveStatus('Image uploaded', 'saved');
        setTimeout(() => updateAutosaveStatus('Ready', ''), 2000);
    } catch (error) {
        console.error('Image upload error:', error);
        updateAutosaveStatus('Upload failed', 'error');
        alert('Failed to upload image. Please try again.');
    }
}


async function commitPublish({ openNotes = false } = {}) {
    syncTitleFromEditor();
    const pieceTitle = extractTitleFromEditor();
    if (!pieceTitle || !getBodyTextExcludingTitle()) {
        alert('Please fill in both title and content');
        return;
    }

    const contentType = getSelectedContentType();
    if (!contentType) {
        alert('Please choose which section this article belongs to');
        contentTypeSelect?.focus();
        return;
    }
    
    try {
        publishBtn.disabled = true;
        publishBtn.textContent = 'Publishing...';
        
        // Prefer edit URL id, then draft-linked id (continues an edit opened via /editor).
        const candidateId =
            (isEditing ? decodePathSegment(blogID[0]) : '') ||
            publishTargetBlogId ||
            readLocalDraft()?.blogId ||
            '';

        let docName = candidateId;
        let prior = null;
        if (candidateId) {
            const priorSnap = await window.db.collection('blogs').doc(candidateId).get();
            if (priorSnap.exists) {
                prior = priorSnap.data() || {};
                docName = candidateId;
                if (prior.notesOpen === true) {
                    alert('This article is open for notes and locked from editing.');
                    location.replace(`/${docName}`);
                    return;
                }
            } else if (isEditing) {
                // Edit URL points at a missing doc — still write that id.
                docName = candidateId;
            } else {
                // Stale draft blogId — create a new post instead of clobbering nothing useful.
                docName = generateBlogId();
                publishTargetBlogId = null;
            }
        } else {
            docName = generateBlogId();
        }

        const notesOpen = openNotes === true || prior?.notesOpen === true;
        // Title heading stays in article HTML (with data-doc-title); byline attaches beside it in the reader.
        const html = getArticleHTMLForPublish();
        const blogData = {
            title: pieceTitle,
            article: html,
            articleFormat: 'tiptap-html',
            contentType,
            // Preserve original publish metadata on edit; only bump lastModified.
            publishedAt: prior?.publishedAt || formatPublishedAt(),
            author: prior?.author || authorIdFromAuth() || 'Anonymous',
            numberofcomments: typeof prior?.numberofcomments === 'number' ? prior.numberofcomments : 0,
            notesOpen,
            notesOpenedAt: notesOpen
                ? prior?.notesOpenedAt || new Date().toISOString()
                : null,
            lastModified: new Date().toISOString()
        };
        
        await window.db.collection("blogs").doc(docName).set(blogData);
        
        localStorage.removeItem('blog_draft');
        markChangesSaved();
        if (window.auth?.currentUser) {
            await window.db.collection('drafts').doc(window.auth.currentUser.uid).delete();
        }
        
        location.href = `/${docName}`;
    } catch (error) {
        console.error('Publish error:', error);
        alert('Failed to publish blog. Please try again.');
        publishBtn.disabled = false;
        publishBtn.textContent = 'Publish';
    }
}

function generateBlogId() {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const blogTitle = (extractTitleFromEditor() || titleInput.value || 'untitled')
        .split(' ')
        .join('-')
        .toLowerCase();
    let id = '';
    for (let i = 0; i < 4; i++) {
        id += letters[Math.floor(Math.random() * letters.length)];
    }
    return `${blogTitle}-${id}`;
}

function normalizeDraftBlogId(raw) {
    const id = String(raw || '').trim();
    if (!id || id === 'editor') return null;
    if (id.includes('/')) return null;
    return id;
}

async function loadBlogData() {
    try {
        const docRef = window.db.collection("blogs").doc(decodePathSegment(blogID[0]));
        const doc = await docRef.get();
        
        if (!doc.exists) {
            location.replace("/");
            return;
        }

        const data = doc.data();
        const blogId = decodePathSegment(blogID[0]);
        if (data.notesOpen === true) {
            // Open for notes ⇒ locked from further edits.
            location.replace(`/${encodeURIComponent(blogId)}`);
            return;
        }
        titleInput.value = data.title || '';
        editorArticleMeta = {
            author: data.author || authorIdFromAuth() || 'Anonymous',
            publishedAt: data.publishedAt || '',
        };
        setContentTypeSelect(data.contentType, blogId);
        isHydratingEditor = true;
        editor
            .chain()
            .setMeta('titleBylineSkipGuard', true)
            .setContent(data.article || '<p></p>', false, { preserveWhitespace: 'full' })
            .run();
        stripOrphanAuthorAvatarImages();
        ensureDocTitleHeading(editor, data.title || '');
        isHydratingEditor = false;
        syncTitleFromEditor();
        resetEditorPageScrollMemory();
        requestEditorPaginationRefresh(editor);
        publishTargetBlogId = blogId;
        markChangesSaved();
    } catch (error) {
        console.error('Error loading blog:', error);
        location.replace("/");
    }
}

function readLocalDraft() {
    try {
        const raw = localStorage.getItem('blog_draft');
        if (!raw) return null;
        const draft = JSON.parse(raw);
        return draft && typeof draft === 'object' ? draft : null;
    } catch (_) {
        return null;
    }
}

function draftSavedMs(draft) {
    if (!draft) return 0;
    const ms = Date.parse(draft.lastSaved || '');
    return Number.isNaN(ms) ? 0 : ms;
}

function draftHasContent(draft) {
    if (!draft) return false;
    const title = String(draft.title || '').trim();
    const html = String(draft.contentHtml || '').trim();
    const legacy = String(draft.content || '').trim();
    const text = String(draft.contentText || '').trim();
    if (title) return true;
    if (text) return true;
    if (legacy) return true;
    if (html && html !== '<p></p>') return true;
    return false;
}

/** Pick the newer draft by lastSaved. Ties prefer cloud (shared source of truth). */
function pickNewerDraft(localDraft, cloudDraft) {
    const localOk = draftHasContent(localDraft);
    const cloudOk = draftHasContent(cloudDraft);
    if (!localOk && !cloudOk) return null;
    if (!localOk) return cloudDraft;
    if (!cloudOk) return localDraft;
    const localMs = draftSavedMs(localDraft);
    const cloudMs = draftSavedMs(cloudDraft);
    if (cloudMs > localMs) return cloudDraft;
    if (localMs > cloudMs) return localDraft;
    return cloudDraft;
}

async function mirrorDraft(draft) {
    if (!draft || typeof draft !== 'object') return;
    localStorage.setItem('blog_draft', JSON.stringify(draft));
    if (window.auth?.currentUser) {
        await window.db.collection('drafts').doc(window.auth.currentUser.uid).set(draft);
    }
}

function applyDraftToEditor(draft, { statusText = 'Draft loaded' } = {}) {
    if (!draft || !editor || isEditing) return false;
    if (!draftHasContent(draft)) return false;
    try {
            if (draft.title) titleInput.value = draft.title;
        if (draft.contentType) setContentTypeSelect(draft.contentType);
            if (draft.contentHtml) {
                isHydratingEditor = true;
            editor
                .chain()
                .setMeta('titleBylineSkipGuard', true)
                .setContent(draft.contentHtml, false, { preserveWhitespace: 'full' })
                .run();
            stripOrphanAuthorAvatarImages();
                isHydratingEditor = false;
            } else if (draft.content) {
                isHydratingEditor = true;
            editor
                .chain()
                .setMeta('titleBylineSkipGuard', true)
                .setContent(`<p>${draft.content.replace(/</g, '&lt;')}</p>`, false, {
                    preserveWhitespace: 'full',
                })
                .run();
                isHydratingEditor = false;
            }
        isHydratingEditor = true;
        ensureDocTitleHeading(editor, draft.title || titleInput.value || '');
        isHydratingEditor = false;
        refreshEditorArticleMetaFromAuth();
        syncTitleFromEditor();
        resetEditorPageScrollMemory();
        requestEditorPaginationRefresh(editor);
        bumpTitleBylineDecoration();
            markChangesSaved();
        updateAutosaveStatus(statusText, 'saved');
        setTimeout(() => updateAutosaveStatus('Ready', ''), 2000);
        return true;
        } catch (error) {
        console.error('Error applying draft:', error);
        isHydratingEditor = false;
        return false;
    }
}

async function fetchCloudDraft(user) {
    if (!user || !window.db) return null;
    try {
        const snap = await window.db.collection('drafts').doc(user.uid).get();
        if (!snap.exists) return null;
        const draft = snap.data();
        return draft && typeof draft === 'object' ? draft : null;
    } catch (error) {
        console.error('Error fetching cloud draft:', error);
        return null;
    }
}

/**
 * New /editor only: reconcile localStorage + Firestore drafts.
 * Newest lastSaved wins; never clobber in-progress edits; mirror winner to both.
 * If the winning draft is tied to an existing blog, continue that edit (no duplicate Publish).
 */
async function resolveDraftFromLocalAndCloud(user) {
    if (isEditing || !editor || !user || draftResolveAttempted) return;
    draftResolveAttempted = true;
    isResolvingDraft = true;
    try {
        const localDraft = readLocalDraft();
        const cloudDraft = await fetchCloudDraft(user);
        const winner = pickNewerDraft(localDraft, cloudDraft);
        if (!winner) return;

        const linkedId = normalizeDraftBlogId(winner.blogId);
        if (linkedId) {
            try {
                const priorSnap = await window.db.collection('blogs').doc(linkedId).get();
                if (priorSnap.exists) {
                    // Resume edit on the canonical URL so Publish updates in place.
                    allowImmediateNavigation = true;
                    location.replace(`/${encodeURIComponent(linkedId)}/editor`);
                    return;
                }
                // Stale link — treat as a new-post draft.
                delete winner.blogId;
                publishTargetBlogId = null;
            } catch (error) {
                console.error('Error checking draft blogId:', error);
            }
        }

        // User already typed since local hydrate — never clobber the live buffer.
        // Autosave will push the current editor state to both stores shortly.
        if (hasUnsavedChanges) return;

        applyDraftToEditor(winner, { statusText: 'Draft loaded' });

        // Keep both stores on the same winning snapshot (same lastSaved).
        try {
            await mirrorDraft(winner);
        } catch (error) {
            console.error('Error mirroring winning draft:', error);
        }
    } finally {
        isResolvingDraft = false;
    }
}

window.auth.onAuthStateChanged((user) => {
    if (!user) {
        // Direct /editor URL while logged out (Editor control is hidden until signed in).
        location.replace('/?login=1');
        return;
    }
    if (!isEditing) {
        resolveDraftFromLocalAndCloud(user);
    }
});

window.addEventListener('beforeunload', (e) => {
    if (allowImmediateNavigation) return;
    if (!hasUnsavedChanges) return;
    e.preventDefault();
    e.returnValue = '';
});