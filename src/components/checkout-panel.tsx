"use client";

import { useState, type FormEvent } from "react";

type Props = {
  vin: string;
  priceLabel: string;
  /** False when payment or data-provider credentials are missing on the server. */
  available: boolean;
  unavailableReason?: string;
  /** True when Stripe Checkout sent the buyer back without taking payment. */
  canceled?: boolean;
};

export function CheckoutPanel({
  vin,
  priceLabel,
  available,
  unavailableReason,
  canceled = false,
}: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, email }),
      });
      const payload = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !payload.url) {
        setError(payload.error ?? "We couldn't start checkout. Please try again.");
        setPending(false);
        return;
      }
      window.location.assign(payload.url);
    } catch {
      setError("Network error — check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Full history report
          </h2>
          <div className="text-right">
            <span className="text-2xl font-semibold tracking-tight text-slate-900">
              {priceLabel}
            </span>
            <span className="block text-xs text-slate-500">one-time</span>
          </div>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          One VIN, one payment. No subscription, no auto-renewal.
        </p>
      </div>

      <div className="px-5 py-5 sm:px-6">
        {available ? (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {canceled && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">
                  Checkout canceled.
                </span>{" "}
                Nothing was charged. Pick up where you left off below.
              </p>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-widest text-slate-500"
              >
                Where should we send it?
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-xl bg-brand-600 px-6 py-4 text-base font-semibold text-white shadow-[0_16px_40px_-18px_rgba(37,99,235,1)] transition hover:bg-brand-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending
                ? "Redirecting to Stripe…"
                : `${canceled ? "Restart checkout" : "Get the report"} · ${priceLabel}`}
            </button>

            <p className="text-center text-xs text-slate-500">
              Secure payment handled by Stripe. We never see your card details.
            </p>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-sm font-semibold text-amber-900">
                Ordering is switched off right now
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-amber-900/80">
                {unavailableReason ??
                  "We've paused new orders while we restore a service this report depends on. Nothing has been charged."}{" "}
                We will not take a payment we can&apos;t fulfil, and we never
                substitute sample data for a paid report.
              </p>
            </div>
          </div>
        )}
      </div>

      <ul className="space-y-2.5 border-t border-slate-100 bg-slate-50/70 px-5 py-5 text-sm text-slate-600 sm:px-6">
        {[
          "Title, salvage, junk and insurance-loss records",
          "Odometer readings and rollback checks",
          "Accident, theft, lien and impound records",
          "Prior sales listings and open safety recalls",
          "Emailed to you and viewable instantly online",
        ].map((item) => (
          <li key={item} className="flex gap-2.5">
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.79 6.8-6.8a1 1 0 0 1 1.4 0Z"
                clipRule="evenodd"
              />
            </svg>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
