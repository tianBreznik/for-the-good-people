/**
 * Word/Docs-style pagination inside TipTap.
 *
 * Break spacers are invisible height jumps between stacked page sheets.
 * Block sizes are taken from real DOM Y distances (not height+margins), so
 * CSS margin-collapse cannot inflate `used` and trigger a short mid-page spacer —
 * that was what parked body text in the gutter / footer.
 */
import { Extension } from 'https://esm.sh/@tiptap/core@2.11.5';
import { Plugin, PluginKey } from 'https://esm.sh/@tiptap/pm@2.11.5/state';
import { Decoration, DecorationSet } from 'https://esm.sh/@tiptap/pm@2.11.5/view';
import { applyPageMetricsCssVars, getReaderPageMetrics } from './page-geometry.js';

export const editorPaginationKey = new PluginKey('editorPagination');

function marginBottom(el) {
    if (!el || !window.getComputedStyle) return 0;
    return parseFloat(window.getComputedStyle(el).marginBottom) || 0;
}

function escapeAttr(value) {
    const id = String(value || '');
    try {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(id);
    } catch (_) { /* ignore */ }
    return id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function collectFootnoteIdsFromPmNode(node) {
    const ids = [];
    if (!node) return ids;
    node.descendants((child) => {
        if (child.type?.name === 'footnoteRef' && child.attrs?.id) {
            if (!ids.includes(child.attrs.id)) ids.push(child.attrs.id);
        }
    });
    return ids;
}

function unionIds(a, b) {
    const out = a.slice();
    b.forEach((id) => {
        if (id && !out.includes(id)) out.push(id);
    });
    return out;
}

function elementContentHeight(view, id) {
    const root = view?.dom;
    if (!id || !root) return 22;
    const el = root.querySelector(
        `p[data-variant="footnote"][data-footnote-id="${escapeAttr(id)}"]`
    );
    if (!el) return 22;
    const rect = el.getBoundingClientRect();
    return Math.max(0, rect.height) + marginBottom(el);
}

function measureFootnoteContentHeight(view, ids) {
    if (!ids || !ids.length) return 0;
    let sum = 0;
    ids.forEach((id) => {
        sum += elementContentHeight(view, id);
    });
    return Math.max(0, Math.round(sum + 10));
}

/**
 * Fit notes into the max band. Returns fitted ids, spill (travel to next band),
 * and measured height of what fits. A single oversize note is kept.
 */
function fitFootnotesToBand(view, ids, bandMax) {
    const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (!list.length) return { fittedIds: [], spillIds: [], height: 0 };

    const max = Math.max(0, Number(bandMax) || 0);
    const fittedIds = [];
    let height = 0;
    for (let i = 0; i < list.length; i += 1) {
        const id = list[i];
        const noteH = elementContentHeight(view, id);
        const chrome = fittedIds.length === 0 ? 10 : 0;
        const next = height + chrome + noteH;
        if (fittedIds.length > 0 && max > 0 && next > max) {
            return {
                fittedIds,
                spillIds: list.slice(i),
                height: Math.max(0, Math.round(height)),
            };
        }
        fittedIds.push(id);
        height = next;
    }
    return {
        fittedIds,
        spillIds: [],
        height: Math.max(0, Math.round(height)),
    };
}

/** Empty pages keep a modest chrome min; pages with notes size to fitted content (capped). */
function footerZoneHeight(footContent, emptyChromeMin, footerMax) {
    const emptyMin = Math.max(0, Number(emptyChromeMin) || 0);
    const max = Math.max(emptyMin, Number(footerMax) || emptyMin);
    const foot = Math.max(0, Number(footContent) || 0);
    if (foot <= 0) return emptyMin;
    return Math.min(max, foot);
}

function createPageBreakWidget(height) {
    // <span display:block> stays valid inside <p> for mid-paragraph splits.
    const wrap = document.createElement('span');
    wrap.className = 'editor-page-break';
    wrap.contentEditable = 'false';
    wrap.setAttribute('data-page-break', 'true');
    wrap.setAttribute('aria-hidden', 'true');
    const px = `${Math.max(0, Math.round(height))}px`;
    wrap.style.cssText = `display:block;width:100%;height:${px};min-height:${px};max-height:${px};margin:0;padding:0;border:0;overflow:hidden;pointer-events:none;`;
    return wrap;
}

/** Words with doc positions (start of each word) for mid-paragraph splits. */
function buildWordIndex(node, blockPos) {
    const words = [];
    if (!node) return words;
    node.descendants((child, relPos) => {
        if (!child.isText || !child.text) return;
        const absBase = blockPos + 1 + relPos;
        const re = /\S+/g;
        let m;
        while ((m = re.exec(child.text))) {
            words.push({ text: m[0], pos: absBase + m.index, len: m[0].length });
        }
    });
    return words;
}

function canSplitBlock(node) {
    if (!node) return false;
    if (node.type.name !== 'paragraph') return false;
    const v = node.attrs?.variant;
    if (v === 'footnote' || v === 'poetry' || v === 'poetry-author') return false;
    return true;
}

/**
 * Height of a block clone with page-break spacers stripped.
 * Must measure inside .ProseMirror so editor typography CSS still applies —
 * measuring under document.body underestimates and mid-para chunks overflow.
 *
 * @param {{ continuation?: boolean, includeMarginBottom?: boolean }} [opts]
 *   continuation — collapse margin-top (inter-block margins owned by Y-distance).
 *   includeMarginBottom — only for the final chunk of a paragraph; mid chunks have
 *   no margin box between them and the next in-paragraph break.
 */
function measureDomCloneHeight(sourceEl, mutateClone, opts = {}) {
    if (!sourceEl || !sourceEl.cloneNode) return 0;
    const width = sourceEl.getBoundingClientRect().width || sourceEl.clientWidth || 520;
    const pm = sourceEl.closest('.ProseMirror') || sourceEl.parentElement || document.body;
    let tray = pm.querySelector(':scope > .editor-measure-tray');
    if (!tray) {
        tray = document.createElement('div');
        tray.className = 'editor-measure-tray';
        tray.setAttribute('aria-hidden', 'true');
        tray.style.cssText =
            'position:absolute;left:-99999px;top:0;width:100%;height:0;overflow:hidden;visibility:hidden;pointer-events:none;';
        pm.appendChild(tray);
    }
    const probe = sourceEl.cloneNode(true);
    probe.querySelectorAll('.editor-page-break, .editor-page-top-inset, .editor-title-byline, .editor-measure-tray').forEach((el) => {
        el.remove();
    });
    if (typeof mutateClone === 'function') mutateClone(probe);
    probe.setAttribute('aria-hidden', 'true');
    const marginTop = opts.continuation ? 'margin-top:0' : '';
    const marginBot = opts.includeMarginBottom ? '' : 'margin-bottom:0';
    probe.style.cssText = [
        'position:relative',
        'left:0',
        'top:0',
        `width:${Math.max(120, Math.round(width))}px`,
        'visibility:hidden',
        'pointer-events:none',
        marginTop,
        marginBot,
        'height:auto',
        'max-height:none',
    ].filter(Boolean).join(';');
    tray.appendChild(probe);
    try {
        const h = probe.getBoundingClientRect().height;
        const mb = opts.includeMarginBottom ? marginBottom(probe) : 0;
        return Math.max(0, Math.round(h + mb));
    } finally {
        probe.remove();
    }
}

/** Keep words [0, wordCount) in a cloned element; clear the rest. */
function truncateCloneToWordCount(root, wordCount) {
    const limit = Math.max(0, wordCount | 0);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    let seen = 0;
    let done = false;
    nodes.forEach((tn) => {
        if (done) {
            tn.textContent = '';
            return;
        }
        const parts = tn.textContent.split(/(\s+)/);
        let out = '';
        for (const token of parts) {
            if (/\S/.test(token)) {
                if (seen >= limit) {
                    done = true;
                    break;
                }
                seen += 1;
            }
            if (!done) out += token;
        }
        tn.textContent = out;
    });
}

/**
 * Max words from `fromWord` that fit in maxHeightPx (prefix of the remaining text).
 * Returns 0 if even one word is too tall.
 */
function maxWordsFitting(dom, totalWords, fromWord, maxHeightPx) {
    const remaining = Math.max(0, totalWords - fromWord);
    if (remaining <= 0 || maxHeightPx < 8) return 0;
    let low = 1;
    let high = remaining;
    let best = 0;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const h = measureDomCloneHeight(dom, (clone) => {
            if (fromWord > 0) {
                truncateCloneToWordCount(clone, fromWord + mid);
                truncateCloneDropPrefix(clone, fromWord);
            } else {
                truncateCloneToWordCount(clone, mid);
            }
        // Collapse margins: inter-block margins are owned by Y-distance packing;
        // mid-chunk fits never include the paragraph's end margin.
        }, { continuation: true, includeMarginBottom: false });
        if (h <= maxHeightPx + 0.5) {
            best = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return best;
}

/** Drop the first `wordCount` words from a clone (keep the suffix). */
function truncateCloneDropPrefix(root, wordCount) {
    const drop = Math.max(0, wordCount | 0);
    if (drop <= 0) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    let seen = 0;
    let started = false;
    nodes.forEach((tn) => {
        if (started) return;
        const parts = tn.textContent.split(/(\s+)/);
        let out = '';
        for (const token of parts) {
            if (/\S/.test(token)) {
                if (seen < drop) {
                    seen += 1;
                    continue;
                }
                started = true;
            }
            if (started || !/\S/.test(token)) {
                if (started) out += token;
            }
        }
        tn.textContent = started ? out : '';
    });
}

function createTopInsetWidget(height) {
    const wrap = document.createElement('div');
    wrap.className = 'editor-page-top-inset';
    wrap.contentEditable = 'false';
    wrap.setAttribute('aria-hidden', 'true');
    const px = `${Math.max(0, Math.round(height))}px`;
    wrap.style.cssText = `display:block;height:${px};min-height:${px};margin:0;padding:0;border:0;pointer-events:none;`;
    return wrap;
}

function footnoteDomById(view, id) {
    const root = view?.dom;
    if (!id || !root) return null;
    return root.querySelector(
        `p[data-variant="footnote"][data-footnote-id="${escapeAttr(id)}"]`
    );
}

function paintFooterNotes(zone, view, ids, pageStartN) {
    if (!zone) return;
    zone.querySelectorAll('.editor-footer-note').forEach((el) => el.remove());
    if (!ids || !ids.length) return;
    let n = Math.max(1, Number(pageStartN) || 1);
    ids.forEach((id) => {
        const src = footnoteDomById(view, id);
        if (!src) return;
        const clone = src.cloneNode(true);
        clone.classList.add('editor-footer-note');
        clone.removeAttribute('id');
        clone.style.cssText = '';
        clone.setAttribute('data-footnote-n', String(n));
        zone.appendChild(clone);
        n += 1;
    });
}

function ensurePageBacks(host, pageCount, metrics, footerHeights = [], pageFootnoteIds = [], view = null) {
    if (!host) return;
    const canvas = host.closest('.editor-content');
    if (canvas) {
        canvas.querySelectorAll(':scope > .editor-page-backs').forEach((el) => el.remove());
    }

    let backs = host.querySelector(':scope > .editor-page-backs');
    if (!backs) {
        backs = document.createElement('div');
        backs.className = 'editor-page-backs';
        backs.setAttribute('aria-hidden', 'true');
        host.insertBefore(backs, host.firstChild);
    }

    const count = Math.max(1, pageCount | 0);
    const minFooter = Math.max(0, metrics.padBlockBottom | 0);
    while (backs.children.length > count) backs.lastElementChild.remove();
    while (backs.children.length < count) {
        const page = document.createElement('div');
        page.className = 'editor-page-back';
        const zone = document.createElement('div');
        zone.className = 'editor-page-back-footer-zone';
        zone.setAttribute('aria-hidden', 'true');
        page.appendChild(zone);
        const num = document.createElement('div');
        num.className = 'editor-page-back-number';
        page.appendChild(num);
        backs.appendChild(page);
    }

    let noteOrdinal = 1;
    Array.from(backs.children).forEach((page, i) => {
        page.style.height = `${metrics.pageHeight}px`;
        page.style.width = `${metrics.pageWidth}px`;
        page.style.marginBottom = i < count - 1 ? `${metrics.pageGap}px` : '0';
        let zone = page.querySelector('.editor-page-back-footer-zone');
        if (!zone) {
            zone = document.createElement('div');
            zone.className = 'editor-page-back-footer-zone';
            zone.setAttribute('aria-hidden', 'true');
            page.insertBefore(zone, page.firstChild);
        }
        const footH = Math.max(minFooter, Number(footerHeights[i]) || minFooter);
        zone.style.height = `${Math.round(footH)}px`;
        const ids = Array.isArray(pageFootnoteIds[i]) ? pageFootnoteIds[i] : [];
        paintFooterNotes(zone, view, ids, noteOrdinal);
        noteOrdinal += ids.length;
        const num = page.querySelector('.editor-page-back-number');
        if (num) num.textContent = String(i + 1);
    });
}

/**
 * Heights from Y-distance to the next top-level block (margin-collapse accurate).
 * Title→next already includes the byline widget between them.
 */
function collectTopLevelBlocks(view) {
    const items = [];
    view.state.doc.forEach((node, pos) => {
        if (node.type.name === 'paragraph' && node.attrs?.variant === 'footnote') return;
        if (node.type.name === 'image') {
            const dom = view.nodeDOM(pos);
            if (dom?.classList?.contains('content-ref-author-avatar')) return;
        }
        const dom = view.nodeDOM(pos);
        if (!dom || dom.nodeType !== Node.ELEMENT_NODE) return;
        if (dom.classList?.contains('editor-page-break')) return;
        if (dom.classList?.contains('editor-page-top-inset')) return;
        if (dom.classList?.contains('editor-title-byline')) return;
        items.push({ node, pos, dom });
    });

    const blocks = [];
    // Floated images share vertical space with following siblings; avoid double-counting.
    let pendingFloatBottom = null;

    for (let i = 0; i < items.length; i += 1) {
        const { node, pos, dom } = items[i];
        const top = dom.getBoundingClientRect().top;
        let bottom;
        if (i + 1 < items.length) {
            bottom = items[i + 1].dom.getBoundingClientRect().top;
        } else {
            const rect = dom.getBoundingClientRect();
            bottom = rect.bottom + marginBottom(dom);
            if (node.type.name === 'heading' && node.attrs?.docTitle) {
                let sib = dom.nextSibling;
                while (sib) {
                    if (sib.nodeType === Node.ELEMENT_NODE) {
                        if (
                            sib.classList.contains('editor-page-break') ||
                            sib.classList.contains('editor-page-top-inset')
                        ) {
                            sib = sib.nextSibling;
                            continue;
                        }
                        if (sib.classList.contains('editor-title-byline')) {
                            const br = sib.getBoundingClientRect();
                            bottom = Math.max(bottom, br.bottom + marginBottom(sib));
                        }
                        break;
                    }
                    sib = sib.nextSibling;
                }
            }
        }

        // Y-distance (margin-collapse accurate). Strip mid-para break spacers so a
        // prior pass doesn't inflate the next pack. Clone measure is for mid-para
        // chunks only — whole-block clones miss sibling margin collapse.
        const breaks = dom.querySelectorAll('.editor-page-break');
        let breakH = 0;
        breaks.forEach((b) => {
            breakH += b.getBoundingClientRect().height || 0;
        });
        let height = Math.max(0, bottom - top - breakH);

        const align = node.attrs?.align;
        const isFloatImg =
            node.type.name === 'image' && (align === 'left' || align === 'right');

        if (isFloatImg) {
            const rect = dom.getBoundingClientRect();
            height = Math.max(0, rect.height + marginBottom(dom));
            pendingFloatBottom = top + height;
        } else if (pendingFloatBottom != null && top < pendingFloatBottom - 1) {
            // Text wrapping beside the float: only count height past the float bottom.
            height = Math.max(0, bottom - top - breakH - Math.max(0, pendingFloatBottom - top));
            if (bottom >= pendingFloatBottom - 1) pendingFloatBottom = null;
        } else {
            pendingFloatBottom = null;
        }

        if (node.type.name === 'image' && !isFloatImg && height > getReaderPageMetrics().pageHeight * 0.85) {
            height = Math.floor(getReaderPageMetrics().pageHeight * 0.55);
        }

        const hardBreak =
            node.type.name === 'horizontalRule' && node.attrs?.variant === 'page-break';

        blocks.push({
            pos,
            nodeSize: node.nodeSize,
            node,
            dom,
            // Sentinel: don't consume body budget — spacer handles the jump.
            height: hardBreak ? 0 : height,
            hardBreak,
            footnoteIds: collectFootnoteIdsFromPmNode(node),
        });
    }
    return blocks;
}

/** Y where page `pageIndex` body content may start (PM-local, y=0 at PM top). */
function pageContentOriginY(pageIndex, metrics, padTop) {
    return pageIndex * (metrics.pageHeight + metrics.pageGap) + padTop;
}

/** Y where page `pageIndex` body must end (above footer). */
function pageContentLimitY(pageIndex, metrics, footerZone) {
    return pageIndex * (metrics.pageHeight + metrics.pageGap) + metrics.pageHeight - footerZone - 1;
}

function buildDecorations(view) {
    const metrics = getReaderPageMetrics();
    const host = view.dom.parentElement;
    const canvas = view.dom.closest('.editor-content') || host;
    applyPageMetricsCssVars(canvas, metrics);
    applyPageMetricsCssVars(host, metrics);
    applyPageMetricsCssVars(view.dom, metrics);

    const padTop = metrics.padBlockTop;
    // Empty-page chrome only (dashed foot). Pages with notes size to fitted content up to max.
    const emptyFooterChrome = Math.max(metrics.padBlockBottom + 10, Math.round(metrics.footnoteBandMax * 0.42));
    const footerMax = Math.max(emptyFooterChrome, metrics.footnoteBandMax);

    const blocks = collectTopLevelBlocks(view);
    const decos = [];

    decos.push(
        Decoration.widget(0, () => createTopInsetWidget(padTop), {
            side: -1,
            key: 'editor-page-top-inset',
        })
    );

    let pageIndex = 0;
    // Cursor Y in PM space as if top-inset is already applied and no breaks yet.
    let cursorY = padTop;
    let pageRefIds = [];
    let footnoteSpill = [];
    let footerZone = emptyFooterChrome;
    const pageFooterHeights = [];
    const pageFootnoteIds = [];

    const applyFittedNotes = (candidateIds) => {
        const fit = fitFootnotesToBand(view, candidateIds, footerMax);
        pageRefIds = fit.fittedIds;
        footnoteSpill = fit.spillIds;
        footerZone = footerZoneHeight(fit.height, emptyFooterChrome, footerMax);
        return fit;
    };

    const commitPageChrome = () => {
        pageFooterHeights[pageIndex] = footerZone;
        pageFootnoteIds[pageIndex] = pageRefIds.slice();
    };

    const advanceToNextPage = (breakPos, side, key) => {
        const nextOrigin = pageContentOriginY(pageIndex + 1, metrics, padTop);
        const spacerH = Math.max(0, nextOrigin - cursorY);
        commitPageChrome();
        decos.push(
            Decoration.widget(breakPos, () => createPageBreakWidget(spacerH), {
                side,
                key,
            })
        );
        pageIndex += 1;
        cursorY = nextOrigin;
        return spacerH;
    };

    for (let i = 0; i < blocks.length; i += 1) {
        const { pos, height, footnoteIds, hardBreak, node, dom } = blocks[i];

        // Author page break: finish this sheet and start the next (even if space remains).
        if (hardBreak) {
            if (cursorY > padTop + 0.5) {
                const afterBreak = pos + (blocks[i].nodeSize || 1);
                advanceToNextPage(afterBreak, -1, `editor-pagebreak-hard-${pos}-${pageIndex + 1}`);
            }
            applyFittedNotes(footnoteSpill.slice());
            continue;
        }

        if (height <= 0) continue;

        const trialIds = unionIds(unionIds(pageRefIds, footnoteSpill), footnoteIds);
        const trialFit = fitFootnotesToBand(view, trialIds, footerMax);
        const trialFooter = footerZoneHeight(trialFit.height, emptyFooterChrome, footerMax);
        footerZone = trialFooter;
        const limitY = pageContentLimitY(pageIndex, metrics, footerZone);

        const fitsWhole = cursorY + height <= limitY + 0.5;
        if (fitsWhole) {
            cursorY += height;
            pageRefIds = trialFit.fittedIds;
            footnoteSpill = trialFit.spillIds;
            footerZone = trialFooter;
            continue;
        }

        const words = canSplitBlock(node) ? buildWordIndex(node, pos) : [];
        const canMidSplit = words.length >= 12 && dom;

        // Non-splittable (or too short): keep whole-block jump to next page.
        if (!canMidSplit) {
            if (cursorY > padTop + 0.5) {
                advanceToNextPage(pos, 1, `editor-pagebreak-${pos}-${pageIndex + 1}`);
            }
            cursorY += height;
            applyFittedNotes(unionIds(footnoteSpill, footnoteIds));
            continue;
        }

        // Mid-paragraph split — fill each page, spacer, continue remainder (reader parity).
        let wordOffset = 0;
        let placedNotes = false;
        let guard = 0;

        const breakBeforeRemainder = () => {
            if (wordOffset === 0) {
                advanceToNextPage(pos, 1, `editor-pagebreak-${pos}-${pageIndex + 1}`);
            } else {
                advanceToNextPage(
                    words[wordOffset].pos,
                    -1,
                    `editor-pagebreak-mid-${pos}-${pageIndex}-${wordOffset}`
                );
            }
        };

        const measureChunk = (count, isLast) => measureDomCloneHeight(dom, (clone) => {
            if (wordOffset > 0) {
                truncateCloneToWordCount(clone, wordOffset + count);
                truncateCloneDropPrefix(clone, wordOffset);
            } else {
                truncateCloneToWordCount(clone, count);
            }
        }, { continuation: true, includeMarginBottom: Boolean(isLast) });

        while (wordOffset < words.length && guard < 40) {
            guard += 1;
            footerZone = footerZoneHeight(
                measureFootnoteContentHeight(
                    view,
                    placedNotes ? pageRefIds : unionIds(pageRefIds, footnoteIds)
                ),
                emptyFooterChrome,
                footerMax
            );
            const pageLimit = pageContentLimitY(pageIndex, metrics, footerZone);
            const remaining = pageLimit - cursorY;
            const leftAfter = words.length - wordOffset;

            if (remaining < 28 && cursorY > padTop + 0.5) {
                breakBeforeRemainder();
                continue;
            }

            const fitCount = maxWordsFitting(dom, words.length, wordOffset, remaining);

            if (fitCount <= 0) {
                if (cursorY > padTop + 0.5) {
                    breakBeforeRemainder();
                    continue;
                }
                // Full page still can't take a word — force a chunk to avoid a stuck loop.
                const force = Math.min(Math.max(8, Math.ceil(leftAfter * 0.35)), leftAfter);
                cursorY += Math.max(measureChunk(force, force >= leftAfter), 20);
                wordOffset += force;
                if (!placedNotes) {
                    applyFittedNotes(unionIds(footnoteSpill, footnoteIds));
                    placedNotes = true;
                }
                if (wordOffset < words.length) breakBeforeRemainder();
                continue;
            }

            // Remainder fits on this page.
            if (fitCount >= leftAfter) {
                cursorY += wordOffset === 0 ? height : Math.max(measureChunk(leftAfter, true), 12);
                wordOffset = words.length;
                if (!placedNotes) {
                    applyFittedNotes(unionIds(footnoteSpill, footnoteIds));
                    placedNotes = true;
                }
                break;
            }

            // Reader parity: refuse crumb splits on the first break of a paragraph.
            let useCount = fitCount;
            if (wordOffset === 0 && (useCount <= 3 || leftAfter - useCount <= 3)) {
                advanceToNextPage(pos, 1, `editor-pagebreak-${pos}-${pageIndex + 1}`);
                cursorY += height;
                applyFittedNotes(unionIds(footnoteSpill, footnoteIds));
                placedNotes = true;
                wordOffset = words.length;
                break;
            }
            // Continuations: never leave fewer than 3 words behind a break.
            if (leftAfter - useCount < 3) useCount = leftAfter - 3;
            if (useCount < 3) useCount = fitCount;

            cursorY += Math.max(measureChunk(useCount, false), 12);
            wordOffset += useCount;

            if (!placedNotes) {
                applyFittedNotes(unionIds(footnoteSpill, footnoteIds));
                placedNotes = true;
            }

            if (wordOffset >= words.length) break;
            breakBeforeRemainder();
        }

        if (!placedNotes) {
            applyFittedNotes(unionIds(footnoteSpill, footnoteIds));
        }
    }

    commitPageChrome();

    // Drain spilled notes onto following footnote-only sheets.
    let drainGuard = 0;
    while (footnoteSpill.length && drainGuard < 40) {
        drainGuard += 1;
        pageIndex += 1;
        applyFittedNotes(footnoteSpill.slice());
        commitPageChrome();
    }

    const pageCount = pageIndex + 1;
    ensurePageBacks(host || canvas, pageCount, metrics, pageFooterHeights, pageFootnoteIds, view);

    const stackH = pageCount * metrics.pageHeight + Math.max(0, pageCount - 1) * metrics.pageGap;
    view.dom.style.minHeight = `${stackH}px`;

    return {
        decorations: DecorationSet.create(view.state.doc, decos),
        sigExtra: `${pageCount}:${Math.round(cursorY)}:${footerZone}`,
    };
}

function recompute(view, signatureRef) {
    if (!view || view.isDestroyed) return;
    try {
        const { decorations: set, sigExtra } = buildDecorations(view);
        const breakSig = set
            .find()
            .filter((d) => d.spec?.key && String(d.spec.key).startsWith('editor-pagebreak'))
            .map((d) => `${d.from}:${d.spec.key}`)
            .join('|');
        const metrics = getReaderPageMetrics();
        const sig = `${metrics.pageHeight}x${metrics.pageWidth}\u0001${breakSig}\u0001${view.state.doc.content.size}\u0001${sigExtra}`;
        if (sig === signatureRef.current) return;
        signatureRef.current = sig;
        // Pin viewport during spacer reflow, then jump only if the caret
        // landed on a different sheet (spacers may not exist until this dispatch).
        const pinX = window.scrollX;
        const pinY = window.scrollY;
        view.dispatch(
            view.state.tr
                .setMeta(editorPaginationKey, set)
                .setMeta('addToHistory', false)
                .setMeta('scrollIntoView', false)
        );
        if (window.scrollX !== pinX || window.scrollY !== pinY) {
            window.scrollTo(pinX, pinY);
        }
        requestAnimationFrame(() => {
            if (view.isDestroyed) return;
            const page = caretPageIndex(view, getReaderPageMetrics());
            if (page !== lastScrolledCaretPage) {
                lastScrolledCaretPage = page;
                scrollToPageSheet(page, { smooth: true });
            }
        });
    } catch (err) {
        console.warn('editor pagination recompute failed', err);
    }
}

export function createEditorPaginationExtension() {
    return Extension.create({
        name: 'editorPagination',

        addProseMirrorPlugins() {
            let scheduled = null;
            const signatureRef = { current: '' };
            let destroyed = false;
            let recomputing = false;

            const schedule = (view) => {
                if (destroyed || scheduled) return;
                scheduled = requestAnimationFrame(() => {
                    scheduled = null;
                    recompute(view, signatureRef);
                });
            };

            const recomputeSoon = (view) => {
                if (destroyed || recomputing) return;
                signatureRef.current = '';
                queueMicrotask(() => {
                    if (destroyed || recomputing || view.isDestroyed) return;
                    recomputing = true;
                    try {
                        recompute(view, signatureRef);
                    } finally {
                        recomputing = false;
                    }
                });
            };

            return [
                new Plugin({
                    key: editorPaginationKey,
                    state: {
                        init: () => DecorationSet.empty,
                        apply(tr, set) {
                            const next = tr.getMeta(editorPaginationKey);
                            if (next) return next;
                            if (tr.docChanged) return DecorationSet.empty;
                            return set;
                        },
                    },
                    props: {
                        decorations(state) {
                            return editorPaginationKey.getState(state);
                        },
                    },
                    view(view) {
                        const onResize = () => {
                            signatureRef.current = '';
                            schedule(view);
                        };
                        const onImg = (e) => {
                            if (e.target && e.target.tagName === 'IMG') {
                                signatureRef.current = '';
                                schedule(view);
                            }
                        };

                        schedule(view);
                        window.addEventListener('resize', onResize);
                        if (window.visualViewport) {
                            window.visualViewport.addEventListener('resize', onResize);
                        }
                        view.dom.addEventListener('load', onImg, true);

                        return {
                            update(view, prevState) {
                                if (recomputing) return;
                                if (view.state.doc !== prevState.doc) {
                                    recomputeSoon(view);
                                }
                            },
                            destroy() {
                                destroyed = true;
                                if (scheduled) cancelAnimationFrame(scheduled);
                                window.removeEventListener('resize', onResize);
                                if (window.visualViewport) {
                                    window.visualViewport.removeEventListener('resize', onResize);
                                }
                                view.dom.removeEventListener('load', onImg, true);
                            },
                        };
                    },
                }),
            ];
        },
    });
}

export function requestEditorPaginationRefresh(editor) {
    if (!editor?.view || editor.isDestroyed) return;
    const view = editor.view;
    requestAnimationFrame(() => {
        recompute(view, { current: '' });
    });
}

/** Last page index we scrolled to — only jump when the caret crosses a sheet. */
let lastScrolledCaretPage = -1;

function toolbarClearancePx() {
    // Match the visible gap under the fixed toolbar (~14px).
    const gap = 14;
    const fromContainer = document.querySelector('.editor-container');
    if (fromContainer) {
        const v = getComputedStyle(fromContainer).getPropertyValue('--editor-toolbar-offset').trim();
        const n = parseFloat(v);
        if (Number.isFinite(n)) return n + gap;
    }
    return 52 + gap;
}

/** Page index (0-based) under the caret, from stacked sheet geometry. */
export function caretPageIndex(view, metrics = getReaderPageMetrics()) {
    if (!view || view.isDestroyed) return 0;
    let coords;
    try {
        coords = view.coordsAtPos(view.state.selection.head);
    } catch (_) {
        return lastScrolledCaretPage >= 0 ? lastScrolledCaretPage : 0;
    }
    if (!coords) return 0;
    const pmRect = view.dom.getBoundingClientRect();
    const yInPm = (coords.top + coords.bottom) / 2 - pmRect.top;
    const stride = metrics.pageHeight + metrics.pageGap;
    if (stride <= 0) return 0;
    return Math.max(0, Math.min(50, Math.floor(yInPm / stride)));
}

function scrollToPageSheet(pageIndex, { smooth = true } = {}) {
    const host = document.querySelector('.tiptap-editor');
    const page = host?.querySelector('.editor-page-backs')?.children?.[pageIndex];
    if (!page) return false;
    const targetTop = page.getBoundingClientRect().top + window.scrollY - toolbarClearancePx();
    window.scrollTo({
        top: Math.max(0, Math.round(targetTop)),
        behavior: smooth ? 'smooth' : 'auto',
    });
    return true;
}

/**
 * Scroll the window only when the caret moves onto a different page sheet.
 * Returns true so ProseMirror skips its default caret-chasing scroll.
 */
export function handleEditorPageScrollToSelection(view) {
    if (!view || view.isDestroyed) return true;
    const metrics = getReaderPageMetrics();
    const page = caretPageIndex(view, metrics);
    if (page !== lastScrolledCaretPage) {
        lastScrolledCaretPage = page;
        // After pagination spacers settle in the same frame, jump to that sheet.
        requestAnimationFrame(() => {
            if (view.isDestroyed) return;
            const again = caretPageIndex(view, getReaderPageMetrics());
            lastScrolledCaretPage = again;
            scrollToPageSheet(again, { smooth: true });
        });
    }
    return true;
}

/** Reset page-scroll memory (e.g. after loading a draft). */
export function resetEditorPageScrollMemory() {
    lastScrolledCaretPage = -1;
}
