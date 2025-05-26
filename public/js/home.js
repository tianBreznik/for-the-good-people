const blogSection = document.querySelector('.blogs-section');
const topdiv = document.querySelector('#first-container');
const navbar = document.querySelector('.navbar');

let topfaded = false;
db.collection("blogs").get().then((blogs) => {
    blogs.forEach(blog => {
        if(blog.id != decodeURI(location.pathname.split("/").pop())){
            createBlog(blog);
        }
    })
})

const createBlog = (blog) => {
    let data = blog.data();
    if(data.bannerImage != ''){
        blogSection.innerHTML += `
            <div class="cardcontainer">
                <div class="blog-card-before"></div>    
                <div class="blog-card-after"></div>   
                <div class="blog-card" onclick="location.href='/${blog.id}'" style="cursor: pointer;"">
                    <img src="${data.bannerImage}" class="blog-image" alt="">
                    <h1 class="blog-title" data-text="${data.title.substring(0,100)}">${data.title.substring(0, 100) + '...'}</h1>
                    <p class="blog-overview" data-text="${data.article.substring(0,100)}">${data.article.substring(0, 200) + '...'}</p>
                </div>
            </div>
    `;
    }
    else{
        blogSection.innerHTML += `
            <div class="cardcontainer">
                <div class="blog-card-before"></div>    
                <div class="blog-card-after"></div>    
                <div class="blog-card" onclick="location.href='/${blog.id}'" style="cursor: pointer;">
                    <h1 class="blog-title" data-text="${data.title.substring(0,100)}">${data.title.substring(0, 100) + '...'}</h1>
                    <p class="blog-overview" data-text="${data.article.substring(0,100)}">${data.article.substring(0, 200) + '...'}</p>
                </div>
            </div>
    `;
    }

}

topdiv.onclick = () => {
    topdiv.classList.toggle('fade');
    navbar.style.position = 'relative';
}

topdiv.addEventListener("transitionend", () => {
    topdiv.style.display = 'none';
});
