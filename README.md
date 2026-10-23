# Antifragile Launch Tracker

A small task tracker for launching Antifragile Tech Limited. You can set each task's status (New, Ongoing, Done, Cancelled), deadline, priority and category, and keep a comment log on it. There is a list view grouped by deadline, a drag-and-drop board view, search, and filters.

It's a static site: plain HTML, CSS and JavaScript, with no build step and no server.

```
index.html        page markup
css/styles.css    styles (light and dark themes)
js/app.js         app logic
amplify.yml       build settings for AWS Amplify Hosting
```

## Where the data lives

Tasks are saved in your browser's `localStorage`, so:

- Each browser and device keeps its own copy. Your laptop and phone won't sync.
- Clearing site data in the browser deletes your tasks.
- Anyone who opens the URL gets their own empty tracker. They can't see your tasks.

Use **Export** to download a `.json` backup and **Import** to load it, whether on another device or after clearing the browser. Backup files are listed in `.gitignore` so they don't end up in the repo by accident.

## Run it locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy to AWS

### Option A: AWS Amplify Hosting (recommended)

Amplify connects to this GitHub repo and redeploys every time you push.

1. In the AWS Console, open **AWS Amplify** and choose **Create new app**.
2. Pick **GitHub** and authorise AWS to read your repositories.
3. Select the `antifragile` repo and the `main` branch.
4. Amplify reads `amplify.yml`. It has no build commands and serves the repo root as is.
5. Choose **Save and deploy**. You get an HTTPS URL like `https://main.<id>.amplifyapp.com`.

Optional:
- **Custom domain:** in the app, go to **Hosting → Custom domains** and add something like `tracker.antifragile.group`. Since the domain is on Cloudflare, add the DNS records Amplify gives you in Cloudflare.
- **Password protection:** **Hosting → Access control** can put a username and password on the branch.

### Option B: S3 static website

1. Create an S3 bucket, for example `antifragile-tracker`.
2. Under **Permissions**, turn off *Block all public access*, and add a bucket policy that allows `s3:GetObject` on `arn:aws:s3:::antifragile-tracker/*`.
3. Under **Properties → Static website hosting**, turn it on and set the index document to `index.html`.
4. Upload the files, keeping the folder structure:

   ```bash
   aws s3 sync . s3://antifragile-tracker --exclude ".git/*" --exclude "*.md" --exclude "amplify.yml"
   ```

The S3 website endpoint is HTTP only. For HTTPS and a custom domain, put CloudFront in front of the bucket.

## Ideas for later

- Sync across devices with a backend (API Gateway, Lambda and DynamoDB, with Cognito for login).
- A reminder email for overdue tasks (EventBridge Scheduler, Lambda and SES).
