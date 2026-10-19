import { Editor, Extension, Node } from 'https://esm.sh/@tiptap/core@2.11.5';
import { Plugin, PluginKey, TextSelection } from 'https://esm.sh/@tiptap/pm@2.11.5/state';
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

function closeQuoteDialog() {
    const el = document.getElementById('quote-dialog');
    if (!el) return;
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
}

function openQuoteDialog() {
    const dialog = document.getElementById('quote-dialog');
    const bodyEl = document.getElementById('quote-dialog-body');
    const authorEl = document.getElementById('quote-dialog-author');
    if (!dialog || !bodyEl || !authorEl) return;
    bodyEl.value = '';
    authorEl.value = '';
    dialog.hidden = false;
    dialog.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => bodyEl.focus());
}

function setupBlockquoteAndQuoteDialogs() {
    const bq = document.getElementById('blockquote-dialog');
    const bqBody = document.getElementById('blockquote-dialog-body');
    const bqAuthor = document.getElementById('blockquote-dialog-author');
    if (bq && bqBody && bqAuthor) {
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
                    content: [{ type: 'text', text: `- ${author}` }]
                });
            }
            editor.chain().focus().insertContent({ type: 'blockquote', content: inner }).run();
            closeBlockquoteDialog();
            triggerAutoSave();
        });
    }

    const qd = document.getElementById('quote-dialog');
    const qBody = document.getElementById('quote-dialog-body');
    const qAuthor = document.getElementById('quote-dialog-author');
    if (qd && qBody && qAuthor) {
        qd.querySelector('[data-quote-cancel]')?.addEventListener('click', closeQuoteDialog);
        qd.querySelector('.editor-dialog-backdrop')?.addEventListener('click', closeQuoteDialog);
        qd.querySelector('[data-quote-insert]')?.addEventListener('click', () => {
            if (!editor) return;
            const raw = qBody.value.replace(/\r\n/g, '\n');
            if (!raw.trim()) {
                qBody.focus();
                return;
            }
            const author = qAuthor.value.trim();
            const inner = [{ type: 'paragraph', content: [{ type: 'text', text: raw }] }];
            if (author) {
                inner.push({
                    type: 'paragraph',
                    attrs: { variant: 'attribution' },
                    content: [{ type: 'text', text: `- ${author}` }]
                });
            }
            editor.chain().focus().insertContent({ type: 'blockquote', attrs: { variant: 'quote' }, content: inner }).run();
            closeQuoteDialog();
            triggerAutoSave();
        });
    }
}

function setupInsertDialogEscape() {
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const poetry = document.getElementById('poetry-dialog');
        const bq = document.getElementById('blockquote-dialog');
        const qd = document.getElementById('quote-dialog');
        if (poetry && !poetry.hidden) {
            e.preventDefault();
            closePoetryDialog();
            return;
        }
        if (bq && !bq.hidden) {
            e.preventDefault();
            closeBlockquoteDialog();
            return;
        }
        if (qd && !qd.hidden) {
            e.preventDefault();
            closeQuoteDialog();
            return;
        }
        const fd = document.getElementById('footnote-dialog');
        if (fd && !fd.hidden) {
            e.preventDefault();
            closeFootnoteDialog();
            return;
        }
        const publishDlg = document.getElementById('publish-confirm-dialog');
        if (publishDlg && !publishDlg.hidden) {
            e.preventDefault();
            closePublishConfirmDialog();
        }
    });
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
                parseHTML: element => element.getAttribute('data-variant') || null,
                renderHTML: attributes => attributes.variant ? { 'data-variant': attributes.variant } : {}
            }
        };
    }
});

