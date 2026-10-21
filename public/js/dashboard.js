let ui = new firebaseui.auth.AuthUI(auth)
let login = document.querySelector('.login');
const blogsSection = document.querySelector('.blogs-section');

auth.onAuthStateChanged((user) => {
    if (user) {
        login.style.display = 'none';
        getUserWrittenBlogs(user);
    }
    else{
        setupLoginButton();
    }
})

const setupLoginButton = () => {
    ui.start(
        '#loginUI',
        getAuthUiConfig({
            callbacks: {
                signInSuccessWithAuthResult(authResult) {
                    console.log(authResult);
                    return false;
                },
            },
        })
    );
};

/** Author keys this account may have used on blog docs (handle, email local-part, displayName). */
function authorIdsForUser(user) {
    const ids = [];
    const add = (value) => {
        const v = String(value || '').trim().replace(/^@+/, '');
        if (v && !ids.includes(v)) ids.push(v);
    };
    add(typeof getAuthorIdFromUser === 'function' ? getAuthorIdFromUser(user) : '');
    if (user.email) add(user.email.split('@')[0]);
    if (user.displayName) {
        add(user.displayName.trim().replace(/^@+/, '').replace(/\s+/g, '_').slice(0, 24));
    }
    return ids.slice(0, 10);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function blogSortMs(data) {
    const raw = data?.publishedAt || data?.lastModified || '';
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
    return 0;
}

/** Compact left-column date: D.M.YY (billwurtz-style). */
function formatDashboardDate(data) {
    const ms = blogSortMs(data);
    if (!ms) return '—';
    const d = new Date(ms);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = String(d.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
}

//fetch user written blogs
const getUserWrittenBlogs = (user) => {
    const runQuery = () => {
        const authorIds = authorIdsForUser(user);
        if (!authorIds.length) {
            showEmptyState();
            return;
        }
        const query = authorIds.length === 1
            ? db.collection('blogs').where('author', '==', authorIds[0])
            : db.collection('blogs').where('author', 'in', authorIds);
        query
            .get()
            .then((blogs) => {
                if (blogs.empty) {
                    showEmptyState();
                    return;
                }
                const rows = [];
                blogs.forEach((blog) => rows.push(blog));
                rows.sort((a, b) => blogSortMs(b.data()) - blogSortMs(a.data()));
                blogsSection.innerHTML = '';
                rows.forEach((blog) => createBlog(blog));
            })
            .catch((err) => {
                console.log(err);
            });
    };

    const tokenPromise = typeof refreshAuthorIdFromToken === 'function'
        ? refreshAuthorIdFromToken(user)
        : Promise.resolve();
    tokenPromise.then(runQuery).catch(runQuery);
}

const showEmptyState = () => {
    blogsSection.innerHTML = `
    <div class="empty-state">
        <h2>No blogs yet</h2>
        <p>Start writing your first blog post!</p>
        <a href="/editor" class="btn dark">Create New Post</a>
    </div>
    `;
}

const createBlog = (blog) => {
    const data = blog.data();
    const title = data.title || 'Untitled';
    const safeTitle = escapeHtml(title);
    const dateLabel = escapeHtml(formatDashboardDate(data));
    const id = escapeHtml(blog.id);
    const notesOpen = data.notesOpen === true;
    const editControl = notesOpen
        ? `<span class="btn grey edit-locked" aria-disabled="true" title="Open for notes — editing locked">edit</span>`
        : `<a href="/${id}/editor" class="btn grey">edit</a>`;

    blogsSection.insertAdjacentHTML(
        'beforeend',
        `
    <article class="blog-row" data-blog-id="${id}">
        <time class="blog-date">${dateLabel}</time>
        <a class="blog-title" href="/${id}">${safeTitle}</a>
        <div class="blog-actions">
            <button type="button" class="btn notes-toggle-btn ${notesOpen ? 'is-open' : ''}" data-notes-id="${id}" data-notes-open="${notesOpen ? '1' : '0'}" title="${notesOpen ? 'Close notes to unlock editing' : 'Allow readers to annotate (locks editing)'}">${notesOpen ? 'notes on' : 'open notes'}</button>
            <a href="/${id}" class="btn dark">read</a>
            ${editControl}
            <button type="button" class="btn danger" data-delete-id="${id}">delete</button>
        </div>
    </article>
    `
    );
}

function syncRowEditLock(row, notesOpen) {
    if (!row) return;
    const actions = row.querySelector('.blog-actions');
    if (!actions) return;
    const existingEdit = actions.querySelector('a.btn.grey[href*="/editor"], span.edit-locked');
    const id = row.getAttribute('data-blog-id');
    if (!id) return;
    const next = notesOpen
        ? `<span class="btn grey edit-locked" aria-disabled="true" title="Open for notes — editing locked">edit</span>`
        : `<a href="/${id}/editor" class="btn grey">edit</a>`;
    if (existingEdit) {
        existingEdit.outerHTML = next;
    }
}

async function toggleBlogNotes(blogId, currentlyOpen, btn) {
    const next = !currentlyOpen;
    btn.disabled = true;
    try {
        await db.collection('blogs').doc(blogId).set(
            {
                notesOpen: next,
                notesOpenedAt: next ? new Date().toISOString() : null
            },
            { merge: true }
        );
        btn.dataset.notesOpen = next ? '1' : '0';
        btn.textContent = next ? 'notes on' : 'open notes';
        btn.classList.toggle('is-open', next);
        btn.title = next ? 'Close notes to unlock editing' : 'Allow readers to annotate (locks editing)';
        syncRowEditLock(btn.closest('.blog-row'), next);
    } catch (err) {
        console.error(err);
        alert('Could not update notes. Please try again.');
    } finally {
        btn.disabled = false;
    }
}

if (blogsSection) {
    blogsSection.addEventListener('click', (e) => {
        if (e.target.closest('.edit-locked')) {
            e.preventDefault();
            return;
        }
        const notesBtn = e.target.closest('[data-notes-id]');
        if (notesBtn && blogsSection.contains(notesBtn)) {
            e.preventDefault();
            const id = notesBtn.getAttribute('data-notes-id');
            const open = notesBtn.getAttribute('data-notes-open') === '1';
            toggleBlogNotes(id, open, notesBtn);
            return;
        }
        const btn = e.target.closest('[data-delete-id]');
        if (!btn || !blogsSection.contains(btn)) return;
        e.preventDefault();
        deleteBlog(btn.getAttribute('data-delete-id'));
    });
}

const deleteBlog = (id) => {
    db.collection("blogs").doc(id).delete()
        .then(()  => {
            location.reload();
        }
    ).catch((err) => {
        console.log(err);
    });
}

const logout = () => {
    auth.signOut().then(() => {
        window.location.href = '/';
    }).catch((error) => {
        console.log(error);
    });
}

function bindRandomNavHover(selectors) {
    document.querySelectorAll(selectors).forEach((el) => {
        el.addEventListener('pointerenter', () => {
            const hue = Math.floor(Math.random() * 360);
            const c = `hsl(${hue} 72% 48%)`;
            el.style.setProperty('--dash-hover', c);
            el.style.setProperty('color', c, 'important');
        });
        el.addEventListener('pointerleave', () => {
            el.style.removeProperty('--dash-hover');
            el.style.removeProperty('color');
        });
    });
}

bindRandomNavHover('.dashboard-footer .logout-btn, .dashboard-footer .home-btn');
