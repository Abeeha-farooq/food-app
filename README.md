# 🍔 FlavorCourt — Food Delivery App

A full-stack food delivery web app where customers can browse restaurants, order food, and pay online. Built for production: real auth, real payments (Stripe + PayPal), deployed on Vercel, database on MongoDB Atlas.

---

## ⚡ Quick Start

```bash
# 1. Install all 3 workspaces' deps
cd "D:\food app"
npm --prefix client install --include=dev
npm --prefix server install --omit=dev
npm --prefix api install --omit=dev

# 2. Copy env templates and fill in your secrets
cp server/.env.production.example server/.env
cp client/.env.production.example client/.env

# 3. Run client + server in two terminals
# Terminal A
cd server && npm run dev
# Terminal B
cd client && npm run dev

# Open http://localhost:5173
```

Seed login (after running `npm run seed` in `server/`):
- **Admin:** `admin@foodapp.com` / `admin123`
- **Restaurant owner:** `owner@foodapp.com` / `owner123`
- **Customer:** `customer@foodapp.com` / `customer123`

---

## 🧱 Tech Stack

| Layer | Tech |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| **Routing / state** | React Router v7, React Context (Auth, Cart, Theme) |
| **Forms / validation** | react-hook-form, Zod |
| **Payments** | Stripe (cards / wallets) + PayPal (PayPal accounts) |
| **Backend** | Node.js 20+, Express 5, ESM modules, Mongoose 9 |
| **Auth** | JWT in httpOnly cookies + Bearer token fallback |
| **Database** | MongoDB Atlas (M0 free tier works for dev) |
| **Email** | Nodemailer (real SMTP in prod, DRY_RUN mode for dev) |
| **Deployment** | Vercel (frontend + serverless functions, single project) |

---

## 📁 Project Structure

```
D:\food app\
├── client\                  # React frontend (Vite)
│   ├── src\
│   │   ├── pages\           # Route-level screens
│   │   │   ├── HomePage / RestaurantDetailPage / CartPage
│   │   │   ├── CheckoutPage / UserOrdersPage
│   │   ├── admin\           # Admin dashboard (role-gated)
│   │   │   ├── Dashboard / OrdersPage
│   │   │   ├── RestaurantManagement / MenuManagement
│   │   ├── auth\            # Login / Signup / ForgotPassword / etc.
│   │   ├── components\      # Shared UI (NavBar, Footer, ThemeToggle, …)
│   │   ├── components\ui\   # shadcn primitives (Button, Card, Input, …)
│   │   ├── context\         # React Context (Auth, Cart, Theme)
│   │   ├── schema\          # Zod schemas
│   │   └── lib\             # Axios setup, utils
│   ├── .env                 # VITE_API_URL, VITE_STRIPE_PUBLISHABLE_KEY, VITE_PAYPAL_CLIENT_ID
│   └── package.json
│
├── server\                  # Express API (used in dev + bundled to /api for Vercel)
│   ├── config\db.js         # Mongoose connection (cached on global for serverless)
│   ├── controllers\         # Business logic
│   │   ├── auth.controller        # signup, login, verify-email, forgot-password
│   │   ├── user.controller        # profile, addresses
│   │   ├── restaurant.controller  # CRUD restaurants, menu
│   │   ├── order.controller       # place order, list, update status
│   │   ├── payment.controller.js  # Stripe (PaymentIntents + webhooks)
│   │   ├── paypal.controller.js   # PayPal (Orders API + webhooks)
│   │   └── admin.controller       # admin-only operations
│   ├── models\              # Mongoose schemas
│   │   ├── user.model.js
│   │   ├── restaurant.model.js
│   │   ├── menu.model.js
│   │   ├── order.model.js         # tracks stripePaymentIntentId + paypalOrderId
│   │   └── pendingSignup.model.js
│   ├── routes\              # Express routers
│   ├── middlewares\         # verifyJWT, requireRole, etc.
│   ├── utils\               # apiError, apiResponse, asyncHandler, mailer
│   ├── seed.js              # Seeds 3 users + 4 restaurants + menu items
│   ├── server.js            # Express app (default export — works in dev + serverless)
│   └── package.json
│
├── api\                     # Vercel serverless entry point
│   ├── handler.js           # Catch-all /api/* → server/server.js
│   ├── server\              # Auto-generated copy of server/ (created by build step)
│   ├── package.json         # Lists server's deps so Vercel bundles correctly
│   └── [[...slug]].js       # (or handler.js depending on current config — see vercel.json)
│
├── scripts\
│   └── copy-server.js       # Build step: copies server/ → api/server/ for Vercel bundling
│
├── vercel.json              # Vercel project config (build, rewrites, env install)
└── DEPLOY.md                # Full deployment runbook (Vercel + Atlas + Stripe + PayPal)
```

---

## ✨ Features

### Customers
- 🔍 Browse restaurants by city / cuisine
- 🛒 Add to cart, checkout with delivery address
- 💳 **Pay with card** (Stripe) — real payment processing
- 🅿️ **Pay with PayPal** — real PayPal Orders API
- 💵 **Cash on delivery** — no online payment needed
- 📧 Email verification on signup (6-digit OTP)
- 📜 Order history with status tracking
- ⭐ Review delivered orders (1-5 stars + comment)
- 🔑 Forgot password / reset password flow
- 🌓 Light / dark / system theme

### Restaurant Owners
- 📊 Dashboard with order stats
- 🍕 Manage menu items (add / edit / delete, toggle availability)
- 🏪 Manage restaurant profile
- 📦 View + update order status (placed → preparing → out_for_delivery → delivered)

