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
let articleBlocksCache = { blocks: [], footnoteDefs: new Map() };
let spreadResizeBound = false;
let spreadReflowTimer = null;
let currentBlogMeta = null;
let footnoteNavAttached = false;

function setupFootnoteRefNavigation() {
    if (footnoteNavAttached) return;
    footnoteNavAttached = true;
    document.body.addEventListener('click', (e) => {
        const ref = e.target.closest('.footnote-ref');
        if (!ref || !document.getElementById('article-body')?.contains(ref)) return;
        const id = ref.getAttribute('data-footnote-id');
        if (!id) return;
        e.preventDefault();
        let note = document.getElementById(`fn-${id}`);
        if (!note && typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            note = document.querySelector(`p[data-variant="footnote"][data-footnote-id="${CSS.escape(id)}"]`);
        }
        if (note) note.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

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
    setupFootnoteRefNavigation();
    const titleTag = document.querySelector('title');
    const title = data.title || '';
    const publishedAt = data.publishedAt || '';
    const author = data.author || 'Anonymous';

    titleTag.textContent = title ? `Blog : ${title}` : 'Blog';
    currentBlogMeta = { title, publishedAt, author };

    numberofcomments = data.numberofcomments;

    renderArticleBody(data.article);
}


function mastheadAuthorColor(name) {
    const s = String(name);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const hue = (h >>> 0) % 360;
    return `hsl(${hue}, 66%, 42%)`;
}

const MONTH_NAMES_LONG = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function englishOrdinalDay(n) {
    const j = n % 10;
    const k = n % 100;
    if (k >= 11 && k <= 13) return `${n}th`;
    if (j === 1) return `${n}st`;
    if (j === 2) return `${n}nd`;
    if (j === 3) return `${n}rd`;
    return `${n}th`;
}

function parsePublishedToDate(raw) {
    const s = String(raw).trim();
    if (!s) return null;
    const m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
        const d = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
        if (!Number.isNaN(d.getTime())) return d;
    }
    const d2 = new Date(s);
    return Number.isNaN(d2.getTime()) ? null : d2;
}

function formatPublishedReadable(raw) {
    const d = parsePublishedToDate(raw);
    if (!d) return String(raw).trim();
    const day = englishOrdinalDay(d.getDate());
    const month = MONTH_NAMES_LONG[d.getMonth()];
    const year = d.getFullYear();
    return `${day} of ${month} ${year}`;
}

function createInlineMasthead(meta) {
    const wrap = document.createElement('section');
    wrap.className = 'article-inline-masthead';

    const titleEl = document.createElement('h1');
    titleEl.className = 'title';
    titleEl.textContent = meta?.title || '';

    const author = (meta?.author || 'Anonymous').trim() || 'Anonymous';
    const publishedRaw = (meta?.publishedAt || '').trim();

    const byline = document.createElement('div');
    byline.className = 'article-byline';

    const byWord = document.createElement('span');
    byWord.className = 'article-byline-by';
    byWord.textContent = 'by';

    const authorEl = document.createElement('span');
    authorEl.className = 'article-byline-author';
    authorEl.textContent = `@${author}`;
    authorEl.style.color = mastheadAuthorColor(author);

    byline.appendChild(byWord);
    byline.appendChild(authorEl);

    if (publishedRaw) {
        const onThe = document.createElement('span');
        onThe.className = 'article-byline-onthe';
        onThe.textContent = 'on the';

        const timeEl = document.createElement('time');
        timeEl.className = 'article-byline-date';
        const d = parsePublishedToDate(publishedRaw);
        if (d) {
            timeEl.dateTime = d.toISOString().slice(0, 10);
        }
        timeEl.textContent = formatPublishedReadable(publishedRaw);

        byline.appendChild(onThe);
        byline.appendChild(timeEl);
    }

    wrap.appendChild(titleEl);
    wrap.appendChild(byline);
    return wrap;
}

function getSpreadTargetHeight() {
    const viewportH = window.visualViewport
        ? Math.floor(window.visualViewport.height)
        : window.innerHeight;
    const inset = Math.max(30, Math.min(52, Math.round(viewportH * 0.048)));
    return Math.max(viewportH - inset, 440);
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
    wrapper.innerHTML = line.trim();
    return wrapper.firstElementChild || document.createElement('p');
}

function extractFootnoteDefinitionsFromHtml(html) {
    const defMap = new Map();
    const container = document.createElement('div');
    container.innerHTML = String(html || '').trim();
    container.querySelectorAll('p[data-variant="footnote"]').forEach((p) => {
        let id = p.getAttribute('data-footnote-id');
        if (!id) {
            const hid = p.getAttribute('id');
            if (hid && hid.startsWith('fn-')) id = hid.slice(3);
        }
        if (id) {
            defMap.set(id, p.outerHTML);
            p.remove();
        }
    });
    return { cleanedHtml: container.innerHTML, defMap };
}

function parseArticleBlocks(articleData) {
    const raw = (articleData || '').trim();
    const footnoteDefs = new Map();
    if (!raw) return { blocks: [], footnoteDefs };

    let source = raw;
    if (raw.includes('<') && raw.includes('>')) {
        const { cleanedHtml, defMap } = extractFootnoteDefinitionsFromHtml(raw);
        defMap.forEach((v, k) => footnoteDefs.set(k, v));
        source = cleanedHtml;
    }

    if (source.includes('<') && source.includes('>')) {
        const container = document.createElement('div');
        container.innerHTML = source;
        const blocks = [];
        container.childNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                blocks.push(node.outerHTML);
            } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                blocks.push(`<p>${node.textContent.trim()}</p>`);
            }
        });
        if (blocks.length) return { blocks, footnoteDefs };
    }

    return {
        blocks: source.split("\n").filter(item => item.length).map(formatLine),
        footnoteDefs
    };
}

