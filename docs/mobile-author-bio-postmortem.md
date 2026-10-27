# Mobile author bio — postmortem

Notes from building the in-app author reader (Mar 2026). For future you / collaborators.

## What kept going wrong

### 1. Too many parallel “mobile bio” models

At different times the stack included: wall strip + `bio-open`, horizontal snap cards, full-screen `bio-mobile-open`, separate close layers, and finally the **article reader shell**. Each layer added its own JS, CSS, and pointer-event rules. Fixes for one path (×, swipe, scroll) often broke another because they weren’t the same state machine as articles.

### 2. Article reader and author bio weren’t one pattern early

Articles ended up with a clear contract: warm iframe → embed ready → slab reveal → one close path. Author bio kept reusing **desktop strip semantics** (hover, delay, `bio-closing`, horizontal cards) on mobile until the product direction was explicit: **same shell as the reader**, not the strip.

### 3. CSS that assumed “home only”

Rules like `body:not(.home-wall-ready) .bio-panel { visibility: hidden }`, mobile hide on `.bio-panel`, and strip `--bio-card-height` on `.bio-panel-cards` were correct on `/` but **silently broke** the author iframe. Same class names, different document — cascade trap.

### 4. Relative URLs on `/author/:handle`

`js/foo.js` resolved to `/author/js/foo.js`. The panel looked empty while the shell and × worked — no JS ran. Blog pages at `/:id` didn’t hit this (path depth differs). **Root-absolute assets** (`/js/…`, `/css/…`) should be default for any routed HTML under nested paths.

### 5. Blocking work before motion

`await fetchAuthorProfile()` before opening the shell made the slab feel dead. Same class of mistake as opening the reader at the wrong time relative to pane anchor for articles.

### 6. Large intertwined diffs in `home.js`

A stray brace in `expandArticlePanelAndNavigate` broke the whole file once. Monolith + big experiments = expensive regressions.

### 7. Implementations removed or superseded

- Mobile horizontal bio strip under the wall (`bio-open` + sideways cards).
- `bio-mobile-open` / dedicated close overlay experiments.
- Pointerdown prefetch for articles (two-tap / missed embed-ready).
- Opening reader before pane anchor (slab misalignment).
- PE / dismiss listeners tuned for strip bio that fought the reader shell.

Desktop strip bio remains for fine pointer / hover; mobile author tap uses `/author/…?embed=1` in `mobile-reader-shell`.

---

## How it could have been prevented

1. **Product contract first** — “Mobile author tap = same shell as article: iframe, same ×, same back, no wall strip.” Delete anything that isn’t that.

2. **Embed checklist** — Absolute asset URLs; `:not(.reader-embed)` on home-only CSS; embed-ready on first paint; handoff from cache, network in background.

3. **Fork the article open sequence** — `openMobileEmbedShell`, different URL + ready id; don’t reinvent strip + reader.

4. **Scope CSS by context** — `body.reader-embed` / `author-bio-embed.css`; don’t share `.bio-panel` globals without guards.

5. **Small commits** — Empty page → vertical cards → styling → sizing → perf.

6. **Smoke checks** — `/author/test?embed=1` asserts scripts 200 and `GppAuthorBioView` exists.

7. **Shared bio modules earlier** — `bio-capture.js`, `bio-social.js`, shared handle fit.

---

## Lesson

Most pain wasn’t “hard mobile bugs” — it was **two products sharing one wall of CSS and one large `home.js`**, while mobile author bio wanted to be **a third embed surface** like the article reader. Once that was explicit, remaining work was sizing, cascade, paths, and not blocking animation.

## Stable contract (current)

| Area | Behavior |
|------|----------|
| Mobile author tap | `openMobileAuthorPage` → `mobile-reader-shell`, `/author/{handle}?embed=1` |
| Close | Same × / `closeMobileInAppReader` as articles |
| Desktop | Unchanged bio strip (`bio-open`) |
| Assets | Absolute paths in `author.html` |
| Layout | `author-bio-embed.css` — full-width inset cards, no panel scroll |
| Open perf | Cache handoff sync; profile fetch async; shorter author reveal fallback |
