const userIds = ['lMjZp', 'rd2be', '2xYazJ'];
const debugLog = document.getElementById('debug-log');
const debugOverlay = document.getElementById('debug-overlay');
let allBots = [];
let searchTerm = '';
let activeTag = ''; // State for tag filtering
let autoScrollInterval;

// Theme toggle
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

function log(message) {
    console.log(message);
    const msg = `${new Date().toLocaleTimeString()}: ${message}\n`;
    debugLog.textContent += msg;
    if (debugOverlay) {
        debugOverlay.textContent += msg;
        debugOverlay.scrollTop = debugOverlay.scrollHeight;
    }
}

// Matrix rain
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
        if (intervalId) {
            clearInterval(intervalId);
        }
    }
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.transition = 'opacity 0.5s ease-out';
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
        }, 500);
    }
}

function generateFingerprint() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function fetchData(url) {
    const options = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en',
            'DNT': '1',
            'Fingerprint': generateFingerprint()
        }
    };
    try {
        log(`Fetching: ${url}`);
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const data = await response.json();
        if (data && data.result && data.result.records) {
            log(`Got data: ${data.result.records.length} records, page ${data.result.page}/${data.result.pages}`);
        } else {
            log(`Got data: ${JSON.stringify(data).substring(0, 200)}...`);
        }
        return data;
    } catch (error) {
        log(`Fetch error for ${url}: ${error.message}`);
        return null;
    }
}

async function loadBotsForUser(userId) {
    log(`Loading bots for user ${userId}...`);
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
            log(`No bot data for ${userId}`);
            break;
        }
    } while (page <= totalPages);
    log(`Loaded ${records.length} bots for ${userId}`);
    return records;
}

async function loadAllBots() {
    log('Matrix loading: Initiating bot fetch...');
    const botPromises = userIds.map(userId => loadBotsForUser(userId));
    const userBotsArrays = await Promise.all(botPromises);
    
    // Explicitly filter out any 'null' results from failed fetches
    allBots = userBotsArrays.filter(Boolean).flat();
    
    allBots.sort((a, b) => a.characterName.localeCompare(b.characterName));
    document.getElementById('bots-count').textContent = allBots.length;
    log(`Matrix complete: Total ${allBots.length} bots loaded.`);
    
    stopMatrix();
    
    // check for zero bots loaded, which indicates an API error
    if (allBots.length === 0) {
        log('CRITICAL: No bots were loaded from any user.');
        const container = document.querySelector('.container');
        // Prepend an error message so user knows what happened
        container.innerHTML = `<h2 style="text-align: center; color: var(--accent);">Could not load bot data. Please try refreshing the page.</h2>` + container.innerHTML;
        container.style.display = 'block';
        return; // Don't try to populate carousel/grid
    }
    
    document.querySelector('.container').style.display = 'block';
    
    populateHeroCarousel();
    updateDisplay(); // Initial render
}

function parseChats(str) {
    if (typeof str !== 'string') return 0;
    const num = parseFloat(str.replace('k', ''));
    return str.includes('k') ? num * 1000 : num;
}

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

function setTagFilter(tag) {
    setTagFilterUI(tag);
}

function clearTagFilter() {
    clearTagFilterUI();
}

function setTagFilterUI(tag) {
    activeTag = tag;
    const searchInput = document.getElementById('search');
    searchInput.value = `Tag: ${tag}`;
    searchInput.disabled = true;
    
    const resetContainer = document.getElementById('filter-reset-container');
    resetContainer.innerHTML = `<button id="reset-tag-filter" class="reset-button">← Back to All Bots</button>`;
    
    document.getElementById('reset-tag-filter').addEventListener('click', clearTagFilter);
    
    updateDisplay(); // Re-render
}

function clearTagFilterUI() {
    activeTag = '';
    const searchInput = document.getElementById('search');
    searchInput.value = '';
    searchInput.disabled = false;
    searchTerm = ''; // Clear internal search term
    
    const resetContainer = document.getElementById('filter-reset-container');
    resetContainer.innerHTML = ''; // Remove button
    
    updateDisplay(); // Re-render
}