function ensureArticlePageBody(pageEl) {
    let b = pageEl.querySelector('.article-page-body');
    if (b) return b;
    b = document.createElement('div');
    b.className = 'article-page-body';
    const mh = pageEl.querySelector('.article-inline-masthead');
    if (mh) mh.after(b);
    else pageEl.prepend(b);
    return b;
}

function collectFootnoteRefIdsFromNode(el) {
    if (!el || !el.querySelectorAll) return [];
    const ids = [];
    el.querySelectorAll('.footnote-ref[data-footnote-id]').forEach((ref) => {
        const id = ref.getAttribute('data-footnote-id');
        if (id && !ids.includes(id)) ids.push(id);
    });
    return ids;
}

function collectFootnoteRefIdsUnion(bodyEl, extraEl) {
    const out = [];
    const add = (el) => {
        collectFootnoteRefIdsFromNode(el).forEach((id) => {
            if (id && !out.includes(id)) out.push(id);
        });
    };
    if (bodyEl) add(bodyEl);
    if (extraEl) add(extraEl);
    return out;
}

/**
 * Footnote strip uses much smaller type (~10–12px); using the body chars/line value
 * massively over-counts lines and steals body space (worse with several notes).
 */
function estimateFootnoteStripCharsPerLine() {
    const root = document.getElementById('article-body');
    const vw = window.innerWidth || 800;
    const w = root && root.clientWidth > 80 ? root.clientWidth : Math.min(1340, vw - 40);
    const gap = Math.min(100, Math.max(40, Math.round(w * 0.055)));
    const colPx = Math.max(220, (w - gap) * 0.5 - 20);
    const approxCharPxFoot = 3.92;
    return Math.max(48, Math.floor(colPx / approxCharPxFoot));
}

/**
 * Vertical space to reserve for the footnote strip on this page: depends on how many distinct
 * refs appear on the page and the stored definition HTML length (per note, then summed).
 */
