let ui = new firebaseui.auth.AuthUI(auth)
let login = document.querySelector('.login');
const blogsSection = document.querySelector('.blogs-section');

auth.onAuthStateChanged((user) => {
    if (user) {
        login.style.display = 'none';
        getUserWrittenBlogs();
    }
    else{
        setupLoginButton();
    }
})

const setupLoginButton = () => {
    ui.start("#loginUI", {
        callbacks: {
            signInSuccessWithAuthResult: function(authResult, redirectUrl) {
                console.log(authResult);
                // Mark that we just logged in so home can skip intro fade
                try { sessionStorage.setItem('justLoggedIn', '1'); } catch (e) {}
                // After successful login, always return to home without keeping login page in history
                window.location.replace('/');
                return false; // prevent FirebaseUI from doing its own redirect
            }
        },
        signInFlow: 'popup',
        signinOptions: [firebase.auth.GoogleAuthProvider.PROVIDER_ID]
    })
}

//fetch user written blogs
const getUserWrittenBlogs = () => {
    db.collection("blogs")
        .where("author", "==", auth.currentUser.email.split("@")[0])
        .get()
        .then((blogs) => {
            blogs.forEach((blog) => {
                createBlog(blog);
            })
        })
        .catch((err) => {
            console.log(err);
        })
}

const createBlog = (blog) => {
    let data = blog.data();
    blogsSection.innerHTML += `
    <div class="blog-card">
        <img src="${data.bannerImage}" class="blog-image" alt="">
        <h1 class="blog-title">${data.title.substring(0, 100) + '...'}</h1>
        <p class="blog-overview">${data.article.substring(0, 200) + '...'}</p>
        <a href="/${blog.id}" class="btn dark">read</a>
        <a href="/${blog.id}/editor" class="btn grey">edit</a>
        <a href="#" onclick="deleteBlog('${blog.id}')" class="btn danger">delete</a>
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
