let blogId = decodeURI(location.pathname.split("/").pop());
const commentSection = document.querySelector('.comment-section');

let docRef = db.collection("blogs").doc(blogId);
let commentRef = db.collection("comments").doc(blogId+'_'+0);
let comments = db.collection("comments");

let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
let numberofcomments = 0;
let commenttracker = [];

docRef.get().then((doc) => {
    if(doc.exists){
        setupBlog(doc.data());
    } else{
        location.replace("/");
    }
})

commentRef.get().then((comms) => {
    console.log(numberofcomments);
    if(comms.exists){
        setupCommentSection();
    } else{
        console.log("no comments yet");
    }
})


document.addEventListener("keydown", function(e) {
    if(e.key === "Enter"){
        e.preventDefault();
        submitComment(numberofcomments);
    }
})

function submitComment(commentindex) {
    const input = document.getElementById("commentInput");
    let commentText = input.value.trim();
    let responseUser = '';
    let responseId = '';
    let date = new Date();

    if (commentText) {
        const commentList = document.getElementById("commentList");
        const newComment = document.createElement("li");
        newComment.textContent = commentText;
        //commentList.appendChild(newComment);
        if(commentText[0] == '@'){
            responseUser = commentText.substring(0, commentText.indexOf(' '));
            commentText = commentText.substring(commentText.indexOf(' '));
            responseId = input.getAttribute("name");
            console.log(responseId)
            console.log(responseUser);
            console.log(commentText)
        }

        comments
            .doc(blogId + '_' + commentindex)
            .set({
                content: commentText,
                postedAt: `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`,
                responseTo: responseUser,
                user: auth.currentUser.email.split("@")[0],
                replyId: responseId,
            })
            .then(() => {
                console.log("Document created");
        });

        numberofcomments++;
        docRef.update({
            numberofcomments: numberofcomments,
        })
        console.log(numberofcomments);
        input.value = ""; // Clear input field
    }
}

const setupCommentSection = () => {
    db.collection("comments").onSnapshot((comments) => {
        comments.forEach(comment => {
            console.log("before: " + comment.id);
            if(comment.id.includes(decodeURI(location.pathname.split("/").pop())) && !(commenttracker.indexOf(comment.id) > -1)){
                console.log("created: " + comment.id);
                createComment(comment, comment.id);
                commenttracker.push(comment.id);
            }
        })
    })
}

const makeAnchor = (replyuser, commentid) => {
    const input = document.getElementById("commentInput");
    console.log("reply user: " + replyuser);
    console.log("on comment: " + commentid);
    //sem daj se comment id in extract it out of the
    console.log(commentid);
    input.setAttribute("name", commentid);
    input.name = commentid;
    input.value = "@" + replyuser;


}
const createComment = (comment, commentid) => {
    let data = comment.data();
    const input = document.getElementById("commentInput");
    const replycommentid = input.getAttribute("name");
    console.log(data.replyId);
    input.setAttribute("name", "");
    if(data.responseTo == ''){
        commentSection.innerHTML += `
        <div class="comment-card" id='${commentid}'>
            <h1 class="user">@${data.user}</h1>
            <div class="comment-meat">
                <p class="comment-content">${data.content}</p>
                <button class="reply" onclick="makeAnchor('${data.user}','${commentid}')">reply</button>
            </div>
        </div>
    `;
    }else{
        commentSection.innerHTML += `
        <div class="comment-card" id='${commentid}'>
            <h1 class="user">@${data.user}</h1>
            <div class="comment-meat">
                <p class="comment-content"><a class="reply-user" href="#'${replycommentid}'" onclick="scrollToAnchor('${data.replyId}')">${data.responseTo}</a> ${data.content}</p>
                <button class="reply" onclick="makeAnchor('${data.user}','${commentid}')">reply</button>
            </div>
        </div>
    `;
    }

}

const setupBlog = (data) => {
    const banner = document.querySelector('.banner');
    const blogTitle = document.querySelector('.title');
    const titleTag = document.querySelector('title');
    const publish = document.querySelector('.published');
    
    banner.style.backgroundImage = `url(${data.bannerImage})`;

    titleTag.innerHTML += blogTitle.innerHTML = data.title;
    publish.innerHTML += data.publishedAt;
    publish.innerHTML += ` -- ${data.author}`;

    numberofcomments = data.numberofcomments;

    try{
        if(data.author == auth.currentUser.email.split('@')[0]){
            let editBtn = document.getElementById('edit-blog-btn');
            editBtn.style.display = "inline";
            editBtn.href = `${blogId}/editor`;
        }
    }
    catch(err){
        console.log(err);
    }

    const article = document.querySelector('.article');
    addArticle(article, data.article);
}

const addArticle = (ele, data) => {
    data = data.split("\n").filter(item => item.length);
    // console.log(data);

    data.forEach(item => {
        // check for heading
        if(item[0] == '#'){
            let hCount = 0;
            let i = 0;
            while(item[i] == '#'){
                hCount++;
                i++;
            }
            let tag = `h${hCount}`;
            ele.innerHTML += `<${tag}>${item.slice(hCount, item.length)}</${tag}>`
        } 
        //checking for image format
        else if(item[0] == "!" && item[1] == "["){
            let seperator;

            for(let i = 0; i <= item.length; i++){
                if(item[i] == "]" && item[i + 1] == "(" && item[item.length - 1] == ")"){
                    seperator = i;
                }
            }

            let alt = item.slice(2, seperator);
            let src = item.slice(seperator + 2, item.length - 1);
            ele.innerHTML += `
            <img src="${src}" alt="${alt}" class="article-image">
            `;
        }

        else{
            ele.innerHTML += `<p>${item}</p>`;
        }
    })
}

function scrollToAnchor(scrollid) {
    const target = document.getElementById(scrollid);
    const targetPosition = target.getBoundingClientRect().top + window.pageYOffset;

    var origcolor = target.style.backgroundColor
    target.style.backgroundColor = 'rgba(255, 251, 0, 0.431)';
    target.style.borderStyle = 'ridge';
    target.style.borderRadius = '10px';

    window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
    })
    setTimeout(function(){
        target.style.backgroundColor = origcolor;
        target.style.borderStyle = 'none';
        target.style.borderRadius = '0px';
    },(1500));
};