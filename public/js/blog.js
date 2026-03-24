let blogId = decodeURI(location.pathname.split("/").pop());
const commentSection = document.querySelector('.comment-section');

let docRef = db.collection("blogs").doc(blogId);
let commentRef = db.collection("comments").doc(blogId+'_'+0);
let comments = db.collection("comments");

let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
let numberofcomments = 0;
let commenttracker = [];

// Scroll fade system variables
let currentScreen = 0;
let screens = [];
let isTransitioning = false;
let scrollAccumulator = 0;
const SCROLL_THRESHOLD = 50; // How much scroll to trigger transition

docRef.get().then((doc) => {
    if(doc.exists){
        setupBlog(doc.data());
    } else{
        location.replace("/");
    }
})

// Store comment loading state
let commentsReady = false;
let screensReady = false;

commentRef.get().then((comms) => {
    console.log(numberofcomments);
    commentsReady = true;
    if(comms.exists){
        if(screensReady) {
            setupCommentSection();
        }
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
    const blogTitle = document.querySelector('.title');
    const titleTag = document.querySelector('title');
    const publish = document.querySelector('.published');
    
    titleTag.innerHTML += blogTitle.innerHTML = data.title;
    publish.innerHTML += data.publishedAt;
    publish.innerHTML += ` -- ${data.author}`;

    numberofcomments = data.numberofcomments;

    // Create screen-based content system
    createContentScreens(data.article);
    
    // Initialize scroll fade system
    initializeScrollFade();
}

const createContentScreens = (articleData) => {
    const contentScreens = document.getElementById('content-screens');
    const commentScreen = document.getElementById('comment-screen');
    
    // Parse article content and create chunks
    const chunks = parseArticleIntoChunks(articleData);
    
    // Create screens for content chunks
    chunks.forEach((chunk, index) => {
        const screen = document.createElement('div');
        screen.className = 'content-screen';
        screen.id = `screen-${index}`;
        screen.innerHTML = chunk;
        contentScreens.appendChild(screen);
        screens.push(screen);
    });
    
    // Make sure comment screen is properly set up
    commentScreen.classList.add('content-screen');
    commentScreen.style.display = 'block'; // Remove the hidden style from HTML
    contentScreens.appendChild(commentScreen);
    screens.push(commentScreen);
    
    // Show first screen
    if (screens.length > 0) {
        screens[0].classList.add('active');
    }
    
    // Mark screens as ready and trigger comment loading if ready
    screensReady = true;
    if (commentsReady) {
        setupCommentSection();
    }
}

const parseArticleIntoChunks = (articleData) => {
    const lines = articleData.split("\n").filter(item => item.length);
    const chunks = [];
    let currentChunk = '';
    let lineCount = 0;
    const maxLinesPerScreen = 15; // Adjust based on viewport height
    
    lines.forEach(line => {
        currentChunk += formatLine(line);
        lineCount++;
        
        // Create new chunk when reaching max lines or encountering major break
        if (lineCount >= maxLinesPerScreen || line.startsWith('#') && lineCount > 5) {
            chunks.push(currentChunk);
            currentChunk = '';
            lineCount = 0;
        }
    });
    
    // Add remaining content as final chunk
    if (currentChunk.trim()) {
        chunks.push(currentChunk);
    }
    
    return chunks;
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

const initializeScrollFade = () => {
    let wheelTimeout;
    
    const handleWheel = (e) => {
        if (isTransitioning) return;
        
        const activeScreen = screens[currentScreen];
        if (!activeScreen) return;
        
        // Check if the active screen is scrollable and has content overflow
        const isScrollable = activeScreen.scrollHeight > activeScreen.clientHeight;
        const isAtTop = activeScreen.scrollTop <= 0;
        const isAtBottom = activeScreen.scrollTop >= activeScreen.scrollHeight - activeScreen.clientHeight;
        
        // Allow normal scrolling within the active screen if it's scrollable
        if (isScrollable && !isAtTop && !isAtBottom) {
            // Let the screen handle its own scrolling
            return;
        }
        
        // Only prevent default and handle screen transitions at boundaries
        if ((e.deltaY > 0 && isAtBottom) || (e.deltaY < 0 && isAtTop)) {
            e.preventDefault();
            
            scrollAccumulator += e.deltaY;
            
            clearTimeout(wheelTimeout);
            wheelTimeout = setTimeout(() => {
                if (Math.abs(scrollAccumulator) >= SCROLL_THRESHOLD) {
                    if (scrollAccumulator > 0 && isAtBottom) {
                        nextScreen();
                    } else if (scrollAccumulator < 0 && isAtTop) {
                        previousScreen();
                    }
                    scrollAccumulator = 0;
                }
            }, 50);
        }
    };
    
    document.addEventListener('wheel', handleWheel, { passive: false });
};

const nextScreen = () => {
    if (currentScreen < screens.length - 1 && !isTransitioning) {
        isTransitioning = true;
        screens[currentScreen].classList.remove('active');
        currentScreen++;
        screens[currentScreen].classList.add('active');
        
        setTimeout(() => {
            isTransitioning = false;
        }, 600);
    }
};

const previousScreen = () => {
    if (currentScreen > 0 && !isTransitioning) {
        isTransitioning = true;
        screens[currentScreen].classList.remove('active');
        currentScreen--;
        screens[currentScreen].classList.add('active');
        
        setTimeout(() => {
            isTransitioning = false;
        }, 600);
    }
};

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