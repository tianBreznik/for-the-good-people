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

const titleInput = document.querySelector('.title-input');
const publishBtn = document.querySelector('.publish-btn');
const saveDraftBtn = document.querySelector('.save-draft-btn');
const imageUpload = document.querySelector('#image-upload');
const autosaveStatus = document.querySelector('#autosave-status');

let editor = null;
let autoSaveTimeout;
let isAutoSaving = false;
let isHydratingEditor = false;
let pendingImageMode = 'block';
const AUTO_SAVE_DELAY = 2000;

/** Cursor position when the footnote dialog opens (dialog focus would otherwise clear PM selection). */
let footnoteDialogInsertAnchor = null;

let blogID = location.pathname.split("/");
blogID.shift();
const isEditing = blogID[0] !== "editor";

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
}

document.addEventListener('DOMContentLoaded', () => {
    initializeEditor();
    setupAutoSave();
    setupToolbar();
    setupPoetryDialog();
    setupBlockquoteAndQuoteDialogs();
    setupFootnoteDialog();
    setupInsertDialogEscape();
    setupEventListeners();
    loadExistingBlog();
});

function getEditorHTML() {
    return editor ? editor.getHTML().trim() : '';
}

function getEditorText() {
    return editor ? editor.getText().trim() : '';
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
            Link.configure({
                openOnClick: false,
                autolink: true
            }),
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
            triggerAutoSave();
        }
    });

    if (isEditing) {
        loadBlogData();
    }
}

function setupEventListeners() {
    publishBtn.addEventListener('click', publishBlog);
    saveDraftBtn.addEventListener('click', saveDraft);
    imageUpload.addEventListener('change', handleImageUpload);
    titleInput.addEventListener('input', triggerAutoSave);
}

function setupAutoSave() {
    titleInput.addEventListener('input', () => {
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

async function saveDraft() {
    if (isAutoSaving || !editor) return;
    
    isAutoSaving = true;
    updateAutosaveStatus('Saving...', 'saving');
    
    try {
        const draftData = {
            title: titleInput.value,
            contentHtml: getEditorHTML(),
            contentText: getEditorText(),
            lastSaved: new Date().toISOString(),
            isDraft: true
        };
        
        localStorage.setItem('blog_draft', JSON.stringify(draftData));
        
        if (window.auth?.currentUser) {
            await window.db.collection('drafts').doc(window.auth.currentUser.uid).set(draftData);
        }
        
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
                    history.back();
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


async function publishBlog() {
    if (!titleInput.value.trim() || !getEditorText()) {
        alert('Please fill in both title and content');
        return;
    }
    
    try {
        publishBtn.disabled = true;
        publishBtn.textContent = 'Publishing...';
        
        const docName = isEditing ? decodeURI(blogID[0]) : generateBlogId();
        const date = new Date();
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        
        const html = getEditorHTML();
        const blogData = {
            title: titleInput.value.trim(),
            article: html,
            articleFormat: 'tiptap-html',
            publishedAt: `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`,
            author: window.auth.currentUser.email.split("@")[0],
            numberofcomments: 0,
            lastModified: new Date().toISOString()
        };
        
        await window.db.collection("blogs").doc(docName).set(blogData);
        
        localStorage.removeItem('blog_draft');
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

async function loadBlogData() {
    try {
        const docRef = window.db.collection("blogs").doc(decodeURI(blogID[0]));
        const doc = await docRef.get();
        
        if (!doc.exists) {
            location.replace("/");
            return;
        }

        const data = doc.data();
        titleInput.value = data.title || '';
        isHydratingEditor = true;
        editor.commands.setContent(data.article || '<p></p>', false, {
            preserveWhitespace: 'full'
        });
        isHydratingEditor = false;
    } catch (error) {
        console.error('Error loading blog:', error);
        location.replace("/");
    }
}

function loadExistingBlog() {
    const savedDraft = localStorage.getItem('blog_draft');
    if (savedDraft && !isEditing && editor) {
        try {
            const draft = JSON.parse(savedDraft);
            if (draft.title) titleInput.value = draft.title;
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
            updateAutosaveStatus('Draft loaded', 'saved');
        } catch (error) {
            console.error('Error loading draft:', error);
        }
    }
}

window.auth.onAuthStateChanged((user) => {
    if (!user) {
        location.replace("/admin");
    }
});

window.addEventListener('beforeunload', (e) => {
    if (titleInput.value.trim() || getEditorText()) {
        e.preventDefault();
        e.returnValue = '';
    }
});