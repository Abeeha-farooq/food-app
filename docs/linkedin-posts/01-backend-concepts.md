# LinkedIn Post — Backend Concepts (Food Delivery App)

> Copy from the `--- BEGIN POST ---` block. Keep the hashtags at the bottom.

---

## --- BEGIN POST ---

When I started building a Zomato-style food delivery app, the tutorials stopped at "place an order." Real production starts there.

For the last few weeks I've been deep in Express + MongoDB + Stripe, deployed serverless on Vercel. CRUD was the easy part. The hard part is what happens when 10,000 hungry people hit your server at lunch and one of your dependencies is having a bad day.

Here's what changed how I think about backend design — and what I tried to bake into this project:

1/ API Versioning
I started with /api/orders. Then I had to add a "delivery instructions" field without breaking the mobile app. Rule: never break the contract you already shipped. I went with URI versioning (/api/v1, /api/v2) because it's explicit, easy to debug, and shows up in logs. Header versioning is "cleaner" but invisible. Pick boring. And always have a sunset policy — old versions die on a date you publish, not "someday."

2/ Timeouts & Retries
Default Node has no timeouts. One slow Mongo query once starved my event loop and froze the whole server at 0% CPU. Every external call — Stripe, Mongo, my own DB — now has an explicit timeout. And retries are dangerous: a naive retry on a POST can double-charge a card. Three rules: (1) only retry idempotent ops, or use an Idempotency-Key (Stripe supports this natively), (2) exponential backoff with jitter so 10,000 clients don't all retry in the same millisecond, (3) a hard max — 3 attempts, then fail loud.

3/ Retries, Backoff & Circuit Breakers
Retries alone aren't enough. If Stripe goes down for 10 minutes, my code shouldn't go down with it. A circuit breaker sits between my service and the dependency — if 50% of calls fail in a 30s window, the breaker opens and we fail fast (clear error, queue, or fallback) instead of piling up requests on a dead service. opossum is the standard Node lib. This single pattern probably prevents more outages than any other.

4/ Rate Limiting
Restaurant menu pages + Stripe payment intents are my most expensive endpoints. I rate-limit per user, per IP, and per route with different buckets. Order-placement is the tightest — one user, N orders per minute. Login is even tighter. Anything weird gets a 429 with a Retry-After header, never a silent failure. Bots die at the door, real users never notice.

5/ WebSockets vs HTTP
For "your rider is 2 mins away" type updates, polling burns battery and money. WebSockets (or SSE) are the right tool — the server pushes when state changes. But I keep HTTP for everything else: placing orders, fetching menus, payments. Don't reach for WebSockets because it sounds cool. Use it where the server has news the client doesn't know to ask for. Everything else is over-engineering.

6/ Graceful Shutdown
On Vercel the platform handles this for me. On a long-running Node server, I'd listen for SIGTERM, stop accepting new requests, drain in-flight ones, close the DB pool, then exit. Never kill a request mid-Stripe-call. Half the "we lost money" war stories I've read come from missing this one. It's 20 lines of code that saves you a 3am page.

7/ API Gateway
I don't run AWS API Gateway — Vercel's edge layer plays that role. It does CORS, request logging, geo-routing, basic auth edge checks, and shields my Express app from random probing traffic. If you're on EC2/ECS/Kubernetes, an API gateway (Kong, NGINX, AWS API GW, Cloudflare) belongs in front of every service. Never expose Express directly to the internet. The gateway is your front door, bouncer, and security camera in one.

The real lesson: these aren't "nice to have." They're the difference between a tutorial project and something that survives Friday 8 PM dinner rush.

What pattern is underrated in your stack right now?

#backend #systemdesign #api #nodejs #webdev #softwareengineering

## --- END POST ---

---

## Notes (not for LinkedIn)

- Character count of the post body (excluding hashtags): ~2,400 chars — well under LinkedIn's 3,000 limit, leaves room for slight edits.
- If you want a shorter version (~1,500 chars), drop the explanation under each header and keep one line per concept.
- Replace "for the last few weeks" with a real time range if you want — feels more grounded.
- "opossum" is the actual lib name for Node circuit breakers. Mentioned once, in passing — readers who care will look it up; readers who don't won't be lost.
- The closing question ("What pattern is underrated in your stack?") is there on purpose — it drives comments, which is the only metric LinkedIn actually rewards.
