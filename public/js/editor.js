// Editor functionality with markdown support and auto-save

// DOM elements
const titleInput = document.querySelector('.title-input');
const articleEditor = document.querySelector('.article-editor');
const publishBtn = document.querySelector('.publish-btn');
const saveDraftBtn = document.querySelector('.save-draft-btn');
const imageUpload = document.querySelector('#image-upload');
const autosaveStatus = document.querySelector('#autosave-status');

// Auto-save variables
let autoSaveTimeout;
let isAutoSaving = false;
const AUTO_SAVE_DELAY = 2000; // 2 seconds after user stops typing

// Check if editing existing blog
let blogID = location.pathname.split("/");
blogID.shift();
const isEditing = blogID[0] !== "editor";

// Initialize editor
document.addEventListener('DOMContentLoaded', () => {
    initializeEditor();
    setupAutoSave();
    setupToolbar();
    loadExistingBlog();
});

// Initialize editor functionality
const initializeEditor = () => {
    // Load existing blog if editing
    if (isEditing) {
        loadBlogData();
    }
    
    // Setup event listeners
    setupEventListeners();
}

// Setup event listeners
const setupEventListeners = () => {
    // Publish button
    publishBtn.addEventListener('click', publishBlog);
    
    // Save draft button
    saveDraftBtn.addEventListener('click', saveDraft);
    
    // Image upload
    imageUpload.addEventListener('change', handleImageUpload);
    
    // Auto-save on input
    titleInput.addEventListener('input', triggerAutoSave);
    articleEditor.addEventListener('input', triggerAutoSave);
}

// Auto-save functionality
const setupAutoSave = () => {
    // Auto-save every 2 seconds after user stops typing
    titleInput.addEventListener('input', () => {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(saveDraft, AUTO_SAVE_DELAY);
    });
    
    articleEditor.addEventListener('input', () => {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(saveDraft, AUTO_SAVE_DELAY);
    });
}

const triggerAutoSave = () => {
    if (!isAutoSaving) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(saveDraft, AUTO_SAVE_DELAY);
    }
}

const saveDraft = async () => {
    if (isAutoSaving) return;
    
    isAutoSaving = true;
    updateAutosaveStatus('Saving...', 'saving');
    
    try {
        const draftData = {
            title: titleInput.value,
            content: articleEditor.value,
            lastSaved: new Date().toISOString(),
            isDraft: true
        };
        
        // Save to localStorage as backup
        localStorage.setItem('blog_draft', JSON.stringify(draftData));
        
        // If user is logged in, save to Firestore
        if (auth.currentUser) {
            await db.collection('drafts').doc(auth.currentUser.uid).set(draftData);
        }
        
        updateAutosaveStatus('Saved', 'saved');
        
        setTimeout(() => {
            updateAutosaveStatus('Ready', '');
        }, 2000);
        
    } catch (error) {
        console.error('Auto-save error:', error);
        updateAutosaveStatus('Error saving', 'error');
    } finally {
        isAutoSaving = false;
    }
};

const updateAutosaveStatus = (text, className) => {
    autosaveStatus.textContent = text;
    autosaveStatus.className = `autosave-status ${className}`;
};

// Toolbar functionality
const setupToolbar = () => {
    const toolbarBtns = document.querySelectorAll('.toolbar-btn');
    
    toolbarBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const action = btn.dataset.action;
            
            if (action === 'image') {
                imageUpload.click();
            } else {
                applyMarkdownFormat(action);
            }
        });
    });
};

const applyMarkdownFormat = (format) => {
    const textarea = articleEditor;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    let formattedText = '';
    let newCursorPos = start;
    
    switch (format) {
        case 'bold':
            formattedText = `**${selectedText || 'bold text'}**`;
            newCursorPos = start + 2;
            break;
        case 'italic':
            formattedText = `*${selectedText || 'italic text'}*`;
            newCursorPos = start + 1;
            break;
        case 'strikethrough':
            formattedText = `~~${selectedText || 'strikethrough text'}~~`;
            newCursorPos = start + 2;
            break;
        case 'underline':
            formattedText = `__${selectedText || 'underlined text'}__`;
            newCursorPos = start + 2;
            break;
        case 'heading':
            formattedText = `# ${selectedText || 'Heading'}`;
            newCursorPos = start + 2;
            break;
    }
    
    // Insert formatted text
    const newValue = textarea.value.substring(0, start) + formattedText + textarea.value.substring(end);
    textarea.value = newValue;
    
    // Set cursor position
    textarea.focus();
    textarea.setSelectionRange(newCursorPos, newCursorPos + (selectedText ? selectedText.length : 0));
    
    // Trigger auto-save
    triggerAutoSave();
};

