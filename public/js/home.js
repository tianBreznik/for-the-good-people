const blogSection = document.querySelector('.blogs-section');
const topdiv = document.querySelector('#first-container');

// If we just returned from login, skip showing the entry overlay transition entirely
try {
    if (sessionStorage.getItem('justLoggedIn') === '1' && topdiv) {
        topdiv.style.transition = 'none';
        topdiv.classList.add('fade');
        // clear the flag so subsequent visits behave normally
        sessionStorage.removeItem('justLoggedIn');
        // allow transitions again for future interactions
        requestAnimationFrame(() => { if (topdiv) topdiv.style.transition = ''; });
    }
} catch (e) {}
const navbar = document.querySelector('.navbar');

let topfaded = false;
let uniqueAuthors = new Set(); // Track unique authors

// Physics system variables
let physicsObjects = []; // Array of all physics objects (cards + popup)
let popup = null; // The growing popup object
let physicsActive = false; // Whether physics simulation is running
let animationFrameId = null; // For the physics animation loop
let hoverTimer = null; // Timer for 2-second hover delay

// Physics object class for cards and popup
class PhysicsObject {
    constructor(element, x, y, width, height, mass = 1) {
        this.element = element; // DOM element
        this.x = x; // Current x position
        this.y = y; // Current y position
        this.width = width;
        this.height = height;
        this.mass = mass;
        this.vx = 0; // Velocity x
        this.vy = 0; // Velocity y
        this.restX = x; // Rest position x
        this.restY = y; // Rest position y
        this.isPopup = false; // Whether this is the popup
        this.isAttractedToRest = false; // Whether to attract to rest position
    }

    // Get current bounds
    getBounds() {
        // Use actual DOM element position for accurate collision detection
        const rect = this.element.getBoundingClientRect();
        return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom
        };
    }

    // Check collision with another object
    collidesWith(other) {
        const bounds1 = this.getBounds();
        const bounds2 = other.getBounds();
        
        // Add collision tolerance to prevent false positives from tiny overlaps
        const tolerance = 2; // 2px tolerance for collisions
        
        return !(bounds1.right + tolerance < bounds2.left || 
                bounds1.left > bounds2.right + tolerance || 
                bounds1.bottom + tolerance < bounds2.top || 
                bounds1.top > bounds2.bottom + tolerance);
    }

    // Update position based on velocity
    update(deltaTime) {
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        
        // Update DOM element position
        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
    }
}

// Physics simulation functions
function startPhysics() {
    if (physicsActive) return;
    physicsActive = true;
    physicsLoop();
}

