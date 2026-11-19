// ==========================================
// MAIN ENTRY POINT: Orchestrates all modules
// ==========================================

import { cfg, applyConfig, initLiveClock, initThemeSwitcher } from './modules/core.js?v=9.3';
import { initCursor, tickCursor, initCanvas, tickSakura, createSparkles, tickSparkles, initTextScramble, isMobile, isTouch, playDiscordNameIntro } from './modules/effects.js?v=9.3';
import { initCardTilt, resetTilt, initTabs, initEasterEggs } from './modules/card.js?v=9.3';
import { initAudio, loadYouTubePlaylist, loadYouTubeAPI, tickVisualizer, bgmPlayer, initAudioContext } from './modules/audio.js?v=9.7';
import { initLanyard } from './modules/lanyard.js?v=9.7';
import { initMessageForm } from './modules/message.js?v=9.3';

// --- Entry Screen Handler ---
const entryScreen = document.getElementById('entry');
const mainContent = document.getElementById('main');

if (entryScreen) {
    const enterSite = (x, y) => {
        if (entryScreen.classList.contains('hidden')) return;
        entryScreen.classList.add('hidden');
        if (mainContent) mainContent.classList.remove('hidden');
        if (bgmPlayer) bgmPlayer.classList.add('visible', 'playing');
        createSparkles(x, y);

        initAudioContext();
        playDiscordNameIntro();

        const ytListId = cfg.youtubePlaylistId || 'PLsDvPWj1sLN61RtOJQyXQowMt7rAo4nYd';
        if (ytListId) {
            loadYouTubePlaylist(ytListId, true);
        }
    };
    entryScreen.addEventListener('click', (e) => enterSite(e.clientX, e.clientY));
    entryScreen.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            enterSite(window.innerWidth / 2, window.innerHeight / 2);
        }
    });
}

// --- Battery-friendly Animation Loop with Visibility & Focus Control ---
let animationFrameId = null;
let isLoopRunning = false;

function mainLoop() {
    if (document.hidden || isMobile) {
        isLoopRunning = false;
        animationFrameId = null;
        return;
    }
    animationFrameId = requestAnimationFrame(mainLoop);
    isLoopRunning = true;

    tickVisualizer();
    tickSakura();
    tickSparkles();
    if (!isTouch) tickCursor();
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        isLoopRunning = false;
        resetTilt();
    } else {
        if (!isLoopRunning) {
            isLoopRunning = true;
            animationFrameId = requestAnimationFrame(mainLoop);
        }
    }
});

window.addEventListener('focus', () => {
    if (!isLoopRunning && !document.hidden) {
        isLoopRunning = true;
        animationFrameId = requestAnimationFrame(mainLoop);
    }
});

// Disable pinch-zoom on mobile (keep clicks for avatar easter egg)
if (isMobile) {
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });
}
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        resetTilt();
        const card = document.getElementById('card');
        if (card && isMobile) card.style.transform = '';
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => { document.body.style.overflow = ''; });
    });
}
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        resetTilt();
        const card = document.getElementById('card');
        if (card) card.style.transform = '';
    }, 300);
});

// --- View Counter (local, replaces counterapi.dev v1) ---
function initViewCounter() {
    const el = document.getElementById('view-count');
    if (!el) return;
    // Use sessionStorage to avoid double-count on SPA reload, but count once per tab
    const hasCounted = sessionStorage.getItem('view_counted');
    const endpoint = hasCounted ? '/api/views' : '/api/views/up';
    fetch(endpoint, { method: hasCounted ? 'GET' : 'POST' })
        .then(r => r.json())
        .then(d => {
            if (typeof d.count === 'number') {
                el.textContent = d.count.toLocaleString('en-US');
                if (!hasCounted) sessionStorage.setItem('view_counted', '1');
            }
        })
        .catch(() => {});
}

// Fallback cho Safari <15.4 không hỗ trợ :has() - thêm class để padding BGM không che
if (!CSS.supports('selector(:has(*))')) {
    const mc = document.querySelector('.main-content');
    const bgm = document.querySelector('.bgm-player.separated-player');
    if (mc && bgm) mc.classList.add('with-fixed-bgm');
}

// --- Initialize All Modules (idempotent, prevents double sound) ---
let __profileInitDone = false;
function initAll() {
    if (__profileInitDone) return;
    __profileInitDone = true;
    applyConfig();
    // Reveal entry play icon only after core is ready (avoid flash before load)
    const entryIcon = document.getElementById('entry-play-icon');
    if (entryIcon) entryIcon.classList.remove('hidden');
    initLiveClock();
    initThemeSwitcher();
    // Heavy effects: disable on mobile to save GPU/battery
    if (!isMobile) {
        initCursor();
        initCanvas();
        initCardTilt();
    } else {
        const c = document.getElementById('mouse-canvas');
        if (c) c.style.display = 'none';
        // Ensure tilt is reset and not running on mobile
        resetTilt();
    }
    initTextScramble();
    initTabs();
    initEasterEggs();
    initAudio();
    initLanyard();
    initMessageForm();
    initViewCounter();
    mainLoop();
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
} else {
    initAll();
}
