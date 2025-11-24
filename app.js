const userIds = ['lMjZp', 'rd2be', '2xYazJ'];
const debugLog = document.getElementById('debug-log');
const debugOverlay = document.getElementById('debug-overlay');
let allBots = [];
let searchTerm = '';
let autoScrollInterval;

// --- STATE FOR FILTERING & LAZY LOADING ---
let activeTags = new Set(); // Stores multiple unique tags
let currentBatch = [];      // Stores the full filtered list
let displayedCount = 0;     // How many currently on screen
const BATCH_SIZE = 20;      // How many to load per scroll
let observer;               // IntersectionObserver instance

// --- THEME TOGGLE ---
const themeToggle = document.getElementById('theme-toggle');
const currentTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', currentTheme);
themeToggle.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
themeToggle.addEventListener('click', () => {
    const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    themeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
});

// --- UTILITIES ---
function log(message) {
    console.log(message);
    const msg = `${new Date().toLocaleTimeString()}: ${message}\n`;
    if (debugLog) debugLog.textContent += msg;
    if (debugOverlay) {
        debugOverlay.textContent += msg;
        debugOverlay.scrollTop = debugOverlay.scrollHeight;
    }
}

function parseChats(str) {
    if (typeof str !== 'string') return 0;
    const num = parseFloat(str.replace('k', ''));
    return str.includes('k') ? num * 1000 : num;
}

function generateFingerprint() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// --- MATRIX RAIN ANIMATION ---
function initMatrix() {
    const canvas = document.getElementById('matrix-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()';
    const fontSize = 14;
    const columns = canvas.width / fontSize;
    const drops = Array(Math.floor(columns)).fill(1);
    let matrixInterval = setInterval(draw, 50);

    function draw() {
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0f0';
        ctx.font = `${fontSize}px monospace`;
        drops.forEach((y, i) => {
            const text = chars[Math.floor(Math.random() * chars.length)];
            ctx.fillText(text, i * fontSize, y * fontSize);
            if (y * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
            drops[i]++;
        });
    }
    canvas.dataset.intervalId = matrixInterval;
}

function stopMatrix() {
    const canvas = document.getElementById('matrix-canvas');
    if (canvas) {
        const intervalId = canvas.dataset.intervalId;
        if (intervalId) clearInterval(intervalId);
    }
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.transition = 'opacity 0.5s ease-out';
        loader.style.opacity = '0';
        setTimeout(() => { loader.style.display = 'none'; }, 500);
    }
}

// --- DATA FETCHING ---
async function fetchData(url) {
    const options = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'DNT': '1',
            'Fingerprint': generateFingerprint()
        }
    };
    try {
        log(`Fetching: ${url}`);
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data;
    } catch (error) {
        log(`Fetch error: ${error.message}`);
        return null;
    }
}

async function loadBotsForUser(userId) {
    let records = [];
    let page = 1;
    let totalPages = 1;
    do {
        const botsData = await fetchData(`https://api.joyland.ai/profile/public-bots?userId=${userId}&page=${page}&pageSize=100`);
        if (botsData && botsData.result) {
            const { records: newRecords, pages } = botsData.result;
            records = records.concat(newRecords.map(bot => ({ ...bot, fromUser: userId })));
            totalPages = pages;
            page++;
        } else {
            break;
        }
    } while (page <= totalPages);
    return records;
}

async function loadAllBots() {
    log('Initiating bot fetch...');
    const botPromises = userIds.map(userId => loadBotsForUser(userId));
    const userBotsArrays = await Promise.all(botPromises);
    
    allBots = userBotsArrays.filter(Boolean).flat();
    allBots.sort((a, b) => a.characterName.localeCompare(b.characterName));
    
    document.getElementById('bots-count').textContent = allBots.length;
    log(`Total ${allBots.length} bots loaded.`);
    
    stopMatrix();
    
    if (allBots.length === 0) {
        const container = document.querySelector('.container');
        container.innerHTML = `<h2 style="text-align: center; color: var(--accent);">Could not load bot data. Refresh page.</h2>` + container.innerHTML;
        container.style.display = 'block';
        return;
    }
    
    document.querySelector('.container').style.display = 'block';
    populateHeroCarousel();
    updateDisplay();
}

