//! Rust rewrite of profile-hd929/server.js (proof of concept, behavior-compatible).
use axum::{
    body::{to_bytes, Body},
    extract::{Request, State},
    http::{header, HeaderMap, Method, StatusCode, Uri},
    response::Response,
    routing::{get, post},
    Router,
};
use flate2::{write::GzEncoder, Compression};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::RwLock;

const SEC_HEADERS: &[(&str, &str)] = &[
    ("X-Frame-Options", "DENY"),
    ("X-Content-Type-Options", "nosniff"),
    ("Strict-Transport-Security", "max-age=31536000; includeSubDomains"),
];

struct Asset {
    bytes: Vec<u8>,
    etag: String,
    content_type: &'static str,
    gz: Option<Vec<u8>>,
    cache_control: &'static str,
}

#[derive(Default)]
struct AppInner {
    rate: HashMap<String, u128>,
    views: i64,
    viewed: HashMap<String, u128>,
    views_dirty: bool,
    yt_cache: HashMap<String, (u128, Vec<String>)>,
    assets: HashMap<String, Asset>,
}

struct AppState {
    inner: RwLock<AppInner>,
    root: PathBuf,
    webhook: Option<String>,
    reset_token: Option<String>,
    view_salt: String,
    trust_cf: bool,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn load_dotenv() {
    let p = PathBuf::from(".env");
    let Ok(content) = fs::read_to_string(p) else { return };
    for line in content.lines() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') { continue }
        if let Some(eq) = t.find('=') {
            let k = t[..eq].trim().to_string();
            let mut v = t[eq + 1..].trim().to_string();
            if (v.starts_with('"') && v.ends_with('"')) || (v.starts_with('\'') && v.ends_with('\'')) {
                v = v[1..v.len() - 1].to_string();
            }
            if std::env::var(&k).is_err() { std::env::set_var(&k, v); }
        }
    }
}

fn hash_ip(salt: &str, ip: &str) -> String {
    let mut h = Sha256::new();
    h.update(format!("{}{}", salt, ip).as_bytes());
    let hex: String = h.finalize().iter().map(|b| format!("{:02x}", b)).collect();
    hex[..16].to_string()
}

fn gzip(bytes: &[u8]) -> Vec<u8> {
    let mut e = GzEncoder::new(Vec::new(), Compression::new(6));
    let _ = e.write_all(bytes);
    e.finish().unwrap_or_default()
}

fn accepts_gzip(h: &HeaderMap) -> bool {
    h.get(header::ACCEPT_ENCODING)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_lowercase().contains("gzip"))
        .unwrap_or(false)
}

