// ==========================================
// AUDIO MODULE: BGM Player, YouTube IFrame API, Visualizer
// ==========================================

import { cfg, formatTime } from './core.js?v=9.3';

export const audio = document.getElementById('bg-audio') || document.getElementById('bgm-audio');
export const bgmPlayer = document.getElementById('bgm-player');
export const bgmPlayPause = document.getElementById('bgm-play-pause');
export const bgmPlayPauseMain = document.getElementById('bgm-play-pause-main');
export const bgmMute = document.getElementById('bgm-mute');
export const bgmCurrent = document.getElementById('bgm-current');
export const bgmDuration = document.getElementById('bgm-duration');
export const timelineSlider = document.getElementById('bgm-progress-slider');
export const volumeSlider = document.getElementById('bgm-volume');
export const visualizerCanvas = document.getElementById('audio-visualizer');
export const visCtx = visualizerCanvas ? visualizerCanvas.getContext('2d') : null;
export const bgmTitleEl = document.querySelector('.bgm-title');
export const bgmCoverImg = document.getElementById('bgm-cover-img');

export let currentBgmMode = 'youtube';
export let isYouTubePlaylistActive = true;
export let isShuffle = false;
export let repeatMode = 'all'; // 'all', 'one', 'none'
export let ytPlayer = null;
let isYtReady = false;
export let ytDuration = 0;
export let ytInterval = null;
export let playlistVideos = [];
export let currentTrackIndex = 0;
let _playlistSyncState = { id: '', synced: false, promise: null, usingFallback: false };

function fetchFreshPlaylist(playlistId) {
    if (!playlistId) return Promise.resolve(null);
    if (_playlistSyncState.id === playlistId && _playlistSyncState.promise) {
        return _playlistSyncState.promise;
    }
    const promise = fetch(`/api/youtube-playlist?id=${encodeURIComponent(playlistId)}`, { cache: 'no-store' })
        .then(res => res.json())
        .then(json => {
            if (json.success && Array.isArray(json.list) && json.list.length > 0) {
                cfg.youtubePlaylistVideos = [...json.list];
                playlistVideos = [...json.list];
                _playlistSyncState.synced = true;
                return playlistVideos;
            }
            return null;
        })
        .catch(() => null);
    _playlistSyncState = { id: playlistId, synced: false, promise, usingFallback: false };
    return promise;
}

// Prefetch fresh playlist immediately on page load (before user clicks entry)
if (cfg.youtubePlaylistId) {
    fetchFreshPlaylist(cfg.youtubePlaylistId);
}
export let dataArray = new Uint8Array(32);
export let audioContext = null;
export let analyser = null;

export function initAudioContext() {
    if (audioContext) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        if (audio) {
            const source = audioContext.createMediaElementSource(audio);
            source.connect(analyser);
            analyser.connect(audioContext.destination);
        }
        analyser.fftSize = 64;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
    } catch (err) {
        console.warn("Audio visualizer init error:", err);
        if (!dataArray) dataArray = new Uint8Array(32);
    }
    if (audioContext && audioContext.state === 'suspended') audioContext.resume();
}

let _lastSyncedVideoId = '';
let _lastSyncedTitle = '';
function setBgmTitle(title) {
    if (!bgmTitleEl || !title) return;
    const container = bgmTitleEl.parentElement;
    bgmTitleEl.classList.remove('scrolling');
    if (container) container.classList.remove('is-scrolling');
    bgmTitleEl.textContent = title;

    requestAnimationFrame(() => {
        if (!container || !bgmTitleEl) return;
        if (bgmTitleEl.scrollWidth > container.clientWidth + 2) {
            bgmTitleEl.textContent = '';
            const c1 = document.createElement('span');
            c1.className = 'marquee-copy';
            c1.textContent = title;
            const c2 = document.createElement('span');
            c2.className = 'marquee-copy';
            c2.setAttribute('aria-hidden', 'true');
            c2.textContent = title;
            bgmTitleEl.appendChild(c1);
            bgmTitleEl.appendChild(c2);
            bgmTitleEl.classList.add('scrolling');
            container.classList.add('is-scrolling');
        }
    });
}

