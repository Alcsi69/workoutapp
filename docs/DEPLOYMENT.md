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
| Admin page loads but API calls fail from another origin | Browser CORS preflight rejected. The API allows `https://alexercise.app`, `https://www.alexercise.app` and local dev origins by default; extend the allowlist with `CORS_ORIGINS` (comma-separated) in the compose file. Mixed content (page on HTTPS calling `http://`) also fails — use the HTTPS URL. |
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

---

## 9. Expo Web app hosting (`https://alexercise.app`)

The same Expo app is exported as a static SPA and served by Caddy from the VM.
The build is fully static — no Node server, no SSR.

### 9.1 Build the bundle

`app.json` already sets `web.bundler: "metro"`, `web.output: "single"`,
`themeColor: "#131112"` and `backgroundColor: "#131112"`, so mobile browsers get
the dark installable PWA (manifest + icons are generated into `dist/`).

```bash
cd /opt/workoutapp
npm ci
npx expo export --platform web      # writes ./dist
```

`dist/` contains `index.html`, `_expo/static/**` (hashed JS/CSS), `assets/**`,
`metadata.json`, the PWA `manifest.json` and the icons from `public/icons/`.

### 9.2 CORS

The web bundle calls `https://api.alexercise.app/api` from the browser, so the API
must answer preflights (`OPTIONS`) with an `Access-Control-Allow-Origin` echoing
`https://alexercise.app`. `server/src/app.ts` does this for the origins listed in
`CORS_ORIGINS` (set in `server/docker-compose.yml`, defaults include
`https://alexercise.app` and `https://www.alexercise.app`). `Authorization` is an
allowed request header (client sync sends `Bearer <token>`). Verify after deploy:

```bash
curl -i -X OPTIONS https://api.alexercise.app/api/sync/push \
  -H 'Origin: https://alexercise.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,authorization'
# expect: HTTP/2 204 + access-control-allow-origin: https://alexercise.app
```

### 9.2.1 Auth on the API

Every client endpoint (`/api/sync/*`, `/api/auth/*` aside from register/login) and
every coach admin endpoint (`/api/admin/*`) requires a bearer token; anything else
answers `401`. Two separate secrets exist:

| Secret | Header | Who uses it |
| --- | --- | --- |
| Per-user token from `/api/auth/login` \| `register` | `Authorization: Bearer <token>` | The app (client sync) |
| Coach admin token | `Authorization: Bearer <token>` | The `/admin` web |

Set `ADMIN_TOKEN` in the container environment for a stable coach token. When it is
unset the server generates a random one per boot and prints it (`Admin token …` in
the logs, also in the startup banner); the admin web asks for it once and stores it
in `localStorage`. Set it explicitly in production so the token survives restarts.

```bash
# Health is public; user data is not.
curl -s -o /dev/null -w '%{http_code}\n' https://api.alexercise.app/api/sync/pull   # 401
curl -s -o /dev/null -w '%{http_code}\n' https://api.alexercise.app/api/admin/clients  # 401
```

### 9.3 Caddyfile (static SPA + PWA headers)

The app persists workouts in SQLite compiled to WebAssembly (`expo-sqlite` →
wa-sqlite). That backend needs `SharedArrayBuffer`, which browsers expose only to
**cross-origin isolated** documents — so `Cross-Origin-Opener-Policy` and
`Cross-Origin-Embedder-Policy` are mandatory on the web origin. The SPA also needs
`try_files {path} /index.html` so deep links (`/history`, `/workout/xyz`) resolve.

The ready-to-copy file lives at `deploy/Caddyfile` in this repo; the relevant block
is reproduced here.

```caddyfile
# Web app
alexercise.app, www.alexercise.app {
    encode zstd gzip

    root * /opt/workoutapp/dist
    try_files {path} /index.html
    file_server

    # Required by expo-sqlite (wa-sqlite / SharedArrayBuffer) on web.
    header {
        Cross-Origin-Opener-Policy "same-origin"
        Cross-Origin-Embedder-Policy "credentialless"
        -Server
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    # Hashed bundle assets are immutable; the shell and manifest must revalidate.
    @immutable path /_expo/static/* /assets/*
    header @immutable Cache-Control "public, max-age=31536000, immutable"
    @shell path /index.html /manifest.json /*
    header @shell Cache-Control "no-cache"
}

# Coach API (existing block, unchanged)
api.alexercise.app {
    encode gzip

    reverse_proxy 127.0.0.1:4000 {
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
sudo systemctl reload caddy
```

> Do **not** add `X-Frame-Options: DENY` or a restrictive
> `Content-Security-Policy` to the web app origin without allowing `wasm-unsafe-eval`;
> the SQLite WASM module needs to compile its binary at runtime.

### 9.4 Redeploying the web app

```bash
cd /opt/workoutapp
git pull
npm ci
npx expo export --platform web
sudo systemctl reload caddy   # only needed if the Caddyfile changed
```

Caddy serves `dist/` straight from disk, so replacing the directory is the deploy.
The service worker is not registered by default, so a plain reload picks up the new
bundle. Keep the previous `dist/` (`mv dist dist.prev`) if you want a one-command
rollback.

### 9.5 Smoke check

```bash
curl -sI https://alexercise.app | grep -i "cross-origin\|content-type"
curl -s  https://alexercise.app/manifest.json | head -c 400
curl -sI https://alexercise.app/history    # 200 text/html (SPA fallback)
```

