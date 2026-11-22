
---

## Rust server (recommended)

The production server is now the Rust/axum rewrite in `src/main.rs` (see `Cargo.toml`).
It is behavior-compatible with the original `server.js` (same routes, headers, gzip, ETag,
range requests, view counter and webhook), but uses ~10 MB RAM instead of ~80 MB and ships
as a single ~5 MB binary.

```bash
cargo build --release
PORT=3000 ./target/release/profile-rs
```

`server.js` is kept for reference/rollback. The systemd unit `profile-web-rs.service` runs
the Rust binary from this repo; `profile-web.service` (Node) is kept disabled as rollback:

```bash
sudo systemctl stop profile-web-rs && sudo systemctl start profile-web   # rollback to Node
sudo systemctl stop profile-web && sudo systemctl start profile-web-rs   # back to Rust
```
