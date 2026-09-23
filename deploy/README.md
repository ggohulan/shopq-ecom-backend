# Deploying to the DreamHost VPS (Ubuntu/Debian + Apache)

Run these in order, over SSH, on the VPS. Every step here is additive — nothing
touches Apache's existing config or any other vhost already on the box. The
only Apache actions are a config **test** and a **graceful reload**, never a
full restart, so anything else already running keeps serving traffic
throughout.

## 1. Check Node, install if missing/too old

```bash
node -v
```

Need 18.18+ (20 LTS recommended). If it's missing or older, install a
user-scoped Node via nvm — this does **not** touch any system-wide Node
another app on the box might already depend on:

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

Copy that output, then on GitHub: `ShopQ-Vercel/ShopQ-Admin-Backend` → Settings
→ Deploy keys → Add deploy key → paste it, leave "Allow write access"
**unchecked** (read-only — this key can never push).

```bash
cat >> ~/.ssh/config << 'EOF'
Host github-shopq-admin-backend
  HostName github.com
  User git
  IdentityFile ~/.ssh/shopq_admin_backend_deploy
EOF
git clone github-shopq-admin-backend:ShopQ-Vercel/ShopQ-Admin-Backend.git ~/shopq-admin-backend
cd ~/shopq-admin-backend
```

## 4. Create `.env.local`

```bash
cat > .env.local << 'EOF'
DB_HOST=<your DreamHost MySQL hostname, e.g. mysql.shopq.lk>
DB_PORT=3306
DB_USER=<db user>
DB_PASSWORD=<db password>
DB_NAME=shopq_supplemental
DB_SSL=false
ADMIN_JWT_SECRET=<generate with: openssl rand -hex 32>
ALLOWED_ORIGIN=https://shopq.lk
LARAVEL_API_BASE_URL=https://shopqhub.com/api/v1
EOF
```

## 5. Build and start under PM2

```bash
npm ci
npm run build
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup   # run the sudo command it prints, so this survives a reboot
```

Confirm it's actually listening before touching Apache:

```bash
curl -I http://127.0.0.1:3001
```

## 6. Enable the Apache proxy modules

```bash
sudo a2enmod proxy proxy_http
```

## 7. Add the new vhost (does not touch any existing one)

```bash
sudo cp deploy/manage.shopq.lk.conf /etc/apache2/sites-available/manage.shopq.lk.conf
sudo a2ensite manage.shopq.lk.conf
sudo apachectl configtest   # must say "Syntax OK" before continuing
sudo systemctl reload apache2
```

## 8. SSL via Certbot (scoped to just this one domain)

```bash
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d manage.shopq.lk
```

Certbot detects the vhost by `ServerName`, gets the cert, and adds the HTTPS
vhost + HTTP→HTTPS redirect on its own.

## 9. Verify

```bash
curl -I https://manage.shopq.lk
curl https://manage.shopq.lk/api/site-offer
```

Both should succeed. If so, this is ready for the DNS + MySQL-allowlist steps
back in the main plan.
