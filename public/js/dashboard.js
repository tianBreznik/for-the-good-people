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

    blogsSection.insertAdjacentHTML(
        'beforeend',
        `
    <article class="blog-row">
        <time class="blog-date">${dateLabel}</time>
        <a class="blog-title" href="/${id}">${safeTitle}</a>
        <div class="blog-actions">
            <a href="/${id}" class="btn dark">read</a>
            <a href="/${id}/editor" class="btn grey">edit</a>
            <button type="button" class="btn danger" data-delete-id="${id}">delete</button>
        </div>
    </article>
    `
    );
}

if (blogsSection) {
    blogsSection.addEventListener('click', (e) => {
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