fn get_client_ip(h: &HeaderMap, state: &AppState) -> String {
    let hget = |k: &str| h.get(k).and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let cf = if state.trust_cf { hget("cf-connecting-ip") } else { None };
    cf.or_else(|| hget("x-real-ip"))
        .or_else(|| hget("x-forwarded-for").map(|s| s.split(',').next().unwrap_or("").trim().to_string()).filter(|s| !s.is_empty()))
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

fn add_sec(mut b: axum::http::response::Builder) -> axum::http::response::Builder {
    for (k, v) in SEC_HEADERS { b = b.header(*k, *v); }
    b
}

fn json_response(headers: &HeaderMap, status: StatusCode, obj: Value, extra: &[(&str, &str)]) -> Response {
    let body = serde_json::to_string(&obj).unwrap_or_else(|_| "{}".to_string());
    let mut b = add_sec(Response::builder())
        .status(status)
        .header(header::CONTENT_TYPE, "application/json; charset=utf-8");
    for (k, v) in extra { b = b.header(*k, *v); }
    if accepts_gzip(headers) {
        let gz = gzip(body.as_bytes());
        b = b.header(header::CONTENT_ENCODING, "gzip").header(header::VARY, "Accept-Encoding");
        b.body(Body::from(gz)).unwrap()
    } else {
        b.header(header::CONTENT_LENGTH, body.len()).body(Body::from(body)).unwrap()
    }
}

fn text_response(status: StatusCode, body: &str) -> Response {
    add_sec(Response::builder())
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(header::CONTENT_LENGTH, body.len())
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn mime_for(ext: &str) -> &'static str {
    match ext {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "webm" => "audio/webm",
        "mp3" => "audio/mpeg",
        "json" => "application/json; charset=utf-8",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        _ => "application/octet-stream",
    }
}

fn is_compressible(ct: &str) -> bool {
    matches!(ct, "text/html; charset=utf-8" | "text/css; charset=utf-8" | "text/javascript; charset=utf-8" | "image/svg+xml" | "application/json; charset=utf-8")
        || ct.starts_with("text/")
}

async fn get_views(State(st): State<Arc<AppState>>, h: HeaderMap) -> Response {
    let count = st.inner.read().await.views;
    json_response(&h, StatusCode::OK, json!({ "count": count }), &[("Access-Control-Allow-Origin", "*")])
}

async fn up_views(State(st): State<Arc<AppState>>, h: HeaderMap) -> Response {
    let ip = get_client_ip(&h, &st);
    let mut w = st.inner.write().await;
    let key = hash_ip(&st.view_salt, &ip);
    if let Some(ts) = w.viewed.get(&key) {
        if now_ms().saturating_sub(*ts) <= 86_400_000 {
            let c = w.views;
            return json_response(&h, StatusCode::OK, json!({ "count": c, "deduped": true }), &[("Access-Control-Allow-Origin", "*")]);
        }
    }
    w.views += 1;
    w.viewed.insert(key, now_ms());
    w.views_dirty = true;
    let c = w.views;
    json_response(&h, StatusCode::OK, json!({ "count": c }), &[("Access-Control-Allow-Origin", "*")])
}

async fn reset_views(State(st): State<Arc<AppState>>, h: HeaderMap) -> Response {
    let token = h.get("x-reset-token").and_then(|v| v.to_str().ok()).unwrap_or("");
    let ok = st.reset_token.as_deref().map(|e| !e.is_empty() && e.as_bytes() == token.as_bytes()).unwrap_or(false);
    if !ok {
        return json_response(&h, StatusCode::FORBIDDEN, json!({ "success": false, "error": "Unauthorized" }), &[]);
    }
    let mut w = st.inner.write().await;
    w.views = 0;
    w.viewed.clear();
    w.views_dirty = true;
    drop(w);
    json_response(&h, StatusCode::OK, json!({ "success": true, "count": 0 }), &[
        ("Access-Control-Allow-Origin", "*"),
        ("Referrer-Policy", "strict-origin-when-cross-origin"),
    ])
}

fn sanitize(s: &str) -> String {
    s.replace("@everyone", "@\u{200b}everyone")
        .replace("@here", "@\u{200b}here")
        .replace("```", "'''")
}

async fn send_message(State(st): State<Arc<AppState>>, h: HeaderMap, req: Request) -> Response {
    let ip = get_client_ip(&h, &st);
    let now = now_ms();
    {
        let mut w = st.inner.write().await;
        if let Some(ts) = w.rate.get(&ip) {
            if now - *ts < 20_000 {
                let wait = ((20_000 - (now - *ts)) / 1000 + 1).to_string();
                return json_response(&h, StatusCode::TOO_MANY_REQUESTS, json!({
                    "success": false,
                    "error": format!("You are sending messages too fast! Please wait {}s before sending again.", wait)
                }), &[]);
            }
        }
    }
    let body = match to_bytes(req.into_body(), 10 * 1024).await {
        Ok(b) => b,
        Err(_) => return json_response(&h, StatusCode::PAYLOAD_TOO_LARGE, json!({
            "success": false, "error": "Message payload too large (max 10KB)."
        }), &[("Connection", "close")]),
    };
    let data: Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => return json_response(&h, StatusCode::BAD_REQUEST, json!({ "success": false, "error": "Invalid JSON payload." }), &[]),
    };
    let jsstr = |v: Option<&Value>| -> String {
        match v {
            Some(Value::String(s)) => s.clone(),
            Some(Value::Number(n)) => n.to_string(),
            Some(Value::Bool(b)) => b.to_string(),
            Some(Value::Null) | None => "".to_string(),
            _ => "".to_string(),
        }
    };
    let name = sanitize(&jsstr(data.get("name")).trim().chars().take(50).collect::<String>());
    let name = if name.is_empty() { "Anonymous".to_string() } else { name };
    let msg = sanitize(&jsstr(data.get("msg")).trim().chars().take(1000).collect::<String>());
    if msg.is_empty() {
        return json_response(&h, StatusCode::BAD_REQUEST, json!({ "success": false, "error": "Message cannot be empty!" }), &[]);
    }
    let Some(webhook) = st.webhook.clone() else {
        return json_response(&h, StatusCode::INTERNAL_SERVER_ERROR, json!({
            "success": false, "error": "Unable to send message at this time. Please try again later!"
        }), &[]);
    };
    let tz = chrono::FixedOffset::east_opt(7 * 3600).unwrap();
    let ts = chrono::Utc::now().with_timezone(&tz).format("%d/%m/%Y, %H:%M:%S").to_string();
    let iso = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let payload = json!({
        "username": "Aji Mailbox 💌",
        "embeds": [{
            "title": "📬 You received a new anonymous message!",
            "color": 13346551,
            "fields": [
                { "name": "👤 Sender", "value": format!("**{}**", name), "inline": true },
                { "name": "⏰ Time", "value": ts, "inline": true },
                { "name": "💬 Message", "value": format!("```\n{}\n```", msg) }
            ],
            "footer": { "text": format!("Sent from https://ajitana.io.vn • IP: {}", ip.split(',').next().unwrap_or("").trim()) },
            "timestamp": iso
        }]
    });
    let client = reqwest::Client::new();
    match client.post(&webhook).json(&payload).send().await {
        Ok(r) if r.status().is_success() => {
            st.inner.write().await.rate.insert(ip, now);
            json_response(&h, StatusCode::OK, json!({ "success": true, "message": "Your message has been sent to Aji!" }), &[])
        }
        _ => json_response(&h, StatusCode::INTERNAL_SERVER_ERROR, json!({
            "success": false, "error": "Unable to send message at this time. Please try again later!"
        }), &[]),
    }
}

