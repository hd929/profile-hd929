// ==========================================
// MAIN ENTRY POINT: Orchestrates all modules
// ==========================================

import { cfg, applyConfig, initLiveClock, initThemeSwitcher } from './modules/core.js';
import { initCursor, tickCursor, initCanvas, tickSakura, createSparkles, tickSparkles, initTextScramble, isMobile, isTouch, playDiscordNameIntro } from './modules/effects.js';
import { initCardTilt, resetTilt, initTabs, initEasterEggs } from './modules/card.js';
import { initAudio, loadYouTubePlaylist, loadYouTubeAPI, tickVisualizer, bgmPlayer, initAudioContext } from './modules/audio.js';
import { initLanyard } from './modules/lanyard.js';
import { initMessageForm } from './modules/message.js';

// --- Entry Screen Handler ---
const entryScreen = document.getElementById('entry');
const mainContent = document.getElementById('main');

if (entryScreen) {
    entryScreen.addEventListener('click', (e) => {
        entryScreen.classList.add('hidden');
        if (mainContent) mainContent.classList.remove('hidden');
        if (bgmPlayer) bgmPlayer.classList.add('visible', 'playing');
        createSparkles(e.clientX, e.clientY);
        
        initAudioContext();
        playDiscordNameIntro();
        
        const ytListId = cfg.youtubePlaylistId || 'PLsDvPWj1sLN61RtOJQyXQowMt7rAo4nYd';
        if (ytListId) {
            loadYouTubePlaylist(ytListId, true);
        }
    });
}

// --- Battery-friendly Animation Loop with Visibility & Focus Control ---
let animationFrameId = null;
let isLoopRunning = false;

let lastMobileTick = 0;
function mainLoop() {
    if (document.hidden) {
        isLoopRunning = false;
        animationFrameId = null;
        return;
    }
    animationFrameId = requestAnimationFrame(mainLoop);
    isLoopRunning = true;
    
    // Mobile: skip heavy canvas work & throttle to ~20fps to save battery (XS Max)
    if (isMobile) {
        const now = performance.now();
        if (now - lastMobileTick < 50) return; // ~20fps on mobile vs 60fps desktop
        lastMobileTick = now;
        // Skip visualizer/sakura entirely on mobile; sparkles at reduced rate
        if (Math.random() < 0.5) tickSparkles(); // half rate
    } else {
        tickVisualizer();
        tickSakura();
        tickSparkles();
        if (!isTouch) tickCursor();
    }
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
