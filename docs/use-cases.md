# Use Case Document — FlavorCourt

> A formal-yet-readable description of who can do what in the system, when they can do it, and what happens as a result. Use this as the source of truth for what the app does, and as a starting point for writing tests.

---

## 📑 Table of Contents

1. [Actors](#-actors)
2. [System Overview](#-system-overview)
3. [Use Case Index](#-use-case-index)
4. [Customer Use Cases](#-customer-use-cases)
5. [Restaurant Owner Use Cases](#-restaurant-owner-use-cases)
6. [Admin Use Cases](#-admin-use-cases)
7. [Guest Use Cases](#-guest-use-cases)
8. [System (Automated) Use Cases](#-system-automated-use-cases)
9. [Cross-Cutting Requirements](#-cross-cutting-requirements)
10. [Use Case Diagrams (text)](#-use-case-diagrams-text)

---

## 👥 Actors

| Actor | Description | Authentication |
|---|---|---|
| **Guest** | Unauthenticated visitor. Can browse but not order. | None |
| **Customer** | Registered user with the `customer` role. Can order, review, manage own profile. | JWT (httpOnly cookie + Bearer) |
| **Restaurant Owner** | User with the `restaurant_owner` role. Owns one or more restaurants. Has customer abilities + restaurant management. | JWT + role check |
| **Admin** | User with the `admin` role. Has full system access. | JWT + role check |
| **System** | Automated actor — sends emails, processes payments via Stripe/PayPal APIs, syncs webhooks. | N/A (machine) |
| **Stripe / PayPal** | External payment processor (treated as a sub-actor of System for payment flows). | API keys (server-side only) |
| **Email Service (SMTP)** | External email delivery (Gmail, SendGrid, etc.). | SMTP credentials (server-side) |

---

## 🏛️ System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                          FlavorCourt                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐         ┌─────────────────────┐         │
│  │   React Frontend    │ ──────▶ │  Express API (Vercel │         │
│  │  (Vite, TS, Tailwind)│  HTTPS  │  Serverless Function)│         │
│  │  Stripe Elements    │         │  Node.js 20+, ESM    │         │
│  │  PayPal Smart Btns  │         └──────────┬──────────┘         │
│  └─────────────────────┘                    │                    │
│                                            │ Mongoose            │
│                                            ▼                    │
│                                  ┌─────────────────────┐         │
│                                  │  MongoDB Atlas       │         │
│                                  │  (users, restaurants,│         │
│                                  │  menus, orders)      │         │
│                                  └─────────────────────┘         │
│                                                                  │
│         ┌──────────────────┐    ┌──────────────────┐             │
│         │  Stripe           │    │  PayPal           │             │
│         │  (cards, wallets) │    │  (PayPal accounts) │             │
│         └─────▲────────────┘    └─────▲────────────┘             │
│               │ Webhooks (POST)        │ Webhooks (POST)            │
│               └────────┬───────────────┘                             │
│                        ▼                                            │
│                  ┌─────────────────┐                                │
│                  │  /api/payments/  │                                │
│                  │  webhook         │                                │
│                  └─────────────────┘                                │
│                                                                   │
│         ┌──────────────────┐                                        │
│         │  SMTP / Gmail     │ ◀──── server uses for OTP emails    │
│         └──────────────────┘                                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📋 Use Case Index

| ID | Use Case | Primary Actor |
|---|---|---|
| UC-01 | Sign up | Guest |
| UC-02 | Verify email | Customer (new) |
| UC-03 | Log in | Guest |
| UC-04 | Forgot password | Guest |
| UC-05 | Reset password | Guest |
| UC-06 | Log out | Customer / Owner / Admin |
| UC-07 | Browse restaurants | Anyone |
| UC-08 | View restaurant + menu | Anyone |
| UC-09 | Toggle theme | Anyone |
| UC-10 | Add item to cart | Customer |
| UC-11 | View / modify cart | Customer |
| UC-12 | Place order (cash) | Customer |
| UC-13 | Place order (Stripe / card) | Customer |
| UC-14 | Place order (PayPal) | Customer |
| UC-15 | View my orders | Customer |
| UC-16 | Review delivered order | Customer |
| UC-17 | Update profile / address | Customer |
| UC-18 | Manage restaurant profile | Restaurant Owner |
| UC-19 | Manage menu items | Restaurant Owner |
| UC-20 | View restaurant orders | Restaurant Owner |
| UC-21 | Update order status | Restaurant Owner |
| UC-22 | View admin dashboard | Admin |
| UC-23 | Manage all users | Admin |
| UC-24 | Manage all restaurants | Admin |
| UC-25 | Manage all menu items | Admin |
| UC-26 | View all orders | Admin |
| UC-27 | Update any order status | Admin |
| UC-28 | Send verification email | System |
| UC-29 | Send password-reset email | System |
| UC-30 | Process Stripe webhook | System |
| UC-31 | Process PayPal webhook | System |

---

## 🛒 Customer Use Cases

### UC-01: Sign up

| | |
|---|---|
| **Actor** | Guest |
| **Preconditions** | Email not already registered. Email is valid format. |
| **Postconditions** | User record created with `emailVerified: false`. Verification OTP sent. |
| **Trigger** | User submits signup form with email, password, name, phone, address, city, country. |

**Main flow:**
1. User opens `/signup` and fills in the form.
2. Client validates input with Zod schema.
3. Client POSTs `/api/auth/signup` with the form data.
4. Server validates input (email format, password strength, etc.).
5. Server checks that the email isn't already registered.
6. Server hashes the password (bcrypt, 10 rounds).
7. Server creates a `PendingSignup` record with a 6-digit OTP (10-min expiry).
8. Server calls the mailer to send the verification email with the OTP.
9. Server returns `201` with a success message.
10. Client navigates to `/verify-email` with the email pre-filled.
11. User checks their inbox, enters the OTP.

**Alternative flow — email already exists:**
- Step 5: Server returns `409 Conflict` with "Email already registered".
- Client shows a "log in instead" link.

**Alternative flow — SMTP failure (MAIL_DRY_RUN=true):**
- Step 8: Server logs the OTP to the console instead of sending the email.
- The user (developer) reads the OTP from the server logs.

---

### UC-02: Verify email

| | |
|---|---|
| **Actor** | Customer (new, unverified) |
| **Preconditions** | User has a `PendingSignup` record with a non-expired OTP. |
| **Postconditions** | User account created with `emailVerified: true`. OTP record deleted. JWT issued. |
| **Trigger** | User submits the 6-digit code from their email. |

**Main flow:**
1. User submits the OTP.
2. Client POSTs `/api/auth/verify-email` with `{ email, otp }`.
3. Server looks up the `PendingSignup` by email.
4. Server checks the OTP matches and hasn't expired.
5. Server creates the `User` record with `emailVerified: true`.
6. Server deletes the `PendingSignup` record.
7. Server issues a JWT and sets it as a httpOnly cookie.
8. Server returns `200` with user data and the token.
9. Client saves the token to localStorage (for Authorization header fallback) and navigates to `/`.

**Alternative flow — invalid OTP:**
- Step 4: Server returns `400 Bad Request` with "Invalid or expired code".
- Client shows an error and offers "Resend code".

**Alternative flow — resend code:**
- User clicks "Resend code".
- Client POSTs `/api/auth/resend-verification` with `{ email }`.
- Server generates a new OTP, updates the `PendingSignup` record, resends the email.
- Server always returns `200` (to avoid leaking which emails are registered).

---

### UC-03: Log in

| | |
|---|---|
| **Actor** | Guest |
| **Preconditions** | User has a verified account. |
| **Postconditions** | JWT set in httpOnly cookie. User data returned. |
| **Trigger** | User submits login form with email + password. |

**Main flow:**
1. User submits email + password.
2. Client POSTs `/api/auth/login` with `{ email, password }`.
3. Server looks up the user by email.
4. Server compares the password hash with `bcrypt.compare`.
5. Server issues a JWT (signed with `JWT_SECRET`, expires per `JWT_EXPIRES_IN`).
6. Server sets the JWT as a httpOnly cookie AND returns it in the JSON body.
7. Client saves the token to localStorage and updates the auth context.
8. Client navigates to the page the user was trying to reach (or `/`).

**Alternative flow — invalid credentials:**
- Step 4: Server returns `401 Unauthorized` with "Invalid email or password".
- Client shows a toast error.

**Alternative flow — email not verified (UC-02):**
- Step 3.5: Server checks `emailVerified` flag.
- If false: Server returns `403 Forbidden` with "Please verify your email".
- Client shows a panel with "Verify now" and "Resend code" CTAs.

---

### UC-04: Forgot password

| | |
|---|---|
| **Actor** | Guest |
| **Preconditions** | User has an account. |
| **Postconditions** | Password-reset email sent (or silently ignored if email doesn't exist — anti-enumeration). |
| **Trigger** | User submits the forgot-password form with their email. |

**Main flow:**
1. User opens `/forgot-password` and enters their email.
2. Client POSTs `/api/auth/forgot-password` with `{ email }`.
3. Server looks up the user by email.
4. If found: server generates a random reset token, saves it (hashed) on the user record with a 1-hour expiry.
5. Server sends an email with a link: `https://app.com/reset-password/{token}`.
6. Server always returns `200` (never reveals if the email exists).
7. Client shows "If an account exists, you'll receive an email".

**Note:** This endpoint does NOT leak whether the email is registered. The response is identical whether the user exists or not.

---

### UC-05: Reset password

| | |
|---|---|
| **Actor** | Guest (with valid reset token) |
| **Preconditions** | User has a non-expired, unused reset token. |
| **Postconditions** | Password updated. Token invalidated. User can log in with new password. |
| **Trigger** | User clicks the link in the password-reset email and submits a new password. |

**Main flow:**
1. User clicks the email link, navigates to `/reset-password/{token}`.
2. User enters and confirms the new password.
3. Client POSTs `/api/auth/reset-password` with `{ token, newPassword }`.
4. Server hashes the token, looks up the user whose hashed token matches.
5. Server checks the token hasn't expired.
6. Server hashes the new password and updates the user record.
7. Server clears the reset token (so it can't be reused).
8. Server returns `200`.
9. Client navigates to `/login` with a success toast.

**Alternative flow — invalid/expired token:**
- Step 4: Server returns `400 Bad Request` with "Invalid or expired reset link".
- Client shows an error and a "Request new link" button.

---

### UC-07: Browse restaurants

| | |
|---|---|
| **Actor** | Anyone (Guest or logged in) |
| **Preconditions** | None |
| **Postconditions** | List of restaurants displayed. |
| **Trigger** | User opens `/` or searches. |

**Main flow:**
1. Client GETs `/api/restaurants?city=X&cuisine=Y&search=Z&page=N`.
2. Server queries MongoDB with filters + pagination.
3. Server returns the matching restaurants (id, name, city, cuisine, image, rating, delivery time).
4. Client renders the restaurant cards.

**Variants:**
- `?city=X` — filter by city
- `?cuisine=X` — filter by cuisine type
- `?search=X` — full-text search on name
- `?page=N&limit=M` — pagination (default 20 per page)

---

### UC-08: View restaurant + menu

| | |
|---|---|
| **Actor** | Anyone |
| **Preconditions** | Restaurant exists. |
| **Postconditions** | Restaurant details and available menu items displayed. |
| **Trigger** | User clicks a restaurant card. |

**Main flow:**
1. Client navigates to `/restaurant/:id`.
2. Client GETs `/api/restaurants/:id` for restaurant details.
3. Client GETs `/api/restaurants/:id/menu` for available menu items.
4. Client renders the menu grouped by category.
5. Each menu item shows: name, description, price, image, "Add" button.

---

### UC-10: Add item to cart

| | |
|---|---|
| **Actor** | Customer |
| **Preconditions** | User is logged in. Restaurant has the item available. |
| **Postconditions** | Cart in localStorage updated. Cart badge increments. |
| **Trigger** | User clicks "Add" on a menu item. |

**Main flow:**
1. User clicks "Add" on a menu item.
2. Client adds the item to the cart context (in localStorage).
3. Cart badge in navbar updates.
4. Toast "Added X to cart" appears.

**Note:** Cart is stored client-side (localStorage). It's NOT in the database until the user places an order. This keeps the cart fast and DB-load-free.

---

### UC-12: Place order (cash on delivery)

| | |
|---|---|
| **Actor** | Customer |
| **Preconditions** | User is logged in, cart has items, delivery address is filled. |
| **Postconditions** | Order created with `paymentStatus: "pending"`, `status: "placed"`, `paymentMethod: "cash"`. Cart cleared. |
| **Trigger** | User clicks "Place order" with payment method = "Cash on delivery". |

**Main flow:**
1. User submits the checkout form.
2. Client POSTs `/api/orders` with `{ items, deliveryAddress, paymentStatus: "pending", paymentMethod: "cash" }`.
3. Server validates input (restaurantId, items[], deliveryAddress required).
4. Server fetches the menu items from DB and verifies they exist + are available.
5. Server computes the subtotal using SERVER-side prices (not the client's claimed prices — defense against tampering).
6. Server computes delivery fee + total.
7. Server creates the `Order` document.
8. Server returns `201` with the order.
9. Client clears the cart and shows the confirmation screen.

**Alternative flow — empty cart:**
- Client-side check prevents this (button disabled if cart is empty).

**Alternative flow — multi-restaurant cart:**
- Server returns `400 Bad Request` with "Order one restaurant at a time".

---

### UC-13: Place order (Stripe / card)

| | |
|---|---|
| **Actor** | Customer |
| **Preconditions** | Same as UC-12 + Stripe configured (`STRIPE_SECRET_KEY` + publishable key). |
| **Postconditions** | Order created with `paymentStatus: "paid"`, `stripePaymentIntentId` saved. Cart cleared. Stripe dashboard shows the charge. |
| **Trigger** | User enters card details in Stripe Elements and clicks "Pay & place order". |

**Main flow:**
1. User enters card in the Stripe Elements iframe (card data NEVER touches our server).
2. User clicks "Pay & place order".
3. Client POSTs `/api/payments/create-intent` with the cart total.
4. Server creates a Stripe PaymentIntent with `automatic_payment_methods.enabled: true` and returns the `clientSecret`.
5. Client calls `stripe.confirmPayment()` with the clientSecret.
6. Stripe processes the payment (talks to the bank).
7. On success, client POSTs `/api/orders` with `{ ..., paymentStatus: "paid", paymentMethod: "stripe", stripePaymentIntentId }`.
8. **Server re-verifies** with Stripe: `stripe.paymentIntents.retrieve(id)`.
9. Server checks status === "succeeded" AND amount ≥ server-computed total.
10. Server creates the order.
11. Server returns `201`.
12. Client clears the cart, shows confirmation.

**Why step 8 matters:** A malicious client could fake a "payment succeeded" message. Server-side verification is the defense.

**Asynchronous:** Stripe ALSO sends a webhook to `/api/payments/webhook` for refund/dispute events. See UC-30.

---

### UC-14: Place order (PayPal)

| | |
|---|---|
| **Actor** | Customer |
| **Preconditions** | Same as UC-12 + PayPal configured (`PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET`). |
| **Postconditions** | Order created with `paymentStatus: "paid"`, `paypalOrderId` + `paypalCaptureId` + `paypalPayerId` saved. Cart cleared. |
| **Trigger** | User clicks "PayPal" button at checkout and approves in the PayPal popup. |

**Main flow:**
1. User clicks the "PayPal" button on the checkout page.
2. PayPal Smart Buttons open a PayPal popup.
3. User logs into PayPal (sandbox test account in dev) and approves the payment.
4. `createOrder` callback fires — Client POSTs `/api/payments/paypal/create-order` with the amount.
5. Server calls PayPal Orders API: `POST /v2/checkout/orders`.
6. Server returns the PayPal order ID to the client.
7. User authorizes in the PayPal popup. PayPal returns an approval.
8. `onApprove` callback fires with the PayPal order ID.
9. Client POSTs `/api/payments/paypal/capture` with the order ID.
10. Server calls PayPal Orders API: `POST /v2/checkout/orders/{id}/capture`.
11. PayPal returns the capture details (status=COMPLETED, captureId, payerId).
12. Client POSTs `/api/orders` with `{ ..., paymentStatus: "paid", paymentMethod: "paypal", paypalOrderId, paypalPayerId, paypalCaptureId }`.
13. **Server re-verifies** with PayPal: refetches the order to confirm COMPLETED.
14. Server checks captured amount ≥ server-computed total.
15. Server creates the order.
16. Server returns `201`.
17. Client clears the cart, shows confirmation.

**Asynchronous:** PayPal ALSO sends webhooks for refunds/disputes. See UC-31.

---

### UC-15: View my orders

| | |
|---|---|
| **Actor** | Customer |
| **Preconditions** | User is logged in. |
| **Postconditions** | List of the user's orders displayed. |
| **Trigger** | User navigates to `/my-orders`. |

**Main flow:**
1. Client GETs `/api/orders/my`.
2. Server queries orders where `user = req.user._id`, sorted by `createdAt: -1` (newest first).
3. Server populates `restaurant` with `{ name, city, imageUrl }`.
4. Server returns the orders.
5. Client renders each order: order ID, restaurant, items, total, status, payment status, date.

---

### UC-16: Review delivered order

| | |
|---|---|
| **Actor** | Customer |
| **Preconditions** | User owns the order. Order status is "delivered". Order has not been reviewed yet. |
| **Postconditions** | Order has a `rating` (1-5), `reviewComment`, `reviewedAt`. |
| **Trigger** | User clicks "Review" on a delivered order. |

**Main flow:**
1. User opens the "Review" modal.
2. User selects 1-5 stars and types an optional comment.
3. Client PATCHes `/api/orders/:id/review` with `{ rating, comment }`.
4. Server validates: rating is integer 1-5, order exists, order is "delivered", order is not already reviewed, user owns the order.
5. Server updates the order.
6. Server returns `200`.
7. Client shows the review on the order detail.

**Alternative flow — not delivered yet:**
- Step 4: Server returns `400 "You can only review delivered orders"`.

**Alternative flow — already reviewed:**
- Step 4: Server returns `400 "This order has already been reviewed"`.

---

## 👨‍🍳 Restaurant Owner Use Cases

### UC-18: Manage restaurant profile

| | |
|---|---|
| **Actor** | Restaurant Owner |
| **Preconditions** | User has the `restaurant_owner` role and owns a restaurant. |
| **Postconditions** | Restaurant profile updated. |
| **Trigger** | Owner edits name / description / image / address / delivery time. |

**Main flow:**
1. Owner opens `/admin/restaurants` (the restaurant-management section).
2. Owner edits fields and clicks Save.
3. Client PATCHes `/api/restaurants/:id` with the updated fields.
4. Server validates: owner owns this restaurant (or is admin).
5. Server updates the document.
6. Server returns `200`.
7. Client shows success toast.

---

### UC-19: Manage menu items

| | |
|---|---|
| **Actor** | Restaurant Owner |
| **Preconditions** | User owns the restaurant. |
| **Postconditions** | Menu item created/updated/deleted/toggled. |
| **Trigger** | Owner clicks Add / Edit / Delete / Toggle availability on a menu item. |

**Sub-flows:**

**19a. Add menu item:**
1. Owner clicks "Add item", fills form (name, description, price, category, image).
2. Client POSTs `/api/restaurants/:id/menu`.
3. Server creates the menu item.
4. Server returns `201`.

**19b. Edit menu item:**
1. Owner edits an item and clicks Save.
2. Client PATCHes `/api/restaurants/:id/menu/:menuId`.
3. Server updates.

**19c. Delete menu item:**
1. Owner clicks delete on an item, confirms.
2. Client DELETEs `/api/restaurants/:id/menu/:menuId`.
3. Server deletes the item.

**19d. Toggle availability:**
1. Owner toggles the "Available" switch.
2. Client PATCHes `/api/restaurants/:id/menu/:menuId` with `{ available: !current }`.
3. Server updates.

---

### UC-20: View restaurant orders

| | |
|---|---|
| **Actor** | Restaurant Owner |
| **Preconditions** | User owns the restaurant. |
| **Postconditions** | List of orders for the restaurant displayed. |
| **Trigger** | Owner navigates to `/admin/orders` (filtered to their restaurant). |

**Main flow:**
1. Client GETs `/api/orders?restaurantId=:id&status=X`.
2. Server returns orders for this restaurant.
3. Client renders the order list.

---

### UC-21: Update order status

| | |
|---|---|
| **Actor** | Restaurant Owner |
| **Preconditions** | User owns the restaurant that has this order. |
| **Postconditions** | Order's `status` field updated. |
| **Trigger** | Owner clicks "Confirm", "Start preparing", "Out for delivery", or "Delivered". |

**Main flow:**
1. Owner picks a new status from the dropdown.
2. Client PATCHes `/api/orders/:id/status` with `{ status }`.
3. Server validates: status is in the enum, user owns the order's restaurant.
4. Server updates the order.
5. Server returns `200`.
6. Customer sees the new status on `/my-orders` (next page load).

**Status enum:** `placed` → `confirmed` → `preparing` → `out_for_delivery` → `delivered` (or `cancelled` at any point).

---

## 🛠️ Admin Use Cases

### UC-22: View admin dashboard

| | |
|---|---|
| **Actor** | Admin |
| **Preconditions** | User has the `admin` role. |
| **Postconditions** | Stats displayed. |
| **Trigger** | Admin navigates to `/admin`. |

**Main flow:**
1. Client GETs `/api/admin/stats`.
2. Server queries MongoDB for: total users, total restaurants, total orders, total revenue, recent orders count.
3. Server returns the stats.
4. Client renders the dashboard with cards + charts.

---

### UC-23: Manage all users

| | |
|---|---|
| **Actor** | Admin |
| **Preconditions** | Admin is logged in. |
| **Postconditions** | User role changed / user verified / user deleted. |
| **Trigger** | Admin opens `/admin/users`, edits a user. |

**Sub-flows:**
- Change role: PATCH `/api/admin/users/:id` with `{ role }`
- Verify email: PATCH `/api/admin/users/:id` with `{ emailVerified: true }`
- Delete: DELETE `/api/admin/users/:id`

---

### UC-24: Manage all restaurants

| | |
|---|---|
| **Actor** | Admin |
| **Preconditions** | Admin is logged in. |
| **Postconditions** | Restaurant created / updated / deleted. |
| **Trigger** | Admin opens `/admin/restaurants`. |

Same shape as UC-18 but with no ownership check (admin can edit any restaurant).

---

### UC-25: Manage all menu items

| | |
|---|---|
| **Actor** | Admin |
| **Preconditions** | Admin is logged in. |
| **Postconditions** | Menu item modified for any restaurant. |
| **Trigger** | Admin opens `/admin/menu`. |

Same shape as UC-19 but with no ownership check.

---

### UC-26: View all orders

| | |
|---|---|
| **Actor** | Admin |
| **Preconditions** | Admin is logged in. |
| **Postconditions** | List of all orders, with optional filters. |
| **Trigger** | Admin navigates to `/admin/orders`. |

**Filters:** `?status=X&paymentStatus=Y&restaurantId=Z&userId=W`

---

### UC-27: Update any order status

Same as UC-21 but admin can update any order (no ownership check).

---

## 👤 Guest Use Cases

| ID | Use case | Notes |
|---|---|---|
| UC-01 | Sign up | Already covered above |
| UC-03 | Log in | Already covered above |
| UC-04 | Forgot password | Already covered above |
| UC-07 | Browse restaurants | Already covered above |
| UC-08 | View restaurant + menu | Already covered above |
| UC-09 | Toggle theme | Light / dark / system. Saved in localStorage. No backend call. |

---

## 🤖 System (Automated) Use Cases

### UC-28: Send verification email

| | |
|---|---|
| **Actor** | System (Nodemailer) |
| **Trigger** | UC-01 step 8 (signup) or UC-02 resend. |
| **Preconditions** | MAIL_DRY_RUN is "true" OR SMTP creds are set. |
| **Postconditions** | Email delivered (or printed to logs in DRY_RUN mode). |

**Main flow:**
1. Server generates a 6-digit OTP.
2. Server renders the verification email template.
3. If `MAIL_DRY_RUN=true`: server logs the email to console (no SMTP).
4. Else: server sends via Nodemailer using `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS`.

**Failure handling:** SMTP errors throw `ApiError(500, "Failed to send email: <reason>")`. DRY_RUN never fails (always returns success).

---

### UC-29: Send password-reset email

| | |
|---|---|
| **Actor** | System (Nodemailer) |
| **Trigger** | UC-04 step 5. |
| **Postconditions** | Email delivered with reset link. |

Same email infrastructure as UC-28.

---

### UC-30: Process Stripe webhook

| | |
|---|---|
| **Actor** | System (Stripe → our server) |
| **Trigger** | Stripe POSTs to `/api/payments/webhook` for `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`. |
| **Preconditions** | `STRIPE_WEBHOOK_SECRET` is set. Raw body preserved by `express.raw()` middleware. |
| **Postconditions** | Order status updated (or no-op if already correct). |

**Main flow:**
1. Stripe sends a POST to our webhook URL.
2. Server reads the raw body and `stripe-signature` header.
3. Server calls `stripe.webhooks.constructEvent(rawBody, sig, secret)`. **This is critical** — if the signature doesn't verify, the request is rejected (prevents fake webhooks from attackers).
4. Server processes the event:
   - `payment_intent.succeeded` → mark order paid (if not already)
   - `payment_intent.payment_failed` → mark order failed
   - `charge.refunded` → mark order refunded
5. Server returns `200 { received: true }`.

**Idempotency:** Webhooks can be retried by Stripe. The handlers should be idempotent (check current state before updating).

---

### UC-31: Process PayPal webhook

| | |
|---|---|
| **Actor** | System (PayPal → our server) |
| **Trigger** | PayPal POSTs to `/api/payments/paypal/webhook` for capture completed, refunds, disputes. |
| **Preconditions** | `PAYPAL_WEBHOOK_ID` is set. |
| **Postconditions** | Order status updated. |

**Main flow:**
1. PayPal sends a POST to our webhook URL with `PAYPAL-*` headers.
2. Server POSTs the event back to PayPal's verification endpoint: `/v1/notifications/verify-webhook-signature`.
3. If PayPal returns `verification_status: "SUCCESS"`, the event is legitimate.
4. Server processes the event:
   - `PAYMENT.CAPTURE.COMPLETED` → mark order paid
   - `PAYMENT.CAPTURE.REFUNDED` → mark order refunded
   - `CUSTOMER.DISPUTE.CREATED` → flag for manual review
5. Server returns `200 { received: true }`.

**Note:** PayPal verification is different from Stripe — you POST the event back to PayPal, they tell you if it's legit (vs Stripe which uses HMAC signatures in headers).

---

## 🔁 Cross-Cutting Requirements

These apply to ALL use cases:

### Security
- **Never trust the client** — every server endpoint validates input and re-computes critical values (order totals, user permissions) from the database
- **Authentication required** for any non-public endpoint (verified via `verifyJWT` middleware on the route)
- **Role-based authorization** for admin/owner endpoints (verified via `requireRole` middleware)
- **Webhook signature verification** is MANDATORY — never trust incoming webhooks without verifying
- **HTTPS only** in production (Vercel handles this)
- **JWT in httpOnly cookie** (not just localStorage) so it's not accessible to XSS
- **Password hashing** with bcrypt (10 rounds minimum)

### Performance
- **Connection caching** for MongoDB (cached on `global` for serverless reuse)
- **Pagination** on all list endpoints (default 20 per page)
- **Selective field population** in queries (e.g. only fetch `{ name, city, imageUrl }` for orders list, not the full restaurant doc)

### Reliability
- **Idempotency** on payment operations (webhooks can be retried — handlers must not double-process)
- **Timeouts** on Mongoose connect (8 seconds — fail fast rather than hang)
- **Graceful degradation** for missing config (e.g. `MAIL_DRY_RUN=true` if SMTP not set; "Stripe not configured" banner if no publishable key)

### UX
- **All forms validated** with Zod on both client (instant feedback) and server (defense)
- **Toast notifications** for success/error feedback
- **Loading states** on all buttons that trigger async work
- **Skeleton placeholders** while data loads
- **Responsive design** — mobile-first, works down to 320px width
- **Dark mode** via theme toggle, persisted in localStorage
- **Accessibility** — proper ARIA labels, keyboard navigation, focus management

---

## 📊 Use Case Diagrams (text)

### Customer use cases

```
                    ┌─────────────────────┐
                    │      Customer         │
                    └──────────┬──────────┘
                               │
        ┌──────────┬───────────┼───────────┬──────────┬──────────┐
        │          │           │           │          │          │
        ▼          ▼           ▼           ▼          ▼          ▼
    ┌───────┐ ┌────────┐ ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │Sign up│ │Log in  │ │Browse   │ │Place   │ │View    │ │Review  │
    │       │ │        │ │restaurants│ │order   │ │orders  │ │order   │
    └───┬───┘ └────┬───┘ └────┬────┘ └───┬────┘ └────┬───┘ └────┬───┘
        │          │          │           │          │          │
        ▼          ▼          ▼           ▼          ▼          ▼
    [UC-01]    [UC-03]    [UC-07/08]   [UC-12/13/14] [UC-15] [UC-16]
```

### Restaurant Owner use cases

```
                 ┌─────────────────────────┐
                 │  Restaurant Owner         │
                 │  (inherits all Customer   │
                 │   use cases)              │
                 └──────────┬──────────────┘
                            │
        ┌───────────────────┼────────────────────┐
        │                   │                    │
        ▼                   ▼                    ▼
  ┌──────────┐       ┌──────────┐         ┌──────────┐
  │Manage    │       │Manage    │         │Update    │
  │restaurant│       │menu      │         │order     │
  │profile   │       │items     │         │status    │
  └────┬─────┘       └────┬─────┘         └────┬─────┘
       │                  │                   │
       ▼                  ▼                   ▼
  [UC-18]            [UC-19]              [UC-21]
```

### Admin use cases

```
                          ┌─────────────────┐
                          │     Admin        │
                          │  (inherits ALL   │
                          │   Customer +     │
                          │   Owner cases)    │
                          └────────┬────────┘
                                   │
        ┌──────────┬───────────────┼───────────────┬──────────┐
        │          │               │               │          │
        ▼          ▼               ▼               ▼          ▼
   ┌────────┐ ┌────────┐      ┌────────┐      ┌────────┐ ┌────────┐
   │Manage  │ │Manage  │      │Manage  │      │View    │ │Update  │
   │users   │ │rest.   │      │menu    │      │all     │ │any     │
   │        │ │        │      │        │      │orders  │ │order   │
   └────┬───┘ └────┬───┘      └────┬───┘      └────┬───┘ └────┬───┘
        │          │               │               │          │
        ▼          ▼               ▼               ▼          ▼
   [UC-23]    [UC-24]         [UC-25]         [UC-26]    [UC-27]
```

---

## 📐 Use Case Relationships

- **«include»** — a use case that MUST execute as part of another use case
  - UC-12/13/14 «include» UC-15 (after placing an order, the order appears in the list)
- **«extend»** — a use case that optionally extends another
  - UC-02 «extend» UC-01 (verification is part of signup, but can be re-triggered)
  - UC-13/14 «extend» UC-12 (paid order = cash order + payment)
- **«inherit»** (generalization)
  - Restaurant Owner «inherits» all Customer use cases
  - Admin «inherits» all Customer + Restaurant Owner use cases

---

## 🧪 Test Scenarios (for QA / automated tests)

A few high-value test cases to start with:

| ID | Scenario | Expected |
|---|---|---|
| TC-01 | Sign up with new email → verify → log in → place order with cash → see order in /my-orders | Order has `paymentStatus: "pending"`, `paymentMethod: "cash"` |
| TC-02 | Sign up → log in → add items → place order with Stripe test card `4242 4242 4242 4242` | Order has `paymentStatus: "paid"`, `stripePaymentIntentId` set |
| TC-03 | Sign up → log in → place order with PayPal sandbox account | Order has `paymentStatus: "paid"`, `paypalOrderId` set |
| TC-04 | Sign up with existing email | `409 Conflict` |
| TC-05 | Log in with wrong password | `401 Unauthorized` |
| TC-06 | Try to access `/admin` as a customer | Redirected to `/login` or `/` |
| TC-07 | Place order with 0 items | `400 Bad Request` |
| TC-08 | Place order with another restaurant's items | `400 "Menu item ... is not available"` |
| TC-09 | Review a placed (not delivered) order | `400 "You can only review delivered orders"` |
| TC-10 | Trigger Stripe webhook with bad signature | `400 Bad Request`, no DB change |

---

## 📚 Related Docs

- **[README.md](../README.md)** — project overview, tech stack, quick start
- **[DEPLOY.md](../DEPLOY.md)** — full deployment runbook (Vercel + Atlas + Stripe + PayPal)
- **Source files:**
  - `server/controllers/*.js` — implementation of every use case's server side
  - `client/src/pages/*.tsx` — UI for every customer-facing use case
  - `client/src/admin/*.tsx` — UI for admin/owner use cases

---

**Version:** 1.0
**Last updated:** 2026-07-16
**Maintained by:** the FlavorCourt dev team
