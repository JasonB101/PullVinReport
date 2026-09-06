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
- [Routes](#routes)
- [Data storage](#data-storage)
- [Stripe webhook setup](#stripe-webhook-setup)
- [Admin console](#admin-console)
- [Scripts](#scripts)
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
read the full sample report, and see `/status` report exactly which services
are missing. Checkout is disabled until VinAudit **and** Stripe are configured —
by design.

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
| `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` | No | Receipt and report-link email. |
| `DATABASE_URL` | No | Use Postgres instead of the JSON file store. |
| `ADMIN_PASSWORD` | No | Unlocks `/admin`. Unset means the console is locked out. |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Base URL for Stripe redirects, emailed links and the sitemap. |

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
  · pulls the report from VinAudit
  · marks it `fulfilled` and emails the private link
  ↓
/order/success?session_id=…   ← fallback fulfillment path
  · runs the same idempotent fulfillment if the webhook was late or absent
  · redirects to /report/<accessToken>
```

Fulfillment is idempotent, so the webhook and the return page can both run
without double-pulling or double-charging. If VinAudit fails, the order is
marked `failed` with the provider error recorded, the customer is told plainly
what happened, and the order shows up in `/admin` with a **Retry pull** button.

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

## Routes

| Route | What it is |
| --- | --- |
| `/` | Landing page: what a report includes, how it works, pricing, FAQ. |
| `/preview?vin=…` | VIN confirmation, labelled sample preview, checkout panel. |
| `/sample` | Full sample report, marked SAMPLE throughout. |
| `/report/[token]` | A purchased report, gated by an unguessable access token. |
| `/lookup` | Re-open a report using the order reference plus the buyer's email. |
| `/order/success` | Post-Stripe landing; finalises fulfillment and redirects. |
| `/status` | Human-readable provider readiness. |
| `/api/status` | JSON readiness; returns HTTP 503 when orders are closed. |
| `/api/checkout` | Creates the order and the Stripe Checkout Session. |
| `/api/stripe/webhook` | Signature-verified fulfillment webhook. |
| `/admin`, `/admin/login` | Password-protected order console. |
| `/privacy`, `/terms`, `/disclaimer` | Legal pages. |

## Data storage

`getStore()` picks a backend at runtime:

- **`DATABASE_URL` set** → PostgreSQL. The `pullvinreport_orders` table and its
  index are created on first use; no migration step is needed.
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

## Admin console

Set `ADMIN_PASSWORD` and sign in at `/admin/login`. The session cookie is an
HMAC derived from the password, so rotating the password signs everyone out.

The console shows order counts, collected revenue, and the full order list with
the provider error for anything that failed. Failed or stuck orders can be
retried, and a delivered report's email can be re-sent.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run build` | Production build. |
| `npm start` | Serve the production build. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Node test runner over `tests/*.test.ts`. |

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