const FontSize = Extension.create({
    name: 'fontSize',
    addGlobalAttributes() {
        return [
            {
                types: ['textStyle'],
                attributes: {
                    fontSize: {
                        default: null,
                        parseHTML: element => element.style.fontSize?.replace('px', '') || null,
                        renderHTML: attributes => {
                            if (!attributes.fontSize || attributes.fontSize === 'default') return {};
                            return { style: `font-size: ${attributes.fontSize}px` };
                        }
                    }
                }
            }
        ];
    },
    addCommands() {
        return {
            setFontSize: size => ({ chain }) => {
                if (!size || size === 'default') {
                    return chain().setMark('textStyle', { fontSize: null }).run();
                }
                return chain().setMark('textStyle', { fontSize: String(size) }).run();
            }
        };
    }
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
    if (!window.matchMedia(EDITOR_NARROW_QUERY).matches) return;

    const scrollCaretIntoView = () => {
        requestAnimationFrame(() => {
            const sel = window.getSelection();
            if (!sel?.rangeCount) return;
            const node = sel.getRangeAt(0).startContainer;
            const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
            el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        });
    };

    document.querySelector('.tiptap-editor .ProseMirror')?.addEventListener('focus', scrollCaretIntoView, true);
}

document.addEventListener('DOMContentLoaded', () => {
    initializeEditor();
    setupMobileEditorLayout();
    setupAutoSave();
    setupToolbar();
    setupPoetryDialog();
    setupBlockquoteAndQuoteDialogs();
    setupFootnoteDialog();
    setupInsertDialogEscape();
    setupLeaveConfirmDialog();
    setupPublishConfirmDialog();
    setupEventListeners();
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

function getEditorHTML() {
    return editor ? editor.getHTML().trim() : '';
}

function getEditorText() {
    return editor ? editor.getText().trim() : '';
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
                horizontalRule: false
            }),
            StyledParagraph,
            StyledBlockquote,
            StyledHorizontalRule,
            Underline,
            Image,
            FootnoteRef,
            FootnoteRenumber,
            TextStyle,
            Color,
            Highlight.configure({ multicolor: true }),
            FontSize,
            Subscript,
            Superscript,
            TextAlign.configure({
                types: ['heading', 'paragraph']
            }),
            ContentRefLink.configure({
                openOnClick: false,
                autolink: true,
            }),
            createContentRefSuggestExtension(),
            Placeholder.configure({
                placeholder: '#IKFLY'
            })
        ],
        content: '<p></p>',
        editorProps: {
            attributes: {
                class: 'ProseMirror'
            }
        },
        onCreate: () => {
            syncToolbarFromSelection();
        },
        onSelectionUpdate: () => {
            syncToolbarFromSelection();
        },
        onUpdate: () => {
            if (isHydratingEditor) return;
            syncToolbarFromSelection();
            markUnsavedChanges();
            triggerAutoSave();
        }
    });

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
    dialog.querySelector('[data-publish-only]')?.addEventListener('click', () => {
        closePublishConfirmDialog();
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
    if (!titleInput.value.trim() || !getEditorText()) {
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
            title: titleInput.value,
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
    const fontSizeSelect = document.querySelector('.toolbar-font-size');
    const textColorInput = document.querySelector('[data-action="text-color"]');
    const highlightColorInput = document.querySelector('[data-action="highlight-color"]');
    const highlightWrap = document.querySelector('.toolbar-color-wrap');
    
    toolbarBtns.forEach(btn => {
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

            if (action === 'quote') {
                openQuoteDialog();
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
                case 'title-toggle':
                    if (editor.isActive('heading')) {
                        chain.setParagraph().run();
                    } else {
                        chain.toggleHeading({ level: 2 }).run();
                    }
                    break;
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
                    chain.sinkListItem('listItem').run();
                    break;
                case 'outdent':
                    chain.liftListItem('listItem').run();
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
                case 'link': {
                    const previous = editor.getAttributes('link').href || '';
                    const url = window.prompt('Link URL', previous);
                    if (url === null) break;
                    if (!url.trim()) {
                        chain.extendMarkRange('link').unsetLink().run();
                    } else {
                        chain.extendMarkRange('link').setLink({ href: url.trim() }).run();
                    }
                    break;
                }
                case 'dinkus':
                    chain.insertContent({ type: 'horizontalRule', attrs: { variant: 'dinkus' } }).run();
                    break;
                case 'dropcap':
                    chain.setNode('paragraph', { variant: 'dropcap' }).run();
                    break;
                case 'smallcaps':
                    chain.setNode('paragraph', { variant: 'smallcaps' }).run();
                    break;
                case 'intro-paragraph':
                    chain.setNode('paragraph', { variant: 'intro' }).run();
                    break;
                case 'whisper-paragraph':
                    chain.setNode('paragraph', { variant: 'whisper' }).run();
                    break;
                case 'paragraph-epigraph': {
                    const quoteText = window.prompt('Paragraph epigraph text');
                    if (!quoteText) break;
                    const author = window.prompt('Author', 'Anonymous') || 'Anonymous';
                    chain
                        .insertContent({
                            type: 'blockquote',
                            attrs: { variant: 'quote' },
                            content: [
                                { type: 'paragraph', content: [{ type: 'text', text: quoteText }] },
                                {
                                    type: 'paragraph',
                                    attrs: { variant: 'attribution' },
                                    content: [{ type: 'text', text: `- ${author}` }]
                                }
                            ]
                        })
                        .run();
                    break;
                }
                case 'chapter-epigraph': {
                    const quoteText = window.prompt('Chapter epigraph text');
                    if (!quoteText) break;
                    const author = window.prompt('Author', 'Anonymous') || 'Anonymous';
                    chain
                        .insertContent([
                            { type: 'paragraph', attrs: { variant: 'epigraph' }, content: [{ type: 'text', text: quoteText }] },
                            {
                                type: 'paragraph',
                                attrs: { variant: 'epigraph' },
                                content: [{ type: 'text', text: `- ${author}` }]
                            }
                        ])
                        .run();
                    break;
                }
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

    if (fontSizeSelect) {
        fontSizeSelect.addEventListener('change', (e) => {
            if (!editor) return;
            editor.chain().focus().setFontSize(e.target.value).run();
            triggerAutoSave();
        });
    }

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

function setActiveImageAlign(align) {
    if (!editor) return;
    const { state } = editor.view;
    const { from, to } = state.selection;
    let applied = false;

    state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === 'image') {
            editor.chain().focus().setNodeSelection(pos).updateAttributes('image', { align }).run();
            applied = true;
        }
    });
    if (!applied) {
        editor.chain().focus().insertContent(`<p>Select an image to align (${align}).</p>`).run();
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

        const imageSrc =
            typeof data === 'string' && !data.startsWith('http') && !data.startsWith('/') ? `/${data}` : data;

        if (editor) {
            if (pendingImageMode === 'inline') {
                editor.chain().focus().insertContent(`<img src="${imageSrc}" alt="${file.name}" data-display="inline">`).run();
            } else {
                editor.chain().focus().insertContent(`<img src="${imageSrc}" alt="${file.name}" data-display="block">`).run();
            }
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
    if (!titleInput.value.trim() || !getEditorText()) {
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
        const html = getEditorHTML();
        const blogData = {
            title: titleInput.value.trim(),
            article: html,
            articleFormat: 'tiptap-html',
            contentType,
            // Preserve original publish metadata on edit; only bump lastModified.
            publishedAt: prior?.publishedAt || formatPublishedAt(),
            author: prior?.author || getAuthorIdFromUser(window.auth.currentUser),
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
    const blogTitle = titleInput.value.split(" ").join("-").toLowerCase();
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
        setContentTypeSelect(data.contentType, blogId);
        isHydratingEditor = true;
        editor.commands.setContent(data.article || '<p></p>', false, {
            preserveWhitespace: 'full'
        });
        isHydratingEditor = false;
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
            editor.commands.setContent(draft.contentHtml, false, {
                preserveWhitespace: 'full'
            });
            isHydratingEditor = false;
        } else if (draft.content) {
            isHydratingEditor = true;
            editor.commands.setContent(`<p>${draft.content.replace(/</g, '&lt;')}</p>`, false, {
                preserveWhitespace: 'full'
            });
            isHydratingEditor = false;
        }
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