function footnoteReserveForBody(bodyEl, defMap, spreadHeight, extraEl) {
    const ids = collectFootnoteRefIdsUnion(bodyEl, extraEl);
    if (!ids.length || !defMap || defMap.size === 0) return 0;
    const ruleGap = 30;
    const charsPerLine = estimateFootnoteStripCharsPerLine();
    const lineH = 13;
    const perNotePad = 3;
    let totalLines = 0;
    ids.forEach((id) => {
        const html = defMap.get(id);
        if (!html) return;
        const d = document.createElement('div');
        d.innerHTML = html;
        const len = (d.textContent || '').length;
        totalLines += Math.max(1, Math.ceil(len / charsPerLine));
    });
    const textBlock = totalLines * lineH + ids.length * perNotePad;
    const raw = ruleGap + textBlock;
    const floor = Math.max(38, Math.round(20 + ids.length * 8));
    const minBody = 200;
    const maxReserve = Math.max(floor, spreadHeight - minBody);
    const padded = Math.ceil(raw * 1.02);
    const capByViewport = Math.floor(spreadHeight * 0.23);
    return Math.min(maxReserve, capByViewport, Math.max(floor, padded));
}

function footnoteHeightBudget(spreadHeight, bodyEl, defMap, extraEl) {
    const r = footnoteReserveForBody(bodyEl, defMap, spreadHeight, extraEl);
    if (r <= 0) return spreadHeight;
    return Math.max(180, spreadHeight - r);
}

function elementOuterHeightWithMargins(el) {
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const h = rect && Number.isFinite(rect.height) ? rect.height : el.offsetHeight || 0;
    const styles = window.getComputedStyle ? window.getComputedStyle(el) : null;
    const mt = styles ? parseFloat(styles.marginTop) || 0 : 0;
    const mb = styles ? parseFloat(styles.marginBottom) || 0 : 0;
    return h + mt + mb;
}

function pageVerticalInsets(pageEl) {
    if (!pageEl || !window.getComputedStyle) return 0;
    const styles = window.getComputedStyle(pageEl);
    const pt = parseFloat(styles.paddingTop) || 0;
    const pb = parseFloat(styles.paddingBottom) || 0;
    const bt = parseFloat(styles.borderTopWidth) || 0;
    const bb = parseFloat(styles.borderBottomWidth) || 0;
    return pt + pb + bt + bb;
}

function pageBodyHeightBudget(pageEl, bodyEl, spreadHeight, defMap, extraEl) {
    const footReserve = footnoteReserveForBody(bodyEl, defMap, spreadHeight, extraEl);
    const masthead = pageEl ? pageEl.querySelector('.article-inline-masthead') : null;
    const mastheadReserve = masthead ? elementOuterHeightWithMargins(masthead) : 0;
    const pageInsets = pageVerticalInsets(pageEl);
    const maxBody = Math.floor(spreadHeight - pageInsets - footReserve - mastheadReserve);
    return Math.max(150, maxBody);
}

