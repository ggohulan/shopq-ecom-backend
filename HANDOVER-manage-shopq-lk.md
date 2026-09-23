# Deploy brief: manage.shopq.lk on the DreamHost VPS

Paste this whole file into Claude Code as your opening prompt, in a session
opened on the ShopQ admin backend repo. Work through it in order.

---

## Context

We are bringing up a Node/Express admin backend at `manage.shopq.lk`, behind
Apache as a reverse proxy, on a DreamHost VPS. The repo contains a
`deploy/README.md` with the intended steps, plus `deploy/ecosystem.config.js`
and `deploy/manage.shopq.lk.conf`.

**The server already hosts other live production sites.** Everything below is
written around that fact. An outage on this box is not limited to our app.

Current state, as far as we know:

- Code is pushed to GitHub. Nothing pulls it onto the VPS. There is no deploy
  pipeline — do not assume one exists, verify it.
- `manage.shopq.lk` DNS currently points at **Vercel**, not at this VPS.
- DreamHost MySQL "Remote Hosts" currently allows any IP, so DB access should
  work before the allowlist is tightened.
- Nothing is running under PM2 for this app yet.

---

## Hard rules

1. **Never `systemctl restart apache2`.** Only `sudo systemctl reload apache2`,
   and only after `sudo apachectl configtest` prints `Syntax OK`.
2. **Never edit, move or disable an existing vhost.** We add exactly one new
   site file and enable exactly that one.
3. **Stop and report** rather than improvising if any preflight check in
   Phase 0 fails. Several of them are go/no-go for the whole approach.
4. **Do not put real secrets in chat.** DB credentials come from the repo
   owner directly onto the server. Generate the JWT secret on the server.
5. **Do not touch DNS yourself.** The repo owner controls it. You tell them
   when to switch and what to point it at.

---

## Phase 0 — Preflight. Change nothing.

Run these and report the output before doing anything else.

```bash
# Which DreamHost product is this? Managed VPS = no root = stop.
hostname
sudo -n true 2>&1 | head -1

# Node, npm, git, pm2
node -v; npm -v; git --version; which pm2 || echo "no pm2"

# What Apache is already serving - our blast radius
sudo apachectl -S 2>&1 | head -40
apache2 -v

# Save current state so we can diff later
ls /etc/apache2/sites-enabled/ > ~/apache-sites-before.txt
cat ~/apache-sites-before.txt

# Is our intended port free?
ss -tlnp | grep -E ':(3001|3000)' || echo "3001 free"

# Where does the domain point, and what is our outbound IP?
dig +short manage.shopq.lk
curl -4 ifconfig.me
```

### Go / no-go

- **If `hostname` looks like `psNNNNNN.dreamhostps.com`, or sudo is
  unavailable** — this is a *Managed* DreamHost VPS. There is no root on that
  product. Steps 6, 7 and 8 of `deploy/README.md` are impossible: Apache config
  is DreamHost's, and certbot cannot run. **Stop and report this.** The app
  would need to run under Passenger with SSL from the DreamHost panel instead,
  which is a different piece of work.
- **If port 3001 is already in use** by one of the other sites — stop, report,
  and we pick a different port. Changing it means editing
  `deploy/ecosystem.config.js` and the vhost together.
- **Confirm the repo.** `deploy/README.md` refers to
  `ShopQ-Vercel/ShopQ-Admin-Backend`, but the code may actually live at
  `ggohulan/shopq-ecom-backend`. Check `git remote -v` in the repo you were
  given and use that. Do not add a deploy key to the wrong repository.

Also read and report the contents of `deploy/ecosystem.config.js` and
`deploy/manage.shopq.lk.conf`, specifically: **which port does the app bind,
and which port does the vhost proxy to?** They must match, and they must match
the `curl` check later. If they disagree, say so before proceeding.

---

## Phase 1 — Get the app running. No Apache changes yet.

Follow `deploy/README.md` steps 1 to 5, with these amendments.

**Node:** use nvm, user-scoped, as the README says. Do not install or upgrade a
system-wide Node — another site on this box may depend on it.

**Deploy key:** read-only. "Allow write access" stays unchecked. The repo owner
adds it, or you send them the public key.

