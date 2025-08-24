const blogSection = document.querySelector('.blogs-section');
const topdiv = document.querySelector('#first-container');
const navbar = document.querySelector('.navbar');

let topfaded = false;
let uniqueAuthors = new Set(); // Track unique authors

db.collection("blogs").get().then((blogs) => {
    // Create separate containers for titles and authors
    const titleSection = document.createElement('div');
    titleSection.className = 'blogs-section title-section';
    titleSection.style.cssText = `
        position: absolute;
        top: 20px;
        left: 20px;
        right: 20px;
        height: 45%;
        overflow: hidden;
    `;
    document.body.appendChild(titleSection);
    
    const authorSection = document.createElement('div');
    authorSection.className = 'blogs-section author-section';
    authorSection.style.cssText = `
        position: absolute;
        bottom: 20px;
        left: 20px;
        right: 20px;
        height: 28.25%;
        overflow: hidden;
    `;
    document.body.appendChild(authorSection);
    
    // Create title cards in the title section
    blogs.forEach(blog => {
        if(blog.id != decodeURI(location.pathname.split("/").pop())){
            createBlogCard(blog, titleSection);
        }
    });
    
    // Create author cards in the author section
    const uniqueAuthors = new Set();
    blogs.forEach(blog => {
        if(blog.id != decodeURI(location.pathname.split("/").pop())){
            const authorName = blog.data().author ? blog.data().author.split('@')[0] : 'Anonymous';
            if (!uniqueAuthors.has(authorName)) {
                uniqueAuthors.add(authorName);
                createAuthorCard(authorName, authorSection);
            }
        }
    });
    
    // Ensure Anonymous is always included
    if (!uniqueAuthors.has('Anonymous')) {
        createAuthorCard('Anonymous', authorSection);
    }
    
    console.log('Created author cards for:', Array.from(uniqueAuthors));
    
    // Position title cards in their section
    positionCardsInSection(titleSection);
    
    // Position author cards in their section
    positionCardsInSection(authorSection);
    
    // Add hover interactions after positioning
    setupHoverInteractions();
})

function createBlogCard(blog, section) {
    let data = blog.data();
    let authorName = data.author ? data.author.split('@')[0] : 'Anonymous';

    if(data.bannerImage != ''){
        section.innerHTML += `
            <div class="cardcontainer" data-author="${authorName}">
                <div class="blog-card" onclick="location.href='/${blog.id}'" style="cursor: pointer;"">
                    <!--<img src="${data.bannerImage}" class="blog-image" alt="">-->
                    <h1 class="blog-title" data-text="${data.title.substring(0,100)}">${data.title.substring(0, 100) + '...'}</h1>
                    <!--<p class="blog-author">@${authorName}</p>-->
                </div>
            </div>
        `;
    }
    else{
        section.innerHTML += `
            <div class="cardcontainer" data-author="${authorName}">
                <div class="blog-card" onclick="location.href='/${blog.id}'" style="cursor: pointer;">
                    <h1 class="blog-title" data-text="${data.title.substring(0,100)}">${data.title.substring(0, 100) + '...'}</h1>
                    <!--<p class="blog-author">@${authorName}</p>-->
                </div>
            </div>
        `;
    }
}