// --- FILTERING & SORTING ---

function sortBots(bots, sortBy) {
    return [...bots].sort((a, b) => {
        switch (sortBy) {
            case 'name': return a.characterName.localeCompare(b.characterName);
            case 'chats': return parseChats(b.botChats) - parseChats(a.botChats);
            case 'likes': return (b.botLikesInInt || 0) - (a.botLikesInInt || 0);
            default: return 0;
        }
    });
}

function filterBots(bots, userFilter) {
    if (userFilter === 'all') return bots;
    return bots.filter(bot => bot.fromUser === userFilter);
}

// --- TAG MANAGEMENT (NEW) ---

// Make accessible to global scope for onclick events
window.removeTag = function(tag) {
    activeTags.delete(tag);
    renderActiveTagsUI();
    updateDisplay();
};

function toggleTag(tag) {
    if (activeTags.has(tag)) {
        activeTags.delete(tag);
    } else {
        activeTags.add(tag);
    }
    renderActiveTagsUI();
    updateDisplay();
}

function renderActiveTagsUI() {
    const container = document.getElementById('active-tags-container');
    if (!container) return;

    if (activeTags.size === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = Array.from(activeTags).map(tag => `
        <button class="active-tag-chip" onclick="removeTag('${tag}')">
            ${tag} <span>&times;</span>
        </button>
    `).join('');
}

function updateDisplay() {
    const sortBy = document.getElementById('sort-select').value;
    const userFilter = document.getElementById('user-filter').value;

    // 1. Filter by User
    let filtered = filterBots(allBots, userFilter);

    // 2. Strict Tag Filtering (AND Logic)
    if (activeTags.size > 0) {
        filtered = filtered.filter(bot => {
            const botTags = bot.tags || [];
            // Every selected tag must exist exactly in the bot's tag list
            return Array.from(activeTags).every(selectedTag => botTags.includes(selectedTag));
        });
    }

    // 3. Search Text Filtering
    if (searchTerm) {
        filtered = filtered.filter(bot =>
            bot.characterName.toLowerCase().includes(searchTerm) ||
            bot.introduce.toLowerCase().includes(searchTerm)
        );
    }
    
    const sorted = sortBots(filtered, sortBy);
    renderCards(sorted);
}

// --- LAZY LOADING & RENDERING (NEW) ---

function renderCards(bots) {
    const grid = document.getElementById('bots-grid');
    if (!grid) return;

    // Reset Lazy Load State
    grid.innerHTML = ''; 
    currentBatch = bots;
    displayedCount = 0;

    // Handle empty state
    if (bots.length === 0) {
        let message = 'No bots found.';
        if (activeTags.size > 0) message = 'No bots match all selected tags.';
        else if (searchTerm) message = 'No bots match your search criteria.';
        grid.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; opacity: 0.8;">${message}</p>`;
        return;
    }

    // Create Sentinel
    const sentinel = document.createElement('div');
    sentinel.id = 'sentinel';
    grid.appendChild(sentinel);

    // Setup Observer
    if (!observer) {
        observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                loadMoreBots();
            }
        }, { rootMargin: '200px' });
    }

    observer.observe(sentinel);
    loadMoreBots(); // Load first batch immediately
}

