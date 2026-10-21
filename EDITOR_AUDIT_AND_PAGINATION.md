# Editor audit & pagination-in-editor proposal

Living notes from the 2026-10 editor/reader audit. Update this file when gaps close or the pagination feature ships.

Related code:
- Editor: `public/editor.html`, `public/js/editor.js`, `public/css/editor.css`
- Reader pagination: `public/js/blog.js` (`parseArticleBlocks`, `renderArticleSpread`, `splitParagraphToFit`, `finalizePageFootnotes`)
- Reader styles: `public/css/blog.css`
- Home preview (first page only): `public/js/home.js`, `public/css/home.css`

---

## 1) Block / feature inventory

Status key: **works** · **partial** · **broken** · **missing**

### Wired and generally fine

| Feature | Notes |
|--------|--------|
| Bold / italic / strike / underline / sub / super | TipTap marks |
| Line break, H2 title toggle | |
| Text align L/C/R/justify | Inline styles on heading/paragraph |
| Poetry (dialog) | `p[data-variant=poetry]` (+ optional author, italic) |
| Blockquote / styled quote | Dialogs; attribution paragraph supported |
| Dinkus | `hr[data-variant=dinkus]` |
| Dropcap / smallcaps / intro / whisper | `setNode('paragraph', { variant })` |
| Footnotes | Ref node + end defs; renumber plugin; reader packs into page band |
| Content refs (`@` / `#`) | Editor suggest + reader `linkifyElement` |
| Image upload block/inline | `data-display="block\|inline"` |
| Undo / redo / close / leave guard | |
| Autosave + cloud draft reconcile | Newest `lastSaved` wins; `blogId` tags drafts |
| Publish + open-notes | Popover; `notesOpen` locks further edits. Second action is labeled **publish draft** (see §5 — not wired to home-hide yet) |

### Partial / broken / missing

| Feature | Status | Issue |
|--------|--------|--------|
| Image align (⬅️⬆️➡️) | **fixed** (2026-10-20) | `StyledImage` persists `align` + `data-display`; toolbar updates attrs; upload uses `setImage` |
| Text color | **fixed** (2026-10-20) | Reader keeps inline color via `currentColor` + escapes ink gradient (no more `color: inherit`) |
| Highlight color | **works** (likely) | Separate from text-color override |
| Font size | **partial** | Inline span sizes; reader ink-gradient may mute hierarchy |
| Link | **partial** | `window.prompt` only (content-ref autocomplete is separate) |
| Paragraph / chapter epigraph | **partial** | Dual `window.prompt`; chapter = two `p[data-variant=epigraph]` |
| Lists | **partial** | Edit OK; little/no list typography in `blog.css`; atomic in pagination |
| `fieldnotes` | **missing** UI | CSS ready in editor + blog; no toolbar action |
| Preview variant CSS | **partial** | Home preview missing dropcap, dinkus, intro, whisper, smallcaps, footnotes |

### Explicitly deferred (product)

- Annotation offset remap when body edits while notes were/are open (`notesOpen` lock is the current mitigation).

---

## 2) Pagination today (reader)

### Strengths

- Measure-driven packing (`scrollHeight` vs `pageBodyHeightBudget`), not char counts.
- Reserved footnote band (`footnoteBandHeight`); defs spill to next page with a guard.
- Word-level split for long top-level `<p>` only (`splitParagraphToFit` / `splitNodeAtWordBoundary`).
- Resize reflow re-runs `renderArticleSpread`.

### Risks / gaps

1. **Only plain `<p>` splits** — blockquotes, lists, images, hr, headings, short poetry move as atomic units → awkward bottoms or oversized single-block pages.
2. **Footnote refs across splits** — clone + text-only split can **duplicate** superscripts.
3. **Variant attrs on both halves** after split (e.g. dropcap on page 2 fragment).
4. **Tall images** — no constrain in full reader (preview can scale).
5. **Right page** in DOM (`article-page-right`) is CSS-hidden — not a real two-up spread.
6. Author has **no control** over break points; layout is chance relative to viewport height.

### Manual QA hotspots

