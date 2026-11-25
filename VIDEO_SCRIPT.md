# Demo video script (target: 1 min 50 s, hard limit 2 min)

Record your screen with your voice (OBS, Zoom, or Win+G on Windows). Do a dry run first. **Before recording:** server running on all machines, one search already made so the cache is warm, browser zoom at 110%, notifications off.

Speak calmly, about 140 words per minute. The narration below is about 270 words.

| Time | Show on screen | Say |
|---|---|---|
| 0:00–0:10 | Browser on the **load balancer URL**, hero section | "Hi, I'm **[your name]**. This is **Job Finder**, a web app that searches live job listings through the JSearch API on RapidAPI, and helps you track your applications." |
| 0:10–0:35 | Pick **Rwanda**, type `software engineer`, press Search. Point at the stat tiles and bar charts | "I choose a country, type a role and search. The server calls the API and returns the results. At the top you get hiring insights: how many jobs were found, the remote share, the job types and the top hiring companies." |
| 0:35–0:55 | Use the filter box, job type dropdown, Remote only, then Sort | "I can filter by title, company, job type or remote only, and sort by newest, title or company." |
| 0:55–1:15 | Click **☆ Save** on three jobs, open **My tracker**, change one job to *Applied* and one to *Interview*. Click Export CSV | "My unique feature is the application tracker. I save jobs, move them from Saved to Applied, Interview and Offer, and export the board to CSV. It is stored in the browser, so no account is needed. I can also switch to dark mode." (click ◐) |
| 1:15–1:35 | Terminal: the 6-request PowerShell loop against the LB showing `X-Served-By` alternating. Then show the badge in the page changing on refresh | "The app runs on two web servers behind an HAProxy load balancer. Each response reports which server answered, and you can see it alternating here. If I stop one server, the balancer keeps working through the other." (optional: `pm2 stop jobfinder`, refresh, still works) |
| 1:35–1:50 | GitHub **Actions** tab (green tick), then the README bonus table | "For the bonus tasks I added caching, rate limiting, input validation and XSS protection, a Dockerfile with Kubernetes files, and a GitHub Actions pipeline that runs the tests and builds the image. Thank you for watching." |

## Checklist before you upload
- [ ] Video is **under 2 minutes**
- [ ] Both servers and the load balancer URL are visible working
- [ ] You mention the API name (JSearch on RapidAPI) and that it is used for live data
- [ ] You show at least one error case if you have time: search `<script>` and show the friendly error message
- [ ] Link pasted into the README `Demo` section

## If you run long, cut in this order
1. The failover test (`pm2 stop`)
2. The dark mode click
3. The filter/sort section (shorten to one sentence)
