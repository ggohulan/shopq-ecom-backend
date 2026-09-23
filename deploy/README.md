# Deploying to the DreamHost VPS (Ubuntu/Debian + Apache)

Run these in order, over SSH, on the VPS. Every step here is additive — nothing
touches Apache's existing config or any other vhost already on the box. The
only Apache actions are a config **test** and a **graceful reload**, never a
full restart, so anything else already running keeps serving traffic
throughout.

> For a more cautious, fully-guided run (preflight checks, rollback commands,
> a check for whether this VPS even has root) see `HANDOVER-manage-shopq-lk.md`
> if present in this repo — this file is the quick-reference version of the
> same steps, corrected to match it.

## 1. Check Node, install if missing/too old

```bash
node -v
```

Need 18.18+ (20 LTS recommended) — this is a **Next.js** app (`next start`),
not Express. If Node is missing or older, install a user-scoped Node via nvm —
this does **not** touch any system-wide Node another app on the box might
already depend on:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

## 2. Install PM2

```bash
npm install -g pm2
```

## 3. Get the code onto the server (SSH deploy key, read-only, scoped to this one repo)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/shopq_admin_backend_deploy -N ""
cat ~/.ssh/shopq_admin_backend_deploy.pub
```

Copy that output, then on GitHub: `ggohulan/shopq-ecom-backend` → Settings →
Deploy keys → Add deploy key → paste it, leave "Allow write access"
**unchecked** (read-only — this key can never push).

```bash
cat >> ~/.ssh/config << 'EOF'
Host github-shopq-admin-backend
  HostName github.com
  User git
  IdentityFile ~/.ssh/shopq_admin_backend_deploy
EOF
git clone github-shopq-admin-backend:ggohulan/shopq-ecom-backend.git ~/shopq-admin-backend
cd ~/shopq-admin-backend
```

## 4. Create `.env.local`

DB credentials come from whoever created the database (in phpMyAdmin) —
paste them directly here, not over chat. Generate the JWT secret on the
server itself:

```bash
openssl rand -hex 32
```

```bash
cat > .env.local << 'EOF'
DB_HOST=<your DreamHost MySQL hostname, e.g. mysql.shopq.lk>
DB_PORT=3306
DB_USER=<db user>
DB_PASSWORD=<db password>
DB_NAME=shopq_supplemental
DB_SSL=false
ADMIN_JWT_SECRET=<paste the openssl output here>
ALLOWED_ORIGIN=https://shopq.lk
LARAVEL_API_BASE_URL=https://shopqhub.com/api/v1
EOF
chmod 600 .env.local
```

## 5. Build and start under PM2

```bash
npm ci
npm run build
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 logs --lines 50   # confirm it connected to MySQL and isn't crash-looping
pm2 startup           # run the sudo command it prints, so this survives a reboot
```

Confirm it's actually listening before touching Apache:

```bash
curl -I http://127.0.0.1:3001
```

**Do not continue past this point until that `curl` returns a real response.**

## 6. Enable the Apache proxy modules

```bash
sudo a2enmod proxy proxy_http
```

## 7. Add the new vhost (does not touch any existing one)

```bash
sudo cp deploy/manage.shopq.lk.conf /etc/apache2/sites-available/manage.shopq.lk.conf
sudo a2ensite manage.shopq.lk.conf
sudo apachectl configtest   # must say "Syntax OK" - if not, `a2dissite` and stop
sudo systemctl reload apache2   # reload only, never `restart` - other sites share this Apache
```

Verify the proxy actually works **before DNS points here** — this is the part
worth not skipping, since it lets you catch a misconfigured vhost while the
live domain is still safely pointed at Vercel:

```bash
curl -I -H "Host: manage.shopq.lk" http://127.0.0.1/
curl -H "Host: manage.shopq.lk" http://127.0.0.1/api/site-offer
```

Both should reach the Node app through Apache. If they do, only DNS and SSL
are left.

## 8. DNS, then SSL — in that order

Certbot's `--apache` plugin validates over HTTP-01, which requires
`manage.shopq.lk` to already resolve to **this** server. Doing this in the
wrong order is the single most common way this step fails.

1. Point `manage.shopq.lk` at this VPS's IP — that DNS record lives in
   **Vercel's** domain settings (Vercel controls `shopq.lk`'s DNS), not
   DreamHost's.

2. Wait for it to actually propagate:

   ```bash
   dig +short manage.shopq.lk
   ```

   Confirm that prints this server's IP before continuing.

3. Only then:

   ```bash
   sudo apt install certbot python3-certbot-apache
   sudo certbot --apache -d manage.shopq.lk
   sudo apachectl configtest
   ```

   Certbot detects the vhost by `ServerName`, gets the cert, and adds the
   HTTPS vhost + HTTP→HTTPS redirect on its own.

## 9. Verify

```bash
curl -I https://manage.shopq.lk
curl https://manage.shopq.lk/api/site-offer
```

Both should succeed. If so, the last remaining step is tightening DreamHost's
MySQL "Remote Hosts" from `%` to this server's specific IP.
