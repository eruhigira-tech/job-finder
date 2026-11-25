# Job Finder

Search live job listings (Rwanda by default, 15 countries available), see hiring insights, and **track every application from Saved to Offer**.

## Demo
- Video (≤2 min): `<ADD YOUTUBE/VIMEO LINK>`
- Load balancer URL: `http://<lb01-address>`
- Web01: `http://<web01-address>` | Web02: `http://<web02-address>`

## Features
- Search by job title, with a country selector and a date-posted filter
- Filter by text, job type and remote only; sort by newest, title (A-Z) or company (A-Z)
- **Hiring insights**: stat tiles and bar charts (job types, top hiring companies, remote share)
- **Unique feature: Application Tracker**. Save any job, move it through *Saved → Applied → Interview → Offer → Closed*, and export the board to CSV. Stored in the browser only (no account needed).
- Personal settings remembered between visits: dark/light mode, last country, recent searches
- Clear error messages: invalid input, API timeout or downtime, rate limit, rejected credentials, unexpected response
- A "Served by" badge shows which server answered and whether the cache was used (this is how load balancing is proven in the demo)

## Bonus tasks implemented

| Bonus task | What was done | Where |
|---|---|---|
| Enhanced features | Application tracker, personal settings (dark mode, country, recent searches), data visualisation (insights charts) | `public/app.js`, `public/style.css` |
| Performance | 10-minute in-memory cache with a size cap. Responses carry `X-Cache: HIT/MISS`; `/health` reports cache stats | `cache.js`, `server.js` |
| Scalability | Dockerfile, `docker-compose.yml` (HAProxy + 2 app containers) and Kubernetes manifests (2 replicas, probes, resource limits, Secret) | `Dockerfile`, `docker-compose.yml`, `k8s/` |
| CI/CD | GitHub Actions: syntax check, tests on Node 20 and 22, dependency audit; on `main` it builds and publishes the Docker image to GHCR | `.github/workflows/ci.yml` |
| Security | See below | `server.js`, `normalize.js`, `public/app.js` |

### Security measures
- **Input validation on the server**: search term must match `^[\p{L}\p{N} ,.'+#&/-]{2,80}$`; `page`, `country` and `date_posted` are checked against fixed lists. Bad input gets a `400` and never reaches the paid API.
- **XSS**: API data is never put into `innerHTML`; all text is set with `textContent`. Apply links are only created for `http(s)` URLs (checked on the server and again in the browser). Exported CSV neutralises spreadsheet formulas.
- **Helmet**: security headers including a Content-Security-Policy (no inline scripts are used).
- **Rate limiting**: 30 API requests per IP per minute (`RATE_LIMIT`), so one visitor cannot use up the 200-requests/month quota.
- **Secrets**: the RapidAPI key lives only in `.env` on the server, which is git-ignored (`chmod 600` on the servers). Error responses never leak upstream details.
- **Docker**: runs as a non-root user; Kubernetes pod forbids privilege escalation.
- **SQL injection**: not applicable, the app has no database.

## API Used
**JSearch** by OpenWeb Ninja (formerly listed under the "letscrape" account) on RapidAPI:
https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch

- Endpoint: `GET /search-v2` (falls back to `/search` automatically if the first returns 404)
- The server accepts both response shapes (`data: [...]` and `data: { jobs: [...] }`)
- Free BASIC plan: 200 requests per month

Thanks to the OpenWeb Ninja developers and RapidAPI.
Libraries and tools: Express, helmet, express-rate-limit, dotenv, Node.js 20, nginx, HAProxy, pm2, Docker, Kubernetes, GitHub Actions.

## Run Locally
Requires Node.js 18+ and a RapidAPI key subscribed to JSearch.

```bash
git clone https://github.com/eruhigira-tech/job-finder.git
cd job-finder
npm install
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
```

Edit `.env` and add your key, then:

```bash
npm start              # http://localhost:3000
npm test               # run the automated tests
```

Health check: `http://localhost:3000/health`

### Testing the cache and security (PowerShell)
```powershell
# Cache: first MISS, then HIT
1..2 | ForEach-Object { (Invoke-WebRequest "http://localhost:3000/api/jobs?q=developer" -UseBasicParsing).Headers["X-Cache"] }

# Input validation: expect 400
try { Invoke-WebRequest "http://localhost:3000/api/jobs?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E" -UseBasicParsing } catch { $_.Exception.Response.StatusCode.value__ }

# Rate limit: expect 429 at the end (after 30 requests/minute)
1..40 | ForEach-Object { try { (Invoke-WebRequest "http://localhost:3000/api/jobs?q=test" -UseBasicParsing).StatusCode } catch { $_.Exception.Response.StatusCode.value__ } }
```
Use `curl.exe` instead of `curl` in PowerShell. Tip: the 40-request test uses real API quota the first time only; after that results come from the cache.