function stopPhysics() {
    physicsActive = false;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function physicsLoop() {
    if (!physicsActive) return;
    
    const deltaTime = 1/60; // 60 FPS for smoother physics
    updatePhysics(deltaTime);
    
    animationFrameId = requestAnimationFrame(physicsLoop);
}

function updatePhysics(deltaTime) {
    // Handle growing popup
    if (popup && popup.growing) {
        // Grow the popup
        const growthAmount = popup.growthSpeed;
        popup.width += growthAmount;
        popup.height += growthAmount;
        
        // Cap the size to prevent growing too large
        if (popup.width > popup.finalWidth) {
            popup.width = popup.finalWidth;
        }
        if (popup.height > popup.finalHeight) {
            popup.height = popup.finalHeight;
        }
        
        // Keep centered by adjusting position
        const newX = window.innerWidth / 2 - popup.width / 2;
        const newY = window.innerHeight / 2 - popup.height / 2;
        popup.x = newX;
        popup.y = newY;
        
        // Update DOM element
        popup.element.style.width = `${popup.width}px`;
        popup.element.style.height = `${popup.height}px`;
        popup.element.style.left = `${popup.x}px`;
        popup.element.style.top = `${popup.y}px`;
        
        // Stop growing when reaching final size
        if (popup.width >= popup.finalWidth) {
            popup.growing = false;
            // When fully grown, stop pushing titles further
            popup.pushing = false;
            // Freeze residual motion immediately so titles stop
            physicsObjects.forEach(obj => {
                if (!obj.isPopup) {
                    obj.vx = 0;
                    obj.vy = 0;
                }
            });
            // Ensure popup stays fixed
            popup.vx = 0; popup.vy = 0;
            console.log('Popup finished growing at:', popup.width, 'x', popup.height);
        }
    }
    
    // Handle shrinking popup (triggered on hover-out)
    if (popup && popup.shrinking) {
        const shrinkAmount = popup.shrinkSpeed || 12;
        popup.width = Math.max(10, popup.width - shrinkAmount);
        popup.height = Math.max(10, popup.height - shrinkAmount);
        
        const newX = window.innerWidth / 2 - popup.width / 2;
        const newY = window.innerHeight / 2 - popup.height / 2;
        popup.x = newX;
        popup.y = newY;
        
        popup.element.style.width = `${popup.width}px`;
        popup.element.style.height = `${popup.height}px`;
        popup.element.style.left = `${popup.x}px`;
        popup.element.style.top = `${popup.y}px`;
        
        // When small enough, remove popup and let cards continue returning to rest
        if (popup.width <= 12 || popup.height <= 12) {
            // Remove popup element
            if (popup.element.parentNode) {
                popup.element.parentNode.removeChild(popup.element);
            }
            // Remove from physics array
            const idx = physicsObjects.indexOf(popup);
            if (idx > -1) physicsObjects.splice(idx, 1);
            popup = null;
            // Keep physics running until all cards reach their rest positions
        }
    }
    
    // Card-card collisions while moving (domino effect) ONLY while popup is pushing.
    // During return-to-rest, we disable card-card collisions so titles don't block each other.
    if (popup && popup.pushing) {
        for (let i = 0; i < physicsObjects.length; i++) {
            const obj = physicsObjects[i];
            if (!obj.isPopup && (Math.abs(obj.vx) > 0.1 || Math.abs(obj.vy) > 0.1)) {
                for (let j = 0; j < physicsObjects.length; j++) {
                    if (j === i) continue;
                    const otherObj = physicsObjects[j];
                    if (!otherObj.isPopup && obj.collidesWith(otherObj)) {
                        resolveCollision(obj, otherObj);
                    }
                }
            }
        }
    }

    // Repulsion system: popup creates a force field that pushes cards away from its edges
    if (popup && (popup.pushing || popup.growing)) {
        const popupBounds = popup.getBounds();
        
        let repulsionApplied = 0;
        physicsObjects.forEach(obj => {
            if (obj.isPopup) return;
            
            const objBounds = obj.getBounds();
            const objCenterX = objBounds.left + objBounds.width / 2;
            const objCenterY = objBounds.top + objBounds.height / 2;
            
            // Check if card is overlapping with popup or very close to it
            const overlapX = Math.min(objBounds.right, popupBounds.right) - Math.max(objBounds.left, popupBounds.left);
            const overlapY = Math.min(objBounds.bottom, popupBounds.bottom) - Math.max(objBounds.top, popupBounds.top);
            
            // If there's overlap or the card is very close, apply repulsion
            const minDistance = 20; // Minimum distance before repulsion kicks in
            const isOverlapping = overlapX > 0 && overlapY > 0;
            const isClose = (overlapX > -minDistance && overlapX < minDistance) || 
                          (overlapY > -minDistance && overlapY < minDistance);
            
            if (isOverlapping || isClose) {
                // Calculate repulsion direction based on which edge is closest
                const distances = {
                    left: Math.abs(objBounds.right - popupBounds.left),
                    right: Math.abs(objBounds.left - popupBounds.right),
                    top: Math.abs(objBounds.bottom - popupBounds.top),
                    bottom: Math.abs(objBounds.top - popupBounds.bottom)
                };
                
                const closestEdge = Object.keys(distances).reduce((a, b) => distances[a] < distances[b] ? a : b);
                
                let forceX = 0, forceY = 0;
                const repulsionStrength = 15.0; // Much stronger than card-to-card forces
                
                switch (closestEdge) {
                    case 'left':
                        forceX = -repulsionStrength; // Push left
                        break;
                    case 'right':
                        forceX = repulsionStrength; // Push right
                        break;
                    case 'top':
                        forceY = -repulsionStrength; // Push up
                        break;
                    case 'bottom':
                        forceY = repulsionStrength; // Push down
                        break;
                }
                
                // Apply the repulsion force
                obj.vx += forceX;
                obj.vy += forceY;
                repulsionApplied++;
            }
        });
        
        // Debug logging
        if (repulsionApplied > 0) {
            console.log(`Repulsion applied to ${repulsionApplied} cards from popup edges`);
        }
    }

    // Apply attraction to rest positions even if popup is gone
    physicsObjects.forEach(obj => {
        if (obj.isAttractedToRest && !obj.isPopup) {
            const dx = obj.restX - obj.x;
            const dy = obj.restY - obj.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) { // revert to earlier threshold
                const attractionForce = 0.1; // revert to earlier force
                obj.vx += (dx / distance) * attractionForce;
                obj.vy += (dy / distance) * attractionForce;
            } else {
                obj.x = obj.restX;
                obj.y = obj.restY;
                obj.vx = 0;
                obj.vy = 0;
            }
        }
    });

    // Update all objects every frame
    physicsObjects.forEach(obj => {
        // Add gentle damping to smooth out movement
        if (!obj.isPopup) {
            obj.vx *= 0.98; // Very light damping to allow movement
            obj.vy *= 0.98;
            
            // Cap speed to prevent cards from flying away
            const maxSpeed = 200; // Increased max speed
            const speed = Math.sqrt(obj.vx * obj.vx + obj.vy * obj.vy);
            if (speed > maxSpeed) {
                obj.vx = (obj.vx / speed) * maxSpeed;
                obj.vy = (obj.vy / speed) * maxSpeed;
            }
        }
        obj.update(deltaTime);
    });

    // If cards are returning to rest, stop physics only when all are settled
    const anyReturning = physicsObjects.some(o => !o.isPopup && o.isAttractedToRest);
    if (anyReturning) {
        const allSettled = physicsObjects.every(o => {
            if (o.isPopup) return true;
            const dx = Math.abs(o.restX - o.x);
            const dy = Math.abs(o.restY - o.y);
            const exactlyAtRest = dx === 0 && dy === 0;
            const stopped = Math.abs(o.vx) === 0 && Math.abs(o.vy) === 0;
            return exactlyAtRest && stopped;
        });
        if (allSettled) {
            physicsObjects.forEach(o => { if (!o.isPopup) o.isAttractedToRest = false; });
            stopPhysics();
        }
    }
}