- Every toolbar action desktop + ≤900px.
- Image align → reload → confirm persistence in editor HTML and reader.
- Text color + highlight published to reader.
- Footnote near a forced paragraph split (duplicate refs).
- Dropcap paragraph split across pages.
- Long article page numbers, footnote spill, resize reflow.
- `notesOpen` lock: dashboard toggle, editor redirect, publish block.

---

## 3) Priority fix backlog (before / alongside pagination UX)

1. ~~Persist image `align` + `data-display`~~ done (`StyledImage` in `editor.js`).
2. ~~Fix reader text-color override~~ done (`blog.css`).
3. Split-safe footnote refs (atoms must not clone onto both halves).
4. Home preview CSS parity for major variants.
5. Optional polish: `fieldnotes` button, real dialogs for link/epigraphs, list styles, blockquote-aware splits.

---

## 4) Proposed feature: paginated editor (same pages as the reader)

### Problem

Authors write in a continuous TipTap canvas. Breaks between reader pages are computed only at view time from viewport geometry. That makes:

- orphans / lonely headings before a break,
- atomic blocks (images, quotes, lists) landing alone on a page,
- footnotes crowding or spilling unpredictably,
- “chance” layout the author cannot steer without repeatedly publishing and checking the article.

### Goal

The **editor content area itself** is paginated with the **same measures** as real article pages. The author always sees which page they are writing on. There is **no separate preview pane** — writing surface = page surface.

Authors later get **explicit break control** so final reader pagination is intentional, not accidental.

### Design principles

1. **One geometry** — editor page width, body height budget, masthead reservation, and footnote band match the reader (`getSpreadTargetHeight` / `pageBodyHeightBudget` / `footnoteBandHeight` family). Shared module; no forked math.
2. **Edit in pages** — TipTap lives inside stacked page frames (page 1, page 2, …). Caret, selection, and typing happen on those pages — not on an infinite scroll sheet with a mirror beside it.
3. **Author breaks are first-class** — stored in document HTML (not only local UI state).
4. **Auto-fill still exists** — until/unless a hard break is placed, content still packs with the same rules as the reader so overflow never “hides” below the fold of a page.
5. **Canonical frame** — target the published article page frame. Document any mobile reflow rules if phone width must reflow differently than the authoring width.

### Non-goal (explicitly rejected)

- A side-by-side or below-the-fold “live preview” while the editor stays a continuous canvas. That splits attention and is not what we want.

### Recommended approach (phased)

#### Phase A — Paginated editor surface (auto breaks only)

Make `#tiptap-editor` / `.ProseMirror` render as **stacked article pages** using the shared packer measures:

- Same page height and content column width as the reader.
- Visible page chrome (edges, page number) so the author knows “I am on page 3.”
- Content flows with the same auto split/pack rules as `renderArticleSpread` (paragraph word-split, atomic blocks move whole, footnote band reserved).
- Still **no** manual break tool yet — but chance is visible *in the writing surface*, not in a second view.

This is the product MVP. It is harder than a detached preview (caret across page boundaries, reflow-on-type, toolbar/mobile) and that cost is accepted.

Technical sketch (implementation detail, not UI):

- Extract measurement + packing helpers from `blog.js`.
- Either: (1) decorate a single ProseMirror doc with page-break decorations / CSS page frames derived from measured offsets, or (2) map doc ranges onto stacked page DOM hosts that still share one editor state. Prefer whichever keeps one document + history intact.
- First page may show masthead space (title is outside TipTap today — reserve the same vertical budget the reader uses for inline masthead so body lines line up).

#### Phase B — Author page-break control

Once pages are visible in-editor:

- TipTap node, e.g. `pageBreak`, visible rule between pages / in flow (“page break”), persisted as HTML sentinel (`<hr data-page-break>` or equivalent).
- Paginator treats sentinel as **hard boundary**: finish current page (footnote finalize), start next — even if space remains.
- Toolbar / shortcut: “Insert page break”; delete by removing the node.
- Optional later: keep-with-next on a block so a heading/image won’t sit alone at a page end.

#### Phase C — Parity polish

- Live footnote band in the editor page chrome (not only reserved empty space).
- Empty-page warnings when edits leave a hard break with almost no content above.
- Align mobile editor layout with the same page frame (or document a single authoring width).

### Author controls (product surface)

