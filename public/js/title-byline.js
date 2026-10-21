/**
 * Title heading marker (data-doc-title) + byline widget that travels with it.
 */
import { Extension } from 'https://esm.sh/@tiptap/core@2.11.5';
import Heading from 'https://esm.sh/@tiptap/extension-heading@2.11.5';
import { Plugin, PluginKey } from 'https://esm.sh/@tiptap/pm@2.11.5/state';
import { Decoration, DecorationSet } from 'https://esm.sh/@tiptap/pm@2.11.5/view';

export const titleBylineKey = new PluginKey('titleByline');

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

function findDocTitle(state) {
    let found = null;
    state.doc.forEach((node, pos) => {
        if (found) return;
        if (node.type.name === 'heading' && node.attrs?.docTitle) {
            found = { node, pos };
        }
    });
    if (found) return found;
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

export function createTitleBylineExtension(options = {}) {
    const getMeta = typeof options.getMeta === 'function' ? options.getMeta : () => ({});

    return Extension.create({
        name: 'titleByline',

        addProseMirrorPlugins() {
            return [
                new Plugin({
                    key: titleBylineKey,
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
    editor.commands.setContent(
        `<h1 data-doc-title="true">${safe}</h1>${rest && rest !== '<p></p>' ? rest : '<p></p>'}`,
        false,
        { preserveWhitespace: 'full' }
    );
}