// Image handling
const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !file.type.includes("image")) {
        alert("Please select an image file");
        return;
    }
    
    try {
        updateAutosaveStatus('Uploading image...', 'saving');
        
        const formData = new FormData();
        formData.append('image', file);
        
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Insert image markdown at cursor position
        insertImageMarkdown(data, file.name);
        
        updateAutosaveStatus('Image uploaded', 'saved');
        setTimeout(() => updateAutosaveStatus('Ready', ''), 2000);
        
    } catch (error) {
        console.error('Image upload error:', error);
        updateAutosaveStatus('Upload failed', 'error');
        alert('Failed to upload image. Please try again.');
    }
};

const insertImageMarkdown = (imagePath, altText) => {
    const textarea = articleEditor;
    const start = textarea.selectionStart;
    const imageMarkdown = `![${altText}](${imagePath})\n`;
    
    const newValue = textarea.value.substring(0, start) + imageMarkdown + textarea.value.substring(start);
    textarea.value = newValue;
    
    // Set cursor after the image
    const newCursorPos = start + imageMarkdown.length;
    textarea.focus();
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    
    triggerAutoSave();
};

// Publish functionality
const publishBlog = async () => {
    if (!titleInput.value.trim() || !articleEditor.value.trim()) {
        alert('Please fill in both title and content');
        return;
    }
    
    try {
        publishBtn.disabled = true;
        publishBtn.textContent = 'Publishing...';
        
        const docName = isEditing ? decodeURI(blogID[0]) : generateBlogId();
        const date = new Date();
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        
        const blogData = {
            title: titleInput.value.trim(),
            article: articleEditor.value.trim(),
            publishedAt: `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`,
            author: auth.currentUser.email.split("@")[0],
            numberofcomments: 0,
            lastModified: new Date().toISOString()
        };
        
        await db.collection("blogs").doc(docName).set(blogData);
        
        // Clear draft
        localStorage.removeItem('blog_draft');
        if (auth.currentUser) {
            await db.collection('drafts').doc(auth.currentUser.uid).delete();
        }
        
        // Redirect to published blog
        location.href = `/${docName}`;
        
    } catch (error) {
        console.error('Publish error:', error);
        alert('Failed to publish blog. Please try again.');
        publishBtn.disabled = false;
        publishBtn.textContent = 'Publish';
    }
};

const generateBlogId = () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const blogTitle = titleInput.value.split(" ").join("-").toLowerCase();
    let id = '';
    for (let i = 0; i < 4; i++) {
        id += letters[Math.floor(Math.random() * letters.length)];
    }
    return `${blogTitle}-${id}`;
};

// Load existing blog data
const loadBlogData = async () => {
    try {
        const docRef = db.collection("blogs").doc(decodeURI(blogID[0]));
        const doc = await docRef.get();
        
        if (doc.exists) {
            const data = doc.data();
            titleInput.value = data.title || '';
            articleEditor.value = data.article || '';
        } else {
            location.replace("/");
        }
    } catch (error) {
        console.error('Error loading blog:', error);
        location.replace("/");
    }
};

// Load draft on page load
const loadExistingBlog = () => {
    // Try to load from localStorage first
    const savedDraft = localStorage.getItem('blog_draft');
    if (savedDraft && !isEditing) {
        try {
            const draft = JSON.parse(savedDraft);
            if (draft.title) titleInput.value = draft.title;
            if (draft.content) articleEditor.value = draft.content;
            updateAutosaveStatus('Draft loaded', 'saved');
        } catch (error) {
            console.error('Error loading draft:', error);
        }
    }
};

// Authentication check
auth.onAuthStateChanged((user) => {
    if (!user) {
        location.replace("/admin");
    }
});

// Prevent accidental navigation
window.addEventListener('beforeunload', (e) => {
    if (titleInput.value.trim() || articleEditor.value.trim()) {
        e.preventDefault();
        e.returnValue = '';
    }
});