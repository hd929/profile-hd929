// ==========================================
// EFFECTS MODULE: Cursor, Particles, Sparkles, Text Scramble
// ==========================================

import { cfg } from './core.js';

// --- Custom Cursor ---
const cursorDot = document.getElementById('cursor-dot');
const cursorRing = document.getElementById('cursor-ring');
export const isMobile = window.matchMedia('(pointer: coarse)').matches;
export const isTouch = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0 && !window.matchMedia('(pointer: fine)').matches);
const shouldUseCustomCursor = !isTouch && !!cursorDot && !!cursorRing;

let mouseX = -100, mouseY = -100;
let ringX = -100, ringY = -100;
let hasMoved = false;

export function initCursor() {
    if (!shouldUseCustomCursor) return;

    const showCursor = () => {
        if (!hasMoved) {
            hasMoved = true;
            cursorDot.style.opacity = '1';
            cursorRing.style.opacity = '1';
        }
    };

    window.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        showCursor();
        document.body.classList.remove('cursor-hidden');
        document.body.classList.add('cursor-visible');
    }, { passive: true });

    const cursorHoverSelector = 'a, button, input, textarea, select, .social-icon, .tab-btn, .fav-game-card, .rot-game-card, .gear-item, .tag-badge, .clickable, #avatar-wrapper, [data-copy]';
    document.addEventListener('mouseover', (e) => {
        if (e.target.closest(cursorHoverSelector)) {
            if (cursorRing) cursorRing.classList.add('cursor-hover');
        }
    });
    document.addEventListener('mouseout', (e) => {
        if (e.target.closest(cursorHoverSelector)) {
            const related = e.relatedTarget;
            if (!related || !related.closest || !related.closest(cursorHoverSelector)) {
                if (cursorRing) cursorRing.classList.remove('cursor-hover');
            }
        }
    });
    document.addEventListener('mouseleave', () => {
        document.body.classList.add('cursor-hidden');
        document.body.classList.remove('cursor-visible');
        if (cursorRing) cursorRing.classList.remove('cursor-hover');
    });
    document.addEventListener('mouseenter', () => {
        if (hasMoved) {
            document.body.classList.remove('cursor-hidden');
            document.body.classList.add('cursor-visible');
        }
    });
}

export function tickCursor() {
    if (!shouldUseCustomCursor || !cursorDot || !cursorRing || mouseX < 0 || document.hidden) return;
    cursorDot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
    ringX += (mouseX - ringX) * 0.18;
    ringY += (mouseY - ringY) * 0.18;
    cursorRing.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
}

// --- Canvas Particles: Sakura & Stardust ---
const canvas = document.getElementById('mouse-canvas');
const ctx = canvas ? canvas.getContext('2d', { alpha: true }) : null;

let sakuraArray = [];
let stardustArray = [];

function Stardust() {
    this.x = Math.random() * (canvas ? canvas.width : window.innerWidth);
    this.y = Math.random() * (canvas ? canvas.height : window.innerHeight);
    this.size = Math.random() * 2 + 1;
    this.vx = Math.random() * 0.4 - 0.2;
    this.vy = Math.random() * 0.4 - 0.2;
    this.alpha = Math.random() * 0.6 + 0.2;
    this.alphaSpeed = Math.random() * 0.015 + 0.005;
    const colors = ['#cba6f7', '#74c7ec', '#f5c2e7', '#a6e3a1', '#ffffff'];
    this.color = colors[Math.floor(Math.random() * colors.length)];
}

Stardust.prototype.update = function() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha += this.alphaSpeed;
    if (this.alpha >= 0.8 || this.alpha <= 0.2) this.alphaSpeed = -this.alphaSpeed;
    if (this.x < 0) this.x = canvas.width;
    if (this.x > canvas.width) this.x = 0;
    if (this.y < 0) this.y = canvas.height;
    if (this.y > canvas.height) this.y = 0;
};

Stardust.prototype.draw = function() {
    if (!ctx) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
};

function Sakura() {
    this.x = Math.random() * (canvas ? canvas.width : window.innerWidth);
    this.y = Math.random() * (canvas ? canvas.height : window.innerHeight) - 100;
    this.size = Math.random() * 2.5 + 2;
    this.speedY = Math.random() * 0.8 + 0.4;
    this.speedX = Math.random() * 1.5 - 0.75;
    this.angle = Math.random() * 360;
    this.spin = Math.random() * 0.04 - 0.02;
    const colors = ['#f38ba8', '#f5c2e7', '#ffffff'];
    this.color = colors[Math.floor(Math.random() * colors.length)];
}

