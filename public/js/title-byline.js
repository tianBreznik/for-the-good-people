/**
 * Title heading marker (data-doc-title) + byline widget that travels with it.
 */
import { Extension } from '@tiptap/core';
import Heading from '@tiptap/extension-heading';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const titleBylineKey = new PluginKey('titleByline');

const BLOCK_INDENT_MAX = 4;

function parseHeadingIndent(element) {
    const n = parseInt(element?.getAttribute?.('data-indent') || '0', 10);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(BLOCK_INDENT_MAX, n);
}

export const StyledHeading = Heading.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            docTitle: {
                default: false,
                parseHTML: (element) => element.getAttribute('data-doc-title') === 'true',
                renderHTML: (attributes) => (
                    attributes.docTitle ? { 'data-doc-title': 'true' } : {}
                ),
            },
            indent: {
                default: 0,
                parseHTML: (element) => parseHeadingIndent(element),
                renderHTML: (attributes) => {
                    const n = Number(attributes.indent) || 0;
                    return n > 0 ? { 'data-indent': String(n) } : {};
                },
            },
        };
    },
});

function mastheadAuthorColor(name) {
    const s = String(name || 'Anonymous');
    let hash = 0;
    for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) | 0;
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 42% 32%)`;
}

function formatPublishedReadable(raw) {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw).trim();
    const day = d.getDate();
    const j = day % 10;
    const k = day % 100;
    let ord = `${day}th`;
    if (j === 1 && k !== 11) ord = `${day}st`;
    else if (j === 2 && k !== 12) ord = `${day}nd`;
    else if (j === 3 && k !== 13) ord = `${day}rd`;
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return `${ord} of ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function buildTitleBylineElement(meta = {}) {
    const author = String(meta.author || '').trim().replace(/^@+/, '');
    const publishedRaw = (meta.publishedAt || '').trim();

    const byline = document.createElement('div');
    byline.className = 'article-byline editor-title-byline';
    byline.contentEditable = 'false';
    byline.setAttribute('data-title-byline', 'true');
    byline.setAttribute('aria-hidden', 'true');

    const byWord = document.createElement('span');
    byWord.className = 'article-byline-by';
    byWord.textContent = 'by';
    byline.appendChild(byWord);

    if (author && typeof window.ContentRefs !== 'undefined' && window.ContentRefs.htmlForSelection) {
        const tmp = document.createElement('span');
        tmp.innerHTML = window.ContentRefs.htmlForSelection('author', { id: author });
        const authorEl = tmp.firstElementChild || document.createElement('span');
        authorEl.classList.add('article-byline-author');
        authorEl.style.color = mastheadAuthorColor(author);
        byline.appendChild(authorEl);
        if (window.ContentRefs.enhanceAuthorRefs) {
            window.ContentRefs.enhanceAuthorRefs(byline);
        }
    } else {
        const authorEl = document.createElement('span');
        authorEl.className = 'article-byline-author';
        authorEl.textContent = author || 'Anonymous';
        if (author) authorEl.style.color = mastheadAuthorColor(author);
        byline.appendChild(authorEl);
    }

    // Always show a date: saved publish date, or today while drafting.
    const dateSource = publishedRaw || new Date().toISOString();
    const onThe = document.createElement('span');
    onThe.className = 'article-byline-onthe';
    onThe.textContent = 'on the';
    byline.appendChild(onThe);

    const timeEl = document.createElement('time');
    timeEl.className = 'article-byline-date';
    const d = new Date(dateSource);
    if (!Number.isNaN(d.getTime())) timeEl.dateTime = d.toISOString().slice(0, 10);
    timeEl.textContent = formatPublishedReadable(dateSource);
    byline.appendChild(timeEl);

    return byline;
}

/** Marked doc-title heading only (not a generic first heading). */
function findMarkedDocTitle(doc) {
    let found = null;
    doc.forEach((node, pos) => {
        if (found) return;
        if (node.type.name === 'heading' && node.attrs?.docTitle) {
            found = { node, pos };
        }
    });
    return found;
}

function findDocTitle(state) {
    const marked = findMarkedDocTitle(state.doc);
    if (marked) return marked;
    let found = null;
    state.doc.forEach((node, pos) => {
        if (found) return;
        if (
            node.type.name === 'heading' &&
            node.attrs?.level >= 1 &&
            node.attrs.level <= 3
        ) {
            found = { node, pos };
        }
    });
    return found;
}

/**
 * If the docTitle marker was stripped (e.g. align/setNode attrs) or the heading
 * was relocated, re-attach the marker in place — never force the title back to
 * position 0 (that broke move-down + alignment).
 */