function resolveCollision(obj1, obj2) {
    // Simple collision resolution - push objects apart
    const bounds1 = obj1.getBounds();
    const bounds2 = obj2.getBounds();
    
    // Calculate overlap
    const overlapX = Math.min(
        Math.max(0, bounds1.right - bounds2.left),
        Math.max(0, bounds2.right - bounds1.left)
    );
    const overlapY = Math.min(
        Math.max(0, bounds1.bottom - bounds2.top),
        Math.max(0, bounds2.bottom - bounds1.top)
    );
    
    // If either object is the popup, make the popup act as an immovable body
    const obj1IsPopup = !!obj1.isPopup;
    const obj2IsPopup = !!obj2.isPopup;

    // Softer impulse and popup attenuation
    const IMPULSE = 0.06; // was 0.12
    const popupAttenuation = (obj1IsPopup || obj2IsPopup) ? 0.6 : 1.0;
    const maxAxisSpeed = 180; // clamp per-axis speed

    // Push in the direction of least overlap
    if (overlapX < overlapY) {
        // Push horizontally
        if (bounds1.left < bounds2.left) {
            if (!obj1IsPopup) obj1.x -= overlapX * 0.5;
            if (!obj2IsPopup) obj2.x += overlapX * 0.5;
            if (!obj1IsPopup) obj1.vx -= Math.max(0.5, overlapX) * IMPULSE * popupAttenuation;
            if (!obj2IsPopup) obj2.vx += Math.max(0.5, overlapX) * IMPULSE * popupAttenuation;
        } else {
            if (!obj1IsPopup) obj1.x += overlapX * 0.5;
            if (!obj2IsPopup) obj2.x -= overlapX * 0.5;
            if (!obj1IsPopup) obj1.vx += Math.max(0.5, overlapX) * IMPULSE * popupAttenuation;
            if (!obj2IsPopup) obj2.vx -= Math.max(0.5, overlapX) * IMPULSE * popupAttenuation;
        }
    } else {
        // Push vertically
        if (bounds1.top < bounds2.top) {
            if (!obj1IsPopup) obj1.y -= overlapY * 0.5;
            if (!obj2IsPopup) obj2.y += overlapY * 0.5;
            if (!obj1IsPopup) obj1.vy -= Math.max(0.5, overlapY) * IMPULSE * popupAttenuation;
            if (!obj2IsPopup) obj2.vy += Math.max(0.5, overlapY) * IMPULSE * popupAttenuation;
        } else {
            if (!obj1IsPopup) obj1.y += overlapY * 0.5;
            if (!obj2IsPopup) obj2.y -= overlapY * 0.5;
            if (!obj1IsPopup) obj1.vy += Math.max(0.5, overlapY) * IMPULSE * popupAttenuation;
            if (!obj2IsPopup) obj2.vy -= Math.max(0.5, overlapY) * IMPULSE * popupAttenuation;
        }
    }
    
    // Clamp per-axis speeds to avoid blowouts
    [obj1, obj2].forEach(o => {
        if (!o.isPopup) {
            if (o.vx > maxAxisSpeed) o.vx = maxAxisSpeed;
            if (o.vx < -maxAxisSpeed) o.vx = -maxAxisSpeed;
            if (o.vy > maxAxisSpeed) o.vy = maxAxisSpeed;
            if (o.vy < -maxAxisSpeed) o.vy = -maxAxisSpeed;
        }
    });
    
    // Immediately update DOM positions to prevent overlapping
    if (!obj1IsPopup) {
        obj1.element.style.left = `${obj1.x}px`;
        obj1.element.style.top = `${obj1.y}px`;
    }
    if (!obj2IsPopup) {
        obj2.element.style.left = `${obj2.x}px`;
        obj2.element.style.top = `${obj2.y}px`;
    }
}

