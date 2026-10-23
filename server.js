const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env locally (simple parser, no dep) - production uses /etc/profile-web.env via systemd
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!(key in process.env)) process.env[key] = val;
    }
    console.log('[Env] Loaded .env');
  } catch (e) { console.error('[Env] Failed to load .env', e); }
})();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const secHeaders = { 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' };

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webm': 'audio/webm',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// In-memory rate limiting: 1 msg per 20s per IP
const ipRateLimits = new Map();
// Auto-cleanup stale entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, ts] of ipRateLimits) {
    if (now - ts > 60000) ipRateLimits.delete(ip);
  }
}, 5 * 60 * 1000).unref();

// View counter (local file, replaces deprecated counterapi.dev v1) — deduped by IP (24h)
const viewsFile = path.join(__dirname, 'views.json');
const viewedIpsFile = path.join(__dirname, 'viewed_ips.json');
const VIEW_DEDUP_MS = 24 * 60 * 60 * 1000; // 24h per IP
function readViews() {
  try { const d = JSON.parse(fs.readFileSync(viewsFile, 'utf8')); return Number(d.count) || 0; } catch { return 0; }
}
function writeViews(count) {
  try { fs.writeFileSync(viewsFile, JSON.stringify({ count }, null, 2)); } catch(e) { console.error('[Views] write error', e); }
}
function readViewedIps() {
  try { return JSON.parse(fs.readFileSync(viewedIpsFile, 'utf8')); } catch { return {}; }
}
function writeViewedIps(map) {
  try { fs.writeFileSync(viewedIpsFile, JSON.stringify(map, null, 2)); } catch(e) {}
}
function hasViewedRecently(ip) {
  const map = readViewedIps();
  const ts = map[ip];
  if (!ts) return false;
  if (Date.now() - ts > VIEW_DEDUP_MS) {
    delete map[ip];
    writeViewedIps(map);
    return false;
  }
  return true;
}
function markViewed(ip) {
  const map = readViewedIps();
  map[ip] = Date.now();
  // Cleanup old entries (>24h)
  for (const k in map) if (Date.now() - map[k] > VIEW_DEDUP_MS) delete map[k];
  writeViewedIps(map);
}
// Ensure files exist
if (!fs.existsSync(viewsFile)) writeViews(0);
if (!fs.existsSync(viewedIpsFile)) writeViewedIps({});

function sendDiscordWebhook(name, message, clientIp) {
  return new Promise((resolve, reject) => {
    if (!DISCORD_WEBHOOK_URL) return reject(new Error("Webhook not configured"));
    
    const parsedUrl = new URL(DISCORD_WEBHOOK_URL);
    const timeString = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    
    const payload = JSON.stringify({
      username: "Aji Mailbox 💌",
      embeds: [{
        title: "📬 You received a new anonymous message!",
        color: 13346551, // Hex #cba6f7 (Catppuccin Mauve)
        fields: [
          { name: "👤 Sender", value: `**${name || 'Anonymous (Ẩn danh)'}**`, inline: true },
          { name: "⏰ Time", value: timeString, inline: true },
          { name: "💬 Message", value: `\`\`\`\n${message}\n\`\`\`` }
        ],
        footer: {
          text: `Sent from https://ajitana.io.vn • IP: ${clientIp.split(',')[0].trim()}`
        },
        timestamp: new Date().toISOString()
      }]
    });

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          reject(new Error(`Discord API error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', err => reject(err));
    req.write(payload);
    req.end();
  });
}

// YouTube Playlist Video IDs Fetcher (cached for 30m)
const ytPlaylistCache = new Map();
function fetchPlaylistVideos(playlistId) {
  const cached = ytPlaylistCache.get(playlistId);
  if (cached && (Date.now() - cached.ts < 30 * 60 * 1000)) {
    return Promise.resolve(cached.videos);
  }
  return new Promise((resolve) => {
    https.get(`https://www.youtube.com/playlist?list=${playlistId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let vids = [];
        try {
          const jsonMatch = data.match(/var ytInitialData = ({.*?});<\/script>/s) || data.match(/ytInitialData\s*=\s*({.*?});/s);
          if (jsonMatch) {
            const json = JSON.parse(jsonMatch[1]);
            const items = json.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
            if (Array.isArray(items)) {
              for (const it of items) {
                const vid = it.lockupViewModel?.contentId || it.playlistVideoRenderer?.videoId;
                if (vid && /^[a-zA-Z0-9_-]{11}$/.test(vid) && !vids.includes(vid)) {
                  vids.push(vid);
                }
              }
            }
          }
        } catch {}

        // Fallback to regex if ytInitialData parsing didn't find any
        if (vids.length === 0) {
          const matches = data.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/g);
          if (matches) {
            for (const m of matches) {
              const id = m.replace('/watch?v=', '');
              if (!vids.includes(id)) vids.push(id);
            }
          }
        }

        if (vids.length > 0) ytPlaylistCache.set(playlistId, { ts: Date.now(), videos: vids });
        resolve(vids);
      });
    }).on('error', () => resolve([]));
  });
}