async fn youtube_playlist(State(st): State<Arc<AppState>>, h: HeaderMap, uri: Uri) -> Response {
    let id = uri.query()
        .and_then(|q| q.split('&').find_map(|kv| kv.strip_prefix("id=")))
        .filter(|s| !s.is_empty())
        .unwrap_or("PLsDvPWj1sLN61RtOJQyXQowMt7rAo4nYd")
        .to_string();
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return json_response(&h, StatusCode::BAD_REQUEST, json!({ "success": false, "error": "Invalid playlist id" }), &[
            ("Referrer-Policy", "strict-origin-when-cross-origin")
        ]);
    }
    {
        let r = st.inner.read().await;
        if let Some((ts, videos)) = r.yt_cache.get(&id) {
            if now_ms() - *ts < 60_000 {
                return json_response(&h, StatusCode::OK, json!({ "success": !videos.is_empty(), "list": videos }), &[
                    ("Access-Control-Allow-Origin", "*"),
                    ("Referrer-Policy", "strict-origin-when-cross-origin"),
                    ("Cache-Control", "no-cache, must-revalidate"),
                ]);
            }
        }
    }
    let url = format!("https://www.youtube.com/playlist?list={}", id);
    let client = reqwest::Client::new();
    let html = match client.get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .header("Accept-Language", "en-US,en;q=0.9")
        .send().await
    {
        Ok(r) => r.text().await.unwrap_or_default(),
        Err(_) => String::new(),
    };
    let mut vids: Vec<String> = Vec::new();
    let re_id = regex::Regex::new(r#""(?:contentId|videoId)":"([a-zA-Z0-9_-]{11})""#).unwrap();
    for cap in re_id.captures_iter(&html) {
        let v = cap[1].to_string();
        if !vids.contains(&v) { vids.push(v); }
    }
    if vids.is_empty() {
        let re_watch = regex::Regex::new(r"/watch\?v=([a-zA-Z0-9_-]{11})").unwrap();
        for cap in re_watch.captures_iter(&html) {
            let v = cap[1].to_string();
            if !vids.contains(&v) { vids.push(v); }
        }
    }
    if !vids.is_empty() {
        st.inner.write().await.yt_cache.insert(id, (now_ms(), vids.clone()));
    }
    json_response(&h, StatusCode::OK, json!({ "success": !vids.is_empty(), "list": vids }), &[
        ("Access-Control-Allow-Origin", "*"),
        ("Referrer-Policy", "strict-origin-when-cross-origin"),
        ("Cache-Control", "no-cache, must-revalidate"),
    ])
}

