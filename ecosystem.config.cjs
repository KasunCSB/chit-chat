// PM2 Ecosystem Configuration for Oracle VM Deployment
// Usage: pm2 start ecosystem.config.cjs --env production

module.exports = {
  apps: [
    {
      name: 'chitchat',
      script: 'src/server.js',
      instances: 1,  // Single instance
      exec_mode: 'fork',
      
      // Environment
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        SERVER_ID: 'oracle-vm',
        REDIS_URL: 'redis://localhost:6379',
        BASE_URL: 'https://cc.kasunc.live',
        CORS_ORIGIN: 'https://chit-chat-g7.web.app,https://chit-chat-g7.firebaseapp.com,https://cc.kasunc.live',
        TRUST_PROXY: 'true',
        ROOM_TTL_SECONDS: '86400',
        RECENT_MESSAGES_LIMIT: '200',
        RATE_LIMIT_WINDOW_MS: '15000',
        RATE_LIMIT_MAX: '80',
        // HA Settings
        RECONNECT_GRACE_SECONDS: '30',
        PRESENCE_HEARTBEAT_MS: '5000',
        PRESENCE_STALE_MS: '15000'
      },
      
      // Auto-restart behavior
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Logging
      error_file: '/var/log/chitchat/error.log',
      out_file: '/var/log/chitchat/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'status-aggregator',
      script: 'scripts/status-aggregator.cjs',
      instances: 1,
      exec_mode: 'fork',
      
      // Environment
      env_production: {
        NODE_ENV: 'production',
        STATUS_PORT: '3001',
        BACKEND_HOST: '127.0.0.1',
        BACKEND_PORT: '3000'
      },
      
      // Auto-restart behavior
      autorestart: true,
      watch: false,
      max_memory_restart: '100M',
      
      // Logging
      error_file: '/var/log/chitchat/status-error.log',
      out_file: '/var/log/chitchat/status-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
