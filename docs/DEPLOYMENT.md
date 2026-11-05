# Deployment Guide — WorkoutApp Coach Backend

The whole backend is one container: the coach REST API (`/api`), the admin portal
(`/admin`) and the SQLite database, served by a single Node process on port 4000.
Caddy (or Nginx) sits in front of it and terminates TLS, because the Android app
refuses plain HTTP for any non-localhost endpoint.

```
Android app ──HTTPS──▶ Caddy :443 ──HTTP──▶ workout-backend :4000 ──▶ /app/server/data/coach-platform.db
Admin browser ─HTTPS──┘                         (container)              (host bind mount ./data)
```

---

## 1. Prerequisites on a fresh Ubuntu VM (22.04 / 24.04)

- A domain (or subdomain) whose **A record already points at the VM's public IP**.
- Open ports `22`, `80`, `443` in the provider firewall / security group.

Install Docker Engine + the Compose plugin from Docker's official repository:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker "$USER"   # log out / back in for this to take effect
```

Verify: `docker compose version`.

---

## 2. Get the code and prepare the persistent database directory

```bash
sudo mkdir -p /opt/workoutapp && sudo chown "$USER" /opt/workoutapp
git clone <your-repo-url> /opt/workoutapp
cd /opt/workoutapp
```

The container runs as the unprivileged `node` user (UID 1000), so the bind-mounted
database directory must be writable by that UID. **Skipping this is the single most
common first-run failure** (`EACCES` / `SQLITE_CANTOPEN` in the logs):

```bash
cd /opt/workoutapp/server
mkdir -p data
sudo chown -R 1000:1000 data
```

`server/data/` is where `coach-platform.db` lives. It is git-ignored, so an
existing database is never overwritten by a `git pull`.

---

## 3. Build and start

```bash
cd /opt/workoutapp/server
docker compose up -d --build
```

The first build compiles the TypeScript API and copies the static admin portal.
Check that it came up:

```bash
docker compose ps                                  # state should become "healthy"
docker compose logs -f workout-backend             # Ctrl+C to stop following
curl -fsS http://127.0.0.1:4000/api/health         # {"ok":true,"service":"workoutapp-coach-server",...}
```

Then browse to `http://<vm-ip>:4000/admin` — the Hungarian coach dashboard.

---

## 4. Put HTTPS in front (required by the mobile app)

Android's network security config blocks cleartext HTTP to non-localhost hosts, so
the app must reach the API over HTTPS. The API port should not stay publicly
exposed: bind it to the loopback interface in `server/docker-compose.yml`.

```yaml
    ports:
      - "127.0.0.1:4000:4000"
```

Then `docker compose up -d` to apply, and install Caddy:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```caddyfile
api.example.com {
    encode gzip

    # Coach admin portal + REST API, same origin, no CORS needed.
    reverse_proxy 127.0.0.1:4000 {
        # Large JSON sync payloads (full session logs) — raise if needed.
        request_body {
            max_size 10MB
        }
    }

    header {
        -Server
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Frame-Options "SAMEORIGIN"
    }
}
```

```bash
sudo systemctl reload caddy     # certificates are obtained automatically
```

Result: `https://api.example.com/api` for the app, `https://api.example.com/admin`
for the coach. Point the mobile client's API base URL at the HTTPS origin.

### Nginx alternative

```nginx
server {
    listen 80;
    server_name api.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Certificates: `sudo certbot --nginx -d api.example.com`.

### Firewall

```bash
sudo ufw allow 22,80,443/tcp
sudo ufw enable
# 4000 stays closed — only the reverse proxy talks to it.
```

---

## 5. Updating the deployment

```bash
cd /opt/workoutapp
git pull
cd server
docker compose up -d --build     # rebuilds, swaps the container, keeps ./data
docker compose ps                # confirm healthy
```

The database survives because it lives on the host bind mount, not in the image.
To roll back, `git checkout <previous-commit>` and rebuild the same way.

---

## 6. Backups

The database is SQLite in WAL mode, so copy all three files together or use
SQLite's own backup routine rather than `cp` of the `.db` alone:

```bash
cd /opt/workoutapp/server
docker compose stop workout-backend
cp data/coach-platform.db* /var/backups/workoutapp-$(date +%F).db
docker compose start workout-backend
```

Better (no downtime, requires `sqlite3` on the host):

```bash
sqlite3 data/coach-platform.db ".backup '/var/backups/coach-platform-$(date +%F).db'"
```

Add that line to a cron job and keep the copies off the VM.

---

## 7. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Container restarts in a loop, logs show `SQLITE_CANTOPEN` or `EACCES` | `server/data` not writable by UID 1000 → `sudo chown -R 1000:1000 server/data`. |
| `Error: Cannot find module 'node:sqlite'` | Runtime image older than Node 22.5 → keep `node:24-bookworm-slim`. |
| `/admin` returns 404 | `server/public/admin` was not copied — rebuild without a stale context (`docker compose build --no-cache`). |
| `Bind for 0.0.0.0:4000 failed: port is already allocated` | Something else holds 4000 (`sudo ss -ltnp | grep 4000`); stop it or change the host port. |
| Admin page loads but API calls fail from another origin | CORS is already permissive (`*`); the usual cause is mixed content (page on HTTPS calling `http://`) — use the HTTPS URL. |
| Healthcheck stays `unhealthy` | `docker compose logs workout-backend`; the healthcheck probes `127.0.0.1:4000/api/health` inside the container. |
| Database empty after a redeploy | The `./data:/app/server/data` volume line was removed or the compose file was run from another directory. |

---

## 8. What is (not) in the image

- **No `admin-web` Vite build stage exists**: the admin portal is a build-free
  static SPA in `server/public/admin/` (`index.html`, `app.js`, `styles.css`), so
  it is copied as-is rather than compiled.
- **No runtime dependencies**: the server uses only Node built-ins (`node:http`,
  `node:sqlite`), so the production stage has no `node_modules` at all.
- **Not included**: TLS termination (Caddy/Nginx), authentication, rate limiting.
  The API is expected to sit behind the reverse proxy. If coach authentication is
  added later, keep credentials in an `.env` file next to the compose file and
  reference them via `environment:` / `env_file:` — never bake them into the image.