**`.env.local`:** create the file with the keys from README step 4, but do not
invent values. `ADMIN_JWT_SECRET` you generate on the server:

```bash
openssl rand -hex 32
```

The DB credentials come from the repo owner. Ask them to paste the values
directly on the server, or to send them via a password manager — not over chat
or email. Then lock the file down:

```bash
chmod 600 .env.local
```

**Start it and prove it is listening**, using whatever port the config actually
uses:

```bash
npm ci
npm run build
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 logs --lines 50
curl -I http://127.0.0.1:3001
```

Check the PM2 logs for a successful MySQL connection and no crash loop.

`pm2 startup` prints a sudo command for reboot persistence. Run it if you have
sudo. If you do not, note it — the app will not survive a reboot and that needs
solving separately.

**Do not continue until that `curl` returns a real response.** If the app
cannot reach the database, check the DreamHost MySQL hostname, the credentials,
and whether the allowlist has already been tightened.

---

## Phase 2 — Apache, tested before DNS moves

README steps 6 and 7, then a verification the README omits.

```bash
sudo a2enmod proxy proxy_http
sudo cp deploy/manage.shopq.lk.conf /etc/apache2/sites-available/manage.shopq.lk.conf
sudo a2ensite manage.shopq.lk.conf
sudo apachectl configtest
sudo systemctl reload apache2
```

`configtest` must print `Syntax OK` before the reload. If it does not, run
`sudo a2dissite manage.shopq.lk.conf` and report — do not reload a config that
failed its test, because the other sites share this Apache instance.

Confirm the other sites are still healthy:

```bash
sudo apachectl -S 2>&1 | head -40
ls /etc/apache2/sites-enabled/
```

Compare that listing against `~/apache-sites-before.txt`. The only difference
should be our one new file.

**Now verify our vhost works without DNS.** This step is missing from the
README, and it is what lets us test safely while the domain still points at
Vercel:

```bash
curl -I -H "Host: manage.shopq.lk" http://127.0.0.1/
curl -H "Host: manage.shopq.lk" http://127.0.0.1/api/site-offer
```

That should reach our Node app through Apache. If it does, the proxy is
correct and the only things left are DNS and SSL.

---

## Phase 3 — DNS, then SSL. This order matters.

`certbot --apache` validates over HTTP-01, which requires `manage.shopq.lk` to
already resolve to this server. **The README runs certbot before the DNS
change, which cannot work.** Correct order:

1. **Report to the repo owner:** Phase 2 verified, ready for DNS. Give them the
   server's public IP. Ask them to lower the TTL on the record first if they
   can, then point `manage.shopq.lk` at the VPS instead of Vercel.

2. **Wait for propagation** and confirm:

   ```bash
   dig +short manage.shopq.lk
   ```

   That must return this server's IP before continuing.

3. **Only then, certbot:**

   ```bash
   sudo apt install certbot python3-certbot-apache
   sudo certbot --apache -d manage.shopq.lk
   sudo apachectl configtest
   systemctl list-timers | grep certbot
   ```

4. **Verify:**

   ```bash
   curl -I https://manage.shopq.lk
   curl https://manage.shopq.lk/api/site-offer
   sudo apachectl -S 2>&1 | head -40
   ```

Certbot edits Apache config to add the HTTPS vhost and the HTTP redirect. Re-run
`configtest` afterwards and check the other sites once more — this is the single
point in the process where a third-party tool writes to shared config.

---

## If something breaks

```bash
# Our vhost is the problem - remove just ours, leave everything else
sudo a2dissite manage.shopq.lk.conf
sudo apachectl configtest && sudo systemctl reload apache2

# Our app is the problem
pm2 logs --lines 100
pm2 restart <app-name>
pm2 delete <app-name>
```

Removing our site file returns the box to its previous state. The other sites
are unaffected by `a2dissite` on a file they do not use.

---

## Report back

When you stop — finished or blocked — report:

1. Managed VPS or root-capable? (Phase 0)
2. What else Apache serves on this box
3. The port the app binds, and whether the vhost matched it
4. Whether the app started and reached MySQL
5. The server's outbound IP, for the DreamHost MySQL allowlist
6. Whether Phase 2's `Host:` header test passed
7. What is left, and what you need from the repo owner