function createPopup(blogData) {
    console.log('createPopup called with:', blogData);
    // Create popup element
    const popupElement = document.createElement('div');
    popupElement.className = 'blog-popup';
    popupElement.innerHTML = `
        <div class="popup-content">
            <h2 class="popup-title">${blogData.title}</h2>
            <p class="popup-preview">${blogData.preview || 'Preview text not available'}</p>
        </div>
    `;
    
    // Style the popup - start small and centered
    const startSize = 50;
    const finalWidth = window.innerWidth * 0.6; // 60% width
    const finalHeight = window.innerHeight * 0.55; // 55% height
    const screenCenterX = window.innerWidth / 2;
    const screenCenterY = window.innerHeight / 2;
    
    console.log('Popup target size:', finalWidth, 'x', finalHeight);
    
    popupElement.style.cssText = `
        position: absolute;
        background: white;
        color: black;
        border-radius: 0;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 1000;
        overflow: hidden;
        cursor: pointer;
        left: ${screenCenterX - startSize/2}px;
        top: ${screenCenterY - startSize/2}px;
        width: ${startSize}px;
        height: ${startSize}px;
        clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 0, 100% calc(100% - 20px), 100% 100%, 20px 100%, 0 100%, 0 20px);
    `;
    
    // Add hover dismissal
    popupElement.addEventListener('mouseleave', () => {
        dismissPopup();
    });
    
    document.body.appendChild(popupElement);
    
    // Create physics object for popup - start small and grow
    popup = new PhysicsObject(popupElement, screenCenterX - startSize/2, screenCenterY - startSize/2, startSize, startSize, 10);
    popup.isPopup = true;
    popup.finalWidth = finalWidth;
    popup.finalHeight = finalHeight;
    popup.growing = true;
    popup.pushing = true; // while growing, affects titles
    popup.growthSpeed = 8; // restore earlier growth speed
    
    return popup;
}

function dismissPopup() {
    if (!popup) return;
    
    // Begin shrink instead of instant removal; attract cards back to rest
    popup.growing = false;
    popup.pushing = false;
    popup.shrinking = true;
    popup.shrinkSpeed = 20;
    
    physicsObjects.forEach(obj => {
        if (!obj.isPopup) {
            obj.isAttractedToRest = true;
        }
    });
}

