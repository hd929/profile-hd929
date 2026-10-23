// ==========================================
// LANYARD MODULE: Discord Live Presence & Spotify
// ==========================================

import { DISCORD_ID, cfg, formatTime } from './core.js';
import { playYouTubeTrack } from './audio.js';

const statusColors = { online: '#a6da95', idle: '#f9e2af', dnd: '#f38ba8', offline: '#a6adc8' };

export async function initLanyard() {
    try {
        const res = await fetch(`https://api.lanyard.rest/v1/users/${DISCORD_ID}`);
        const json = await res.json();
        if (json.success) {
            updatePresence(json.data);
            connectWS();
        } else {
            handleLanyardFallback();
            connectWS();
        }
    } catch (e) {
        console.warn("Lanyard init failed, using fallback:", e);
        handleLanyardFallback();
        setTimeout(connectWS, 5000);
    }
}

function handleLanyardFallback() {
    const avatarEl = document.getElementById('avatar');
    const discordAvatarEl = document.getElementById('discord-avatar');
    const nameEl = document.getElementById('discord-global-name');
    const customStatusEl = document.getElementById('discord-custom-status');

    if (avatarEl && (!avatarEl.src || avatarEl.src.includes('embed/avatars'))) {
        avatarEl.src = `https://dcdn.dstn.to/avatars/${DISCORD_ID}?size=256`;
        avatarEl.onerror = () => { avatarEl.src = 'https://cdn.discordapp.com/embed/avatars/0.png'; };
    }
    if (discordAvatarEl) {
        discordAvatarEl.classList.remove('skeleton');
        discordAvatarEl.src = `https://dcdn.dstn.to/avatars/${DISCORD_ID}?size=128`;
        discordAvatarEl.onerror = () => { discordAvatarEl.src = 'https://cdn.discordapp.com/embed/avatars/0.png'; };
    }
    if (nameEl) {
        nameEl.classList.remove('skeleton');
        nameEl.style.width = 'auto';
        nameEl.style.height = 'auto';
        nameEl.innerHTML = `${cfg.displayName || 'Aji'} <span class="presence-status">OFFLINE</span>`;
    }
    if (customStatusEl) {
        customStatusEl.classList.remove('skeleton');
        customStatusEl.style.width = 'auto';
        customStatusEl.style.height = 'auto';
        customStatusEl.textContent = 'Offline';
    }
}

let _lanyardWS = null;
let _lanyardHB = null;
function connectWS() {
    if (_lanyardWS && (_lanyardWS.readyState === WebSocket.OPEN || _lanyardWS.readyState === WebSocket.CONNECTING)) return;
    try {
        const ws = new WebSocket('wss://api.lanyard.rest/socket');
        _lanyardWS = ws;
        ws.onopen = () => ws.send(JSON.stringify({ op: 2, d: { subscribe_to_id: DISCORD_ID } }));
        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.op === 1) {
                    if (_lanyardHB) clearInterval(_lanyardHB);
                    _lanyardHB = setInterval(() => { try { ws.send(JSON.stringify({ op: 3 })); } catch {} }, msg.d.heartbeat_interval);
                }
                if (msg.t === 'INIT_STATE' || msg.t === 'PRESENCE_UPDATE') updatePresence(msg.d);
            } catch (err) {}
        };
        ws.onclose = () => { if (_lanyardHB) clearInterval(_lanyardHB); _lanyardHB = null; _lanyardWS = null; setTimeout(connectWS, 5000); };
        ws.onerror = () => { try { ws.close(); } catch {} };
    } catch(err) {
        _lanyardWS = null;
        setTimeout(connectWS, 10000);
    }
}
// iPhone Safari: khi app background rồi foreground lại, WS hay bị treo, cần refetch + reconnect
let _lastFetch = 0;
async function refreshPresence() {
    // tránh spam khi chuyển tab liên tục
    if (Date.now() - _lastFetch < 3000) return;
    _lastFetch = Date.now();
    try {
        const res = await fetch(`https://api.lanyard.rest/v1/users/${DISCORD_ID}`, { cache: 'no-store' });
        const json = await res.json();
        if (json.success && json.data) updatePresence(json.data);
    } catch {}
    // Nếu WS đóng hoặc không còn heartbeat, reconnect
    if (!_lanyardWS || _lanyardWS.readyState === WebSocket.CLOSED || _lanyardWS.readyState === WebSocket.CLOSING) {
        connectWS();
    } else if (_lanyardWS.readyState === WebSocket.OPEN) {
        // WS vẫn mở nhưng có thể treo, gửi ping nhẹ, nếu không phản hồi sẽ tự reconnect ở lần sau
        try { _lanyardWS.send(JSON.stringify({ op: 3 })); } catch { connectWS(); }
    }
}
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshPresence();
});
window.addEventListener('pageshow', (e) => {
    if (e.persisted || document.visibilityState === 'visible') refreshPresence();
});
window.addEventListener('focus', refreshPresence);