export function syncYouTubeTrackInfo() {
    if (!ytPlayer || !ytPlayer.getVideoData) return;
    const vData = ytPlayer.getVideoData();
    if (!vData) return;
    const vidId = vData.video_id;
    const title = vData.title;
    if (title && (vidId !== _lastSyncedVideoId || title !== _lastSyncedTitle)) {
        _lastSyncedVideoId = vidId || '';
        _lastSyncedTitle = title;
        setBgmTitle(title);
        if (vidId && bgmCoverImg) {
            const newCover = `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`;
            if (bgmCoverImg.src !== newCover) {
                bgmCoverImg.onerror = () => {
                    bgmCoverImg.onerror = null;
                    bgmCoverImg.src = `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`;
                };
                bgmCoverImg.src = newCover;
            }
        }
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: title,
                    artist: vData.author || 'YouTube Playlist',
                    artwork: [{ src: `https://img.youtube.com/vi/${vidId || 'default'}/hqdefault.jpg`, sizes: '512x512', type: 'image/jpeg' }]
                });
            } catch {}
        }
    }
}


// Centralized play/pause visual sync — robust, idempotent
export function syncPlayIcons(playing) {
    // Cover disc overlay button: fa-play <-> fa-pause
    const coverBtn = document.getElementById('bgm-play-pause');
    const mainBtn = document.getElementById('bgm-play-pause-main');
    const player = document.getElementById('bgm-player');
    if (coverBtn) {
        coverBtn.classList.remove('hidden');
        coverBtn.classList.remove('fa-play', 'fa-pause');
        coverBtn.classList.add(playing ? 'fa-pause' : 'fa-play');
        // ensure fa-solid stays
        if (!coverBtn.classList.contains('fa-solid')) coverBtn.classList.add('fa-solid');
    }
    if (mainBtn) {
        mainBtn.classList.remove('fa-circle-play', 'fa-circle-pause', 'fa-play', 'fa-pause');
        mainBtn.classList.add(playing ? 'fa-circle-pause' : 'fa-circle-play');
        if (!mainBtn.classList.contains('fa-solid')) mainBtn.classList.add('fa-solid');
    }
    if (player) player.classList.toggle('playing', playing);
    if (playing && volumeSlider && ytPlayer && ytPlayer.setVolume) {
        ytPlayer.setVolume(parseFloat(volumeSlider.value) * 100);
    }
    // MediaSession playbackState
    if ('mediaSession' in navigator) {
        try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch {}
    }
}

export function playYouTubeTrack(videoId, autoPlay = true) {
    if (!videoId) return;
    currentBgmMode = 'youtube';
    isYouTubePlaylistActive = false;
    if (audio && !audio.paused) audio.pause();
    const doPlay = () => {
        if (!ytPlayer || !ytPlayer.loadVideoById) return false;
        try {
            if (volumeSlider) ytPlayer.setVolume(volumeSlider.value * 100);
            if (bgmPlayPause) bgmPlayPause.classList.remove('hidden');
            ytPlayer.loadVideoById(videoId);
            if (autoPlay) {
                ytPlayer.playVideo();
                syncPlayIcons(true);
            }
            return true;
        } catch (e) { console.warn('playYouTubeTrack error', e); return false; }
    };
    if (!doPlay()) {
        const chk = setInterval(() => {
            if (doPlay()) clearInterval(chk);
        }, 200);
        setTimeout(() => clearInterval(chk), 5000);
    }
}

