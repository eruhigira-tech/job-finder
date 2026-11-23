# Job Finder
Search live job listings (Rwanda by default), filter by type/remote, and sort by date, title or company.

## Demo
- Video (≤2 min): `<ADD YOUTUBE/VIMEO LINK>`
- Load balancer URL: `http://<lb01-address>`
- Web01: `http://<web01-address>` | Web02: `http://<web02-address>`

## Features
- Search by job title and location (for example `developer in kigali`)
- Filter by text, job type and remote only
- Sort by newest, title (A-Z) or company (A-Z)
- 10-minute in-memory cache to save API quota
- Error handling with clear messages: empty search, API timeout or downtime, rate limit, rejected credentials, unexpected response
- API key stays on the server; results are rendered with `textContent` (XSS-safe)

## API Used
**JSearch** by OpenWeb Ninja (formerly listed under the "letscrape" account) on RapidAPI:
https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch

- Endpoint: `GET /search-v2` (API version v5)
- Free BASIC plan: 200 requests per month

Thanks to the OpenWeb Ninja developers and RapidAPI.
Libraries and tools: Express, dotenv, Node.js 20, nginx, HAProxy, pm2.

## Run Locally
Requires Node.js 18+ and a RapidAPI key subscribed to JSearch.

```bash
git clone https://github.com/eruhigira-tech/job-finder.git
cd job-finder
npm install
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
```

Edit `.env` and add your key:

```
RAPIDAPI_KEY=your_key_here
RAPIDAPI_HOST=jsearch.p.rapidapi.com
PORT=3000
```

```bash
npm start              # http://localhost:3000
```

Health check: `http://localhost:3000/health`

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
nano .env              # set RAPIDAPI_KEY
chmod 600 .env

# Run with pm2
sudo npm install -g pm2
pm2 start server.js --name jobfinder
pm2 save
pm2 status
```

**After a container restart:** without systemd, `pm2 startup` does not work. If a container restarts, run this on that server:

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
> TODO: replace the addresses and confirm after configuring Lb01.

HAProxy balances round-robin between the two web servers and removes a server from rotation when its `/health` check fails.

```
frontend http_front
    bind *:80
    mode http
    default_backend webservers

backend webservers
    mode http
    balance roundrobin
    option httpchk GET /health
    server web01 <WEB01_ADDRESS>:80 check
    server web02 <WEB02_ADDRESS>:80 check
```

```bash
haproxy -c -f /etc/haproxy/haproxy.cfg   # validate the config
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
- Free plan limit (200 requests/month) → in-memory cache and careful testing
- API version change (v5 uses `/search-v2` and returns jobs under `data.jobs`) → updated the server's response mapping
- No systemd in the lab containers → pm2 to keep the app running
- Unreliable API or network → timeouts, status-code handling, friendly messages

## Credentials
API keys and login details are provided in the submission comment (not in the repo). The app has no user login.