async fn static_file(State(st): State<Arc<AppState>>, h: HeaderMap, method: Method, uri: Uri) -> Response {
    if method != Method::GET && method != Method::HEAD { return text_response(StatusCode::FORBIDDEN, "Forbidden"); }
    let mut path = uri.path().to_string();
    if path == "/" { path = "/index.html".to_string(); }
    let lower = path.to_lowercase();
    let allowed = lower.starts_with("/assets/") || lower == "/favicon.ico" || lower == "/index.html";
    if lower.contains("..") || lower.contains('\0') || !allowed {
        return text_response(StatusCode::FORBIDDEN, "Forbidden");
    }
    let file = st.root.join(&path[1..]);
    let meta = match fs::metadata(&file) {
        Ok(m) if m.is_file() => m,
        _ => return text_response(StatusCode::NOT_FOUND, "Not Found"),
    };
    let size = meta.len();
    let mtime = meta.modified().ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64).unwrap_or(0);
    let etag = format!("W/\"{}-{}\"", size, mtime);
    let ext = Path::new(&path).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let ct = mime_for(&ext);
    let cc = if ext == "html" || ext == "js" { "no-cache, must-revalidate" } else { "public, max-age=2592000" };

    if let Some(inm) = h.get(header::IF_NONE_MATCH).and_then(|v| v.to_str().ok()) {
        if inm == etag || inm == format!("W/{}", etag) {
            return add_sec(Response::builder()).status(StatusCode::NOT_MODIFIED)
                .header(header::ETAG, etag).header(header::CACHE_CONTROL, cc)
                .header(header::VARY, "Accept-Encoding")
                .body(Body::empty()).unwrap();
        }
    }

    let range = h.get(header::RANGE).and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let (bytes, gz) = {
        let mut w = st.inner.write().await;
        if let Some(a) = w.assets.get(&path) {
            if a.etag == etag { (a.bytes.clone(), a.gz.clone()) }
            else {
                let b = fs::read(&file).unwrap_or_default();
                let g = if is_compressible(ct) { Some(gzip(&b)) } else { None };
                w.assets.insert(path.clone(), Asset { bytes: b.clone(), etag: etag.clone(), content_type: ct, gz: g.clone(), cache_control: cc });
                (b, g)
            }
        } else {
            let b = fs::read(&file).unwrap_or_default();
            let g = if is_compressible(ct) { Some(gzip(&b)) } else { None };
            w.assets.insert(path.clone(), Asset { bytes: b.clone(), etag: etag.clone(), content_type: ct, gz: g.clone(), cache_control: cc });
            (b, g)
        }
    };

    if let Some(r) = range {
        let re = regex::Regex::new(r"^bytes=(\d*)-(\d*)$").unwrap();
        let caps = re.captures(&r);
        let (start, end) = match caps {
            Some(c) => {
                let s = if c[1].is_empty() { 0 } else { c[1].parse::<u64>().unwrap_or(u64::MAX) };
                let e = if c[2].is_empty() { size - 1 } else { c[2].parse::<u64>().unwrap_or(u64::MAX) };
                (s, e)
            }
            None => return add_sec(Response::builder()).status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header("Content-Range", format!("bytes */{}", size))
                .body(Body::from("Range Not Satisfiable")).unwrap(),
        };
        if start == u64::MAX || end == u64::MAX || start > end || start >= size {
            return add_sec(Response::builder()).status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header("Content-Range", format!("bytes */{}", size))
                .body(Body::from("Range Not Satisfiable")).unwrap();
        }
        let end = end.min(size - 1);
        let chunk = bytes[start as usize..=end as usize].to_vec();
        return add_sec(Response::builder()).status(StatusCode::PARTIAL_CONTENT)
            .header("Content-Range", format!("bytes {}-{}/{}", start, end, size))
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::CONTENT_LENGTH, chunk.len())
            .header(header::CONTENT_TYPE, ct)
            .header(header::ETAG, etag)
            .header("Access-Control-Allow-Origin", "*")
            .header("Referrer-Policy", "strict-origin-when-cross-origin")
            .body(Body::from(chunk)).unwrap();
    }

    let mut b = add_sec(Response::builder()).status(StatusCode::OK)
        .header(header::CONTENT_TYPE, ct)
        .header(header::ETAG, etag)
        .header("Access-Control-Allow-Origin", "*")
        .header("Referrer-Policy", "strict-origin-when-cross-origin")
        .header(header::CACHE_CONTROL, cc);
    if accepts_gzip(&h) {
        if let Some(g) = gz {
            b = b.header(header::CONTENT_ENCODING, "gzip").header(header::VARY, "Accept-Encoding");
            return b.body(Body::from(g)).unwrap();
        }
    }
    b.header(header::CONTENT_LENGTH, bytes.len())
        .header(header::ACCEPT_RANGES, "bytes")
        .body(Body::from(bytes)).unwrap()
}