export function playPlaylistIndex(index, autoPlay = true) {
    if (!playlistVideos || playlistVideos.length === 0) return;
    currentTrackIndex = ((index % playlistVideos.length) + playlistVideos.length) % playlistVideos.length;
    const vid = playlistVideos[currentTrackIndex];
    if (!vid || !ytPlayer) return;
    try {
        if (volumeSlider && ytPlayer.setVolume) ytPlayer.setVolume(parseFloat(volumeSlider.value) * 100);
        if (bgmPlayPause) bgmPlayPause.classList.remove('hidden');
        if (autoPlay && ytPlayer.loadVideoById) {
            ytPlayer.loadVideoById(vid);
            if (ytPlayer.playVideo) ytPlayer.playVideo();
            syncPlayIcons(true);
        } else if (ytPlayer.cueVideoById) {
            ytPlayer.cueVideoById(vid);
            syncPlayIcons(false);
        }
        setTimeout(syncYouTubeTrackInfo, 300);
        setTimeout(syncYouTubeTrackInfo, 800);
    } catch (err) {
        console.warn("playPlaylistIndex error:", err);
    }
}

export function playNextInPlaylist() {
    if (!isYouTubePlaylistActive || !playlistVideos || playlistVideos.length === 0) {
        if (ytPlayer && ytPlayer.nextVideo) ytPlayer.nextVideo();
        return;
    }
    if (isShuffle && playlistVideos.length > 1) {
        let nextIdx = currentTrackIndex;
        while (nextIdx === currentTrackIndex) {
            nextIdx = Math.floor(Math.random() * playlistVideos.length);
        }
        playPlaylistIndex(nextIdx, true);
    } else {
        playPlaylistIndex(currentTrackIndex + 1, true);
    }
}

export function playPrevInPlaylist() {
    if (!isYouTubePlaylistActive || !playlistVideos || playlistVideos.length === 0) {
        if (ytPlayer && ytPlayer.previousVideo) ytPlayer.previousVideo();
        return;
    }
    playPlaylistIndex(currentTrackIndex - 1, true);
}

export function loadYouTubePlaylist(playlistId, autoPlay = true) {
    currentBgmMode = 'youtube';
    isYouTubePlaylistActive = true;
    if (audio && !audio.paused) audio.pause();

    const isFreshReady = _playlistSyncState.id === playlistId && _playlistSyncState.synced && playlistVideos.length > 0;
    if (!isFreshReady && playlistVideos.length === 0 && Array.isArray(cfg.youtubePlaylistVideos) && cfg.youtubePlaylistVideos.length > 0) {
        playlistVideos = [...cfg.youtubePlaylistVideos];
        _playlistSyncState.usingFallback = true;
    }

    const doStart = () => {
        if (!ytPlayer || !isYtReady || !ytPlayer.loadVideoById) {
            window._pendingPlaylist = { playlistId, autoPlay };
            return false;
        }
        if (playlistVideos.length > 0) {
            window._pendingPlaylist = null;
            playPlaylistIndex(0, autoPlay);
            return true;
        }
        return false;
    };

    // 1. Immediately start playback synchronously within the user gesture context, or poll until ready
    if (!doStart()) {
        const check = setInterval(() => {
            if (ytPlayer && isYtReady && ytPlayer.loadVideoById && playlistVideos.length > 0) {
                clearInterval(check);
                if (window._pendingPlaylist) {
                    window._pendingPlaylist = null;
                    doStart();
                }
            }
        }, 200);
        setTimeout(() => clearInterval(check), 10000);
    }

    // 2. Ensure fresh playlist from server API (reuses in-flight prefetch if same ID)
    if (!isFreshReady) {
        fetchFreshPlaylist(playlistId).then(freshList => {
            if (!freshList || freshList.length === 0) return;
            const currentVid = ytPlayer && ytPlayer.getVideoData ? ytPlayer.getVideoData()?.video_id : '';
            const wasFallback = _playlistSyncState.usingFallback;
            _playlistSyncState.usingFallback = false;

            if (!ytPlayer || !ytPlayer.getPlayerState || ytPlayer.getPlayerState() <= 0) {
                doStart();
            } else if (wasFallback && (!currentVid || currentVid !== freshList[0])) {
                // Switch immediately from stale fallback track to fresh playlist's first track
                playPlaylistIndex(0, autoPlay);
            }
        });
    }
}

