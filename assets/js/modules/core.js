// ==========================================
// CORE MODULE: Config, DOM, Theme, Clock, Toast
// ==========================================

export const cfg = typeof CONFIG !== 'undefined' ? CONFIG : {};
export const DISCORD_ID = cfg.discordId || '463983563659018241';

export function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export function applyConfig() {
    if (cfg.siteTitle) document.title = cfg.siteTitle;
    
    const entryTitleEl = document.querySelector('.entry-title');
    if (entryTitleEl && cfg.entryTitle) entryTitleEl.textContent = cfg.entryTitle;
    
    const entryPromptEl = document.querySelector('.entry-prompt');
    if (entryPromptEl && cfg.entryPrompt) entryPromptEl.textContent = cfg.entryPrompt;

    const nameTextEl = document.getElementById('name-text');
    if (nameTextEl && cfg.displayName) nameTextEl.textContent = cfg.displayName;

    const subtagUserEl = document.getElementById('subtag-username');
    if (subtagUserEl && cfg.username) subtagUserEl.textContent = cfg.username;

    const subtagProEl = document.getElementById('subtag-pronouns');
    if (subtagProEl && cfg.pronouns) subtagProEl.textContent = cfg.pronouns;

    const clanTagEl = document.getElementById('clan-tag');
    const clanNameEl = document.getElementById('clan-name');
    const clanBadgeEl = document.getElementById('clan-badge');
    if (clanTagEl && cfg.clanTag) {
        clanTagEl.classList.remove('hidden');
        if (clanNameEl) clanNameEl.textContent = cfg.clanTag;
        if (clanBadgeEl && cfg.clanBadgeUrl) clanBadgeEl.src = cfg.clanBadgeUrl;
    }

    const avatarDecoEl = document.getElementById('avatar-decoration');
    if (avatarDecoEl && cfg.avatarDecorationUrl) {
        avatarDecoEl.src = cfg.avatarDecorationUrl;
        avatarDecoEl.classList.remove('hidden');
    }

    const userNoteEl = document.getElementById('user-note');
    if (userNoteEl && cfg.userNote) userNoteEl.textContent = cfg.userNote;

    const memberSinceEl = document.getElementById('member-since');
    if (memberSinceEl && cfg.memberSince) memberSinceEl.textContent = cfg.memberSince;

    // Badges
    const badgesContainer = document.getElementById('badges-container');
    if (badgesContainer && Array.isArray(cfg.badges)) {
        badgesContainer.innerHTML = cfg.badges.map(b => 
            `<img src="${b.icon}" alt="${b.title}" title="${b.title}" class="badge-icon">`
        ).join('');
    }

    // Socials
    const socialRow = document.getElementById('social-row');
    if (socialRow && Array.isArray(cfg.socials)) {
        socialRow.innerHTML = cfg.socials.map(s => {
            const iconHtml = s.iconSvg ? s.iconSvg : `<i class="${s.icon}"></i>`;
            const copyAttr = s.copyText ? `data-copy="${s.copyText}"` : '';
            return `<a href="${s.link}" target="_blank" class="social-icon ${s.type}" title="${s.title || s.name || ''}" ${copyAttr}>${iconHtml}</a>`;
        }).join('');
        attachCopyListeners();
    }

    // Setup: Game Profiles
    const gameGrid = document.getElementById('game-profiles-grid');
    if (gameGrid && cfg.setup?.gameProfiles) {
        gameGrid.innerHTML = cfg.setup.gameProfiles.map(g => `
            <div class="gear-item">
                <span class="gear-label"><i class="${g.icon}"></i> ${g.label}</span>
                <span class="gear-value ${g.highlight ? 'highlight' : ''}">${g.value}</span>
            </div>
        `).join('');
    }

    // Setup: Favorite Game
    const favGameCard = document.querySelector('.fav-game-card');
    if (favGameCard && cfg.setup?.favoriteGame) {
        const fg = cfg.setup.favoriteGame;
        favGameCard.innerHTML = `
            <img src="${fg.cover}" alt="${fg.title}" class="fav-game-cover">
            <div class="fav-game-details">
                <h4 class="fav-game-title">${fg.title}</h4>
                <span class="game-tag-badge gold"><i class="fa-solid fa-crown"></i> ${fg.tag}</span>
                <p class="fav-game-desc">${fg.note}${fg.publisher ? ' • ' + fg.publisher : ''}</p>
            </div>
        `;
    }

    // Setup: Games in Rotation
    const rotGrid = document.querySelector('.rotation-games-grid');
    if (rotGrid && cfg.setup?.rotationGames) {
        rotGrid.innerHTML = cfg.setup.rotationGames.map(g => `
            <div class="rot-game-card">
                <img src="${g.cover}" alt="${g.title}" class="rot-game-img">
                <div class="rot-game-info">
                    <p class="rot-game-name">${g.title}</p>
                    <span class="game-tag-badge">${g.tag}</span>
                </div>
            </div>
        `).join('');
    }

    // Setup: Gear
    const gearGrid = document.getElementById('gear-grid');
    if (gearGrid && cfg.setup?.gear) {
        gearGrid.innerHTML = cfg.setup.gear.map(g => `
            <div class="gear-item">
                <span class="gear-label"><i class="${g.icon}"></i> ${g.label}</span>
                <span class="gear-value">${g.value}</span>
            </div>
        `).join('');
    }

    // Setup: Favorites
    const favContainer = document.getElementById('favorites-container');
    if (favContainer && cfg.setup?.favorites) {
        favContainer.innerHTML = cfg.setup.favorites.map(f => `
            <span class="tag-badge"><i class="${f.icon}"></i> ${f.text}</span>
        `).join('');
    }
}

const toast = document.getElementById('toast');
let toastTimeout;
export function showToast(message) {
    if (!toast) return;
    toast.innerHTML = message;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

export function attachCopyListeners() {
    document.querySelectorAll('.social-icon[data-copy]').forEach(icon => {
        icon.onclick = () => {
            const textToCopy = icon.getAttribute('data-copy');
            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showToast(`<i class="fa-solid fa-circle-check" style="color: var(--c-green);"></i> Copied <b>${textToCopy}</b> to clipboard!`);
                }).catch(() => {});
            }
        };
    });
}

export function initLiveClock() {
    const clockEl = document.getElementById('live-clock');
    if (!clockEl) return;
    const updateTime = () => {
        const now = new Date();
        const h = now.getHours().toString().padStart(2, '0');
        const m = now.getMinutes().toString().padStart(2, '0');
        const s = now.getSeconds().toString().padStart(2, '0');
        clockEl.textContent = `${h}:${m}:${s}`;
    };
    updateTime();
    setInterval(updateTime, 1000);
}

export function initThemeSwitcher() {
    const themePresets = ['tokyonight', 'atom', 'catppuccin'];
    const themeNames = {
        'tokyonight': 'Tokyo Night 🌌',
        'atom': 'Atom One Dark ⚛️',
        'catppuccin': 'Catppuccin Mocha ☕'
    };
    let currentThemeIndex = 0;
    const savedTheme = localStorage.getItem('profile_theme');
    if (savedTheme && themePresets.includes(savedTheme)) {
        currentThemeIndex = themePresets.indexOf(savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
        document.documentElement.setAttribute('data-theme', 'tokyonight');
    }

    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            currentThemeIndex = (currentThemeIndex + 1) % themePresets.length;
            const newTheme = themePresets[currentThemeIndex];
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('profile_theme', newTheme);
            showToast(`🎨 Theme: <b>${themeNames[newTheme]}</b>`);
        });
    }
}