export function updatePresence(d) {
    if (!d?.discord_user) return;
    const u = d.discord_user;

    const activityCard = document.getElementById('activity-card-container');
    const infoBox = document.querySelector('.activity-box');

    if (activityCard) activityCard.classList.add('fade-transition');
    if (infoBox) infoBox.classList.add('fade-transition');

    setTimeout(() => {
        // Avatar
        const av = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256` : `https://cdn.discordapp.com/embed/avatars/0.png`;
        const avatarEl = document.getElementById('avatar');
        const discordAvatarEl = document.getElementById('discord-avatar');
        if (avatarEl) avatarEl.src = av;
        if (discordAvatarEl) discordAvatarEl.src = av;

        // Avatar Decoration
        const avatarDecoEl = document.getElementById('avatar-decoration');
        const discordAvatarDecoEl = document.getElementById('discord-avatar-decoration');
        const decoAsset = u.avatar_decoration_data?.asset || (cfg.avatarDecorationUrl ? 'config' : null);
        if (decoAsset) {
            const decoSrc = u.avatar_decoration_data?.asset
                ? `https://cdn.discordapp.com/avatar-decoration-presets/${u.avatar_decoration_data.asset}.png?size=256&passthrough=true`
                : cfg.avatarDecorationUrl;
            
            if (avatarDecoEl) {
                avatarDecoEl.src = decoSrc;
                avatarDecoEl.classList.remove('hidden');
            }
            if (discordAvatarDecoEl) {
                discordAvatarDecoEl.src = decoSrc;
                discordAvatarDecoEl.classList.remove('hidden');
            }
        }

        // Display Name & Global Name
        const nameTextEl = document.getElementById('name-text');
        if (nameTextEl) {
            nameTextEl.textContent = u.global_name || u.display_name || cfg.displayName || u.username;
        }

        // Status Dot & Text
        const s = d.discord_status || 'offline';
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('discord-status-text');
        if (statusDot) statusDot.style.backgroundColor = statusColors[s] || statusColors.offline;
        if (statusText) {
            statusText.textContent = s.toUpperCase();
            statusText.style.color = statusColors[s] || statusColors.offline;
        }

        const globalNameEl = document.getElementById('discord-global-name');
        if (globalNameEl) {
            const globalName = u.global_name || u.display_name || cfg.displayName || u.username;
            const statusLabel = s.toUpperCase();
            const existingStatusSpan = globalNameEl.querySelector('.presence-status');
            if (existingStatusSpan) {
                existingStatusSpan.textContent = statusLabel;
                existingStatusSpan.style.color = statusColors[s] || statusColors.offline;
                existingStatusSpan.style.background = `${statusColors[s] || statusColors.offline}22`;
                // Update the name text (first text node)
                const nameNode = globalNameEl.firstChild;
                if (nameNode && nameNode.nodeType === Node.TEXT_NODE) nameNode.textContent = globalName + ' ';
                else globalNameEl.insertBefore(document.createTextNode(globalName + ' '), existingStatusSpan);
            } else {
                globalNameEl.textContent = globalName + ' ';
                const statusSpan = document.createElement('span');
                statusSpan.className = 'presence-status';
                statusSpan.textContent = statusLabel;
                globalNameEl.appendChild(statusSpan);
            }
        }

        // Remove all skeleton loader classes
        document.querySelectorAll('.skeleton').forEach(el => {
            el.classList.remove('skeleton');
            if (el.tagName !== 'IMG') {
                el.style.width = 'auto';
                el.style.height = 'auto';
            }
        });

        // Custom Status (Type 4)
        const cs = d.activities?.find(a => a.type === 4);
        const customStatusEl = document.getElementById('discord-custom-status');
        if (customStatusEl) {
            if (cs) {
                let html = '';
                if (cs.emoji) {
                    if (cs.emoji.id) {
                        const ext = cs.emoji.animated ? 'gif' : 'webp';
                        html += `<img src="https://cdn.discordapp.com/emojis/${cs.emoji.id}.${ext}?size=48&quality=lossless" class="custom-status-emoji" alt="${cs.emoji.name}"> `;
                    } else if (cs.emoji.name) {
                        html += cs.emoji.name + ' ';
                    }
                }
                if (cs.state) {
                    const textSpan = document.createElement('span');
                    textSpan.textContent = cs.state;
                    html += textSpan.innerHTML;
                }
                customStatusEl.innerHTML = html || "Just chilling.";
            } else {
                customStatusEl.textContent = "Just chilling.";
            }
        }

        // Speech Bubble Status beside avatar
        const speechBubbleEl = document.getElementById('status-speech-bubble');
        const speechBubbleText = document.getElementById('speech-bubble-text');
        if (speechBubbleEl && speechBubbleText) {
            if (cs && (cs.state || cs.emoji)) {
                speechBubbleText.textContent = cs.state || cs.emoji?.name || '';
                speechBubbleEl.classList.remove('hidden');
            } else {
                speechBubbleEl.classList.add('hidden');
            }
        }

        // Discord Collectible Nameplate Effect (only on Activity box, not on Mirai banner)
        const nameplateData = u.collectibles?.nameplate;
        const npVideo = document.getElementById('nameplate-video');
        const npImg = document.getElementById('nameplate-img');
        const npEffect = document.getElementById('nameplate-effect');

        if (nameplateData && nameplateData.sku_id) {
            const videoUrl = `https://cdn.discordapp.com/media/v1/collectibles-shop/${nameplateData.sku_id}/video.webm`;
            const staticUrl = `https://cdn.discordapp.com/media/v1/collectibles-shop/${nameplateData.sku_id}/static`;
            
            // Mobile Safari: dùng static để tránh lỗi autoplay/video, desktop dùng video
            const isMobileNameplate = window.matchMedia('(pointer: coarse)').matches;
            // Set Activity Box Nameplate only
            if (npVideo && npVideo.dataset.currentSku !== nameplateData.sku_id) {
                npVideo.dataset.currentSku = nameplateData.sku_id;
                if (isMobileNameplate) {
                    // mobile: hiện static, ẩn video để tránh lỗi Safari
                    if (npVideo) npVideo.classList.add('hidden');
                    if (npImg) {
                        npImg.src = staticUrl;
                        npImg.classList.remove('hidden');
                        npImg.onerror = () => npEffect?.classList.add('hidden');
                    }
                    if (npEffect) npEffect.classList.remove('hidden');
                } else {
                    npVideo.src = videoUrl;
                    npVideo.classList.remove('hidden');
                    if (npImg) npImg.classList.add('hidden');
                    if (npEffect) npEffect.classList.remove('hidden');

                    npVideo.onerror = () => {
                        npVideo.classList.add('hidden');
                        if (npImg) {
                            npImg.src = staticUrl;
                            npImg.classList.remove('hidden');
                            npImg.onerror = () => npEffect?.classList.add('hidden');
                        }
                    };
                    const p2 = npVideo.play();
                    if (p2 !== undefined) p2.catch(() => {});
                }
            }
        } else {
            if (npEffect) npEffect.classList.add('hidden');
            if (npVideo) {
                npVideo.src = '';
                npVideo.dataset.currentSku = '';
            }
        }

        // Multiple Activities - show all simultaneously
        const acts = d.activities || [];
        if (window.spotifyInterval) clearInterval(window.spotifyInterval);
        if (window.rpInterval) clearInterval(window.rpInterval);

        // Listening activity = real Spotify (d.spotify) OR a type-2 music activity
        const listAct = d.spotify ? { source: 'spotify', data: d.spotify } : (acts.find(a => a.type === 2) ? { source: 'activity', data: acts.find(a => a.type === 2) } : null);
        // Game activity = type 0 (actual game). Other types (1 streaming, 3 watching, 5 competing) also show via game box.
        const gameAct = acts.find(a => a.type === 0);
        const otherAct = acts.find(a => a.type === 1 || a.type === 3 || a.type === 5);
        const mainAct = gameAct || otherAct;

        const listeningEl = document.getElementById('spotify-box');
        const gameEl = document.getElementById('game-box');

        const hasListening = !!listAct && !!listeningEl;
        const hasGame = !!mainAct && !!gameEl;

        if (hasListening || hasGame) {
            if (activityCard) activityCard.classList.remove('hidden');
        } else {
            if (activityCard) activityCard.classList.add('hidden');
        }

        // --- Listening Box (Spotify / YouTube Music / etc.) ---
        if (hasListening) {
            listeningEl.classList.remove('hidden');
            const src = listAct.source;
            const act = listAct.data;
            const art = document.getElementById('sp-art');
            const song = document.getElementById('sp-song');
            const artist = document.getElementById('sp-artist');
            const fill = document.getElementById('sp-progress-fill');
            const cur = document.getElementById('sp-time-current');
            const tot = document.getElementById('sp-time-total');
            const header = document.getElementById('sp-header');
            const disc = listeningEl.querySelector('.spinning-disc');
            const progress = listeningEl.querySelector('.music-progress');
            const progBar = listeningEl.querySelector('.progress-bar');

            if (src === 'spotify') {
                if (header) header.innerHTML = '<i class="fa-brands fa-spotify"></i> LISTENING TO SPOTIFY';
                if (art) {
                    art.src = act.album_art_url;
                    art.style.visibility = 'visible';
                    art.onerror = null;
                }
                if (song) song.textContent = act.song;
                if (artist) artist.textContent = act.artist;
                // Buttons: View Album (external) + Listen Along (play via BGM via YouTube search fallback)
                const btnContainer = document.getElementById('spotify-buttons');
                const viewBtn = document.getElementById('spotify-view-btn');
                const listenBtn = document.getElementById('spotify-listen-btn');
                if (btnContainer && viewBtn) {
                    const trackId = act.track_id;
                    if (trackId) {
                        viewBtn.href = `https://open.spotify.com/track/${trackId}`;
                        viewBtn.textContent = 'View Album';
                        viewBtn.innerHTML = `<i class="fa-brands fa-spotify"></i> View Album`;
                        viewBtn.classList.remove('hidden');
                        viewBtn.onclick = null;
                        btnContainer.classList.remove('hidden');
                    } else {
                        viewBtn.classList.add('hidden');
                    }
                    if (listenBtn) {
                        if (trackId) {
                            listenBtn.href = `https://open.spotify.com/track/${trackId}`;
                            listenBtn.innerHTML = `<i class="fa-solid fa-headphones"></i> Listen Along`;
                            listenBtn.classList.remove('hidden');
                            // Try to play via BGM by searching YouTube is not implemented, so keep external for now
                            listenBtn.onclick = null;
                        } else {
                            listenBtn.classList.add('hidden');
                        }
                    }
                    if (btnContainer && viewBtn.classList.contains('hidden') && listenBtn.classList.contains('hidden')) {
                        btnContainer.classList.add('hidden');
                    }
                }
            } else {
                const actName = (act.name || "").toLowerCase();
                if (header) {
                    header.innerHTML = actName.includes('youtube') || actName.includes('youtube music') || actName.includes('yt music')
                        ? '<i class="fa-brands fa-youtube" style="color: #ff0000;"></i> LISTENING TO YOUTUBE MUSIC'
                        : '<i class="fa-solid fa-music"></i> LISTENING TO MUSIC';
                }
                if (art && act.assets?.large_image) {
                    let assetId = act.assets.large_image;
                    art.src = assetId.startsWith('mp:external/')
                        ? `https://media.discordapp.net/external/${assetId.replace('mp:external/', '')}`
                        : `https://cdn.discordapp.com/app-assets/${act.application_id}/${assetId}.png`;
                    art.onerror = function() { this.style.visibility = 'hidden'; };
                } else if (art) {
                    art.style.visibility = 'hidden';
                }
                if (song) song.textContent = act.details || act.name || "Unknown";
                if (artist) artist.textContent = act.state || "";
                // Buttons for YouTube Music / generic music - Listen Along dùng BGM để phát luôn
                const btnContainer2 = document.getElementById('spotify-buttons');
                const viewBtn2 = document.getElementById('spotify-view-btn');
                const listenBtn2 = document.getElementById('spotify-listen-btn');
                const escapeHtml = (unsafe) => (unsafe || '').toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
                if (btnContainer2) {
                    // Extract YouTube videoId from details_url/state_url if present
                    const ytUrl = act.details_url || act.state_url || '';
                    let ytId = null;
                    try {
                        const u = new URL(ytUrl);
                        ytId = u.searchParams.get('v');
                        if (!ytId && ytUrl.includes('youtu.be/')) ytId = ytUrl.split('youtu.be/')[1]?.split(/[?&]/)[0];
                    } catch {}
                    // View button -> external album/artist page
                    if (viewBtn2) {
                        const viewUrl = act.state_url || act.details_url;
                        if (viewUrl) {
                            viewBtn2.href = viewUrl;
                            viewBtn2.innerHTML = `<i class="fa-solid fa-external-link"></i> ${escapeHtml(act.buttons?.[1] || 'View Artist')}`;
                            viewBtn2.classList.remove('hidden');
                            viewBtn2.onclick = null;
                        } else {
                            viewBtn2.classList.add('hidden');
                        }
                    }
                    // Listen Along -> play via BGM
                    if (listenBtn2) {
                        if (ytId) {
                            listenBtn2.href = '#';
                            listenBtn2.innerHTML = `<i class="fa-solid fa-headphones"></i> ${escapeHtml(act.buttons?.[0] || 'Listen Along')}`;
                            listenBtn2.classList.remove('hidden');
                            listenBtn2.onclick = (e) => {
                                e.preventDefault();
                                playYouTubeTrack(ytId, true);
                                // Scroll to BGM player to show playing
                                document.getElementById('bgm-player')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            };
                        } else if (act.buttons?.[0] && act.details_url) {
                            listenBtn2.href = act.details_url;
                            listenBtn2.innerHTML = `<i class="fa-solid fa-headphones"></i> ${escapeHtml(act.buttons[0])}`;
                            listenBtn2.classList.remove('hidden');
                            listenBtn2.onclick = null;
                        } else {
                            listenBtn2.classList.add('hidden');
                        }
                    }
                    const anyVisible = !viewBtn2.classList.contains('hidden') || !listenBtn2.classList.contains('hidden');
                    btnContainer2.classList.toggle('hidden', !anyVisible);
                }
            }

            if (act.timestamps?.start) {
                const startMs = act.timestamps.start;
                const endMs = act.timestamps.end;
                const hasEnd = !!endMs;
                const totalSec = hasEnd ? Math.max(0, Math.floor((endMs - startMs) / 1000)) : 0;
                if (tot) tot.textContent = hasEnd ? formatTime(totalSec) : '';
                if (art) art.style.visibility = 'visible';
                if (disc) disc.classList.toggle('paused', !hasEnd);
                if (progBar) progBar.style.visibility = hasEnd ? 'visible' : 'hidden';

                const updateList = () => {
                    const now = Date.now();
                    const currentSec = Math.max(0, Math.floor((now - startMs) / 1000));
                    if (hasEnd) {
                        const clamped = Math.min(totalSec, currentSec);
                        const percent = totalSec > 0 ? (clamped / totalSec) * 100 : 0;
                        if (cur) cur.textContent = formatTime(clamped);
                        if (fill) fill.style.width = `${percent}%`;
                    } else {
                        if (cur) cur.textContent = formatTime(currentSec);
                        if (fill) fill.style.width = '0%';
                        if (tot) tot.textContent = '';
                    }
                };
                updateList();
                window.spotifyInterval = setInterval(updateList, 1000);
            } else {
                if (cur) cur.textContent = '0:00';
                if (tot) tot.textContent = '0:00';
                if (fill) fill.style.width = '0%';
                if (disc) disc.classList.add('paused');
                if (progBar) progBar.style.visibility = 'hidden';
            }
        } else if (listeningEl) {
            listeningEl.classList.add('hidden');
            const bc = document.getElementById('spotify-buttons');
            if (bc) bc.classList.add('hidden');
        }

        // --- Game Box (actual game / streaming / competing) ---
        if (hasGame) {
            gameEl.classList.remove('hidden');

            // Dynamic Header based on Activity Type & Name
            const rpHeader = document.getElementById('rp-header');
            const otherName = (mainAct.name || "").toLowerCase();
            let headerHTML = '<i class="fa-solid fa-gamepad"></i> PLAYING A GAME';

            if (otherName.includes('visual studio') || otherName.includes('code') || otherName.includes('neovim') || otherName.includes('intellij') || otherName.includes('terminal')) {
                headerHTML = '<i class="fa-solid fa-code"></i> CODING & DEVELOPING';
            } else if (mainAct.type === 1 || otherName.includes('twitch') || otherName.includes('kick')) {
                headerHTML = '<i class="fa-solid fa-video"></i> STREAMING';
            } else if (mainAct.type === 3 || otherName.includes('youtube') || otherName.includes('netflix') || otherName.includes('bilibili') || otherName.includes('anime')) {
                headerHTML = '<i class="fa-solid fa-tv"></i> WATCHING';
            } else if (mainAct.type === 5) {
                headerHTML = '<i class="fa-solid fa-trophy"></i> COMPETING';
            }

            if (rpHeader) rpHeader.innerHTML = headerHTML;

            const rpName = document.getElementById('rp-name');
            const rpDetails = document.getElementById('rp-details');
            const rpState = document.getElementById('rp-state');
            if (rpName) rpName.textContent = mainAct.name || "Unknown Activity";
            if (rpDetails) {
                rpDetails.textContent = mainAct.details || "";
                rpDetails.style.display = mainAct.details ? 'block' : 'none';
            }
            if (rpState) {
                rpState.textContent = mainAct.state || "";
                rpState.style.display = mainAct.state ? 'block' : 'none';
            }

            // Party (e.g., 2/2) and asset hover texts (often contain LV / map / rank)
            const rpParty = document.getElementById('rp-party');
            if (rpParty) {
                if (mainAct.party?.size && Array.isArray(mainAct.party.size)) {
                    rpParty.textContent = `👥 Party: ${mainAct.party.size[0]}/${mainAct.party.size[1]}`;
                    rpParty.style.display = 'block';
                } else {
                    rpParty.style.display = 'none';
                }
            }
            const rpAssetsText = document.getElementById('rp-assets-text');
            if (rpAssetsText) {
                const texts = [];
                if (mainAct.assets?.large_text) texts.push(mainAct.assets.large_text);
                if (mainAct.assets?.small_text) texts.push(mainAct.assets.small_text);
                // Also show large_image text fallback if details/state empty
                if (texts.length) {
                    rpAssetsText.textContent = texts.join(' • ');
                    rpAssetsText.style.display = 'block';
                } else {
                    rpAssetsText.style.display = 'none';
                }
            }

            // Large Image
            const lImg = document.getElementById('rp-large-img');
            if (lImg) {
                lImg.onerror = function() {
                    if (mainAct.application_id && !this.src.includes('dcdn.dstn.to')) {
                        this.src = `https://dcdn.dstn.to/app-icons/${mainAct.application_id}?size=256`;
                    } else if (this.src !== av) {
                        this.src = av;
                    }
                };

                if (mainAct.assets?.large_image) {
                    let assetId = mainAct.assets.large_image;
                    if (assetId.startsWith('mp:external/')) {
                        lImg.src = `https://media.discordapp.net/external/${assetId.replace('mp:external/', '')}`;
                    } else {
                        lImg.src = `https://cdn.discordapp.com/app-assets/${mainAct.application_id}/${assetId}.png`;
                    }
                } else if (mainAct.application_id) {
                    lImg.src = `https://dcdn.dstn.to/app-icons/${mainAct.application_id}?size=256`;
                } else {
                    lImg.src = av;
                }
            }

            // Small Image
            const sImg = document.getElementById('rp-small-img');
            if (sImg) {
                sImg.onerror = function() { this.classList.add('hidden'); };
                if (mainAct.assets?.small_image) {
                    sImg.classList.remove('hidden');
                    let sAssetId = mainAct.assets.small_image;
                    if (sAssetId.startsWith('mp:external/')) {
                        sImg.src = `https://media.discordapp.net/external/${sAssetId.replace('mp:external/', '')}`;
                    } else {
                        sImg.src = `https://cdn.discordapp.com/app-assets/${mainAct.application_id}/${sAssetId}.png`;
                    }
                } else {
                    sImg.classList.add('hidden');
                }
            }

            // Live Timer (Elapsed / Left)
            const timeEl = document.getElementById('rp-time');

            if (mainAct.timestamps?.end || mainAct.timestamps?.start) {
                const hasEnd = !!mainAct.timestamps?.end;
                const targetMs = hasEnd ? mainAct.timestamps.end : mainAct.timestamps.start;

                const updateTime = () => {
                    let diffSeconds = 0;
                    if (hasEnd) {
                        diffSeconds = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
                    } else {
                        diffSeconds = Math.max(0, Math.floor((Date.now() - targetMs) / 1000));
                    }

                    const h = Math.floor(diffSeconds / 3600);
                    const m = Math.floor((diffSeconds % 3600) / 60);
                    const s = diffSeconds % 60;
                    let txt = '';
                    if (h > 0) txt += `${h}:`;
                    txt += `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

                    if (timeEl) {
                        timeEl.textContent = hasEnd ? `${txt} left` : `${txt} elapsed`;
                    }
                };
                updateTime();
                window.rpInterval = setInterval(updateTime, 1000);
            } else {
                if (timeEl) timeEl.textContent = "";
            }

            // Buttons
            const buttonsContainer = document.getElementById('rp-buttons');
            if (buttonsContainer) {
                if (mainAct.buttons && mainAct.buttons.length > 0) {
                    buttonsContainer.classList.remove('hidden');
                    buttonsContainer.innerHTML = '';
                    mainAct.buttons.slice(0, 2).forEach(btnText => {
                        const btn = document.createElement('a');
                        btn.className = 'rp-button';
                        btn.textContent = btnText;
                        btn.target = "_blank";
                        let url = mainAct.details_url || mainAct.state_url;
                        if (url) btn.href = url;
                        buttonsContainer.appendChild(btn);
                    });
                } else {
                    buttonsContainer.classList.add('hidden');
                }
            }
        } else if (gameEl) {
            gameEl.classList.add('hidden');
        }

        if (activityCard) activityCard.classList.remove('fade-transition');
        if (infoBox) infoBox.classList.remove('fade-transition');
    }, 300);
}
