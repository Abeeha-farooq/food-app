# LinkedIn Post — Backend Concepts Part 2 (Caching, Rate Limiting, Async) — GENERALIZED

> Generic e-commerce / SaaS tone. No food-specific examples. Copy from the `--- BEGIN POST ---` block.

---

## --- BEGIN POST ---

I returned a 201 in 80ms once. Then watched my server spend the next 6 seconds sending an email. The user was happy. My server was crying. That's when I learned the difference between "the request succeeded" and "the work is done."

Continuing the backend patterns series (Express + Mongo + Stripe on Vercel) — three more patterns I'm now thinking about seriously.

1/ Caching (Redis, CDN, Cache Invalidation)
Product catalog pages are the same data for thousands of users. That screams "cache me" — and caching the wrong thing has taught me more than getting it right. The hard part was never the cache. It was invalidation.

When a seller changes a product price, every cached catalog across N instances has the old price. User sees one number, gets another, complains. Two non-negotiables: short TTLs (60s for catalog data) PLUS event-driven invalidation (product update → publish event → Redis DEL key on every instance).

The silent killer is the cache stampede. When the key expires, 10K requests all hit the DB at once. Solution: single-flight — one request hits the DB, the rest wait or serve slightly-stale. On the client side, Vercel's CDN handles product images, brand assets, and the static frontend. Not optional, table stakes for a media-heavy app.

I haven't wired Redis into my project yet. The plan: Upstash Redis for catalog + session, Vercel CDN for assets, and stampede protection from day one.

2/ Rate Limiting Strategies (Part 2 — the algorithms)
I covered the "why" last time. The "how" is the fun part. Four algorithms, and they behave very differently:

• Fixed window: count resets every minute. Simple — but bursty. 100 requests at 12:00:59 + 100 at 12:01:01 = 200 in 2 seconds. Your DB felt that.
• Sliding window: smoother, slightly more memory. What I'd pick for most cases.
• Token bucket: allows controlled bursts. "User can do 5 actions in a burst, then 1 every 10s" is a token-bucket shape, not a fixed-window shape.
• Leaky bucket: smooths output. Best for protecting downstream services from spikes.

Once you have N server instances, in-memory counters are a lie. Use Redis (INCR + EXPIRE) so the limit is global. And layer it: cheap edge limits block 95% of junk, then tight app-level limits protect sensitive routes like /payments/create-intent. Different limits per role — admin 10K/min, user 60/min, anonymous IP 10/min.

The lesson: "rate limiting" isn't one thing, it's a stack.

3/ Async vs Sync Processing
The single biggest tutorial mistake: doing every part of a request synchronously.

User hits checkout. Critical path: validate → charge → save order. Return 201. That's it. Confirmation email? Job. Fulfillment notification? Job. Invoice PDF? Job. Analytics? Job.

In a long-running Node server, a queue (BullMQ + Redis, AWS SQS, or Cloudflare Queues) is the standard. The handler publishes a job, the worker picks it up, retries on failure, dead-letters if broken. Idempotency is critical — same job ID processed twice should not send two emails.

On Vercel/serverless, this gets interesting. The handler can't run a long worker — publish to a queue and return. The worker lives elsewhere (cron, edge function with extended time, or an external service). Never, ever, `await sendEmail()` inside a Stripe webhook handler on a clock.

The line I'd draw: anything the user can wait 50ms for is sync. Anything the user doesn't need to see the result of is async. That single rule eliminated 80% of the latency from my endpoints.

Closing
Place the order. Hit checkout. Click subscribe. Do any write — that's the trigger. Making it happen is the system. Caching, layered rate limiting, and async-by-default are what turn the trigger into the system.

What's the one thing in your stack you wish was async but isn't (or vice versa)?

#backend #systemdesign #caching #nodejs #webdev #softwareengineering

## --- END POST ---

---

## Notes (not for LinkedIn)

- Tone: fully generalized e-commerce / SaaS examples. No food-specific terms (no "kitchen karahi", "restaurant menu", "hungry user", specific PKR prices, etc.).
- Stack mention is still specific (Express + Mongo + Stripe + Vercel) because that anchors credibility — you built this, not generic advice.
- ~2,750 chars in the body. Close to LinkedIn's 3,000 cap.
- If you want me to apply the same generalization to Part 1 (the original post), just say the word and I'll redo it.
