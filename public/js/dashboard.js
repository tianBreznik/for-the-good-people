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
                } else {
                    blogs.forEach((blog) => {
                        createBlog(blog);
                    });
                }
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
    let data = blog.data();
    blogsSection.innerHTML += `
    <div class="blog-card">
        <div class="blog-content">
            <h1 class="blog-title">${data.title}</h1>
            <p class="blog-meta">Published: ${data.publishedAt} • ${data.numberofcomments || 0} comments</p>
        </div>
        <div class="blog-actions">
            <a href="/${blog.id}" class="btn dark">read</a>
            <a href="/${blog.id}/editor" class="btn grey">edit</a>
            <a href="#" onclick="deleteBlog('${blog.id}')" class="btn danger">delete</a>
        </div>
    </div>
    `;
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