function loadMoreBots() {
    if (displayedCount >= currentBatch.length) return;

    const grid = document.getElementById('bots-grid');
    const sentinel = document.getElementById('sentinel');
    
    // Slice next batch
    const nextBatch = currentBatch.slice(displayedCount, displayedCount + BATCH_SIZE);
    
    const batchHTML = nextBatch.map(bot => {
        const tags = Array.isArray(bot.tags) ? bot.tags : [];
        const botImage = bot.avatar || 'https://placehold.co/300x200/6c5ce7/white?text=No+Image';

        return `
        <div class="card">
            <div class="image-placeholder skeleton">
                <img 
                    src="${botImage}" 
                    alt="${bot.characterName}" 
                    class="img-loading"
                    loading="lazy" 
                    onload="this.classList.remove('img-loading'); this.classList.add('img-loaded'); this.parentElement.classList.remove('skeleton');"
                    onerror="this.src='https://placehold.co/300x200/6c5ce7/white?text=Error'; this.parentElement.classList.remove('skeleton'); this.classList.remove('img-loading'); this.classList.add('img-loaded');"
                >
            </div>
            
            <a href="https://www.joyland.ai/botProfile/${bot.botId}" class="chat-button" title="Chat with ${bot.characterName}" target="_blank" rel="noopener noreferrer">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
            </a>

            <div class="card-content">
                <h3>${bot.characterName || 'Unknown Bot'}</h3>
                <p>${bot.introduce || 'No introduction available.'}</p>
                <div class="tags">
                    ${tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
                <div class="card-footer">
                    <span class="profile-tag">From ${bot.fromUser}</span>
                    <span class="card-stats">Chats: ${bot.botChats || 0} | Likes: ${bot.botLikes || 0}</span>
                </div>
            </div>
        </div>
    `}).join('');

    // Insert new items before sentinel
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = batchHTML;
    while (tempDiv.firstChild) {
        grid.insertBefore(tempDiv.firstChild, sentinel);
    }

    displayedCount += nextBatch.length;

    if (displayedCount >= currentBatch.length) {
        observer.unobserve(sentinel);
    }
}

// --- CAROUSEL LOGIC ---
function populateHeroCarousel() {
    const mostLiked = sortBots(allBots, 'likes').slice(0, 10);
    const track = document.getElementById('hero-carousel-container');
    if (!track) return;

    track.innerHTML = mostLiked.map(bot => `
        <a href="https://www.joyland.ai/botProfile/${bot.botId}" class="hero-card" target="_blank" rel="noopener noreferrer">
            <img src="${bot.avatar || 'https://placehold.co/450x300/a855f7/white?text=No+Image'}" alt="${bot.characterName}" class="hero-card-image">
            <div class="hero-card-fade"></div>
            <div class="hero-card-content">
                <h3>${bot.characterName || 'Unknown Bot'}</h3>
                <p>${bot.introduce || 'No introduction available.'}</p>
            </div>
        </a>
    `).join('');
    
    initCarouselControls();
}

function initCarouselControls() {
    const container = document.getElementById('hero-carousel-container');
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');

    if (!container || !prevBtn || !nextBtn) return;
    const scrollAmount = () => container.clientWidth * 0.8;

    prevBtn.addEventListener('click', () => container.scrollBy({ left: -scrollAmount(), behavior: 'smooth' }));
    nextBtn.addEventListener('click', () => container.scrollBy({ left: scrollAmount(), behavior: 'smooth' }));

    const startAutoScroll = () => {
        stopAutoScroll();
        autoScrollInterval = setInterval(() => {
            if (!container) return;
            if (container.scrollLeft + container.clientWidth + 50 >= container.scrollWidth) {
                container.scrollTo({ left: 0, behavior: 'smooth' });
            } else {
                container.scrollBy({ left: scrollAmount(), behavior: 'smooth' });
            }
        }, 3000);
    };
    const stopAutoScroll = () => clearInterval(autoScrollInterval);

    container.addEventListener('mouseenter', stopAutoScroll);
    container.addEventListener('mouseleave', startAutoScroll);
    startAutoScroll();
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initMatrix();
    const searchInput = document.getElementById('search');
    
    let searchTimeout;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchTerm = e.target.value.toLowerCase();
                updateDisplay();
            }, 300);
        });
    }

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) sortSelect.addEventListener('change', updateDisplay);

    const userFilter = document.getElementById('user-filter');
    if (userFilter) userFilter.addEventListener('change', updateDisplay);
    
    // Tag Click Event Delegation
    const botsGrid = document.getElementById('bots-grid');
    if (botsGrid) {
        botsGrid.addEventListener('click', (e) => {
            if (e.target.classList.contains('tag')) {
                const tag = e.target.textContent;
                toggleTag(tag);
            }
        });
    }
    
    loadAllBots();
});
