module.exports = {
  apps: [{
    name: "ajitana-profile",
    script: "server.js",
    instances: 1,
    exec_mode: "fork",
    env: {
      NODE_ENV: "production",
      PORT: 3000
      // DISCORD_WEBHOOK_URL: set via `pm2 env` or .env on server
      // VIEWS_RESET_TOKEN: set via env on server
    },
    watch: false,
    autorestart: true,
    max_memory_restart: "300M",
    log_date_format: "YYYY-MM-DD HH:mm:ss Z"
  }]
};