export function initAudio() {
    // Migrate legacy akari key / unset default to 0.5, but otherwise respect saved volume
    let savedVol = localStorage.getItem('profile_bgm_volume');
    const legacyVol = localStorage.getItem('akari_bgm_volume');
    if (savedVol === null) {
        savedVol = (legacyVol !== null ? legacyVol : '0.5');
        localStorage.setItem('profile_bgm_volume', savedVol);
    }
    localStorage.removeItem('akari_bgm_volume');
    if (savedVol === null) savedVol = '0.5';
    window.addEventListener('resize', resizeVisualizer);
    if (volumeSlider) {
        volumeSlider.value = savedVol;
        if (audio) audio.volume = parseFloat(savedVol);
        if (savedVol == 0 && bgmMute) bgmMute.className = 'fa-solid fa-volume-xmark';
        // Ensure YouTube player gets correct volume when ready (handled in onReady, but also set here if already ready)
        if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(parseFloat(savedVol) * 100);
    }

    const updateVolumeUI = (vol) => {
        if (volumeSlider) {
            volumeSlider.style.background = `linear-gradient(to right, var(--c-lavender) ${vol * 100}%, rgba(255,255,255,0.15) ${vol * 100}%)`;
        }
        if (bgmMute) bgmMute.className = vol == 0 ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    };
    const volumePopup = document.getElementById('volume-popup');
    const volumeWrapper = document.getElementById('volume-wrapper');

    if (volumeSlider) {
        volumeSlider.addEventListener('input', () => {
            const vol = parseFloat(volumeSlider.value);
            localStorage.setItem('profile_bgm_volume', vol);
            if (audio) audio.volume = vol;
            if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(vol * 100);
            updateVolumeUI(vol);
            // Tự ẩn popup sau khi chỉnh xong 1.2s
            if (volumePopup) {
                clearTimeout(window._volHideTimer);
                window._volHideTimer = setTimeout(() => volumePopup.classList.add('hidden'), 1200);
            }
        });
        updateVolumeUI(parseFloat(volumeSlider.value));
    }
    if (bgmMute) {
        let prevVol = parseFloat(volumeSlider?.value || localStorage.getItem('profile_bgm_volume') || 0.5);
        bgmMute.style.cursor = 'pointer';
        // Volume icon: hover shows popup via CSS bridge, click toggles mute and keeps popup visible
        const muteTrigger = bgmMute.closest('button') || bgmMute;
        muteTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (volumePopup) volumePopup.classList.remove('hidden');
            const cur = parseFloat(volumeSlider?.value || 0);
            if (cur > 0) {
                prevVol = cur;
                if (volumeSlider) {
                    volumeSlider.value = 0;
                    volumeSlider.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    localStorage.setItem('profile_bgm_volume', 0);
                    if (audio) audio.volume = 0;
                    if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(0);
                    updateVolumeUI(0);
                }
            } else {
                const restore = prevVol > 0 ? prevVol : 0.5;
                if (volumeSlider) {
                    volumeSlider.value = restore;
                    volumeSlider.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    localStorage.setItem('profile_bgm_volume', restore);
                    if (audio) audio.volume = restore;
                    if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(restore * 100);
                    updateVolumeUI(restore);
                }
            }
        });
        // Click outside to close popup (mobile + desktop after click)
        if (volumePopup && volumeWrapper) {
            document.addEventListener('click', (e) => {
                if (!volumeWrapper.contains(e.target)) volumePopup.classList.add('hidden');
            });
            // Giữ popup khi hover chính nó, tự ẩn khi di ra khỏi vùng chỉnh
            volumePopup.addEventListener('mouseenter', () => volumePopup.classList.remove('hidden'));
            const autoHideOnLeave = () => {
                clearTimeout(window._volLeaveTimer);
                window._volLeaveTimer = setTimeout(() => {
                    if (!volumeWrapper.matches(':hover') && !volumePopup.matches(':hover')) {
                        volumePopup.classList.add('hidden');
                    }
                }, 300);
            };
            volumeWrapper.addEventListener('mouseleave', autoHideOnLeave);
            volumePopup.addEventListener('mouseleave', autoHideOnLeave);
            volumeWrapper.addEventListener('mouseenter', () => clearTimeout(window._volLeaveTimer));
            volumePopup.addEventListener('mouseenter', () => clearTimeout(window._volLeaveTimer));
        }
    }
    // --- Seek / Scrub functionality ---
    if (timelineSlider) {
        let isSeeking = false;
        // Expose seeking state for ytInterval to avoid overwriting drag
        Object.defineProperty(timelineSlider, '_isSeeking', {
            get: () => isSeeking,
            set: (v) => { isSeeking = v; },
            configurable: true
        });

        const doSeek = (value) => {
            if (currentBgmMode === 'youtube' && ytPlayer && ytPlayer.seekTo) {
                const duration = ytPlayer.getDuration() || 0;
                const seekTime = (value / 100) * duration;
                ytPlayer.seekTo(seekTime, true);
            } else if (currentBgmMode === 'local' && audio && Number.isFinite(audio.duration)) {
                const seekTime = (value / 100) * audio.duration;
                audio.currentTime = seekTime;
            }
        };
        const updateTimelineVisual = (percent) => {
            timelineSlider.style.background = `linear-gradient(to right, var(--c-lavender) ${percent}%, rgba(255,255,255,0.1) ${percent}%)`;
            if (bgmCurrent) {
                const duration = currentBgmMode === 'youtube' ? (ytDuration || ytPlayer?.getDuration?.() || 0) : (audio?.duration || 0);
                const t = (percent / 100) * duration;
                bgmCurrent.textContent = formatTime(t);
            }
        };

        timelineSlider.addEventListener('mousedown', () => { isSeeking = true; });
        timelineSlider.addEventListener('mousemove', (e) => {
            if (!isSeeking) return;
            const rect = timelineSlider.getBoundingClientRect();
            const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            timelineSlider.value = percent;
            updateTimelineVisual(percent);
        });
        const finishSeek = () => {
            if (isSeeking) {
                isSeeking = false;
                doSeek(parseFloat(timelineSlider.value));
            }
        };
        timelineSlider.addEventListener('mouseup', finishSeek);
        timelineSlider.addEventListener('mouseleave', finishSeek);
        window.addEventListener('mouseup', () => { if (isSeeking) finishSeek(); });
        timelineSlider.addEventListener('touchstart', () => { isSeeking = true; }, { passive: true });
        timelineSlider.addEventListener('touchmove', (e) => {
            if (!isSeeking) return;
            const rect = timelineSlider.getBoundingClientRect();
            const touch = e.touches[0];
            const percent = Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100));
            timelineSlider.value = percent;
            updateTimelineVisual(percent);
        }, { passive: true });
        timelineSlider.addEventListener('touchend', finishSeek);
        timelineSlider.addEventListener('touchcancel', () => { isSeeking = false; });
        timelineSlider.addEventListener('input', () => {
            const percent = parseFloat(timelineSlider.value);
            updateTimelineVisual(percent);
        });
        timelineSlider.addEventListener('change', () => {
            const percent = parseFloat(timelineSlider.value);
            doSeek(percent);
        });
    }

    const playPauseBtn = document.getElementById('bgm-play-pause');
    const playPauseMainBtn = document.getElementById('bgm-play-pause-main');
    const coverBtn = document.getElementById('bgm-cover-btn');

    const togglePlayPause = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        // YouTube mode
        if (currentBgmMode === 'youtube' && ytPlayer && ytPlayer.getPlayerState) {
            const state = ytPlayer.getPlayerState();
            // 1 = playing, 2 = paused, 3 = buffering, 5 = cued
            if (state === 1) {
                ytPlayer.pauseVideo();
                syncPlayIcons(false);
            } else if (state === 2 || state === 5 || state === -1 || state === 3 || state === 0) {
                // paused/cued/unstarted/buffering/ended => play
                // Ensure audioContext resumed on user gesture
                if (audioContext && audioContext.state === 'suspended') audioContext.resume();
                ytPlayer.playVideo();
                syncPlayIcons(true);
            } else {
                // fallback toggle based on visual state
                const isPlaying = document.getElementById('bgm-player')?.classList.contains('playing');
                if (isPlaying) {
                    ytPlayer.pauseVideo();
                    syncPlayIcons(false);
                } else {
                    ytPlayer.playVideo();
                    syncPlayIcons(true);
                }
            }
            return;
        }
        // Local audio fallback
        if (currentBgmMode === 'local' && audio) {
            if (audio.paused) {
                audio.play().then(() => syncPlayIcons(true)).catch(() => syncPlayIcons(true));
                if (audioContext && audioContext.state === 'suspended') audioContext.resume();
            } else {
                audio.pause();
                syncPlayIcons(false);
            }
            return;
        }
        // If ytPlayer not ready yet, try to play anyway and sync optimistically
        if (ytPlayer && ytPlayer.playVideo) {
            const state = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -1;
            if (state === 1) {
                ytPlayer.pauseVideo();
                syncPlayIcons(false);
            } else {
                ytPlayer.playVideo();
                syncPlayIcons(true);
            }
        } else if (audio) {
            if (audio.paused) {
                audio.play().catch(()=>{});
                syncPlayIcons(true);
            } else {
                audio.pause();
                syncPlayIcons(false);
            }
        }
    };

    // Fix: playPauseBtn is inside coverBtn -> stopPropagation prevents double toggle
    if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);
    if (playPauseMainBtn) (playPauseMainBtn.closest('button') || playPauseMainBtn).addEventListener('click', togglePlayPause);
    if (coverBtn) coverBtn.addEventListener('click', togglePlayPause);

    // Also handle local audio events to keep icons in sync if user uses browser media controls
    if (audio) {
        audio.addEventListener('play', () => { if (currentBgmMode === 'local') syncPlayIcons(true); });
        audio.addEventListener('pause', () => { if (currentBgmMode === 'local') syncPlayIcons(false); });
        audio.addEventListener('ended', () => syncPlayIcons(false));
    }

    // Media Session handlers (OS/browser media keys)
    if ('mediaSession' in navigator) {
        try {
            navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
            navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                if (currentBgmMode === 'youtube') playNextInPlaylist();
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                if (currentBgmMode === 'youtube') playPrevInPlaylist();
            });
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details.seekTime != null) {
                    if (currentBgmMode === 'youtube' && ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(details.seekTime, true);
                    else if (audio) audio.currentTime = details.seekTime;
                }
            });
        } catch {}
    }

    const shuffleBtn = document.getElementById('bgm-shuffle');
    if (shuffleBtn) {
        const shuffleTrigger = shuffleBtn.closest('button') || shuffleBtn;
        shuffleTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            isShuffle = !isShuffle;
            if (currentBgmMode === 'youtube' && ytPlayer && ytPlayer.setShuffle) {
                ytPlayer.setShuffle(isShuffle);
            }
            shuffleBtn.classList.toggle('active', isShuffle);
            shuffleTrigger.title = isShuffle ? 'Shuffle: On' : 'Shuffle: Off';
        });
    }

    const repeatBtn = document.getElementById('bgm-repeat');
    if (repeatBtn) {
        const repeatTrigger = repeatBtn.closest('button') || repeatBtn;
        repeatBtn.classList.add('active'); // Default: repeat all
        repeatTrigger.title = 'Repeat: All';
        repeatTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (repeatMode === 'all') {
                repeatMode = 'one';
                repeatBtn.className = 'fa-solid fa-repeat active';
                repeatTrigger.title = 'Repeat: Single Track';
                if (currentBgmMode === 'youtube' && ytPlayer && ytPlayer.setLoop) ytPlayer.setLoop(false);
                if (audio) audio.loop = true;
            } else if (repeatMode === 'one') {
                repeatMode = 'none';
                repeatBtn.className = 'fa-solid fa-repeat';
                repeatBtn.classList.remove('active');
                repeatTrigger.title = 'Repeat: Off';
                if (currentBgmMode === 'youtube' && ytPlayer && ytPlayer.setLoop) ytPlayer.setLoop(false);
                if (audio) audio.loop = false;
            } else {
                repeatMode = 'all';
                repeatBtn.className = 'fa-solid fa-repeat active';
                repeatTrigger.title = 'Repeat: All';
                if (currentBgmMode === 'youtube' && ytPlayer && ytPlayer.setLoop) ytPlayer.setLoop(true);
                if (audio) audio.loop = false;
            }
        });
    }

    const nextBtn = document.getElementById('bgm-next');
    if (nextBtn) {
        (nextBtn.closest('button') || nextBtn).addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentBgmMode === 'youtube') {
                playNextInPlaylist();
            }
        });
    }

    const prevBtn = document.getElementById('bgm-prev');
    if (prevBtn) {
        (prevBtn.closest('button') || prevBtn).addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentBgmMode === 'youtube') {
                playPrevInPlaylist();
            }
        });
    }
}

