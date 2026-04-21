let blogId = decodeURI(location.pathname.split("/").pop());
const commentSection = document.querySelector('.comment-section');

let docRef = db.collection("blogs").doc(blogId);
let commentRef = db.collection("comments").doc(blogId+'_'+0);
let comments = db.collection("comments");

let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
let numberofcomments = 0;
let commenttracker = [];

let commentsReady = false;
let readerReady = false;
let commentsListenerAttached = false;
let articleLinesCache = [];
let spreadResizeBound = false;
let spreadReflowTimer = null;
let currentBlogMeta = null;

docRef.get().then((doc) => {
    if(doc.exists){
        setupBlog(doc.data());
    } else{
        location.replace("/");
    }
})

commentRef.get().then((comms) => {
    console.log(numberofcomments);
    commentsReady = true;
    if (!comms.exists) {
        console.log("no comments yet");
    }
    if (readerReady) {
        setupCommentSection();
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
    if (commentsListenerAttached) return;
    commentsListenerAttached = true;
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
    const titleTag = document.querySelector('title');
    const title = data.title || '';
    const publishedAt = data.publishedAt || '';
    const author = data.author || 'Anonymous';

    titleTag.textContent = title ? `Blog : ${title}` : 'Blog';
    currentBlogMeta = { title, publishedAt, author };

    numberofcomments = data.numberofcomments;

    renderArticleBody(data.article);
}


function createInlineMasthead(meta) {
    const wrap = document.createElement('section');
    wrap.className = 'article-inline-masthead';

    const titleEl = document.createElement('h1');
    titleEl.className = 'title';
    titleEl.textContent = meta?.title || '';

    const publishedEl = document.createElement('p');
    publishedEl.className = 'published';
    publishedEl.innerHTML = `<span>published at - </span>${meta?.publishedAt || ''} -- ${meta?.author || 'Anonymous'}`;

    wrap.appendChild(titleEl);
    wrap.appendChild(publishedEl);
    return wrap;
}

function getSpreadTargetHeight() {
    return Math.max(Math.floor(window.innerHeight * 0.89), 590);
}

function createSpread() {
    const spread = document.createElement('section');
    spread.className = 'article-spread';

    const leftPage = document.createElement('div');
    leftPage.className = 'article-page article-page-left';

    const rightPage = document.createElement('div');
    rightPage.className = 'article-page article-page-right';

    spread.appendChild(leftPage);
    spread.appendChild(rightPage);

    return { spread, leftPage, rightPage };
}

function createArticleNode(line) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = formatLine(line).trim();
    return wrapper.firstElementChild || document.createElement('p');
}

function splitParagraphToFit(pageEl, paragraphEl, spreadHeight) {
    if (!paragraphEl || paragraphEl.tagName !== 'P') return null;
    const text = (paragraphEl.textContent || '').trim();
    if (!text) return null;
    const words = text.split(/\s+/);
    if (words.length < 12) return null;

    let low = 1;
    let high = words.length - 1;
    let best = 0;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const probe = document.createElement('p');
        probe.textContent = words.slice(0, mid).join(' ');
        pageEl.appendChild(probe);
        const fits = pageEl.scrollHeight <= spreadHeight;
        pageEl.removeChild(probe);

        if (fits) {
            best = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    if (best <= 3 || best >= words.length - 3) return null;

    const leftPart = document.createElement('p');
    leftPart.textContent = words.slice(0, best).join(' ');

    const rightPart = document.createElement('p');
    rightPart.textContent = words.slice(best).join(' ');

    return { leftPart, rightPart };
}

function renderArticleSpread(lines) {
    const articleBody = document.getElementById('article-body');
    if (!articleBody) return;

    articleBody.innerHTML = '';

    const spreadHeight = getSpreadTargetHeight();
    let currentSpread = createSpread();
    articleBody.appendChild(currentSpread.spread);

    let currentPage = currentSpread.leftPage;
    currentPage.appendChild(createInlineMasthead(currentBlogMeta));

    const moveToNextPage = () => {
        if (currentPage === currentSpread.leftPage) {
            currentPage = currentSpread.rightPage;
            return;
        }
        currentSpread = createSpread();
        articleBody.appendChild(currentSpread.spread);
        currentPage = currentSpread.leftPage;
    };

    lines.forEach((line) => {
        const node = createArticleNode(line);
        currentPage.appendChild(node);

        const minChildren = currentPage.querySelector('.article-inline-masthead') ? 2 : 1;
        if (currentPage.scrollHeight > spreadHeight && currentPage.childElementCount > minChildren) {
            currentPage.removeChild(node);
            const split = splitParagraphToFit(currentPage, node, spreadHeight);
            if (split) {
                currentPage.appendChild(split.leftPart);
                moveToNextPage();
                currentPage.appendChild(split.rightPart);
            } else {
                moveToNextPage();
                currentPage.appendChild(node);
            }
        }
    });

    const commentBlock = document.getElementById('comment-screen');
    if (commentBlock) {
        currentPage.appendChild(commentBlock);
    }

    articleBody.dataset.lastPage = (currentPage === currentSpread.rightPage) ? 'right' : 'left';
}

const renderArticleBody = (articleData) => {
    articleLinesCache = (articleData || '').split("\n").filter(item => item.length);
    renderArticleSpread(articleLinesCache);

    if (!spreadResizeBound) {
        spreadResizeBound = true;
        window.addEventListener('resize', () => {
            clearTimeout(spreadReflowTimer);
            spreadReflowTimer = setTimeout(() => {
                if (articleLinesCache.length) {
                    renderArticleSpread(articleLinesCache);
                }
            }, 140);
        });
    }

    readerReady = true;
    if (commentsReady) {
        setupCommentSection();
    }
}

const formatLine = (line) => {
    // Handle headings
    if (line[0] == '#') {
        let hCount = 0;
        let i = 0;
        while (line[i] == '#') {
            hCount++;
            i++;
        }
        let tag = `h${hCount}`;
        return `<${tag}>${line.slice(hCount, line.length)}</${tag}>`;
    }
    // Handle images
    else if (line[0] == "!" && line[1] == "[") {
        let seperator;
        for (let i = 0; i <= line.length; i++) {
            if (line[i] == "]" && line[i + 1] == "(" && line[line.length - 1] == ")") {
                seperator = i;
            }
        }
        let alt = line.slice(2, seperator);
        let src = line.slice(seperator + 2, line.length - 1);
        return `<img src="${src}" alt="${alt}" class="article-image">`;
    }
    // Handle regular text
    else {
        return `<p>${line}</p>`;
    }
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