### Admins
- 📊 Global stats (users, restaurants, orders, revenue)
- 👥 Manage all users + roles
- 🏪 Manage all restaurants
- 📦 Manage all orders + payments
- 🔍 Verify / unverify restaurants

---

## 🛣️ Key Routes

| Path | Component | Auth |
|---|---|---|
| `/` | `HomePage` | public |
| `/restaurant/:id` | `RestaurantDetailPage` | public |
| `/login` | `Login` | public |
| `/signup` | `Signup` | public |
| `/forgot-password` | `ForgotPassword` | public |
| `/verify-email` | `VerifyEmail` | public |
| `/reset-password/:token` | `ResetPassword` | public |
| `/profile` | `Profile` | logged in |
| `/cart` | `CartPage` | logged in |
| `/checkout` | `CheckoutPage` | logged in |
| `/my-orders` | `UserOrdersPage` | logged in |
| `/admin` | `Dashboard` (admin layout) | admin |
| `/admin/orders` | `OrdersPage` | admin |
| `/admin/restaurants` | `RestaurantManagement` | admin |
| `/admin/menu` | `MenuManagement` | admin |

---

## 💳 Payment Flow (production-grade)

The app supports **two real payment processors** with the same defense-in-depth pattern:

```
1. User picks "Pay with card" or "Pay with PayPal" at checkout
2. Client asks OUR server to create a payment intent (Stripe) or order (PayPal)
3. Server returns clientSecret / orderId
4. Client confirms payment (Stripe Elements iframe / PayPal Smart Buttons)
5. Processor charges the customer
6. Client tells OUR server "order placed" with the payment ID
7. Server RE-VERIFIES with the processor (defense in depth — never trust the client)
8. Server saves the order with paymentStatus="paid"
9. Processor ALSO sends a webhook (async) — server verifies signature and reconciles
```

**Why this matters:** A malicious client can fake a "payment succeeded" message. Step 7 (server re-verification) catches this. Step 9 (webhook) catches the case where the user closes the tab before we get a response.

See `server/controllers/payment.controller.js` (Stripe) and `server/controllers/paypal.controller.js` (PayPal) for the implementation.

---

## 🚀 Deployment

Full runbook: **[DEPLOY.md](./DEPLOY.md)**

TL;DR:
1. **MongoDB Atlas** — free M0 cluster, whitelist `0.0.0.0/0`
2. **GitHub** — push the repo
3. **Vercel** — New Project → import repo, set Root Directory to `.`, paste env vars, deploy
4. **Stripe** — add webhook → `https://yourapp.vercel.app/api/payments/webhook`
5. **PayPal** — add webhook → `https://yourapp.vercel.app/api/payments/paypal/webhook` (optional)

---

## 🔐 Environment Variables

### Server (`server/.env` — dev) / Vercel env vars (prod)
```
MONGO_URI=             # mongodb+srv:// connection string
JWT_SECRET=            # long random string (node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_EXPIRES_IN=        # e.g. 7d
CLIENT_URL=            # http://localhost:5173 (dev) | https://yourapp.vercel.app (prod)
MAIL_DRY_RUN=          # true for dev (prints OTPs to console) | false for prod
MAIL_FROM=             # "FoodApp <no-reply@yourdomain.com>"
MAIL_HOST=             # smtp.gmail.com (or your SMTP host)
MAIL_PORT=             # 465
MAIL_USER=             # your email
MAIL_PASS=             # your app password
STRIPE_SECRET_KEY=     # sk_test_... (dev) | sk_live_... (prod)
STRIPE_WEBHOOK_SECRET= # whsec_... (from Stripe webhook setup)
PAYPAL_MODE=           # sandbox | live
PAYPAL_CLIENT_ID=      # from PayPal Developer Dashboard
PAYPAL_CLIENT_SECRET=  # from PayPal Developer Dashboard
PAYPAL_WEBHOOK_ID=     # from PayPal webhook setup (optional)
```

### Client (`client/.env`)
```
VITE_API_URL=                    # leave blank in prod (uses same origin)
VITE_STRIPE_PUBLISHABLE_KEY=     # pk_test_... (dev) | pk_live_... (prod)
VITE_PAYPAL_CLIENT_ID=           # from PayPal Developer Dashboard
```

---

## 📚 Other Docs

- **[DEPLOY.md](./DEPLOY.md)** — step-by-step Vercel + Atlas + Stripe + PayPal setup
- **[docs/linkedin-posts/](./docs/linkedin-posts/)** — educational blog posts about the architecture decisions

---

## 🧪 Test Cards (Stripe)

| Card | Behavior |
|---|---|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 0002` | Declined |
| `4000 0027 6000 3184` | Requires 3D Secure |

Use any future expiry (e.g. `12/34`) and any 3-digit CVC.

---

## 🏗️ Architecture Notes

- **Single Vercel project** hosts both the static React build AND the serverless Express function. No CORS, no second domain. The Express `app` is exported as a `(req, res)` handler and bundled by Vercel.
- **Mongoose connection** is cached on `global` so serverless function invocations reuse the connection within the same container.
- **Payment fields on Order** track BOTH processors: `stripePaymentIntentId`, `paypalOrderId`, `paypalPayerId`, `paypalCaptureId`. The `paymentMethod` enum tells you which one was used.
- **Webhook routes** are mounted with `express.raw()` (NOT `express.json()`) so signature verification works. Both Stripe and PayPal are mounted BEFORE the JSON middleware in `server.js`.
- **Build step** (`scripts/copy-server.js`) copies `server/` → `api/server/` before Vercel bundles the function. The build step exists because Vercel's bundler is happiest with same-directory relative imports.

---

## 📜 License

Private project — all rights reserved.