function footnoteSuperscriptNumberForId(bodyRoot, id) {
    if (!id || !bodyRoot) return null;
    let esc = id;
    try {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') esc = CSS.escape(id);
    } catch (_) {
        esc = id.replace(/\\/g, '').replace(/"/g, '');
    }
    const ref = bodyRoot.querySelector(`.footnote-ref[data-footnote-id="${esc}"]`);
    if (!ref) return null;
    const sup = ref.querySelector('sup.footnote-ref-mark');
    const raw = (sup && sup.textContent) || ref.textContent || '';
    const n = parseInt(String(raw).trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function finalizePageFootnotes(pageEl, defMap, assignedAnchors) {
    pageEl.querySelector('.article-page-footnotes')?.remove();
    const body = pageEl.querySelector('.article-page-body');
    if (!body) return;
    const orderedIds = collectFootnoteRefIdsFromNode(body);
    if (!orderedIds.length || !defMap || defMap.size === 0) return;
    const foot = document.createElement('div');
    foot.className = 'article-page-footnotes';
    orderedIds.forEach((id, index) => {
        const html = defMap.get(id);
        if (!html) return;
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const src = temp.firstElementChild;
        if (!src) return;
        const clone = src.cloneNode(true);
        const n = footnoteSuperscriptNumberForId(body, id) ?? index + 1;
        clone.setAttribute('data-footnote-n', String(n));
        if (!assignedAnchors.has(id)) {
            clone.id = `fn-${id}`;
            assignedAnchors.add(id);
        } else {
            clone.removeAttribute('id');
        }
        foot.appendChild(clone);
    });
    if (!foot.childElementCount) return;
    body.appendChild(foot);
}

function splitParagraphToFit(pageBodyEl, paragraphEl, maxBodyScrollHeight) {
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
        pageBodyEl.appendChild(probe);
        const fits = pageBodyEl.scrollHeight <= maxBodyScrollHeight;
        pageBodyEl.removeChild(probe);

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

function applyPageNumbers(articleBodyEl) {
    if (!articleBodyEl) return;
    const pages = articleBodyEl.querySelectorAll('.article-page-left');
    pages.forEach((pageEl, index) => {
        pageEl.querySelector('.article-page-number')?.remove();
        const number = document.createElement('div');
        number.className = 'article-page-number';
        number.textContent = String(index + 1);
        pageEl.appendChild(number);
    });
}

function renderArticleSpread(blocks, footnoteDefMap) {
    const articleBody = document.getElementById('article-body');
    if (!articleBody) return;

    const defMap = footnoteDefMap instanceof Map ? footnoteDefMap : new Map();

    articleBody.innerHTML = '';

    const spreadHeight = getSpreadTargetHeight();

    let currentSpread = createSpread();
    articleBody.appendChild(currentSpread.spread);

    let currentPage = currentSpread.leftPage;
    currentPage.classList.add('article-page-first');
    currentPage.appendChild(createInlineMasthead(currentBlogMeta));
    let currentPageBody = ensureArticlePageBody(currentPage);

    const assignedFootnoteAnchors = new Set();

    const moveToNextPage = () => {
        finalizePageFootnotes(currentPage, defMap, assignedFootnoteAnchors);
        currentSpread = createSpread();
        articleBody.appendChild(currentSpread.spread);
        currentPage = currentSpread.leftPage;
        currentPageBody = ensureArticlePageBody(currentSpread.leftPage);
    };

    blocks.forEach((blockHtml) => {
        const node = createArticleNode(blockHtml);
        currentPageBody.appendChild(node);

        const heightBudget = pageBodyHeightBudget(currentPage, currentPageBody, spreadHeight, defMap);
        if (currentPageBody.scrollHeight > heightBudget && currentPageBody.childElementCount > 1) {
            currentPageBody.removeChild(node);
            const splitBudget = pageBodyHeightBudget(currentPage, currentPageBody, spreadHeight, defMap, node);
            const split = splitParagraphToFit(currentPageBody, node, splitBudget);
            if (split) {
                currentPageBody.appendChild(split.leftPart);
                moveToNextPage();
                currentPageBody.appendChild(split.rightPart);
            } else {
                moveToNextPage();
                currentPageBody.appendChild(node);
            }
        }
    });

    finalizePageFootnotes(currentPage, defMap, assignedFootnoteAnchors);

    const commentBlock = document.getElementById('comment-screen');
    if (commentBlock) {
        currentPage.appendChild(commentBlock);
    }

    applyPageNumbers(articleBody);

    articleBody.dataset.lastPage = 'left';
}

const renderArticleBody = (articleData) => {
    articleBlocksCache = parseArticleBlocks(articleData);
    renderArticleSpread(articleBlocksCache.blocks, articleBlocksCache.footnoteDefs);

    if (!spreadResizeBound) {
        spreadResizeBound = true;
        window.addEventListener('resize', () => {
            clearTimeout(spreadReflowTimer);
            spreadReflowTimer = setTimeout(() => {
                if (articleBlocksCache.blocks.length) {
                    renderArticleSpread(articleBlocksCache.blocks, articleBlocksCache.footnoteDefs);
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
