// ==========================================
// CARD MODULE: 3D Tilt, Gyroscope, Tabs, Easter Eggs
// ==========================================

import { createSparkles, isTouch } from './effects.js';
import { showToast } from './core.js';

const card = document.getElementById('card');
const container = document.querySelector('.cards-container') || card?.parentElement;
const cardBorder = document.querySelector('.card-border');
const hologramGlare = document.getElementById('hologram-glare');

let targetTiltX = 0, targetTiltY = 0;
let currentTiltX = 0, currentTiltY = 0;

export function initCardTilt() {
    if (!card || !container) return;

    // Desktop Mouse Move Tilt
    container.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        targetTiltX = ((y - centerY) / centerY) * -8;
        targetTiltY = ((x - centerX) / centerX) * 8;

        if (hologramGlare) {
            const px = (x / rect.width) * 100;
            const py = (y / rect.height) * 100;
            hologramGlare.style.setProperty('--glare-x', `${px}%`);
            hologramGlare.style.setProperty('--glare-y', `${py}%`);
            hologramGlare.style.opacity = '1';
        }
    });

    container.addEventListener('mouseleave', resetTilt);
    window.addEventListener('blur', resetTilt);

    function renderCardTilt() {
        requestAnimationFrame(renderCardTilt);
        if (document.hidden) return;
        currentTiltX += (targetTiltX - currentTiltX) * 0.12;
        currentTiltY += (targetTiltY - currentTiltY) * 0.12;
        card.style.transform = `rotateX(${currentTiltX.toFixed(2)}deg) rotateY(${currentTiltY.toFixed(2)}deg)`;
    }
    renderCardTilt();
}

export function resetTilt() {
    targetTiltX = 0;
    targetTiltY = 0;
    if (hologramGlare) hologramGlare.style.opacity = '0';
}

// --- Tab Switching ---
let tabsInitialized = false;
export function initTabs() {
    if (tabsInitialized) return;
    tabsInitialized = true;
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    // Mobile: shorten labels so 3 buttons fit (XS Max 375px)
    const isMobileTab = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 768;
    if (isMobileTab) {
        const short = { 'tab-profile': 'Bio', 'tab-setup': 'Games', 'tab-message': 'Message' };
        tabBtns.forEach(btn => {
            const target = btn.getAttribute('data-tab');
            if (short[target]) {
                const icon = btn.querySelector('i');
                const iconHTML = icon ? icon.outerHTML : '';
                btn.innerHTML = `${iconHTML} ${short[target]}`;
            }
        });
    }

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const activePane = document.getElementById(target);
            if (activePane) activePane.classList.add('active');
            playTabSound();
        });
    });

    // Mobile swipe to switch tabs (slide) — ignore when dragging games carousel
    const swipeArea = document.querySelector('.card-inner') || document.getElementById('tab-profile')?.parentElement;
    if (swipeArea) {
        let startX = 0, startY = 0, isSwiping = false;
        swipeArea.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            if (e.target.closest('input, textarea, select, .bgm-player, .volume-slider, .timeline-slider, #bgm-volume, #bgm-progress-slider, .rotation-games-grid, .fav-game-card')) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isSwiping = false;
        }, { passive: true });
        swipeArea.addEventListener('touchmove', (e) => {
            if (!startX) return;
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy) * 1.4) isSwiping = true;
        }, { passive: true });
        swipeArea.addEventListener('touchend', (e) => {
            if (!isSwiping) { startX = 0; return; }
            const dx = e.changedTouches[0].clientX - startX;
            if (Math.abs(dx) > 60) {
                const tabs = Array.from(document.querySelectorAll('.tab-btn'));
                const activeIdx = tabs.findIndex(b => b.classList.contains('active'));
                let nextIdx = dx < 0 ? activeIdx + 1 : activeIdx - 1;
                if (nextIdx < 0) nextIdx = tabs.length - 1;
                if (nextIdx >= tabs.length) nextIdx = 0;
                tabs[nextIdx]?.click();
                // Slide feedback
                const pane = document.getElementById(tabs[nextIdx].getAttribute('data-tab'));
                if (pane) {
                    pane.style.transform = `translateX(${dx < 0 ? '18px' : '-18px'})`;
                    pane.style.opacity = '0.6';
                    requestAnimationFrame(() => {
                        pane.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
                        pane.style.transform = 'translateX(0)';
                        pane.style.opacity = '1';
                        setTimeout(() => { pane.style.transition = ''; pane.style.transform = ''; pane.style.opacity = ''; }, 260);
                    });
                }
            }
            startX = 0; isSwiping = false;
        }, { passive: true });
    }
}

let tabAudioCtx = null;
function getTabAudioCtx() {
    if (tabAudioCtx && tabAudioCtx.state !== 'closed') return tabAudioCtx;
    try {
        tabAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) { tabAudioCtx = null; }
    return tabAudioCtx;
}
function playTabSound() {
    try {
        const audioCtx = getTabAudioCtx();
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
        osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch(e) {} };
    } catch(e) {}
}

// --- Easter Eggs ---
let easterEggsInitialized = false;
export function initEasterEggs() {
    if (easterEggsInitialized) return;
    easterEggsInitialized = true;
    const avatarWrapper = document.getElementById('avatar-wrapper');
    let avatarClicks = 0;
    let avatarResetTimer = null;
    if (avatarWrapper) {
        avatarWrapper.addEventListener('click', (e) => {
            avatarClicks++;
            createSparkles(e.clientX, e.clientY);
            avatarWrapper.classList.remove('wobble');
            void avatarWrapper.offsetWidth;
            avatarWrapper.classList.add('wobble');
            setTimeout(() => avatarWrapper.classList.remove('wobble'), 500);

            // Reset if idle >2s, so 5 rapid clicks required (fixes double-listener skip bug)
            clearTimeout(avatarResetTimer);
            avatarResetTimer = setTimeout(() => { avatarClicks = 0; }, 2000);

            if (avatarClicks >= 5) {
                avatarClicks = 0;
                clearTimeout(avatarResetTimer);
                showToast("✨ You have unlocked Ultimate Magic Mode!");
                if (cardBorder) cardBorder.classList.add('rainbow-rave');
            }
        });
    }

    const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let konamiIndex = 0;
    window.addEventListener('keydown', (e) => {
        if (e.key === konamiCode[konamiIndex]) {
            konamiIndex++;
            if (konamiIndex === konamiCode.length) {
                konamiIndex = 0;
                showToast("🎮 KONAMI CODE UNLOCKED! RAVE MODE ACTIVATED! 🌈");
                if (cardBorder) cardBorder.classList.add('rainbow-rave');
                for (let i = 0; i < 40; i++) {
                    setTimeout(() => {
                        createSparkles(window.innerWidth / 2 + (Math.random() * 300 - 150), window.innerHeight / 2 + (Math.random() * 300 - 150));
                    }, i * 40);
                }
            }
        } else {
            konamiIndex = 0;
        }
    });
}
