const blogSection = document.querySelector('.blogs-section');
const topdiv = document.querySelector('#first-container');
const navbar = document.querySelector('.navbar');

let topfaded = false;
db.collection("blogs").get().then((blogs) => {
    blogs.forEach(blog => {
        if(blog.id != decodeURI(location.pathname.split("/").pop())){
            createBlog(blog);
        }
    });
    
    // Position cards in a tight grid after all blogs are created
    positionCardsInGrid();
})

const createBlog = (blog) => {
    let data = blog.data();
    let authorName = data.author ? data.author.split('@')[0] : 'Anonymous';

    if(data.bannerImage != ''){
        blogSection.innerHTML += `
            <div class="cardcontainer">
                <div class="blog-card" onclick="location.href='/${blog.id}'" style="cursor: pointer;"">
                    <!--<img src="${data.bannerImage}" class="blog-image" alt="">-->
                    <h1 class="blog-title" data-text="${data.title.substring(0,100)}">${data.title.substring(0, 100) + '...'}</h1>
                    <!--<p class="blog-author">@${authorName}</p>-->
                </div>
            </div>
    `;
    }
    else{
        blogSection.innerHTML += `
            <div class="cardcontainer">
                <div class="blog-card" onclick="location.href='/${blog.id}'" style="cursor: pointer;">
                    <h1 class="blog-title" data-text="${data.title.substring(0,100)}">${data.title.substring(0, 100) + '...'}</h1>
                    <!--<p class="blog-author">@${authorName}</p>-->
                </div>
            </div>
    `;
    }
}

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function randomizeTitles() {
    const blogCards = document.querySelectorAll('.blog-card');
    const cardInnerPadding = 10;

    blogCards.forEach(card => {
        const title = card.querySelector('.blog-title');
        const author = card.querySelector('.blog-author');

        if (title) {
            const cardClientWidth = card.clientWidth;
            const cardClientHeight = card.clientHeight;
            const titleInitialRect = title.getBoundingClientRect();
            const availableWidthForTitle = card.offsetWidth - titleInitialRect.width - (2 * cardInnerPadding);
            const availableHeightForTitle = card.offsetHeight - titleInitialRect.height - (2 * cardInnerPadding);
            const randomTitleLeft = cardInnerPadding + (Math.random() * Math.max(0, availableWidthForTitle));
            const randomTitleTop = cardInnerPadding + (Math.random() * Math.max(0, availableHeightForTitle));

            title.style.top = `${randomTitleTop}px`;
            title.style.left = `${randomTitleLeft}px`;

            if (author) {
                const authorInitialRect = author.getBoundingClientRect();
                const verticalOffsetBelowTitle = 0;
                const horizontalOffsetFromTitleMidpoint = 5;

                let authorTop = randomTitleTop + titleInitialRect.height + verticalOffsetBelowTitle;
                let authorLeft = randomTitleLeft + (titleInitialRect.width / 2) + horizontalOffsetFromTitleMidpoint;

                authorTop = Math.min(authorTop, card.offsetHeight - authorInitialRect.height - cardInnerPadding);
                authorTop = Math.max(cardInnerPadding, authorTop);
                authorLeft = Math.min(authorLeft, card.offsetWidth - authorInitialRect.width - cardInnerPadding);
                authorLeft = Math.max(cardInnerPadding, authorLeft);

                author.style.top = `${authorTop}px`;
                author.style.left = `${authorLeft}px`;
                author.style.color = getRandomColor(); // Set random color
            }
        }
    });
}

function positionCardsInGrid() {
    const cards = document.querySelectorAll('.cardcontainer');
    const container = document.querySelector('.blogs-section');
    const containerWidth = container.offsetWidth;
    const containerHeight = container.offsetHeight;
    const spacing = 0;
    const maxTitleWidth = 400; // Maximum width before text wrapping

    // First, measure all cards and sort by height (tallest first for better packing)
    const cardData = Array.from(cards).map(card => {
        const title = card.querySelector('.blog-title');
        
        // Reset all spacing to eliminate gaps
        title.style.margin = '0';
        title.style.padding = '0';
        title.style.lineHeight = '1';
        
        // First measure the title at its natural width (no width constraint)
        title.style.width = 'auto';
        title.style.wordWrap = 'normal';
        title.style.overflowWrap = 'normal';
        title.style.whiteSpace = 'nowrap';
        title.offsetHeight; // Force reflow
        const naturalWidth = title.getBoundingClientRect().width;
        
        // If natural width exceeds max, then apply wrapping
        if (naturalWidth > maxTitleWidth) {
            title.style.width = `${maxTitleWidth}px`;
            title.style.wordWrap = 'break-word';
            title.style.overflowWrap = 'break-word';
            title.style.whiteSpace = 'normal';
            title.style.lineHeight = '1';
        } else {
            // Keep natural width
            title.style.width = `${naturalWidth}px`;
        }
        
        // Force reflow to get final dimensions
        title.offsetHeight;
        const titleRect = title.getBoundingClientRect();
        
        // Calculate card dimensions with minimal padding
        const cardWidth = titleRect.width + 4; // Minimal padding
        const cardHeight = titleRect.height + 2; // Minimal padding
        
        return { card, width: cardWidth, height: cardHeight };
    });

    // Sort by height descending (tallest first for better packing)
    cardData.sort((a, b) => b.height - a.height);

    // Packing algorithm: place each card in the best available position
    const placedCards = [];
    const containerPadding = 10; // Reduced container padding from 20 to 10

    cardData.forEach(({ card, width, height }) => {
        let bestX = containerPadding;
        let bestY = containerPadding;
        let minOverlap = Infinity;

        // Try placing the card at different positions
        for (let x = containerPadding; x <= containerWidth - width - containerPadding; x += 5) { // Reduced step from 10 to 5
            for (let y = containerPadding; y <= containerHeight - height - containerPadding; y += 5) { // Reduced step from 10 to 5
                // Check if this position overlaps with any placed card
                let overlap = 0;
                let canPlace = true;
                
                for (const placed of placedCards) {
                    if (x < placed.x + placed.width + spacing && 
                        x + width + spacing > placed.x &&
                        y < placed.y + placed.height + spacing && 
                        y + height + spacing > placed.y) {
                        canPlace = false;
                        break;
                    }
                }
                
                if (canPlace) {
                    // Calculate distance from center (prefer center placement)
                    const centerX = containerWidth / 2;
                    const centerY = containerHeight / 2;
                    const distanceFromCenter = Math.sqrt(
                        Math.pow(x + width/2 - centerX, 2) + 
                        Math.pow(y + height/2 - centerY, 2)
                    );
                    
                    if (distanceFromCenter < minOverlap) {
                        minOverlap = distanceFromCenter;
                        bestX = x;
                        bestY = y;
                    }
                }
            }
        }

        // Place the card at the best position found
        card.style.position = 'absolute';
        card.style.left = `${bestX}px`;
        card.style.top = `${bestY}px`;
        card.style.width = `${width}px`;
        card.style.height = `${height}px`;
        
        // Record the placed card
        placedCards.push({ x: bestX, y: bestY, width, height });
    });
}

topdiv.onclick = () => {
    topdiv.classList.toggle('fade');
    navbar.style.position = 'relative';
}

topdiv.addEventListener("transitionend", () => {
    topdiv.style.display = 'none';
});
