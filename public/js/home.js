const blogSection = document.querySelector('.blogs-section');
const topdiv = document.querySelector('#first-container');
const navbar = document.querySelector('.navbar');

let topfaded = false;
let uniqueAuthors = new Set(); // Track unique authors

db.collection("blogs").get().then((blogs) => {
    blogs.forEach(blog => {
        if(blog.id != decodeURI(location.pathname.split("/").pop())){
            createBlog(blog);
        }
    });
    
    // Position cards in a tight grid after all blogs are created
    positionCardsInGrid();
    
    // Add hover interactions after positioning
    setupHoverInteractions();
})

const createBlog = (blog) => {
    let data = blog.data();
    let authorName = data.author ? data.author.split('@')[0] : 'Anonymous';

    if(data.bannerImage != ''){
        blogSection.innerHTML += `
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
        blogSection.innerHTML += `
            <div class="cardcontainer" data-author="${authorName}">
                <div class="blog-card" onclick="location.href='/${blog.id}'" style="cursor: pointer;">
                    <h1 class="blog-title" data-text="${data.title.substring(0,100)}">${data.title.substring(0, 100) + '...'}</h1>
                    <!--<p class="blog-author">@${authorName}</p>-->
                </div>
            </div>
        `;
    }
    
    // Only create author card if this author hasn't been seen before
    if (!uniqueAuthors.has(authorName)) {
        uniqueAuthors.add(authorName);
        blogSection.innerHTML += `
            <div class="cardcontainer">
                <div class="blog-card author-card" data-author="${authorName}" style="cursor: pointer;">
                    <h1 class="blog-title" id="${authorName}" data-text="@${authorName}">@${authorName}</h1>
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

    // Create filler cards first
    const fillerTexts = ["good people", "posting"];
    for (let i = 0; i < 300; i++) {
        const text = fillerTexts[i % fillerTexts.length];
        blogSection.innerHTML += `
            <div class="cardcontainer" data-author="filler@system">
                <div class="blog-card" style="cursor: pointer;">
                    <h1 class="blog-title" data-text="${text}">${text}</h1>
                </div>
            </div>
        `;
    }

    // Get all cards including the newly created filler cards
    const allCards = document.querySelectorAll('.cardcontainer');

    // Separate real cards from filler cards first
    const realCardElements = Array.from(allCards).filter(card => !card.querySelector('[data-author="filler@system"]'));
    const fillerCardElements = Array.from(allCards).filter(card => card.querySelector('[data-author="filler@system"]'));

    // Measure and process real cards first
    const realCardData = realCardElements.map(card => {
        const title = card.querySelector('.blog-title');
        
        // Reset all spacing to eliminate gaps
        title.style.margin = '0';
        title.style.padding = '0';
        title.style.lineHeight = '1.2'; // Consistent line height for multi-line entries
        
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
            title.style.lineHeight = '1.2'; // Consistent line height for multi-line entries
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

    // Sort real cards by height descending (tallest first for better packing)
    realCardData.sort((a, b) => b.height - a.height);

    // Measure filler cards separately (no sorting needed for filler cards)
    const fillerCardData = fillerCardElements.map(card => {
        const title = card.querySelector('.blog-title');
        
        // Reset all spacing to eliminate gaps
        title.style.margin = '0';
        title.style.padding = '0';
        title.style.lineHeight = '1.2'; // Consistent line height for multi-line entries
        
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
            title.style.lineHeight = '1.2'; // Consistent line height for multi-line entries
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

    // Packing algorithm: place each card in the best available position
    const placedCards = [];
    const containerPadding = 10; // Reduced container padding from 20 to 10

    // First, place all real cards
    const realCards = realCardData;
    const fillerCards = fillerCardData;

    // Place real cards first using center preference
    realCards.forEach(({ card, width, height }) => {
        let bestX = containerPadding;
        let bestY = containerPadding;
        let minOverlap = Infinity;

        // Try placing the card at different positions (allow placement beyond screen)
        const packingAreaWidth = containerWidth * 1.5; // 1.5x screen width
        const packingAreaHeight = containerHeight * 1.5; // 1.5x screen height
        const packingAreaStartX = -(packingAreaWidth - containerWidth) / 2;
        const packingAreaStartY = -(packingAreaHeight - containerHeight) / 2;
        
        for (let x = packingAreaStartX; x <= packingAreaStartX + packingAreaWidth - width; x += 5) {
            for (let y = packingAreaStartY; y <= packingAreaStartY + packingAreaHeight - height; y += 5) {
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

    // Calculate the center and radius of real cards
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;
    let maxDistanceFromCenter = 0;
    
    // Find the maximum distance of any real card from center
    placedCards.forEach(card => {
        const cardCenterX = card.x + card.width / 2;
        const cardCenterY = card.y + card.height / 2;
        const distance = Math.sqrt(
            Math.pow(cardCenterX - centerX, 2) + 
            Math.pow(cardCenterY - centerY, 2)
        );
        maxDistanceFromCenter = Math.max(maxDistanceFromCenter, distance);
    });

    // Add some padding around the real cards
    const realCardsRadius = maxDistanceFromCenter + 50;

    // Now place filler cards in a circular pattern around the real cards
    fillerCards.forEach(({ card, width, height }) => {
        let placed = false;
        let attempts = 0;
        const maxAttempts = 100;

        while (!placed && attempts < maxAttempts) {
            // Generate circular positions around the real cards
            const angle = (attempts * 0.5) % (2 * Math.PI); // Rotate around circle
            const radius = realCardsRadius + (attempts * 10); // Increase radius with attempts
            
            const x = centerX + radius * Math.cos(angle) - width / 2;
            const y = centerY + radius * Math.sin(angle) - height / 2;

            // Check if position is within the larger packing area bounds
            const packingAreaWidth = containerWidth * 1.5;
            const packingAreaHeight = containerHeight * 1.5;
            const packingAreaStartX = -(packingAreaWidth - containerWidth) / 2;
            const packingAreaStartY = -(packingAreaHeight - containerHeight) / 2;
            
            if (x >= packingAreaStartX && x + width <= packingAreaStartX + packingAreaWidth &&
                y >= packingAreaStartY && y + height <= packingAreaStartY + packingAreaHeight) {
                
                // Check overlap with placed cards
                let canPlace = true;
                for (const placedCard of placedCards) {
                    if (x < placedCard.x + placedCard.width + spacing && 
                        x + width + spacing > placedCard.x &&
                        y < placedCard.y + placedCard.height + spacing && 
                        y + height + spacing > placedCard.y) {
                        canPlace = false;
                        break;
                    }
                }
                
                if (canPlace) {
                    card.style.position = 'absolute';
                    card.style.left = `${x}px`;
                    card.style.top = `${y}px`;
                    card.style.width = `${width}px`;
                    card.style.height = `${height}px`;
                    
                    placedCards.push({ x, y, width, height });
                    placed = true;
                }
            }
            
            attempts++;
        }
        
        // If we couldn't place the card, remove it
        if (!placed) {
            card.remove();
        }
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
            // Find and highlight the corresponding author card by adding hover class
            const authorCard = document.querySelector(`.blog-card.author-card[data-author="${authorName}"]`);
            if (authorCard) {
                authorCard.classList.add('hover');
                console.log('Added hover to author card');
            } else {
                console.log('Author card not found for:', authorName);
            }
        });
        
        card.addEventListener('mouseleave', () => {
            console.log('Blog leave:', authorName);
            // Remove highlight from author card
            const authorCard = document.querySelector(`.blog-card.author-card[data-author="${authorName}"]`);
            if (authorCard) {
                authorCard.classList.remove('hover');
                console.log('Removed hover from author card');
            }
        });
    });
    
    // Add hover listeners to author cards
    authorCards.forEach(authorCard => {
        const authorName = authorCard.getAttribute('data-author');
        console.log('Setting up author card:', authorName);
        
        authorCard.addEventListener('mouseenter', () => {
            console.log('Author hover:', authorName);
            // Find and highlight all blog cards by this author by adding hover class
            const blogCardsByAuthor = document.querySelectorAll(`.cardcontainer[data-author="${authorName}"] .blog-card:not(.author-card)`);
            console.log('Found blog cards:', blogCardsByAuthor.length);
            blogCardsByAuthor.forEach(card => {
                card.classList.add('hover');
                console.log('Added hover class to:', card);
                console.log('Card classes after adding hover:', card.className);
            });
        });
        
        authorCard.addEventListener('mouseleave', () => {
            console.log('Author leave:', authorName);
            // Remove highlight from all blog cards by this author
            const blogCardsByAuthor = document.querySelectorAll(`.cardcontainer[data-author="${authorName}"] .blog-card:not(.author-card)`);
            blogCardsByAuthor.forEach(card => {
                card.classList.remove('hover');
                console.log('Removed hover class from:', card);
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
