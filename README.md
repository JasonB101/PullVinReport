# PullVinReport

Consumer vehicle history reports for **pullvinreport.com**, powered by the
[VinAudit](https://www.vinaudit.com/) Vehicle History API.

One product, one price: a customer enters a VIN, previews a clearly labelled
sample, pays once through Stripe Checkout, and gets the full report on screen
and by email.

> This repository is **only** the VIN history product. It is not a radio-code
> service and it is not a plate-to-VIN lookup.

---

## Contents

- [Quick start](#quick-start)
- [Environment](#environment)
- [How the paid path works](#how-the-paid-path-works)
- [The sample report rule](#the-sample-report-rule)
- [The written brief](#the-written-brief)
- [What customers see when something breaks](#what-customers-see-when-something-breaks)
- [Refunds](#refunds)
- [Routes](#routes)
- [Data storage](#data-storage)
- [Stripe webhook setup](#stripe-webhook-setup)
- [Admin console](#admin-console)
- [Scripts](#scripts)
- [Reading `/status` honestly](#reading-status-honestly)
- [Known limitations](#known-limitations)
- [Continuous integration](#continuous-integration)
- [Deploying](#deploying)

---

## Quick start

```bash
npm install
cp .env.example .env.local     # optional — the demo runs without any keys
npm run dev
```

Open <http://localhost:3000>.

With no credentials set you can still browse the landing page, validate a VIN,
read the full sample report. Checkout is disabled until VinAudit **and** Stripe
are configured — by design. `/status` is an admin page (same login as `/admin`)
and is not linked from the public site.

## Environment

Every variable is documented in [`.env.example`](./.env.example). The short
version:

| Variable | Required | Purpose |
| --- | --- | --- |
| `VINAUDIT_API_KEY`, `VINAUDIT_USER`, `VINAUDIT_PASS` | Yes, for paid reports | Vehicle history data. All three must be present or the paid path is closed. |
| `STRIPE_SECRET_KEY` | Yes, for checkout | Creates Checkout Sessions. |
| `STRIPE_WEBHOOK_SECRET` | Strongly recommended | Verifies fulfillment webhooks. |
| `REPORT_PRICE_CENTS` | No (default `1499`) | Price per report in the smallest currency unit. |
| `REPORT_CURRENCY` | No (default `usd`) | Stripe currency code. |
| `AUTO_REFUND_FAILED_ORDERS` | No (default `false`) | Refund a charge automatically when its report pull fails, instead of waiting for an operator. |
| `RESEND_API_KEY` | No | Receipt, refund and report-link email. |
| `EMAIL_FROM` | No (default `PullVinReport <orders@pullvinreport.com>`) | Outbound sender. **Quote it** — see below. Stays on the PullVinReport domain; this product never sends as another brand. |
| `SUPPORT_EMAIL` | No (default `support@pullvinreport.com`) | Reply-to and the address shown to customers. Outbound only; nothing reads this inbox. |
| `ANTHROPIC_API_KEY` | No | Turns on the written brief at the top of a paid report. Unset means no brief and no other change. |
| `ANTHROPIC_ADMIN_API_KEY` | No | Admin API key (`sk-ant-admin…`) for /admin USD spend MTD. Unset omits Anthropic from the credits card; a failed Cost Report is shown as unavailable, never as $0. |
| `ANTHROPIC_MODEL` | No (default `claude-sonnet-5`) | Any current Messages API model id. |
| `ANTHROPIC_TIMEOUT_MS` | No (default `45000`) | How long a page view waits for a brief. Fulfillment uses a shorter budget of its own. |
| `FAL_KEY` | No | Turns on a cartoon vehicle hero on the paid report card. Unset means no hero and no other change. |
| `FAL_ADMIN_KEY` | No | Admin-scope fal key for the /admin credit balance. An API-scope `FAL_KEY` is shown as unavailable (needs Admin-scope key) instead of 0. |
| `FAL_IMAGE_MODEL` | No (default `fal-ai/recraft/v3/text-to-image`) | fal.ai model id. Recraft V3's digital-illustration style is the default so the picture cannot read as a photo of this VIN. Recraft V4 on fal has no style lock. |
| `FAL_IMAGE_STYLE` | No (default `digital_illustration`) | Recraft style preset. Do not set `realistic_image`. |
| `FAL_REMBG_MODEL` | No (default `fal-ai/imageutils/rembg`) | Cuts the Recraft raster to a transparent PNG. Recraft itself does not return alpha. |
| `FAL_TIMEOUT_MS` | No (default `45000`) | How long a page view waits for an illustration. |
| `DATABASE_URL` | No | Use Postgres instead of the JSON file store. |
| `ADMIN_PASSWORD` | No | Unlocks `/admin`. Unset means the console is locked out. |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Base URL for Stripe redirects, emailed links and the sitemap. |

`EMAIL_FROM` uses the `Name <address>` display-name form, so it must be quoted
in `.env.local`, in `.env.example` and in your host's environment UI. Unquoted
angle brackets are redirection syntax to a shell and several `.env` parsers
strip or truncate them:

```bash
EMAIL_FROM="PullVinReport <orders@pullvinreport.com>"
SUPPORT_EMAIL=support@pullvinreport.com
```

If a parser hands the value back with its quotes still attached, or mangles it
into something without an `@`, `emailConfig` falls back to the brand default
rather than passing it to Resend.

## How the paid path works

```
/                 VIN entered and validated client-side
  ↓
/preview?vin=…    VIN confirmed · labelled SAMPLE preview · email captured
  ↓
POST /api/checkout
  · re-validates the VIN and email
  · refuses with 503 if VinAudit or Stripe is unconfigured
  · creates a `pending` order, then a Stripe Checkout Session
  ↓
Stripe Checkout (hosted)
  ↓
POST /api/stripe/webhook   ← primary fulfillment path
  · verifies the signature
  · marks the order `paid`
  · pulls the report from VinAudit and marks it `fulfilled`
  · writes the brief, if a key is set and it arrives inside the budget
  · emails the private link with the report attached as a PDF
  ↓
/order/success?session_id=…   ← fallback fulfillment path
  · runs the same idempotent fulfillment if the webhook was late or absent
  · redirects to /report/<accessToken>
```

Fulfillment is idempotent, so the webhook and the return page can both run
without double-pulling or double-charging. If VinAudit fails, the order is
marked `failed` with the provider error recorded, the customer is told plainly
what happened, and the order shows up in `/admin` with **Retry pull** and
**Refund** buttons.

A buyer who abandons Stripe Checkout comes back to
`/preview?vin=…&canceled=1`, which shows a "payment canceled — you have not
been charged" banner and offers to restart checkout with the same VIN.

## The sample report rule

The single hardest rule in this codebase: **sample data is never served as a
paid report.**

How it is enforced:

- `VehicleReport` carries `source: "vinaudit" | "sample"` and `isSample`. Both
  travel with the data into storage and into every renderer.
- `buildSampleReport()` is the only producer of `source: "sample"` and it is
  imported exclusively by marketing pages (`/`, `/preview`, `/sample`).
- `fulfillOrder()` imports only `pullVinAuditReport()`. If credentials are
  missing it marks the order `failed` and throws — there is no fallback branch.
- `pullVinAuditReport()` throws `ProviderNotConfiguredError` rather than
  returning anything when any of the three VinAudit variables is unset.
- `/api/checkout` returns `503` before creating a Stripe session when the
  provider is unconfigured, so the money is never taken in the first place.
- Every sample surface renders a SAMPLE chip, an amber hatched border and an
  explanatory banner, keyed off `isSample`.

## The written brief

With `ANTHROPIC_API_KEY` set, a paid report opens with a short brief in three
parts:

- **From this report** — written only from the records on that order.
- **Common for this model — not confirmed on this VIN** — general knowledge for
  the year, make and model. The disclaimer is in the heading rather than in
  small print, because a forwarded PDF is read by people who never saw the page.
  Omitted entirely when the vehicle is unknown.
- **Questions to ask the seller** — each one following from a bullet above.

What keeps it honest:

- What is sent is the report's own summary — vehicle, checks, odometer
  readings, record rows with values clipped and rows capped. Not the VIN, the
  buyer, the order, or the stored provider payload. Tests assert each absence.
- The prompt forbids stating events the records do not contain, implying that a
  model-level problem was found on this VIN, and inventing prices or grades.
  `parseBrief()` then re-checks the output and drops bullets that break those
  rules, so a drifting model cannot put a claim in front of a buyer.
- It is written **once per order** and cached on the order row (`ai_brief`).
  A page view always reuses the cached brief; rewriting one is an explicit
  **Rewrite brief** action in `/admin`. That is why the default model is Sonnet
  rather than something cheaper — the cost is paid once and read every time.
- Fulfillment writes the brief before the receipt goes out, so the attached PDF
  says what the page says. It waits at most 12 seconds, comfortably inside
  Stripe's webhook window; a brief that misses that window is written on the
  first page view instead.
- Everything soft-fails. No key, a timeout, a refusal or unparsable output all
  end the same way: no brief, and a report that reads exactly as it did before
  the brief existed. The records are never made to wait on it.
- The sample's brief is written by hand, so browsing `/sample` spends nothing.

## Illustrated vehicle hero

With `FAL_KEY` set, a paid report draws a **product-cutout** of the year, make
and model (plus a richer listing trim and exterior colour when the records
have them) and places it **to the right of the vehicle details**. It is never
a photograph of that VIN. On a narrow screen the cutout stacks under the
details.

- Colour comes from listing fields including **`Vehicle color` / `Vehicle
  colour`**, not only `Exterior color`. Interior colour is ignored.
- Generated **inside the product** on `POST /api/vehicle-hero` after the
  records are already on screen — the same lazy pattern as the brief.
  Fulfillment does not wait on it.
- Recraft V3 does not return alpha. After the drawing, `fal-ai/imageutils/rembg`
  cuts the background to a transparent PNG. If that pass fails, no hero is
  stored (we will not keep an opaque studio plate).
- Cached once per `cutout-v1|year|make|model|trim|color|body|engine` on the
  store (`pullvinreport_vehicle_heroes` in Postgres, `.data/vehicle-heroes.json`
  on the file store). Another order for the same example reuses the drawing.
  Keys that do not start with `cutout-v1|` are dropped on the next report view
  so a previous white studio shot cannot come back.
- The sample report uses a static transparent SVG at `/sample-vehicle-hero.svg`
  and never calls fal.
- Soft-fail: no key, a timeout or a rejection leaves the report unchanged
  aside from no hero.

### ZOO `:3004` — clear the white cache, then hard-refresh

After Baloo pulls this branch:

1. Drop the old drawings so the next view cannot serve the white studio car.
   - Postgres: `DELETE FROM pullvinreport_vehicle_heroes;`
   - File store: delete `.data/vehicle-heroes.json`
   The app also ignores (and prunes) any key that does not start with
   `cutout-v1|`, so a missed delete still will not show the old white image.
2. Hard-refresh the paid report (Cmd/Ctrl-Shift-R).
3. With `FAL_KEY` set you should see a Magnetite Gray (or the listing's
   `Vehicle color`) cutout to the right of the details, with no on-image
   label. Without the key, no hero.

## What customers see when something breaks

The second rule: **buyers never read our internals.** No environment variable
names, no provider names, no raw exception text, no stack of "missing
`VINAUDIT_…`" strings on a page someone just paid on.

- Every sentence a buyer reads about a failure comes from
  `src/lib/customer-copy.ts`. `classifyFailure()` buckets a raw error into one
  of a few kinds and anything unrecognised falls through to a generic message,
  so a new error string cannot leak by default.
- The raw cause is still recorded: it is written to `providerError` on the
  order, shown in `/admin`, and logged to the server console.
- Full diagnostics — which credential is missing, what the provider returned,
  whether storage is reachable — live on `/status`, `/api/status` and `/admin`.
- `/api/checkout` returns the same soft copy in its `503` body and logs the
  missing credential names server-side instead of returning them.

When you add a customer-facing error path, route the copy through
`customer-copy.ts` rather than rendering the error you caught.
`tests/customer-copy.test.ts` asserts that known raw errors never produce a
message containing credentials or provider names.

## Refunds

We promise a refund before checkout for any VIN we cannot deliver, so the
refund is part of the app rather than a trip to the Stripe dashboard.

- **From `/admin`.** Any order with a Stripe payment on record gets a
  **Refund** button, which confirms first because the action is irreversible.
  It calls `refundOrder()` (`src/lib/refund.ts`), records `refundedAt` and
  `stripeRefundId` on the order, and emails the customer if Resend is
  configured.
- **Automatically.** Set `AUTO_REFUND_FAILED_ORDERS=true` and a failed pull
  refunds itself immediately. It is off by default because the documented flow
  is retry-then-refund, and a refunded charge cannot be retried without asking
  the customer to pay again.
- **From the Stripe dashboard.** The `charge.refunded` webhook records refunds
  issued outside the app, so `/admin` and the customer's report page stay in
  step with Stripe.

Refunds are idempotent: an order that already carries `refundedAt` is left
alone, and the Stripe call is keyed on the order id. Refunded orders are
excluded from **Collected** in `/admin` and counted under **Refunded**, and the
customer's report page switches from "we will refund you" to "we've refunded
you" on its own.

## Routes

| Route | What it is |
| --- | --- |
| `/` | Landing page: what a report includes, how it works, pricing, FAQ. |
| `/preview?vin=…` | VIN confirmation, labelled sample preview, checkout panel. |
| `/sample` | Full sample report, marked SAMPLE throughout. |
| `/api/sample/pdf` | Server-generated SAMPLE-labelled PDF of the demo report. |
| `/report/[token]` | A purchased report, gated by an unguessable access token. |
| `/api/report/[token]/pdf` | Server-generated PDF of that paid report. Same token as the page. |
| `/lookup` | Re-open a report using the order reference plus the buyer's email. |
| `/order/success` | Post-Stripe landing; finalises fulfillment and redirects. |
| `/status` | Admin-only provider readiness (same session as `/admin`). Each check labelled *Checked live* or *Config only*. |
| `/api/status` | JSON readiness; returns HTTP 503 when orders are closed. Anonymous callers see only `ordersEnabled`; signed-in admins get the full probe. |
| `/api/brief` | Writes or returns the cached buyer brief for one order. |
| `/api/vehicle-hero` | Draws or returns the cached cartoon hero for one order. |
| `/api/checkout` | Creates the order and the Stripe Checkout Session. |
| `/api/stripe/webhook` | Signature-verified fulfillment webhook. |
| `/admin`, `/admin/login` | Password-protected order console. |
| `/privacy`, `/terms`, `/disclaimer` | Legal pages. |

## Data storage

`getStore()` picks a backend at runtime:

- **`DATABASE_URL` set** → PostgreSQL. The `pullvinreport_orders` table, its
  index and `pullvinreport_vehicle_heroes` are created on first use; no
  migration step is needed.
- **`DATABASE_URL` unset** → a JSON file under `DATA_DIR` (default `.data/`).
  Writes are serialised and atomic. This is for local development and demos —
  serverless filesystems are ephemeral, so set `DATABASE_URL` in production.

Both implement the same `OrderStore` interface in `src/lib/store/types.ts`.

## Stripe webhook setup

Locally, with the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`.

In production, add an endpoint at `https://pullvinreport.com/api/stripe/webhook`
subscribed to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`

## Admin console

Set `ADMIN_PASSWORD` and sign in at `/admin/login`. The session cookie is an
HMAC derived from the password, so rotating the password signs everyone out.

The console shows order counts, collected revenue, refunded totals, a compact
API credits card (Stripe, fal, Resend, and Anthropic when an admin key is
set), and the full order list with the provider error for anything that
failed. Failed or stuck orders can be retried, a delivered report's email
can be re-sent, and any charged order can be refunded in place — see
[Refunds](#refunds). Credit numbers are admin-only and never linked from
the customer footer. A configured vendor whose official API fails is shown
as unavailable (never faked as zero). “No credit APIs configured” appears
only when Stripe, fal, Resend, and Anthropic admin keys are all absent.

This is the only surface that shows raw provider errors, so it is also the
place to look when a customer reports the soft "we couldn't retrieve this
report" message.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run build` | Production build. |
| `npm start` | Serve the production build. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Node test runner over `tests/*.test.ts`. |

## Reading `/status` honestly

`/status` is signed-in admin only. `/api/status` and `/status` mix two very
different kinds of check, and every check carries a `verification` field saying
which kind it is:

- `probed` — we contacted the dependency while building the report. VinAudit
  (credential probe) and order storage (`ping()`) are probed.
- `config-only` — we found credentials and stopped there. Stripe, the webhook
  secret, the admin password and **email** are config-only.

**Email is presence-only and can read green while sending is broken.** A
`RESEND_API_KEY` being set says nothing about whether the key is valid, still
active, or whether the sending domain is verified in Resend — and on a
multi-site Resend account it says nothing about which domain the key is scoped
to. The status page reports "configured, not verified" for exactly this reason.
There is deliberately no live send probe: it would cost a real email on every
status check and every uptime poll.

Prove sending the only way that proves anything — send one. Fulfil a test order
end to end, or use the **Re-send email** button in `/admin` on a delivered
order, and confirm it arrives from `orders@pullvinreport.com`. A failed send is
reported honestly on the order (`emailSentAt` stays unset and the admin action
returns the Resend error); it never blocks fulfillment, because the report is
always delivered on screen regardless.

The same caveat applies in smaller doses to Stripe: a well-formed secret key
that Stripe would reject still shows as ready until the first Checkout Session.

## Known limitations

- **Rate limiting is per process, not per deployment.** `src/lib/rate-limit.ts`
  keeps its buckets in memory, so on a serverless or multi-instance host the
  real limit is the configured limit times the number of live instances, and a
  cold start resets it. It also trusts `x-forwarded-for`, which only holds
  behind a proxy that overwrites the header. It is enough to blunt casual abuse
  and double-submits, but before taking public traffic put a shared limiter in
  front of `/api/checkout` and `/admin/login` — edge/WAF rules on the host, or
  a limiter backed by the Postgres instance the app already uses.
- **The file store is not durable.** Without `DATABASE_URL`, orders live in a
  JSON file that a serverless filesystem will throw away. Production needs
  Postgres.

## Continuous integration

`.github/workflows/ci.yml` runs `lint`, `typecheck`, `test` and `build` on
every pull request and on pushes to `main`, on Node 22 with the npm cache
enabled. The build step runs with no credentials on purpose: it proves the app
still compiles and prerenders with the paid path closed, which is the state a
fresh clone starts in.

## Deploying

The app is a standard Next.js App Router project and deploys unchanged to
Vercel or any Node host.

1. Set the environment variables from `.env.example`, including
   `NEXT_PUBLIC_SITE_URL`.
2. Point `DATABASE_URL` at a Postgres instance.
3. Register the Stripe webhook endpoint and set `STRIPE_WEBHOOK_SECRET`.
4. Verify the sending domain in Resend so receipts do not land in spam.
5. Load `/status` and confirm every required check is green before taking real
   payments.

---

PullVinReport is an independent service. It is not affiliated with, endorsed by,
or sponsored by any vehicle manufacturer, government agency, or other vehicle
history reporting company. Reports are informational only and are not a
substitute for an independent inspection.
