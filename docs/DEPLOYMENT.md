# Deployment guide

Self-hosted with Docker Compose: Caddy (automatic HTTPS) -> `web`, `worker`, a one-shot `migrate`, and `postgres`. Everything is free and open source. Design: [ADR 0018](adr/0018-production-deployment.md), backups: [ADR 0019](adr/0019-backups.md).

## 1. What you need

- A Linux server (a small VPS or a home server). 2 vCPU, 2 GB RAM and 20 GB disk are enough for a household or two; add 2 GB RAM if you enable ClamAV. Docker Engine 25+ with the Compose plugin v2.24+ (`docker compose version`).
- A domain name (a free subdomain from a dynamic DNS service works) with an A/AAAA record pointing to the server.
- An SMTP account for outgoing mail (see [SMTP](#5-outgoing-email)). Sign-up verification and password reset need it.
- Ports 80 and 443 (TCP) and 443 (UDP, HTTP/3) reachable from the internet, for the certificate and for visitors.

## 2. Firewall

Allow only SSH, 80 and 443. Postgres, the web app and the worker publish no ports at all; they live on an internal Docker network.

```bash
sudo ufw default deny incoming && sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443
sudo ufw enable
```

Docker publishes ports by editing iptables directly, which bypasses ufw rules. That is why this stack publishes nothing except Caddy's 80/443; do not add `ports:` to other services.

## 3. First-time setup

```bash
git clone <your repository url> animal-logbook && cd animal-logbook

# Secrets live outside the repository, readable by you only
sudo install -d -m 700 /etc/animal-logbook
cp .env.production.example /etc/animal-logbook/.env.production
chmod 600 /etc/animal-logbook/.env.production
```

Generate the secrets and paste them into the file (hex avoids URL-encoding problems in the database URLs):

```bash
for k in AUTH_SECRET FILE_TOKEN_SECRET POSTGRES_PASSWORD APP_DB_PASSWORD WORKER_DB_PASSWORD; do
  echo "$k=$(openssl rand -hex 32)"
done
npx web-push generate-vapid-keys      # optional: Web Push; copy both keys into the file
```

Edit `/etc/animal-logbook/.env.production`: set `APP_DOMAIN`, `ACME_EMAIL`, the SMTP block, `EMAIL_FROM` and `VAPID_SUBJECT`. The app refuses to start (and says which keys are wrong, never their values) if a secret is shorter than 32 characters or still a placeholder, if the URL is not https, if SMTP points at localhost, or if the app and worker share a database role.

```bash
export ENV_FILE=/etc/animal-logbook/.env.production
alias dc='docker compose --env-file $ENV_FILE -f docker-compose.prod.yml'

dc build                    # or: export APP_IMAGE=ghcr.io/<owner>/<repo>:<git sha> and `dc pull`
dc up -d                    # starts postgres, runs migrate once, then web, worker and caddy
dc ps                       # everything should be "healthy"; migrate shows "Exited (0)"
curl -s https://<your domain>/api/health/ready    # {"status":"ok"}
```

Caddy requests the certificate on first start; it needs DNS to be correct and ports 80/443 open.

### Send a test email

```bash
dc run --rm worker node dist/send-test-email.mjs you@example.org
```

It prints the SMTP host it used, never the password. Fix SMTP before creating accounts.

### Create the first user

There is no admin console. Open `https://<your domain>/sign-up`, create your account and click the link in the verification email. Your first household is created for you and you are its owner; invite others from the household page. Public sign-up stays open (see [BACKLOG](BACKLOG.md)); if the server is public and you do not want strangers to register, restrict access at Caddy (for example `basic_auth` or an IP allow-list in `deploy/Caddyfile`) until you have set everyone up.

### Review the legal pages

`/privacy` and `/disclaimer` are templates. Edit the wording in `src/i18n/messages/en.json` (`legal.*`), add your name and contact details, and rebuild.

## 4. How the stack is secured

- **Roles.** `migrate` runs as the owner role (`animal_owner`) and then configures the restricted `animal_app` and `animal_worker` roles. The web app connects as `animal_app`; the worker as `animal_worker` (plus the owner URL, only because pg-boss owns its own schema). Both refuse to start if their role is a superuser or has BYPASSRLS ([ADR 0015](adr/0015-row-level-security.md)).
- **Proxy header.** `TRUSTED_PROXY=true` is set in `docker-compose.prod.yml` only. Caddy replaces any client-sent `X-Forwarded-For` with the address it saw, and the app uses the right-most entry. If you put another proxy in front of Caddy, list it in `TRUSTED_PROXY_CIDRS`. If you ever run the app without Caddy, remove the setting.
- **Cloudflare Tunnel.** The peer is `cloudflared`, so the real client is in `CF-Connecting-IP`. Use the commented block in `deploy/Caddyfile` (`header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}`), use `http://<domain>` as the site address (Cloudflare terminates TLS), publish nothing on 80/443, and point the tunnel at `http://caddy:80`. Do not use the tunnel without that header mapping, or all visitors share one rate-limit bucket.
- **Containers.** Non-root user, read-only root filesystem (tmpfs for `/tmp` and the Next cache), all capabilities dropped, `no-new-privileges`, memory limits, rotated JSON logs (10 MB x 3).
- **ClamAV (optional).** `dc --profile clamav up -d`, then set `VIRUS_SCANNER=clamav` in the env file and `dc up -d`. It is only reachable on the internal network.
- **Never** publish Mailpit or Postgres. Mailpit is not part of the production stack.

## 5. Outgoing email

Any SMTP server works: your own (Postfix, Mailu), your mailbox provider's SMTP, or the free tier of a transactional relay you already have. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` (`true` for port 465, `false` for STARTTLS on 587) and an `EMAIL_FROM` on a domain you control (set SPF/DKIM for it, or mail lands in spam). Messages contain no medical details. Email delivery is at-least-once: in a rare crash window a reminder can arrive twice ([ADR 0011](adr/0011-reminder-delivery-and-schedules.md)).

## 6. Day-to-day operations

### Logs and the worker

```bash
dc logs -f --tail 100 web worker          # JSON logs; passwords, tokens and emails are redacted
dc ps                                     # worker has a healthcheck that goes unhealthy if it stalls
dc logs worker | grep heartbeat           # a "worker heartbeat" line appears every few minutes
curl -s https://<domain>/api/health/live  # process is up
curl -s https://<domain>/api/health/ready # database reachable and migrations applied
```

Point an uptime monitor (any free one, or a cron job) at `/api/health/ready`. The health endpoints return a verdict only; details go to the logs. If you see `unhealthy` on the worker, `dc restart worker` and read its logs.

### Upgrade

```bash
cd animal-logbook
./deploy/backup.sh                         # always back up first (see section 7)
git fetch && git checkout <tag or commit>  # or: export APP_IMAGE=ghcr.io/<owner>/<repo>:<sha>
dc build                                   # or: dc pull
dc up -d                                   # migrate runs first; web and worker start only if it succeeds
dc ps && curl -s https://<domain>/api/health/ready
```

Migrations only move forward and run before the new web and worker start. If `migrate` fails, nothing else starts and the old containers keep running; read `dc logs migrate`.

### Roll back

1. **Code only (no migration in the release).** Check out the previous tag (or set the previous `APP_IMAGE`) and `dc up -d`. The readiness check accepts a database that is _ahead_ of the image, so an older image keeps working.
2. **Release with a migration.** Every migration has a hand-written down script in `drizzle/down/`. Reverse the newest migration, then start the old image:
   ```bash
   dc run --rm migrate node dist/migrate.mjs down     # reverts the most recent migration; repeat for more
   git checkout <previous tag> && dc build && dc up -d
   ```
   Run `migrate down` with the **new** image (it contains the down script for its own migrations). A down script can drop data that only exists in the newer schema.
3. **If in doubt, restore the backup** you took before upgrading (section 7). That is the only fully safe rollback when data was written under the new schema.

### Backup, restore and scheduling

See [section 7](#7-backups-and-restore).

## 7. Backups and restore

`deploy/backup.sh` (bash) and `deploy/backup.ps1` (PowerShell) write one archive per run: a `pg_dump` (custom format, owner role), the uploads volume, row counts and a SHA-256 list of every uploaded file. Exports are transient (24 h) and are not backed up.

```bash
ENV_FILE=/etc/animal-logbook/.env.production BACKUP_DIR=/mnt/backup/animal-logbook ./deploy/backup.sh
```

| Variable                                       | Meaning                                        |
| ---------------------------------------------- | ---------------------------------------------- |
| `ENV_FILE`                                     | Path of the production env file (required)     |
| `BACKUP_DIR`                                   | Where archives go (default `./backups`)        |
| `BACKUP_KEEP_DAYS`                             | Delete archives older than this (default 14)   |
| `BACKUP_AGE_RECIPIENT`, `BACKUP_GPG_RECIPIENT` | Encrypt the archive (see below)                |
| `COMPOSE_PROJECT`, `COMPOSE_FILES`             | Defaults: `animal-logbook-prod`, the prod file |

### A backup on the same disk is not a backup

If the disk, the server or your account is lost, so is a backup stored next to the data. Copy archives to **another machine or location** (another computer at home, a cheap storage box, a USB disk you rotate). Any free tool works: `rsync`, `rclone`, `syncthing`. Keep at least one copy off-site.

### Backups contain personal data: encrypt them

Archives hold names, email addresses, health notes and every uploaded document. Treat them like the database.

```bash
# age (https://github.com/FiloSottile/age), free
age-keygen -o ~/.config/animal-logbook-backup.key      # prints the public key (age1...)
BACKUP_AGE_RECIPIENT=age1... ./deploy/backup.sh         # writes animal-logbook-<time>.tar.age
BACKUP_AGE_IDENTITY=~/.config/animal-logbook-backup.key ./deploy/restore.sh <archive>.tar.age --yes

# or gpg
BACKUP_GPG_RECIPIENT=you@example.org ./deploy/backup.sh   # writes ...tar.gpg
```

Keep the private key **away from the server and out of the backup location** (a password manager, a printed copy in a safe place). Without it the backups are unreadable. Never commit backups or keys.

### Schedule

Linux cron (daily at 03:15):

```cron
15 3 * * * cd /opt/animal-logbook && ENV_FILE=/etc/animal-logbook/.env.production BACKUP_DIR=/mnt/backup/animal-logbook BACKUP_AGE_RECIPIENT=age1... ./deploy/backup.sh >> /var/log/animal-logbook-backup.log 2>&1
```

Windows (Task Scheduler): run `powershell -File deploy\backup.ps1` daily, with `ENV_FILE` and `BACKUP_DIR` set in the task's environment or a small wrapper script.

### Restore

```bash
ENV_FILE=/etc/animal-logbook/.env.production ./deploy/restore.sh /mnt/backup/animal-logbook/animal-logbook-20260101T031500Z.tar --yes
```

It starts Postgres, runs `migrate` (so the roles exist on a fresh server), replaces the database (`pg_restore --clean --single-transaction`) and the uploads volume, then verifies that the row counts and every file checksum match the archive and starts the whole stack. It stops web, worker and Caddy while it works. To recover on a new server: install Docker, clone the repo, recreate the env file (secrets must be the same `AUTH_SECRET` and `FILE_TOKEN_SECRET` so sessions and file links keep working, the database passwords may be new), then run the restore.

### Prove it works: the restore drill

`deploy/restore-drill.sh` (or `.ps1`) brings up a throwaway stack with test credentials, creates data through the real app, backs up, wipes **every volume**, restores and checks that rows and files are back. CI runs it on every push. Run it yourself before you trust a new setup. It never touches your production project.

## 8. Troubleshooting

| Symptom                                                   | Check                                                                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dc up` fails with `set APP_DOMAIN` (or another variable) | You forgot `--env-file` / `ENV_FILE`, or the variable is missing from the file.                                                                                    |
| `web` exits at start with "Refusing to start ..."         | Read `dc logs web`; it lists the keys and rules that failed. Fix the env file and `dc up -d`.                                                                      |
| `migrate` exits non-zero                                  | `dc logs migrate`. Usually wrong `POSTGRES_PASSWORD` after the volume was created with another one (the password in the env file only applies on the first start). |
| "database role is a superuser / BYPASSRLS"                | `DATABASE_URL` points at the owner. It must use `animal_app` (the compose file does this for you).                                                                 |
| Certificate not issued                                    | `dc logs caddy`. DNS must point at this server, ports 80/443 must be reachable, and nothing else may listen on them. Let's Encrypt rate-limits repeated failures.  |
| Everyone gets "too many attempts"                         | `TRUSTED_PROXY` is not active or Caddy does not forward the client address (Cloudflare Tunnel: use the `CF-Connecting-IP` mapping).                                |
| No emails                                                 | `dc run --rm worker node dist/send-test-email.mjs you@x.org`; check spam, SPF/DKIM and `EMAIL_FROM`.                                                               |
| Reminders not arriving                                    | `dc ps` (worker healthy?), `dc logs worker`. Reminders older than `REMINDER_STALE_WINDOW_HOURS` (24) are never sent by design.                                     |
| Uploads fail with permission errors                       | The uploads volume must be writable by uid 1000 (`docker run --rm -v animal-logbook-prod_uploads:/d alpine chown -R 1000:1000 /d`).                                |
| Readiness is 503 right after an upgrade                   | `dc logs migrate web`. Readiness needs every migration of the image applied.                                                                                       |
| Disk filling up                                           | `docker system df`; logs are capped at 30 MB per service. Check `uploads`, `pgdata`, and `BACKUP_DIR`. `RETENTION_DAYS` controls when soft-deleted data is purged. |

## 9. Optional: publish the image to GitHub Container Registry

Free for public repositories. In the repository settings add the variable `PUBLISH_IMAGE=true`; CI then pushes `ghcr.io/<owner>/<repo>:<git sha>` (and `:latest` from `main`) after the end-to-end suite and the Trivy scan pass. To deploy a tag on the server:

```bash
export APP_IMAGE=ghcr.io/<owner>/<repo>:<git sha>
dc pull && dc up -d
```

Make the package public, or `docker login ghcr.io` with a read-only token.