| Control | Phase | Behavior |
|--------|-------|----------|
| See page frames + numbers while typing | A | Always on |
| Insert page break | B | Hard break at caret / block boundary |
| Keep with next | later | Mark heading/image so packer won’t orphan it |
| Break before block | later | Force break without a free-floating sentinel |

Minimum lovable: **Phase A**. Minimum for “control”: **A + B**.

### Data model (Phase B)

```html
<!-- example sentinel in saved article HTML -->
<hr data-page-break="true" data-variant="page-break">
```

- Zero-height / non-printed in the reader; hard boundary in the packer.
- Must survive TipTap parse/serialize (extend `HorizontalRule` or dedicated node — same pattern as dinkus `variant`).
- Draft autosave and publish both persist it.

### Interaction with current paginator

Pseudo-order inside the packer (reader + editor):

1. Walk blocks from `parseArticleBlocks` (or live block map from the doc).
2. If block is page-break sentinel → finalize footnotes + open fresh page; do not render sentinel as article prose.
3. Else append / split as today.
4. Footnote defs still stripped from body flow and packed into the page band.

### Risks specific to this feature

- **TipTap + page hosts** — selection/history across visual pages is the hard part; must stay one logical document.
- **Reflow on every keystroke** — debounce/measure carefully; avoid jumpy caret.
- **Viewport mismatch** — authoring width vs phone reader. Prefer a fixed canonical page width in the editor that matches the reader column; reflow rules on real phones must be documented.
- **Stale hard breaks** (Phase B) — edits above a break can leave sparse pages; allow easy delete + empty-page hint.
- **Footnotes** — reserved band in Phase A; live packing UI in Phase C.
- **Annotations** — page-break sentinels must not corrupt plain-text offsets.
- **Shared module** — `blog.js` and editor must call the same geometry API; home first-page preview should eventually too.

### Success criteria

- While typing, the author can see which page they are on without leaving the editor or opening a second pane.
- Editor page geometry matches the published article page closely enough that break positions do not surprise on publish (canonical width).
- After Phase B: author can force a break before a heading, image, quote, or poem and see it held in the reader.
- No regression on footnote packing or `notesOpen` lock.

### Out of scope (for this feature)

- Separate preview column/panel.
- True two-page spread (right column) — separate decision; DOM already has `article-page-right` unused.
- Annotation remap on edit.
- Replacing TipTap.

### Suggested implementation order

1. Finish remaining parity bugs that affect page trust (§3 item 3: split-safe footnotes; preview CSS can follow).
2. Extract shared page geometry + packing module from `blog.js`.
3. **Phase A** — paginate the editor content area itself. **Started 2026-10-20:** `page-geometry.js` + `editor-pagination.js` (stacked page backs + spacer widgets; auto breaks). Footer zone always reserved (empty margin); footnotes occupy that same bottom zone and may grow it (capped). In-page title: `data-doc-title` heading synced to Firestore `title`; author/date byline travels with that heading in editor + reader (`article-title-block`). Legacy posts without a body title still use top masthead. Not yet: mid-paragraph split parity with reader, shared packer extraction into `blog.js`, author `pageBreak` node, live footnote text painted in the footer chrome.
4. **Phase B** — `pageBreak` via `hr[data-variant=page-break]` + toolbar (📄). Editor pagination hard-breaks; reader/`home` preview skip the sentinel. **Started 2026-10-20.**
5. **Phase C** — live footnote packing in band, empty-page hints, tighter mobile frame parity.

---

## 5) Meaningful other follow-ups (short list)

- **Publish draft (was “publish only”)** — Author can mark an article as a **draft** from the publish popover / dashboard so it is saved but **does not appear on the home page**. Wire `data-publish-draft` (and a dashboard draft toggle) to a Firestore flag (e.g. `status: 'draft' | 'published'` or `listed: false`) and filter home feeds on that flag. Today the button still runs a normal publish with notes closed.
- `fieldnotes` toolbar (CSS already exists).
- Replace `window.prompt` for link + epigraphs with existing dialog pattern (poetry/quote).
- Preview CSS parity with `blog.css` variants.
- List typography in the reader.
- Blockquote inner-`<p>` split (home preview already closer than reader).

---

*Last updated: 2026-10-20*
