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
    
    const spacing = 5;
    const maxCardWidth = 150; // Maximum width for each card
    const baseCardHeight = 20; // Reduced base height for tighter fit
    
    // Calculate optimal grid dimensions for a more square shape
    const totalCards = cards.length;
    const aspectRatio = containerWidth / containerHeight;
    
    // Calculate rows and columns to make a more square grid
    const cardsPerRow = Math.ceil(Math.sqrt(totalCards * aspectRatio));
    const totalRows = Math.ceil(totalCards / cardsPerRow);
    
    // First pass: calculate all card dimensions and row heights
    const cardData = [];
    const rowHeights = new Array(totalRows).fill(0);
    
    cards.forEach((card, index) => {
        const title = card.querySelector('.blog-title');
        const titleStyle = window.getComputedStyle(title);
        
        // Set title to wrap text and constrain width
        title.style.width = `${maxCardWidth - 10}px`; // Reduced padding
        title.style.wordWrap = 'break-word';
        title.style.overflowWrap = 'break-word';
        title.style.whiteSpace = 'normal';
        title.style.lineHeight = '1.1'; // Tighter line height
        title.style.padding = '5px'; // Minimal padding
        
        // Force a reflow to get the new dimensions
        title.offsetHeight;
        
        const titleRect = title.getBoundingClientRect();
        
        // Calculate actual height needed based on wrapped text with minimal padding
        const actualTitleHeight = titleRect.height;
        const cardHeight = Math.max(actualTitleHeight + 10, baseCardHeight); // Reduced padding
        const cardWidth = Math.min(titleRect.width + 10, maxCardWidth); // Reduced padding
        
        const row = Math.floor(index / cardsPerRow);
        const col = index % cardsPerRow;
        
        // Track the maximum height needed in each row
        rowHeights[row] = Math.max(rowHeights[row], cardHeight);
        
        cardData.push({
            card,
            row,
            col,
            width: cardWidth,
            height: cardHeight
        });
    });
    
    // Calculate total grid height and starting position
    const totalGridHeight = rowHeights.reduce((sum, height) => sum + height + spacing, 0) - spacing;
    const gridWidth = cardsPerRow * (maxCardWidth + spacing) - spacing;
    const startX = (containerWidth - gridWidth) / 2;
    const startY = (containerHeight - totalGridHeight) / 2;
    
    // Second pass: position cards with proper row spacing
    let currentY = startY;
    
    cardData.forEach(({card, row, col, width, height}) => {
        const x = startX + col * (maxCardWidth + spacing);
        const y = currentY;
        
        card.style.position = 'absolute';
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
        card.style.width = `${width}px`;
        card.style.height = `${height}px`;
        
        // Move to next row if this is the last card in the current row
        if (col === cardsPerRow - 1 || cardData.indexOf({card, row, col, width, height}) === cardData.length - 1) {
            currentY += rowHeights[row] + spacing;
        }
    });
}

topdiv.onclick = () => {
    topdiv.classList.toggle('fade');
    navbar.style.position = 'relative';
}

topdiv.addEventListener("transitionend", () => {
    topdiv.style.display = 'none';
});