Sakura.prototype.update = function() {
    this.y += this.speedY;
    this.x += this.speedX + Math.sin(this.angle) * 0.4;
    this.angle += this.spin;
    if (this.y > canvas.height) {
        this.y = -10;
        this.x = Math.random() * canvas.width;
    }
};

Sakura.prototype.draw = function() {
    if (!ctx) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = this.color;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-this.size, -this.size, -this.size, this.size, 0, this.size);
    ctx.bezierCurveTo(this.size, this.size, this.size, -this.size, 0, 0);
    ctx.fill();
    ctx.restore();
};

export function initCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const isSmall = window.innerWidth <= 768;
    const sakuraCount = isSmall ? 14 : 24;
    const stardustCount = isSmall ? 10 : 16;

    sakuraArray = [];
    stardustArray = [];
    for (let i = 0; i < sakuraCount; i++) sakuraArray.push(new Sakura());
    for (let i = 0; i < stardustCount; i++) stardustArray.push(new Stardust());

    window.addEventListener('resize', () => {
        if (canvas) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
    });
}

export function tickSakura() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < stardustArray.length; i++) {
        stardustArray[i].update();
        stardustArray[i].draw();
    }
    for (let i = 0; i < sakuraArray.length; i++) {
        sakuraArray[i].update();
        sakuraArray[i].draw();
    }
}

// --- Click Sparkles ---
let sparkleArray = [];
class Sparkle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.size = Math.random() * 3 + 2;
        this.alpha = 1;
        this.decay = Math.random() * 0.03 + 0.02;
        const colors = ['#cba6f7', '#b4befe', '#74c7ec', '#f5c2e7', '#ffffff'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.08;
        this.alpha -= this.decay;
        this.size *= 0.95;
    }
    draw() {
        if (!ctx) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.5, this.size), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

export function createSparkles(x, y) {
    if (!x || !y) return;
    const count = isTouch ? 8 : 16;
    for (let i = 0; i < count; i++) {
        sparkleArray.push(new Sparkle(x, y));
    }
}

// Discord-style display name intro: Ajitana -> Aji - H (scramble)
export function playDiscordNameIntro() {
    const nameEl = document.getElementById('name-text');
    if (!nameEl) return;
    const final = (typeof CONFIG !== 'undefined' && CONFIG.displayName) ? CONFIG.displayName : 'Aji - H';
    // Show final directly (no Ajitana intermediate) — keep icon stable
    nameEl.textContent = final;
}

// Global click/tap sparkles
window.addEventListener('click', (e) => {
    createSparkles(e.clientX, e.clientY);
});
window.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches[0]) {
        createSparkles(e.touches[0].clientX, e.touches[0].clientY);
    }
}, { passive: true });

export function tickSparkles() {
    if (!ctx) return;
    for (let i = sparkleArray.length - 1; i >= 0; i--) {
        sparkleArray[i].update();
        sparkleArray[i].draw();
        if (sparkleArray[i].alpha <= 0 || sparkleArray[i].size <= 0.5) {
            sparkleArray.splice(i, 1);
        }
    }
}

// --- Hacker Text Scramble Effect ---
export function initTextScramble() {
    const quotes = Array.isArray(cfg.quotes) && cfg.quotes.length > 0 ? cfg.quotes : [
        "reality is an illusion.",
        "system breach detected...",
        "i'm done overthinking.",
        "404 not found.",
        "access denied.",
        "terminal // offline",
        "too much love will kill you."
    ];
    const scrambleEl = document.getElementById('scramble-text');
    if (!scrambleEl) return;

    let quoteIndex = 0;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*";
    
    function scrambleTo(newText) {
        let iteration = 0;
        const interval = setInterval(() => {
            scrambleEl.innerText = newText.split("").map((char, index) => {
                if (index < iteration) return newText[index];
                if (char === " ") return " ";
                return letters[Math.floor(Math.random() * letters.length)];
            }).join("");

            if (iteration >= newText.length) clearInterval(interval);
            iteration += 1 / 2;
        }, 30);
    }

    scrambleTo(quotes[0]);
    setInterval(() => {
        quoteIndex = (quoteIndex + 1) % quotes.length;
        scrambleTo(quotes[quoteIndex]);
    }, 7000);
}
