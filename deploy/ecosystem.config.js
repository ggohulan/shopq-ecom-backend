// PM2 process definition for the admin backend on the VPS. `npm start` is
// already `next start -p 8001 -H 0.0.0.0` in package.json - PM2 just keeps
// that process alive and restarts it if it crashes or gets OOM-killed. Port
// 8001 and the 0.0.0.0 bind are required by DreamHost's Proxy Server feature
// (Servers & Usage -> Manage -> Proxy Server), which replaces the
// hand-written Apache vhost this project used to ship - see deploy/README.md.
//
// This VPS has 1GB RAM and no swap, so `pm2 startup` (needs root) is not
// available - reboot persistence goes through a user crontab `@reboot` entry
// instead, and max_memory_restart caps this process so a leak gets a clean
// PM2 restart rather than the kernel OOM-killing it.
module.exports = {
  apps: [
    {
      name: 'shopq-admin-backend',
      script: 'npm',
      args: 'start',
      cwd: __dirname + '/..',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '400M',
    },
  ],
};