db.collection("blogs").get().then((blogs) => {
    // Create separate containers for titles and authors
    const titleSection = document.createElement('div');
    titleSection.className = 'blogs-section title-section';
    titleSection.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        width: 50%;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
    `;
    document.body.appendChild(titleSection);
    
    const authorSection = document.createElement('div');
    authorSection.className = 'blogs-section author-section';
    authorSection.style.cssText = `
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 50%;
        overflow: hidden;
    `;
    document.body.appendChild(authorSection);
    
    // Create title cards in the title section
    blogs.forEach(blog => {
        if(blog.id != decodeURI(location.pathname.split("/").pop())){
            // stash article body on the card for preview derivation
            const doc = blog.data();
            const card = createBlogCard(blog, titleSection);
            if (card && typeof doc.article === 'string') {
                // store raw article on the clickable .blog-card element
                const blogCardEl = card.querySelector('.blog-card');
                if (blogCardEl) blogCardEl.dataset.article = doc.article;
            }
        }
    });
    
    // New layout: auth/editor controls will live in the bottom-right of author section
    
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
    
    // Add a static ABOUT card under authors
    createAboutCard(authorSection);

    // Create about panel element once
    const aboutPanel = document.createElement('aside');
    aboutPanel.className = 'about-panel';
    aboutPanel.innerHTML = `
        <div>
            <p>This space will tell visitors what this site is about. It can hold a few short paragraphs describing the idea, how to participate, and where to find more.</p>
        </div>`;
    document.body.appendChild(aboutPanel);

    // Create top bio panel (initially hidden above viewport)
    const bioPanel = document.createElement('section');
    bioPanel.className = 'bio-panel';
    bioPanel.innerHTML = `<p id="bio-content">Author bio</p>`;
    document.body.appendChild(bioPanel);

    // Create centered article preview panel (initially hidden)
    const articlePanel = document.createElement('section');
    articlePanel.className = 'article-panel';
    articlePanel.innerHTML = `
        <h2 id="article-title"></h2>
        <p id="article-preview"></p>
        <p id="article-author"></p>
    `;
    document.body.appendChild(articlePanel);

    console.log('Created author cards for:', Array.from(uniqueAuthors));
    
    // Position title and author cards
    positionCardsInSection(titleSection);
    positionCardsInSection(authorSection);
    
    // Add hover interactions after positioning (disable popup/physics in new design)
    setupHoverInteractions();
    
    // Create auth controls in bottom-right of authors column
    createAuthControls(authorSection);

    // Hook About hover: open on about hover; close on first mouse move after a brief delay
    const aboutCard = document.getElementById('about-card');
    if (aboutCard) {
        const panelEl = document.querySelector('.about-panel');
        let aboutCloser = null;
        const attachAboutMoveCloser = () => {
            if (aboutCloser) return;
            // Wait a tick so the panel is visible before we consider movement
            setTimeout(() => {
                if (aboutCloser) return;
                aboutCloser = (e) => {
                    document.body.classList.remove('about-open');
                    document.removeEventListener('mousemove', aboutCloser, true);
                    aboutCloser = null;
                };
                document.addEventListener('mousemove', aboutCloser, true);
            }, 120);
        };
        const open = () => { document.body.classList.add('about-open'); attachAboutMoveCloser(); };
        aboutCard.addEventListener('mouseenter', open);
        aboutCard.addEventListener('focus', open);
        if (panelEl) panelEl.addEventListener('mouseenter', open);
    }

    // Hook author hover to open bio panel; close on first mouse move after a brief delay
    // Select only real authors, not the About card
    const authorCards = Array.from(document.querySelectorAll('.blog-card.author-card'))
        .filter(card => (card.getAttribute('data-author') || '').toLowerCase() !== 'about');
    const bioEl = document.querySelector('.bio-panel');
    const bioContent = document.getElementById('bio-content');
    if (bioEl && authorCards.length) {
        let bioCloser = null;
        const attachBioMoveCloser = () => {
            if (bioCloser) return;
            setTimeout(() => {
                if (bioCloser) return;
                bioCloser = () => {
                    document.body.classList.remove('bio-open');
                    document.removeEventListener('mousemove', bioCloser, true);
                    bioCloser = null;
                };
                document.addEventListener('mousemove', bioCloser, true);
            }, 120);
        };
        const openBio = (authorName) => {
            if (bioContent) bioContent.textContent = `@${authorName} — short bio goes here.`;
            document.body.classList.add('bio-open');
            attachBioMoveCloser();
        };
        authorCards.forEach(card => {
            const name = card.getAttribute('data-author');
            card.addEventListener('mouseenter', () => openBio(name));
            card.addEventListener('focus', () => openBio(name));
        });
    }

    // (Reverted) remove title hover article preview behavior

    // Helper: fade out entry overlay if logged in
    const ensureFirstContainerFaded = () => {
        if (!topdiv) return;
        if (!topdiv.classList.contains('fade')) {
            topdiv.classList.add('fade');
        }
    };

    // Monitor auth state to update controls
    auth.onAuthStateChanged((user) => {
        if (user) {
            user.getIdTokenResult().then((idTokenResult) => {
                const isRealPerson = idTokenResult.claims.role === "real person";
                updateAuthControls(user, isRealPerson);
                // If we arrived here after login, auto dismiss the entry overlay
                ensureFirstContainerFaded();
            });
        } else {
            updateAuthControls(null, false);
        }
    });
    
})

function formatTitleForCard(rawTitle) {
    if (!rawTitle) return '';
    const maxLen = 100;
    const trimmed = rawTitle.substring(0, maxLen);
    return rawTitle.length > maxLen ? trimmed + '...' : trimmed;
}

function createBlogCard(blog, section) {
    const data = blog.data();
    const authorName = data.author ? data.author.split('@')[0] : 'Anonymous';
    const titleText = formatTitleForCard(data.title || '');

    const container = document.createElement('div');
    container.className = 'cardcontainer';
    container.setAttribute('data-author', authorName);

    const card = document.createElement('div');
    card.className = 'blog-card';
    card.style.cursor = 'pointer';
    card.onclick = () => { location.href = `/${blog.id}`; };
    // Persist preview data for the hover preview panel
    if (typeof data.preview === 'string' && data.preview.length) {
        card.dataset.preview = data.preview;
    }
    card.dataset.title = data.title || '';

    // optional banner kept commented in markup previously
    const titleEl = document.createElement('h1');
    titleEl.className = 'blog-title';
    titleEl.setAttribute('data-text', titleText);
    titleEl.textContent = titleText;

    card.appendChild(titleEl);
    container.appendChild(card);
    section.appendChild(container);
    return container;
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

function createAboutCard(section) {
    section.innerHTML += `
        <div class="cardcontainer">
            <div class="blog-card author-card" data-author="about" id="about-card" style="cursor: pointer;">
                <h1 class="blog-title" id="about" data-text="about">about</h1>
            </div>
        </div>
    `;
}

function createActionCard(actionText, section) {
    const cardId = actionText.replace(/\s+/g, '-');
    section.innerHTML += `
        <div class="cardcontainer" data-action="${cardId}">
            <div class="blog-card" onclick="handleActionCard('${cardId}')" style="cursor: pointer;">
                <h1 class="blog-title" data-text="${actionText.toUpperCase()}">${actionText.toUpperCase()}</h1>
            </div>
        </div>
    `;
}

function createLoginCard(section) {
    section.innerHTML += `
        <div class="cardcontainer" data-action="login" id="login-card">
            <div class="blog-card" onclick="handleActionCard('login')" style="cursor: pointer;">
                <h1 class="blog-title" data-text="LOGIN" id="login-text">LOGIN</h1>
            </div>
        </div>
    `;
}

function createNavCard(navType, section) {
    const displayText = navType.toUpperCase();
    section.innerHTML += `
        <div class="cardcontainer" data-action="${navType}" id="${navType}-card" style="display: none;">
            <div class="blog-card" onclick="handleActionCard('${navType}')" style="cursor: pointer;">
                <h1 class="blog-title" data-text="${displayText}">${displayText}</h1>
            </div>
        </div>
    `;
}

function createWriteBlogCard(section) {
    section.innerHTML += `
        <div class="cardcontainer" data-action="write-a-blog" id="write-blog-card" style="display: none;">
            <div class="blog-card" onclick="handleActionCard('write-a-blog')" style="cursor: pointer;">
                <h1 class="blog-title" data-text="WRITE A BLOG">WRITE A BLOG</h1>
            </div>
        </div>
    `;
}

function createAuthControls(section) {
    // container pinned to bottom-right
    const wrapper = document.createElement('div');
    wrapper.id = 'auth-controls';
    wrapper.style.cssText = `
        position: absolute;
        right: 14px;
        bottom: 8px;
        display: flex;
        gap: 8px;
        align-items: center;
        z-index: 10;
    `;

    // login/logout card
    const login = document.createElement('div');
    login.className = 'cardcontainer';
    login.innerHTML = `
        <div class="blog-card auth-plain" id="auth-login-card" style="cursor: pointer;">
            <h1 class="blog-title" id="auth-login-text" data-text="LOGIN">LOGIN</h1>
        </div>
    `;
    login.onclick = () => handleActionCard('login');

    // editor card (hidden by default; visible for role)
    const editor = document.createElement('div');
    editor.className = 'cardcontainer';
    editor.id = 'auth-editor-card';
    editor.style.display = 'none';
    editor.innerHTML = `
        <div class="blog-card auth-plain" style="cursor: pointer;">
            <h1 class="blog-title" data-text="EDITOR">EDITOR</h1>
        </div>
    `;
    editor.onclick = () => window.location.href = '/editor';

    wrapper.appendChild(editor);
    wrapper.appendChild(login);
    section.appendChild(wrapper);

    // Size cards to fit their text exactly and anchor text top-left
    const ensureSize = (titleEl) => {
        const probe = titleEl.cloneNode(true);
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.whiteSpace = 'nowrap';
        probe.style.width = 'auto';
        document.body.appendChild(probe);
        // Measure pseudo-text as well by matching styles
        const w = Math.ceil(probe.getBoundingClientRect().width + 6); // buffer for pseudo layer
        const h = Math.ceil(probe.getBoundingClientRect().height + 2);
        document.body.removeChild(probe);
        const card = titleEl.closest('.blog-card');
        if (card) {
            card.style.position = 'relative';
            card.style.width = `${w + 10}px`; // generous buffer
            card.style.height = `${h + 6}px`;
            card.style.overflow = 'visible'; // allow pseudo-element to extend
        }
        // Anchor the absolute title inside the card
        titleEl.style.left = '0px';
        titleEl.style.top = '0px';
        titleEl.style.textAlign = 'left';
        titleEl.style.whiteSpace = 'nowrap';
        titleEl.style.width = `${w}px`;
        return { w, h };
    };

    ensureSize(document.getElementById('auth-login-text'));
    const editorTitle = wrapper.querySelector('#auth-editor-card .blog-title');
    if (editorTitle) ensureSize(editorTitle);
}

function updateAuthControls(user, isRealPerson) {
    const loginText = document.getElementById('auth-login-text');
    const editorCard = document.getElementById('auth-editor-card');
    if (!loginText) return;

    if (user) {
        loginText.textContent = 'LOGOUT';
        loginText.setAttribute('data-text', 'LOGOUT');
        // Mark as logout for red glow
        const loginCard = document.getElementById('auth-login-card');
        if (loginCard) loginCard.setAttribute('data-logout', 'true');
        if (editorCard) editorCard.style.display = isRealPerson ? 'block' : 'none';
    } else {
        loginText.textContent = 'LOGIN';
        loginText.setAttribute('data-text', 'LOGIN');
        // Remove logout marker for green glow
        const loginCard = document.getElementById('auth-login-card');
        if (loginCard) loginCard.removeAttribute('data-logout');
        if (editorCard) editorCard.style.display = 'none';
    }

    // Recompute sizes after label change
    const resize = (titleEl) => {
        const probe = titleEl.cloneNode(true);
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.whiteSpace = 'nowrap';
        probe.style.width = 'auto';
        document.body.appendChild(probe);
        const w = Math.ceil(probe.getBoundingClientRect().width + 6);
        const h = Math.ceil(probe.getBoundingClientRect().height + 2);
        document.body.removeChild(probe);
        const card = titleEl.closest('.blog-card');
        if (card) {
            card.style.width = `${w + 10}px`;
            card.style.height = `${h + 6}px`;
            card.style.overflow = 'visible';
        }
        titleEl.style.width = `${w}px`;
        titleEl.style.left = '0px';
        titleEl.style.top = '0px';
        titleEl.style.textAlign = 'left';
    };
    resize(loginText);
    const editorTitle = document.querySelector('#auth-editor-card .blog-title');
    if (editorTitle && isRealPerson) resize(editorTitle);
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
    const isTitleSection = section.classList.contains('title-section');
    const columnPadding = 12; // tight but readable
    let y = columnPadding;

    cards.forEach(card => {
        const title = card.querySelector('.blog-title');
        // base styles
        title.style.margin = '0';
        title.style.padding = '0';
        title.style.width = 'auto';
        title.style.whiteSpace = 'nowrap';
        title.style.wordBreak = 'normal';
        title.style.overflowWrap = 'normal';
        title.offsetHeight;

        // measure single-line width
        let rect = title.getBoundingClientRect();
        const siteWidth = window.innerWidth;
        const maxLeftColumnWidth = siteWidth * 0.3; // 30% of website width

        // For left titles only: wrap to 2 lines if longer than 30% width
        if (isTitleSection && rect.width > maxLeftColumnWidth) {
            title.style.whiteSpace = 'normal';
            title.style.display = 'inline-block';
            title.style.maxWidth = `${Math.floor(maxLeftColumnWidth)}px`;
            title.style.wordBreak = 'break-word';
            title.style.overflowWrap = 'anywhere';
            title.style.lineHeight = '1.05';
            // clamp to 2 lines visually
            title.style.webkitLineClamp = '2';
            title.style.webkitBoxOrient = 'vertical';
            title.style.display = '-webkit-box';
            // re-measure after wrapping
            title.offsetHeight;
            rect = title.getBoundingClientRect();
        }

        const width = rect.width + 4;
        const height = rect.height + 2;

        card.style.position = 'absolute';
        card.style.top = `${y}px`;
        card.style.width = `${width}px`;
        card.style.height = `${height}px`;
        if (isTitleSection) {
            // align to far left
            card.style.left = '8px';
            card.style.right = 'auto';
            title.style.textAlign = 'left';
        } else {
            // align to far right
            const rightOffset = 8;
            card.style.right = `${rightOffset}px`;
            card.style.left = 'auto';
            title.style.textAlign = 'right';
            // authors stay single line
            title.style.whiteSpace = 'nowrap';
            title.style.maxWidth = 'none';
        }

        y += height + 4; // tight vertical spacing
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
            // Start dwell to open article preview
            const articleEl = document.querySelector('.article-panel');
            if (!articleEl) return;
            hoverTimer = setTimeout(() => {
                // set preview content from Firestore preview field + title + author
                const titleEl = document.getElementById('article-title');
                const previewEl = document.getElementById('article-preview');
                const authorEl = document.getElementById('article-author');
                const title = card.dataset.title || '';
                // Derive preview from article text if present on dataset; fall back to title
                // We expect article body stored on each card as dataset.article (first N chars/sentences extracted at fetch time)
                const rawArticle = card.dataset.article || '';
                const preview = derivePreviewFromArticle(rawArticle) || '';
                const author = card.closest('.cardcontainer')?.getAttribute('data-author') || 'Anonymous';
                if (titleEl) titleEl.textContent = title;
                if (previewEl) previewEl.textContent = preview;
                if (authorEl) authorEl.textContent = `@${author}`;
                document.body.classList.add('article-open');
                // arm close on first mousemove after short delay
                setTimeout(() => {
                    const closer = () => {
                        document.body.classList.remove('article-open');
                        document.removeEventListener('mousemove', closer, true);
                    };
                    document.addEventListener('mousemove', closer, true);
                }, 150);
            }, 1200);
        });
        
        card.addEventListener('mouseleave', () => {
            console.log('Blog leave:', authorName);
            // Clear hover timer
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }
            
            // Remove dimming from all authors
            authorCards.forEach(authorCard => {
                authorCard.classList.remove('hover');
            });

            // nothing else to do on leave
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

// Create a short preview from a full article string (markdown-like)
function derivePreviewFromArticle(articleText) {
    if (!articleText) return '';
    // Split into lines, drop images and headings, keep first 2-3 paragraphs
    const lines = articleText.split('\n').filter(Boolean);
    const paragraphs = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('![')) continue; // image
        if (trimmed.startsWith('#')) continue; // heading
        paragraphs.push(trimmed);
        if (paragraphs.length >= 3) break;
    }
    let text = paragraphs.join(' ');
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();
    // Truncate to ~260 chars at sentence boundary
    const limit = 260;
    if (text.length > limit) {
        const cut = text.slice(0, limit);
        const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
        text = (lastStop > 120 ? cut.slice(0, lastStop + 1) : cut) + (text.length > cut.length ? '…' : '');
    }
    return text;
}

function updateLoginButton(user) {
    const loginText = document.getElementById('login-text');
    const loginCard = document.getElementById('login-card');
    
    if (loginText && loginCard) {
        // Decide label
        const label = user ? 'LOGOUT' : 'LOGIN';
        loginText.textContent = label;
        loginText.setAttribute('data-text', label);
        
        // Ensure constant width: use max of 'LOGIN' vs 'LOGOUT' rendered width
        const computeTextWidth = (text) => {
            const probe = loginText.cloneNode(true);
            probe.style.position = 'absolute';
            probe.style.visibility = 'hidden';
            probe.style.width = 'auto';
            probe.textContent = text;
            probe.setAttribute('data-text', text);
            document.body.appendChild(probe);
            const w = probe.getBoundingClientRect().width;
            document.body.removeChild(probe);
            return w;
        };
        const maxLabelWidth = Math.max(computeTextWidth('LOGIN'), computeTextWidth('LOGOUT'));
        // Add a tiny padding buffer to avoid hairline overlaps
        const fixedWidth = Math.ceil(maxLabelWidth) + 6;
        loginText.style.width = `${fixedWidth}px`;
        loginText.style.textAlign = 'center';
        
        // Update container and physics width to match
        const titleRect = loginText.getBoundingClientRect();
        const newWidth = Math.ceil(titleRect.width) + 4;
        const newHeight = Math.ceil(titleRect.height) + 2;
        loginCard.style.width = `${newWidth}px`;
        loginCard.style.height = `${newHeight}px`;
        
        const phys = physicsObjects.find(o => o.element === loginCard);
        if (phys) {
            phys.width = newWidth;
            phys.height = newHeight;
        }
    }
}

function updateWriteBlogCard(isRealPerson) {
    const writeBlogCard = document.getElementById('write-blog-card');
    const homeCard = document.getElementById('home-card');
    const editorCard = document.getElementById('editor-card');
    const dashboardCard = document.getElementById('dashboard-card');
    
    const navCards = [writeBlogCard, homeCard, editorCard, dashboardCard];
    
    navCards.forEach(card => {
        if (card) {
            if (isRealPerson) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
                removeCardFromLayout(card);
            }
        }
    });
    
    if (isRealPerson) {
        addNavCardsToLayout();
    }
}

function recalculateCardDimensions(card) {
    const title = card.querySelector('.blog-title');
    
    // Use a fixed width to prevent the card from changing size
    // This keeps the card consistent regardless of text content
    const fixedWidth = 120; // Increased width for better text fit
    title.style.width = `${fixedWidth}px`;
    title.style.textAlign = 'center';
    
    const titleRect = title.getBoundingClientRect();
    const newWidth = titleRect.width + 4;
    const newHeight = titleRect.height + 2;
    
    // Update card dimensions
    card.style.width = `${newWidth}px`;
    card.style.height = `${newHeight}px`;
    
    // Find and update the corresponding physics object
    const physicsObj = physicsObjects.find(obj => obj.element === card);
    if (physicsObj) {
        physicsObj.width = newWidth;
        physicsObj.height = newHeight;
        // Update rest position to match new dimensions
        physicsObj.restX = parseFloat(card.style.left);
        physicsObj.restY = parseFloat(card.style.top);
    }
}

function addNavCardsToLayout() {
    // Reposition all cards to include the navigation cards
    const titleSection = document.querySelector('.title-section');
    if (titleSection) {
        positionCardsInSection(titleSection);
    }
}

function removeCardFromLayout(card) {
    if (card) {
        // Remove from physics objects
        const physicsObj = physicsObjects.find(obj => obj.element === card);
        if (physicsObj) {
            const index = physicsObjects.indexOf(physicsObj);
            physicsObjects.splice(index, 1);
        }
    }
}

function handleActionCard(cardId) {
    if (cardId === 'write-a-blog') {
        window.location.href = '/editor';
    } else if (cardId === 'home') {
        window.location.href = '/';
    } else if (cardId === 'editor') {
        window.location.href = '/editor';
    } else if (cardId === 'dashboard') {
        window.location.href = '/admin';
    } else if (cardId === 'login') {
        // Check if user is logged in
        if (auth.currentUser) {
            // User is logged in, logout
            logoutUser();
        } else {
            // User is not logged in, redirect to admin page for login
            window.location.href = '/admin';
        }
    }
}

topdiv.onclick = () => {
    topdiv.classList.toggle('fade');
    navbar.style.position = 'relative';
}

topdiv.addEventListener("transitionend", () => {
    topdiv.style.display = 'none';
});