async fn flush(st: &Arc<AppState>, sync: bool) {
    let (a, b) = {
        let mut w = st.inner.write().await;
        if !w.views_dirty { return }
        w.views_dirty = false;
        let now = now_ms();
        w.viewed.retain(|_, ts| now - *ts <= 86_400_000);
        (serde_json::to_string(&json!({ "count": w.views })).unwrap(),
         serde_json::to_string(&w.viewed).unwrap())
    };
    let base = &st.root;
    if sync {
        let _ = fs::write(base.join("views.json"), a);
        let _ = fs::write(base.join("viewed_ips.json"), b);
    } else {
        let _ = fs::write(base.join("views.json.tmp"), a).and_then(|_| fs::rename(base.join("views.json.tmp"), base.join("views.json")));
        let _ = fs::write(base.join("viewed_ips.json.tmp"), b).and_then(|_| fs::rename(base.join("viewed_ips.json.tmp"), base.join("viewed_ips.json")));
    }
}

#[tokio::main]
async fn main() {
    load_dotenv();
    let root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let view_count = fs::read_to_string(root.join("views.json")).ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.get("count").and_then(|c| c.as_i64()))
        .unwrap_or(0);
    let mut viewed = HashMap::new();
    if let Ok(s) = fs::read_to_string(root.join("viewed_ips.json")) {
        if let Ok(Value::Object(m)) = serde_json::from_str(&s) {
            for (k, v) in m {
                if k.len() == 16 && k.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()) {
                    if let Some(ts) = v.as_i64() {
                        if now_ms().saturating_sub(ts as u128) <= 86_400_000 { viewed.insert(k, ts as u128); }
                    }
                }
            }
        }
    }
    let st = Arc::new(AppState {
        inner: RwLock::new(AppInner { views: view_count, viewed, ..Default::default() }),
        root: root.clone(),
        webhook: std::env::var("DISCORD_WEBHOOK_URL").ok().filter(|s| !s.is_empty()),
        reset_token: std::env::var("RESET_TOKEN").or_else(|_| std::env::var("VIEWS_RESET_TOKEN")).ok().filter(|s| !s.is_empty()),
        view_salt: std::env::var("VIEW_SALT").unwrap_or_else(|_| "profile-views-salt".to_string()),
        trust_cf: std::env::var("TRUST_CLOUDFLARE").as_deref() != Ok("0"),
    });

    // Periodic flush
    let flush_st = st.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(10));
        loop {
            tick.tick().await;
            flush(&flush_st, false).await;
        }
    });

    let app = Router::new()
        .route("/api/send-message", post(send_message))
        .route("/api/views", get(get_views))
        .route("/api/views/up", post(up_views))
        .route("/api/views/reset", post(reset_views))
        .route("/api/youtube-playlist", get(youtube_playlist))
        .fallback(static_file)
        .with_state(st.clone());

    let port: u16 = std::env::var("PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(3001);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await.expect("bind failed");
    println!("[Profile RS] Listening on http://localhost:{}", port);

    #[cfg(unix)]
    {
        let mut sig = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).unwrap();
        tokio::select! {
            _ = axum::serve(listener, app) => {},
            _ = sig.recv() => { flush(&st, true).await; }
        }
    }
    #[cfg(not(unix))]
    axum::serve(listener, app).await.unwrap();
}