function recoverDocTitleTransaction(transactions, oldState, newState) {
    const headingType = newState.schema.nodes.heading;
    if (!headingType) return null;

    const prev = findMarkedDocTitle(oldState.doc);
    if (!prev) return null;

    // Map where the title lived through this edit (moves / attr-only updates).
    let mapped = prev.pos;
    transactions.forEach((tr) => {
        if (tr.docChanged) mapped = tr.mapping.map(mapped, -1);
    });
    mapped = Math.max(0, Math.min(mapped, newState.doc.content.size));

    const atMapped = newState.doc.nodeAt(mapped);
    if (atMapped?.type.name === 'heading') {
        // Same block still here (typical: textAlign updated and dropped docTitle).
        if (atMapped.attrs?.docTitle) return null;
        return newState.tr
            .setNodeMarkup(mapped, undefined, {
                ...atMapped.attrs,
                docTitle: true,
            })
            .setMeta('addToHistory', false);
    }

    // Relocated: prefer a heading with the same text that isn't already marked.
    const prevText = prev.node.textContent;
    let candidatePos = null;
    newState.doc.forEach((node, pos) => {
        if (candidatePos != null) return;
        if (node.type.name !== 'heading' || node.attrs?.docTitle) return;
        if (node.textContent === prevText) candidatePos = pos;
    });
    if (candidatePos == null) {
        newState.doc.forEach((node, pos) => {
            if (candidatePos != null) return;
            if (node.type.name === 'heading' && !node.attrs?.docTitle) {
                candidatePos = pos;
            }
        });
    }
    if (candidatePos != null) {
        const node = newState.doc.nodeAt(candidatePos);
        if (!node) return null;
        return newState.tr
            .setNodeMarkup(candidatePos, undefined, {
                ...node.attrs,
                docTitle: true,
            })
            .setMeta('addToHistory', false);
    }

    // Truly removed — put the previous title node back near where it was, not at doc start.
    const attrs = { ...prev.node.attrs, docTitle: true };
    const fresh = headingType.create(attrs, prev.node.content, prev.node.marks);
    const insertAt = Math.max(0, Math.min(mapped, newState.doc.content.size));
    return newState.tr.insert(insertAt, fresh).setMeta('addToHistory', false);
}

export function createTitleBylineExtension(options = {}) {
    const getMeta = typeof options.getMeta === 'function' ? options.getMeta : () => ({});
    const isHydrating =
        typeof options.isHydrating === 'function' ? options.isHydrating : () => false;

    return Extension.create({
        name: 'titleByline',

        addProseMirrorPlugins() {
            return [
                new Plugin({
                    key: titleBylineKey,
                    appendTransaction(transactions, oldState, newState) {
                        if (!transactions.some((tr) => tr.docChanged)) return null;
                        if (transactions.some((tr) => tr.getMeta('titleBylineSkipGuard'))) {
                            return null;
                        }
                        // Load/draft setContent — ensureDocTitleHeading owns bootstrap.
                        if (isHydrating()) return null;
                        const had = findMarkedDocTitle(oldState.doc);
                        const has = findMarkedDocTitle(newState.doc);
                        // Only recover when an edit stripped/removed an existing title marker.
                        if (has || !had) return null;
                        return recoverDocTitleTransaction(transactions, oldState, newState);
                    },
                    props: {
                        decorations(state) {
                            const hit = findDocTitle(state);
                            if (!hit) return DecorationSet.empty;
                            const meta = getMeta() || {};
                            const author = String(meta.author || '').trim();
                            const publishedAt = String(meta.publishedAt || '').trim();
                            // Key must include meta so the widget re-renders when auth resolves
                            // (stable key alone reuses the first "…" DOM node forever).
                            const after = hit.pos + hit.node.nodeSize;
                            return DecorationSet.create(state.doc, [
                                Decoration.widget(
                                    after,
                                    () => buildTitleBylineElement(meta),
                                    {
                                        // Before page-break spacers at the same pos (those use side: 1).
                                        side: -1,
                                        key: `doc-title-byline:${author}:${publishedAt}`,
                                    }
                                ),
                            ]);
                        },
                    },
                }),
            ];
        },
    });
}

/** Clear docTitle on all headings, set on the heading at pos. */
export function markDocTitleAt(editor, pos) {
    if (!editor) return;
    const { state } = editor;
    const node = state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'heading') return;
    let tr = state.tr;
    state.doc.forEach((child, childPos) => {
        if (child.type.name === 'heading' && child.attrs?.docTitle) {
            tr = tr.setNodeMarkup(childPos, undefined, { ...child.attrs, docTitle: false });
        }
    });
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, docTitle: true });
    editor.view.dispatch(tr.setMeta('addToHistory', false));
}

/** Ensure exactly one doc-title heading exists (does not force it to the top). */
export function ensureDocTitleHeading(editor, titleText) {
    if (!editor) return;
    const { state } = editor;
    let titled = null;
    let firstHeading = null;
    state.doc.forEach((node, pos) => {
        if (node.type.name !== 'heading') return;
        if (node.attrs?.docTitle && !titled) titled = { node, pos };
        if (!firstHeading && node.attrs?.level >= 1 && node.attrs.level <= 3) {
            firstHeading = { node, pos };
        }
    });

    if (titled) {
        if (titleText && !titled.node.textContent.trim()) {
            const from = titled.pos + 1;
            const to = titled.pos + titled.node.nodeSize - 1;
            editor.chain().insertContentAt({ from, to }, titleText).run();
        }
        return;
    }

    if (firstHeading) {
        markDocTitleAt(editor, firstHeading.pos);
        if (titleText && !firstHeading.node.textContent.trim()) {
            const from = firstHeading.pos + 1;
            const to = firstHeading.pos + firstHeading.node.nodeSize - 1;
            editor.chain().insertContentAt({ from, to }, titleText).run();
        }
        return;
    }

    const safe = String(titleText || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const rest = editor.getHTML();
    editor
        .chain()
        .setMeta('titleBylineSkipGuard', true)
        .setContent(
            `<h1 data-doc-title="true">${safe}</h1>${rest && rest !== '<p></p>' ? rest : '<p></p>'}`,
            false,
            { preserveWhitespace: 'full' }
        )
        .run();
}