function resizeVisualizer() {
    if (!visualizerCanvas) return;
    visualizerCanvas.width = visualizerCanvas.clientWidth;
    visualizerCanvas.height = visualizerCanvas.clientHeight;
}

export function tickVisualizer() {
    if (!visCtx || !visualizerCanvas) return;
    resizeVisualizer();
    if (visualizerCanvas.width === 0 || visualizerCanvas.height === 0) return;
    
    if (!dataArray) dataArray = new Uint8Array(32);
    
    const playing = (currentBgmMode === 'youtube' && ytPlayer && ytPlayer.getPlayerState && ytPlayer.getPlayerState() === 1) ||
                    (currentBgmMode === 'local' && audio && !audio.paused);
    
    if (!playing) {
        visCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        return;
    }
    
    if (currentBgmMode === 'local' && analyser) {
        analyser.getByteFrequencyData(dataArray);
    } else {
        // Fake visualizer for YouTube
        for (let i = 0; i < dataArray.length; i++) {
            dataArray[i] = Math.max(10, Math.min(240, (dataArray[i] || 20) + (Math.random() * 40 - 20)));
        }
    }
    
    visCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
    const barWidth = (visualizerCanvas.width / dataArray.length) * 1.4;
    let x = 0;
    visCtx.fillStyle = '#b4befe';
    for (let i = 0; i < dataArray.length; i++) {
        const barHeight = (dataArray[i] / 255) * (visualizerCanvas.height * 0.35);
        visCtx.fillRect(x, visualizerCanvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 2;
    }
}

function updateYtProgressUI() {
    if (!ytPlayer || currentBgmMode !== 'youtube' || !timelineSlider || timelineSlider._isSeeking) return;
    const cur = ytPlayer.getCurrentTime ? (ytPlayer.getCurrentTime() || 0) : 0;
    const dur = ytPlayer.getDuration ? (ytPlayer.getDuration() || ytDuration || 0) : ytDuration;
    if (dur && dur !== ytDuration) {
        ytDuration = dur;
        if (bgmDuration) bgmDuration.textContent = formatTime(ytDuration);
    }
    if (bgmCurrent) bgmCurrent.textContent = formatTime(cur);
    const percent = ytDuration ? Math.min(100, Math.max(0, (cur / ytDuration) * 100)) : 0;
    timelineSlider.value = percent;
    timelineSlider.style.background = `linear-gradient(to right, var(--c-lavender) ${percent}%, rgba(255,255,255,0.1) ${percent}%)`;
    syncYouTubeTrackInfo();
}

function startYtProgressLoop() {
    updateYtProgressUI();
    if (ytInterval) clearInterval(ytInterval);
    ytInterval = setInterval(() => {
        if (currentBgmMode !== 'youtube' || !ytPlayer) return;
        const st = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -1;
        if (st === 1 || st === 3) {
            updateYtProgressUI();
        }
    }, 500);
}

function stopYtProgressLoop() {
    if (ytInterval) {
        clearInterval(ytInterval);
        ytInterval = null;
    }
}

// Global hook for YouTube IFrame API
let _ytApiReadyInit = false;
window.onYouTubeIframeAPIReady = function() {
    if (_ytApiReadyInit || (ytPlayer && ytPlayer.loadPlaylist)) return;
    _ytApiReadyInit = true;

    ytPlayer = new YT.Player('yt-player-container', {
        height: '200', width: '200',
        videoId: '',
        playerVars: {
            'autoplay': 0,
            'controls': 0,
            'disablekb': 1,
            'fs': 0,
            'playsinline': 1,
            'enablejsapi': 1,
            'origin': window.location.origin
        },
        events: {
            'onReady': (e) => {
                isYtReady = true;
                if (volumeSlider) e.target.setVolume(parseFloat(volumeSlider.value) * 100);
                if (bgmPlayPause) bgmPlayPause.classList.remove('hidden');
                if (window._pendingPlaylist) {
                    const p = window._pendingPlaylist;
                    window._pendingPlaylist = null;
                    loadYouTubePlaylist(p.playlistId, p.autoPlay);
                } else if (playlistVideos.length > 0 && e.target.cueVideoById) {
                    try { e.target.cueVideoById(playlistVideos[0]); } catch {}
                }
            },
            'onError': (e) => {
                console.warn('YouTube playback error:', e.data);
                if (isYouTubePlaylistActive && playlistVideos.length > 1) {
                    setTimeout(() => playNextInPlaylist(), 500);
                }
            },
            'onStateChange': (e) => {
                if (currentBgmMode !== 'youtube') return;
                syncYouTubeTrackInfo();

                if (e.data === YT.PlayerState.PLAYING) {
                    if (volumeSlider) e.target.setVolume(parseFloat(volumeSlider.value) * 100);
                    syncPlayIcons(true);
                    ytDuration = ytPlayer.getDuration ? (ytPlayer.getDuration() || 0) : 0;
                    if (bgmDuration) bgmDuration.textContent = formatTime(ytDuration);
                    syncYouTubeTrackInfo();
                    startYtProgressLoop();
                } else if (e.data === YT.PlayerState.PAUSED) {
                    syncPlayIcons(false);
                    stopYtProgressLoop();
                } else if (e.data === YT.PlayerState.BUFFERING) {
                    syncYouTubeTrackInfo();
                } else if (e.data === YT.PlayerState.ENDED) {
                    stopYtProgressLoop();
                    if (repeatMode === 'one') {
                        ytPlayer.seekTo(0, true);
                        ytPlayer.playVideo();
                    } else if (repeatMode === 'all') {
                        playNextInPlaylist();
                    } else {
                        if (isYouTubePlaylistActive && currentTrackIndex < playlistVideos.length - 1) {
                            playNextInPlaylist();
                        } else {
                            syncPlayIcons(false);
                        }
                    }
                } else if (e.data === YT.PlayerState.CUED) {
                    stopYtProgressLoop();
                    ytDuration = ytPlayer.getDuration ? (ytPlayer.getDuration() || 0) : 0;
                    if (bgmDuration) bgmDuration.textContent = formatTime(ytDuration);
                    syncYouTubeTrackInfo();
                    syncPlayIcons(false);
                }
            }
        }
    });
};

function loadYouTubeAPI() {
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;
    const ytScript = document.createElement('script');
    ytScript.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(ytScript);
}
// Preload YouTube API on all devices so player is instantly ready upon user click
loadYouTubeAPI();

// If YouTube API was already loaded before this module was executed:
if (typeof window !== 'undefined' && window.YT && window.YT.Player && !ytPlayer) {
    window.onYouTubeIframeAPIReady();
}

// Expose for entry handler
export { loadYouTubeAPI };
