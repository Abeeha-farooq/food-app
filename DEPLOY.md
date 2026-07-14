# Deployment Runbook

> **Quick answer:** Yes — **everything deploys on Vercel** from a single project. The React client is a static build (served by Vercel's CDN), and the Express API runs as a serverless function at `/api/*` on the **same domain**. No CORS, no second host.

## Architecture

```
┌────────────────────────────────────────────────┐
│  Vercel (single project, one URL)               │
│                                                  │
│  foodapp.vercel.app/  →  React (CDN)            │
│  foodapp.vercel.app/api/*  →  Express function  │
│                                                  │
│  Auto-deploys on git push                       │
└──────────┬─────────────────────────────────────┘
           │  Mongoose
           ▼
┌──────────────────────────────┐
│  MongoDB Atlas (free M0)     │   ← Cloud database
│                              │      512MB free, no credit card
└──────────────────────────────┘
```

**Why this works:**
- The client (Vite/React) builds to static HTML/CSS/JS — Vercel serves these from a CDN.
- The Express app is wrapped in a single Vercel serverless function (`api/index.js`) that imports the same `server/server.js` you use in dev.
- Both share the **same origin**, so no CORS, no cross-origin cookie headaches.
- Stripe webhooks still work — `express.raw()` on the webhook route preserves the raw body for signature verification.

**Tradeoff vs Render/Vercel split:** Vercel serverless has a 10s request timeout on Hobby (60s on Pro) and ~300-800ms cold start. For a normal food-ordering flow (REST + Stripe, all <1s) this is fine.

---

## Step-by-step deployment (≈25 min total)

### Step 1: Set up MongoDB Atlas (10 min)

1. Sign up at https://www.mongodb.com/cloud/atlas/register
2. Create a free **M0 cluster** (any region — pick one close to your users)
3. **Database Access** → Add new database user
   - Username: `foodapp`
   - Password: generate a strong one, **save it**
4. **Network Access** → Add IP Address → `0.0.0.0/0` (allow from anywhere — Vercel functions run on dynamic IPs)
5. **Clusters** → Connect → Drivers → copy the connection string. It looks like:
   ```
   mongodb+srv://foodapp:<password>@cluster0.abc123.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<password>` with the password from step 3 and add `/FoodAppDB` before the `?`:
   ```
   mongodb+srv://foodapp:YOUR_PASSWORD@cluster0.abc123.mongodb.net/FoodAppDB?retryWrites=true&w=majority
   ```
7. **Save this string** — you'll need it in Step 3.

### Step 2: Push your code to GitHub (5 min, one-time)

1. Initialize git if you haven't:
   ```bash
   cd "D:\food app"
   git init
   git add .
   git commit -m "Initial commit"
   ```
2. Create a new GitHub repo (e.g. `foodapp`)
3. Push:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/foodapp.git
   git branch -M main
   git push -u origin main
   ```

### Step 3: Deploy to Vercel (5 min)

1. Sign up at https://vercel.com (use GitHub login)
2. Click **Add New → Project**
3. Import your GitHub repo
4. **Settings:**
   - **Root Directory:** leave as `.` (the project root — Vercel reads `vercel.json` from there)
   - **Framework Preset:** Other (we configure the build manually in vercel.json)
   - **Build & Output settings:** leave defaults — `vercel.json` overrides them
5. **Environment Variables** (expand section) — add these for **Production** (and optionally Preview):

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `MONGO_URI` | (the Atlas string from Step 1) |
   | `JWT_SECRET` | (long random string; generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`) |
   | `JWT_EXPIRES_IN` | `7d` |
   | `CLIENT_URL` | leave blank for now (CORS isn't needed since client + API share the same origin) |
   | `MAIL_DRY_RUN` | `true` (switch to `false` after you set up real SMTP) |
   | `MAIL_FROM` | `"FoodApp <no-reply@yourdomain.com>"` |
   | `MAIL_HOST` | `smtp.gmail.com` (or your SMTP host) |
   | `MAIL_PORT` | `465` |
   | `MAIL_USER` | your SMTP username |
   | `MAIL_PASS` | your SMTP password |
   | `STRIPE_SECRET_KEY` | `sk_test_...` (use test key first; switch to live later) |
   | `STRIPE_WEBHOOK_SECRET` | leave blank for now (optional, see Step 5) |
   | `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` (your Stripe test key) |
   | `VITE_API_URL` | leave blank (uses relative `/api` since same origin) |

6. Click **Deploy**. Vercel:
   - Installs deps in `client/`, `server/`, and `api/`
   - Builds the React client to `client/dist/`
   - Bundles `api/index.js` as a serverless function
   - Deploys everything to your URL
   - First deploy takes ~2 min. You'll get a URL like `https://foodapp-abc123.vercel.app`.

7. **Verify:** open your URL → the app loads → you can log in (using one of your seed users: `admin@foodapp.com` / `admin123`).

### Step 4: (Optional) Seed your production database

If you want your live DB to have restaurants, menu items, and the admin user, run the seed script against your Atlas cluster:

```bash
# Locally, point at your Atlas cluster and run the seed
cd "D:\food app\server"
MONGO_URI="mongodb+srv://foodapp:YOUR_PASSWORD@cluster0.abc123.mongodb.net/FoodAppDB?retryWrites=true&w=majority" npm run seed
```

(You can also do this in MongoDB Atlas's web UI by importing the data manually.)

### Step 5: Set up Stripe webhook (optional, 5 min)

If you want Stripe to send payment events to your deployed API:

1. Stripe Dashboard → **Webhooks** → **Add endpoint**
2. URL: `https://foodapp-abc123.vercel.app/api/payments/webhook`
3. Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
4. Click **Add endpoint** → reveal **Signing secret** → copy
5. Go back to **Vercel** → Project → Settings → Environment Variables → add `STRIPE_WEBHOOK_SECRET` = the signing secret
6. Save → Vercel auto-redeploys the API with the new env var

### Step 6: Custom domain (optional)

- **Vercel:** Project → Settings → Domains → add your domain. Free HTTPS auto-issued.

---

## Cost (free tier limits)

| Service | Free tier | What you get |
|---|---|---|
| **Vercel** | Free forever (Hobby) | 100GB bandwidth, 10s serverless timeout, 6000 build min/month, 100GB-hr function execution |
| **MongoDB Atlas M0** | Free forever | 512MB storage, shared CPU, no credit card |
| **Stripe** | Pay per use | No monthly fee; 2.9% + 30¢ per successful card charge |

For a demo/personal project, **everything fits in the free tiers** and you'd pay nothing.

If you outgrow the Vercel free tier (unusual for a project this size), the next step up is **Vercel Pro ($20/mo)** for 60s function timeouts and more bandwidth.

---

## Common gotchas

1. **Cold start ~300-800ms on first request.** Vercel keeps the function warm for a few minutes after the last call, so a hot app feels instant. After 5-10 min of no traffic, the next request pays the cold-start tax. This is normal for serverless — not a bug.

2. **10s timeout on Hobby plan.** If any single request ever takes longer (very rare for normal CRUD + Stripe), the function times out. Upgrade to Pro ($20/mo) for 60s, or split long-running work into background jobs.

3. **MongoDB connection takes 2-5 sec on cold start.** Atlas free tier is far from the server. The connection is cached on `global` (see `server/config/db.js`) so subsequent requests in the same container are fast. First request after a long idle = slow.

4. **Vercel preview deployments** get their own URL (e.g. `https://foodapp-git-feature-x.vercel.app`). Our CORS config (`server/server.js`) auto-allows any `*.vercel.app` origin, so previews work without changes.

5. **Never commit `.env` to git.** The `.env.production.example` files are templates only — they go in git. The real `.env` stays local.

6. **Use Stripe TEST keys first** (start with `sk_test_...`). Switch to live keys only after thorough testing. Live keys charge real money.

7. **Generate a strong JWT_SECRET for production.** Never use the dev one from the repo.

8. **`api/package.json` and `server/package.json` must stay in sync.** When you add/remove a server dependency, update both. They list the same deps — `api/` is for Vercel's bundler, `server/` is for local dev.

---

## Files in this repo that support deployment

| File | Purpose |
|---|---|
| `vercel.json` | Vercel project config — build, output dir, rewrites, function settings |
| `api/index.js` | Vercel serverless entry point — imports `server/server.js` and exports it |
| `api/package.json` | Server deps (mirrors `server/package.json` — Vercel's bundler uses this) |
| `server/server.js` | Express app — now works in BOTH dev (`npm start`) and serverless (Vercel) |
| `server/config/db.js` | Mongoose connection cached on `global` for serverless reuse |
| `client/.env.production.example` | Template for the 1 frontend env var (`VITE_STRIPE_PUBLISHABLE_KEY`) |
| `DEPLOY.md` | This file |

---

## After deployment, test these flows

- [ ] Open the Vercel URL → home page loads (fast, from CDN)
- [ ] Click "Restaurants" → list loads (calls API on the same origin)
- [ ] Sign up with a new email → check Vercel logs (Dashboard → Deployments → click latest → Logs) for `[EMAIL:DRY-RUN]` OTP
- [ ] Verify the OTP → you should be logged in
- [ ] Add a restaurant to cart → checkout
- [ ] Pay with test card `4242 4242 4242 4242` → order saved with `paymentStatus: "paid"`
- [ ] Open admin → change order status → status updates in DB

If any step fails, check the **Vercel logs** (Dashboard → your project → Deployments → click the deployment → Logs).