function getClientIp(req) {
  // Honor cf-connecting-ip only unless explicitly disabled (TRUST_CLOUDFLARE=0)
  const trustCf = process.env.TRUST_CLOUDFLARE !== '0';
  const rawCfIp = trustCf ? req.headers['cf-connecting-ip'] : undefined;
  const rawRealIp = req.headers['x-real-ip'];
  const rawForwarded = req.headers['x-forwarded-for'];
  return (rawCfIp || rawRealIp || (rawForwarded ? rawForwarded.split(',')[0].trim() : '') || req.socket.remoteAddress || '127.0.0.1').toString();
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let reqPath;
  try {
    reqPath = decodeURIComponent(parsedUrl.pathname);
  } catch (e) {
    res.writeHead(400, { ...secHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  // Handle Anonymous Message API Endpoint
  if (reqPath === '/api/send-message' && req.method === 'POST') {
    const clientIp = getClientIp(req);
    const now = Date.now();
    
    // Anti-spam check
    if (ipRateLimits.has(clientIp) && (now - ipRateLimits.get(clientIp) < 20000)) {
      const waitTime = Math.ceil((20000 - (now - ipRateLimits.get(clientIp))) / 1000);
      res.writeHead(429, { ...secHeaders, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: `You are sending messages too fast! Please wait ${waitTime}s before sending again.` }));
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10240) { // Limit to 10KB
        req.socket.destroy();
      }
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        let name = (data.name || 'Anonymous').toString().trim().slice(0, 50);
        let msg = (data.msg || '').toString().trim().slice(0, 1000);
        // Sanitize to prevent Discord @everyone/@here pings and code-block breakout
        const sanitize = s => s.replace(/@everyone/g, '@\u200beveryone').replace(/@here/g, '@\u200bhere').replace(/```/g, "'''");
        name = sanitize(name);
        msg = sanitize(msg);

        if (!msg) {
          res.writeHead(400, { ...secHeaders, 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'Message cannot be empty!' }));
          return;
        }

        ipRateLimits.set(clientIp, now);
        await sendDiscordWebhook(name, msg, clientIp);

        res.writeHead(200, { ...secHeaders, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Your message has been sent to Aji!' }));
      } catch (err) {
        console.error('[Webhook Error]', err);
        res.writeHead(500, { ...secHeaders, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Unable to send message at this time. Please try again later!' }));
      }
    });
    return;
  }

  // View Counter API (local, replaces counterapi.dev)
  if (reqPath === '/api/views' && req.method === 'GET') {
    const count = readViews();
    res.writeHead(200, { ...secHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ count }));
    return;
  }
  if (reqPath === '/api/views/up' && (req.method === 'GET' || req.method === 'POST')) {
    const clientIp = getClientIp(req);
    let count = readViews();
    if (hasViewedRecently(clientIp)) {
      // Deduped: return current count without increment
      res.writeHead(200, { ...secHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ count, deduped: true }));
      return;
    }
    count += 1;
    writeViews(count);
    markViewed(clientIp);
    res.writeHead(200, { ...secHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ count }));
    return;
  }

  if (reqPath === '/api/views/reset' && req.method === 'POST') {
    const token = req.headers['x-reset-token'] || new URL(req.url, 'http://localhost').searchParams.get('token');
    if (!process.env.RESET_TOKEN || token !== process.env.RESET_TOKEN) {
      res.writeHead(403, { ...secHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
      return;
    }
    // Simple protection: require header x-reset-token if env set, otherwise allow (log IP)
    writeViews(0);
    writeViewedIps({});
    console.log(`[Views] reset to 0 by ${req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
    res.writeHead(200, { ...secHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    res.end(JSON.stringify({ success: true, count: 0 }));
    return;
  }

  // YouTube Playlist Video IDs Sync API
  if (reqPath === '/api/youtube-playlist' && req.method === 'GET') {
    const playlistId = parsedUrl.searchParams.get('id') || 'PLsDvPWj1sLN61RtOJQyXQowMt7rAo4nYd';
    if (!/^[a-zA-Z0-9_-]+$/.test(playlistId)) {
      res.writeHead(400, { ...secHeaders, 'Content-Type': 'application/json', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
      return res.end(JSON.stringify({ success: false, error: 'Invalid playlist id' }));
    }
    fetchPlaylistVideos(playlistId)
      .then(videos => {
        res.writeHead(200, { ...secHeaders, 'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Cache-Control': 'public, max-age=1800'
        });
        res.end(JSON.stringify({ success: videos.length > 0, list: videos }));
      })
      .catch(() => {
        res.writeHead(200, { ...secHeaders, 'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Referrer-Policy': 'strict-origin-when-cross-origin'
        });
        res.end(JSON.stringify({ success: false, list: [] }));
      });
    return;
  }

  // Static File Serving
  if (reqPath === '/') reqPath = '/index.html';
  // Block sensitive files from being served publicly
  // Security: Strict Whitelist for static file serving
  const allowedPrefixes = ['/assets/', '/favicon.ico', '/index.html'];
  const lowerPath = reqPath.toLowerCase();
  
  if (lowerPath.includes('..') || lowerPath.includes('\0') || !allowedPrefixes.some(p => lowerPath === p || lowerPath.startsWith(p))) {
    res.writeHead(403, { ...secHeaders, 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  const filePath = path.join(__dirname, reqPath);

  // Security: prevent path traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { ...secHeaders, 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { ...secHeaders, 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mime[ext] || 'application/octet-stream';
    const range = req.headers.range;

    // Handle range request for audio/video media
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m) {
        res.writeHead(416, { ...secHeaders, 'Content-Range': `bytes */${stats.size}`, 'Content-Type': 'text/plain' });
        res.end('Range Not Satisfiable');
        return;
      }
      let start = m[1] === '' ? 0 : parseInt(m[1], 10);
      let end = m[2] === '' ? stats.size - 1 : parseInt(m[2], 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= stats.size) {
        res.writeHead(416, { ...secHeaders, 'Content-Range': `bytes */${stats.size}`, 'Content-Type': 'text/plain' });
        res.end('Range Not Satisfiable');
        return;
      }
      end = Math.min(end, stats.size - 1);
      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, { ...secHeaders, 'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });
      fileStream.on('error', () => { try { res.end(); } catch {} });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, { ...secHeaders, 'Content-Length': stats.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Cache-Control': 'public, max-age=86400'
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
server.listen(PORT, () => {
  console.log(`[Profile Server] Listening on http://localhost:${PORT}`);
});