function updateDisplay() {
    const sortBy = document.getElementById('sort-select').value;
    const userFilter = document.getElementById('user-filter').value;
    let filtered = filterBots(allBots, userFilter);

    if (activeTag) {
        filtered = filtered.filter(bot =>
            (bot.tags && Array.isArray(bot.tags) && bot.tags.some(t => t.toLowerCase() === activeTag.toLowerCase()))
        );
    } else if (searchTerm) {
        filtered = filtered.filter(bot =>
            bot.characterName.toLowerCase().includes(searchTerm) ||
            bot.introduce.toLowerCase().includes(searchTerm) ||
            (bot.tags && bot.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
        );
    }
    
    const sorted = sortBots(filtered, sortBy);
    renderCards(sorted);
}

function populateHeroCarousel() {
    const mostLiked = sortBots(allBots, 'likes').slice(0, 10);
    const track = document.getElementById('hero-carousel-container');
    if (!track) return;

    track.innerHTML = mostLiked.map(bot => `
        <a href="https://www.joyland.ai/botProfile/${bot.botId}" class="hero-card" target="_blank" rel="noopener noreferrer">
            <img src="${bot.avatar || 'https://placehold.co/450x300/a855f7/white?text=No+Image'}" alt="${bot.characterName}" class="hero-card-image" onerror="this.src='https://placehold.co/450x300/a855f7/white?text=Error'">
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

    prevBtn.addEventListener('click', () => {
        container.scrollBy({ left: -scrollAmount(), behavior: 'smooth' });
    });

    nextBtn.addEventListener('click', () => {
        container.scrollBy({ left: scrollAmount(), behavior: 'smooth' });
    });

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

    const stopAutoScroll = () => {
        clearInterval(autoScrollInterval);
    };

    container.addEventListener('mouseenter', stopAutoScroll);
    container.addEventListener('mouseleave', startAutoScroll);
    
    startAutoScroll();
}

function renderCards(bots) {
    const grid = document.getElementById('bots-grid');
    if (!grid) return;

    // Handle empty results
    if (bots.length === 0) {
        let message = 'No bots found.';
        if (activeTag) {
            message = `No bots found with the tag "${activeTag}".`;
        } else if (searchTerm) {
            message = 'No bots match your search criteria.';
        }
        // Display a helpful message instead of a blank grid
        grid.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; opacity: 0.8;">${message}</p>`;
        return; // Stop here
    }

    grid.innerHTML = bots.map(bot => {
        const tags = Array.isArray(bot.tags) ? bot.tags : [];
        
        // The HTML structure inside card-content is updated
        return `
        <div class="card">
            <img src="${bot.avatar || 'https://placehold.co/300x200/6c5ce7/white?text=No+Image'}" alt="${bot.characterName}" loading="lazy" onerror="this.src='https://placehold.co/300x200/6c5ce7/white?text=Error'">
            
            <a href="https://www.joyland.ai/botProfile/${bot.botId}" class="chat-button" title="Chat with ${bot.characterName}" target="_blank" rel="noopener noreferrer">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <title>Chat</title>
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
}

document.addEventListener('DOMContentLoaded', () => {
    initMatrix();
    const searchInput = document.getElementById('search');
    
    let searchTimeout;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            if (!activeTag) {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    searchTerm = e.target.value.toLowerCase();
                    updateDisplay();
                }, 300);
            }
        });
    }

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) sortSelect.addEventListener('change', updateDisplay);

    const userFilter = document.getElementById('user-filter');
    if (userFilter) userFilter.addEventListener('change', updateDisplay);
    
    // Event delegation for tag clicks
    const botsGrid = document.getElementById('bots-grid');
    if (botsGrid) {
        botsGrid.addEventListener('click', (e) => {
            if (e.target.classList.contents.contains('tag')) {
                const tag = e.target.textContent;
                setTagFilter(tag);
            }
        });
    }
    
    loadAllBots();
});