function createAuthorCard(authorName, section) {
    section.innerHTML += `
        <div class="cardcontainer">
            <div class="blog-card author-card" data-author="${authorName}" style="cursor: pointer;">
                <h1 class="blog-title" id="${authorName}" data-text="@${authorName}">@${authorName}</h1>
            </div>
        </div>
    `;
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

function positionCardsInSection(section) {
    const cards = section.querySelectorAll('.cardcontainer');
    const containerWidth = section.offsetWidth;
    const containerHeight = section.offsetHeight;
    const spacing = -2; // Negative spacing to allow slight overlap for tighter packing
    const maxTitleWidth = 400;
    const isTitleSection = section.classList.contains('title-section');

    // First, measure all cards and sort by height (tallest first for better packing)
    const cardData = Array.from(cards).map(card => {
        const title = card.querySelector('.blog-title');
        
        // Reset all spacing to eliminate gaps
        title.style.margin = '0';
        title.style.padding = '0';
        title.style.lineHeight = '1';
        
        // Force single line for all titles - no wrapping, keep full text
        title.style.width = 'auto';
        title.style.wordWrap = 'nowrap';
        title.style.overflowWrap = 'nowrap';
        title.style.whiteSpace = 'nowrap';
        title.style.lineHeight = '1';
        title.offsetHeight; // Force reflow
        const naturalWidth = title.getBoundingClientRect().width;
        
        // Keep the full title width - let the card container adjust
        title.style.width = `${naturalWidth}px`;
        
        // Force reflow to get final dimensions
        title.offsetHeight;
        const titleRect = title.getBoundingClientRect();
        
        // Calculate card dimensions with minimal padding
        const cardWidth = titleRect.width + 4; // Minimal padding
        const cardHeight = titleRect.height + 2; // Minimal padding
        
        return { card, width: cardWidth, height: cardHeight };
    });

    if (isTitleSection) {
        // For title section: sort by area (largest first) for better packing
        cardData.sort((a, b) => (b.width * b.height) - (a.width * a.height)); // Largest area first
        console.log('Title sorting by area:', cardData.map(card => ({
            text: card.card.querySelector('.blog-title').textContent,
            width: card.width,
            height: card.height,
            area: card.width * card.height
        })));
    } else {
        // For author section: sort by text length (longest first) for better packing
        cardData.sort((a, b) => {
            const aText = a.card.querySelector('.blog-title').textContent.length;
            const bText = b.card.querySelector('.blog-title').textContent.length;
            return bText - aText; // Longest first (will be placed at bottom)
        });
        console.log('Author sorting by length:', cardData.map(card => ({
            text: card.card.querySelector('.blog-title').textContent,
            length: card.card.querySelector('.blog-title').textContent.length
        })));
    }

    // Packing algorithm: place each card in the best available position
    const placedCards = [];
    const containerPadding = 10;

    cardData.forEach(({ card, width, height }, index) => {
        let bestX = containerPadding;
        let bestY = containerPadding;
        let minOverlap = Infinity;

        // Try placing the card at different positions with smaller steps for better precision
        for (let x = containerPadding; x <= containerWidth - width - containerPadding; x += 1) { // Even smaller step for precision
            for (let y = containerPadding; y <= containerHeight - height - containerPadding; y += 1) { // Even smaller step for precision
                // Check if this position overlaps with any placed card
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
                    // Calculate weighted distance from center based on section type
                    const centerX = containerWidth / 2;
                    const centerY = containerHeight / 2;
                    const baseDistance = Math.sqrt(
                        Math.pow(x + width/2 - centerX, 2) + 
                        Math.pow(y + height/2 - centerY, 2)
                    );
                    
                    let weightedDistance = baseDistance;
                    
                    if (isTitleSection) {
                        // For titles: horizontal center preference, vertical top preference
                        const normalizedY = y / containerHeight;
                        const centerX = containerWidth / 2;
                        const horizontalDistance = Math.abs(x + width/2 - centerX);
                        const horizontalPenalty = horizontalDistance * 0.5; // Tighter penalty for being away from center horizontally
                        const verticalPenalty = normalizedY * 1000; // Massive penalty for being away from top vertically
                        weightedDistance = horizontalPenalty + verticalPenalty;
                    } else {
                        // For authors: prefer bottom, avoid top (tallest at bottom)
                        const normalizedY = y / containerHeight;
                        weightedDistance = baseDistance * (1 + (1 - normalizedY) * 10); // Much stronger penalty as we go up
                    }
                    
                    if (weightedDistance < minOverlap) {
                        minOverlap = weightedDistance;
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

function setupHoverInteractions() {
    console.log('Setting up hover interactions...');
    
    // Get all blog cards and author cards
    const blogCards = document.querySelectorAll('.cardcontainer[data-author] .blog-card:not(.author-card)');
    const authorCards = document.querySelectorAll('.blog-card.author-card');
    
    console.log('Found blog cards:', blogCards.length);
    console.log('Found author cards:', authorCards.length);
    
    // Add hover listeners to blog cards
    blogCards.forEach(card => {
        const authorName = card.closest('.cardcontainer').getAttribute('data-author');
        console.log('Blog card author:', authorName);
        
        card.addEventListener('mouseenter', () => {
            console.log('Blog hover:', authorName);
            // Dim all authors that are NOT associated with this blog
            authorCards.forEach(authorCard => {
                const authorCardName = authorCard.getAttribute('data-author');
                if (authorCardName !== authorName) {
                    authorCard.classList.add('hover');
                }
            });
        });
        
        card.addEventListener('mouseleave', () => {
            console.log('Blog leave:', authorName);
            // Remove dimming from all authors
            authorCards.forEach(authorCard => {
                authorCard.classList.remove('hover');
            });
        });
    });
    
    // Add hover listeners to author cards
    authorCards.forEach(authorCard => {
        const authorName = authorCard.getAttribute('data-author');
        console.log('Setting up author card:', authorName);
        
        authorCard.addEventListener('mouseenter', () => {
            console.log('Author hover:', authorName);
            // Dim all blog cards that are NOT by this author
            blogCards.forEach(card => {
                const cardAuthorName = card.closest('.cardcontainer').getAttribute('data-author');
                if (cardAuthorName !== authorName) {
                    card.classList.add('hover');
                }
            });
        });
        
        authorCard.addEventListener('mouseleave', () => {
            console.log('Author leave:', authorName);
            // Remove dimming from all blog cards
            blogCards.forEach(card => {
                card.classList.remove('hover');
            });
        });
    });
}

topdiv.onclick = () => {
    topdiv.classList.toggle('fade');
    navbar.style.position = 'relative';
}

topdiv.addEventListener("transitionend", () => {
    topdiv.style.display = 'none';
});