## Run with Docker (HAProxy + 2 servers on your laptop)
```bash
docker compose up --build
```
Open `http://localhost:8080` and refresh: the "Served by" badge alternates between two container IDs.

## Kubernetes
```bash
kubectl create secret generic job-finder-secret --from-literal=RAPIDAPI_KEY=your_key_here
kubectl apply -f k8s/job-finder.yaml
kubectl get pods
kubectl port-forward svc/job-finder 8080:80
```
The image is built and published by the CI/CD workflow to `ghcr.io/eruhigira-tech/job-finder`.

## CI/CD
Every push and pull request runs the tests. Pushes to `main` that pass also publish the Docker image. No API key is needed in CI because the tests use a fake API. Screenshot: `<ADD GREEN-TICK SCREENSHOT>`

## Deployment (Web01 & Web02)
The lab servers are Docker containers without systemd, so the app is kept running with **pm2** instead of a systemd service. Repeat on both servers.

```bash
# Connect (use each server's own SSH port)
ssh ubuntu@localhost -p <PORT>

# Install Node 20, nginx and git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git

# Get the code
cd /var/www
sudo git clone https://github.com/eruhigira-tech/job-finder.git
sudo chown -R $USER:$USER /var/www/job-finder
cd /var/www/job-finder
npm ci --omit=dev

# Create the secret env file ON THE SERVER (never committed)
cp .env.example .env
nano .env              # set RAPIDAPI_KEY and TRUST_PROXY=2
chmod 600 .env

# Run with pm2
sudo npm install -g pm2
pm2 start server.js --name jobfinder
pm2 save
pm2 status
```

`TRUST_PROXY=2` is needed because HAProxy and nginx both sit in front of Node; without it every visitor looks like the load balancer and shares one rate limit.

**To update after a `git push`:**
```bash
cd /var/www/job-finder && git pull && npm ci --omit=dev && pm2 restart jobfinder
```

**After a container restart:** without systemd, `pm2 startup` does not work. Run this on that server:

```bash
pm2 resurrect
# or, if nothing was saved:
cd /var/www/job-finder && pm2 start server.js --name jobfinder
```

**nginx reverse proxy (port 80 → 3000):** create `/etc/nginx/sites-available/jobfinder`:

```nginx
server {
    listen 80 default_server;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/jobfinder /etc/nginx/sites-enabled/
sudo nginx -t
sudo service nginx start    # or: sudo nginx   /   sudo nginx -s reload
curl http://localhost/health
```

Each server returns its own hostname from `/health` and in an `X-Served-By` header, which is how load balancing is verified.

## Load Balancer (Lb01)
HAProxy balances round-robin between the two web servers and removes a server from rotation when its `/health` check fails. Full file: `deploy/haproxy.lab.cfg`.

```
frontend http_front
    bind *:80
    option forwardfor
    default_backend webservers

backend webservers
    balance roundrobin
    option httpchk GET /health
    server web01 <WEB01_ADDRESS>:80 check
    server web02 <WEB02_ADDRESS>:80 check
```

```bash
haproxy -c -f /etc/haproxy/haproxy.cfg   # validate the config
sudo service haproxy reload
```

## Testing the Load Balancer
> TODO: paste the real output below and show it in the demo video.

```powershell
1..6 | ForEach-Object { curl.exe -sI http://<LB_ADDRESS>/health | Select-String -Pattern "x-served-by" }
```

Expected: `X-Served-By` alternates between the two servers.

Failover test: run `pm2 stop jobfinder` on Web01, reload the load balancer address (it keeps working through Web02), then run `pm2 start jobfinder`.

## Challenges & Solutions
- Keeping the API key secret → backend proxy + `.env` + `.gitignore` + `chmod 600` on the servers
- Free plan limit (200 requests/month) → in-memory cache, per-IP rate limit and careful testing
- API version change (v5 uses `/search-v2` and returns jobs under `data.jobs`) → response normaliser that accepts both shapes, plus automatic endpoint fallback
- No systemd in the lab containers → pm2 to keep the app running
- Visitors all looked like the load balancer's IP → `TRUST_PROXY` setting and `option forwardfor`
- Unreliable API or network → timeouts, status-code handling, friendly messages

## Credentials
API keys and login details are provided in the submission comment (not in the repo). The app has no user login; the tracker is stored in each visitor's own browser.
