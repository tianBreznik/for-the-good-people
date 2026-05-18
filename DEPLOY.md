# Deploy Good People Posting

This app is a **Node.js server** (not static-only hosting). It needs Express for `/api/auth/*`, `/upload`, and env-based Firebase Admin + email.

Recommended host: **[Render](https://render.com)** (free tier works for testing; use a paid plan if you need persistent image uploads).

## 1. Push code to GitHub

Ensure secrets are **not** committed:

- `.env`
- `firebase-service-account.json`

```bash
git add .
git commit -m "Prepare for production deploy"
git push origin main
```

## 2. Create a Render Web Service

1. [Render Dashboard](https://dashboard.render.com/) → **New** → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free (or Starter for always-on + disk)

Or use **Blueprint** and upload `render.yaml`, then fill secret env vars in the dashboard.

## 3. Environment variables (Render → Environment)

Copy from your local `.env`, plus Firebase Admin as **one line of JSON**:

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Entire contents of `firebase-service-account.json` (minified one line) |
| `ADMIN_NOTIFY_EMAIL` | Your inbox |
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` |
| `SMTP_USER` | Gmail that sends mail |
| `SMTP_PASS` | Gmail App Password |
| `MAIL_FROM` | Optional display name |
| `SITE_NAME` | `Good People Posting` |

Render sets `PORT` automatically — do not override it.

**Tip:** To minify the service account JSON:

```bash
node -e "console.log(JSON.stringify(require('./firebase-service-account.json')))"
```

Paste that output into `FIREBASE_SERVICE_ACCOUNT_JSON`.

## 4. Custom domain (your new domain)

1. Render → your service → **Settings** → **Custom Domains** → add `yourdomain.com` and `www.yourdomain.com`
2. At your domain registrar, add the DNS records Render shows (usually a **CNAME** for `www` and **A/ALIAS** for apex)
3. Wait for DNS + SSL (often 5–30 minutes)

## 5. Firebase Console

[Firebase Console](https://console.firebase.google.com/) → **Authentication** → **Settings** → **Authorized domains**

Add:

- `yourdomain.com`
- `www.yourdomain.com`
- Your Render URL (e.g. `good-people-posting.onrender.com`) while testing

OAuth providers (Google, Apple, X):

- Add the same domains to each provider’s allowed callback/redirect URLs where required.

## 6. Verify

- Open `https://yourdomain.com`
- Sign in / create account / submit author application
- Check Render **Logs** for `[mail] Sent author application notification`
- Check Firestore for `authorApplications`

## Image uploads note

Uploaded images are stored in `public/uploads/` on the server disk. On **free** Render instances, files can be **lost on redeploy**. For production, plan to move uploads to **Firebase Storage** later.

## Local production test

```bash
NODE_ENV=production npm start
```

Uses `PORT` from env or defaults to `3008`.
