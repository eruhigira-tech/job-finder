# Job Finder
Search live job listings, filter by type/remote, and sort by date, title or company.

## Demo
- Video (≤2 min): <link>
- Load balancer URL: http://<lb01-ip-or-domain>
- Web01: http://<web01-ip> | Web02: http://<web02-ip>

## Features
Search, filter (text, type, remote), sort, caching (10 min), error handling.

## API Used
JSearch by letscrape on RapidAPI: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
Thanks to the API developers. Libraries: Express, dotenv.

## Run Locally
git clone <repo> && cd job-finder
npm install
cp .env.example .env   # add your RapidAPI key
npm start              # http://localhost:3000

## Deployment (Web01 & Web02)
<paste Stage 5 steps>

## Load Balancer (Lb01)
<paste Stage 6 config + test output>

## Testing the Load Balancer
<paste curl output showing alternating X-Served-By>

## Challenges & Solutions
- Keeping the API key secret → backend proxy + .env + .gitignore
- Rate limits → in-memory cache
- Unreliable API → timeouts, status-code handling, friendly messages

## Credentials
API keys and login details are provided in the submission comment (not in the repo).
