// PM2 process definition for the admin backend on the VPS. `npm start` is
// already `next start -p 3001` in package.json - PM2 just keeps that process
// alive, restarts it if it crashes, and brings it back up after a reboot
// (once `pm2 save` + `pm2 startup` have been run, per deploy/README.md).
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
    },
  ],
};
