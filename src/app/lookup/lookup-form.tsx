"use client";

import { useActionState } from "react";

import { lookupAction, type LookupState } from "@/app/lookup/actions";

const INITIAL: LookupState = {};

export function LookupForm() {
  const [state, formAction, pending] = useActionState(lookupAction, INITIAL);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label
          htmlFor="orderId"
          className="block text-xs font-semibold uppercase tracking-widest text-slate-500"
        >
          Order reference
        </label>
        <input
          id="orderId"
          name="orderId"
          required
          placeholder="00000000-0000-0000-0000-000000000000"
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
        />
        <p className="mt-1.5 text-xs text-slate-500">
          It&apos;s in your receipt email, and on the page you saw right after
          paying.
        </p>
      </div>

      <div>
        <label
          htmlFor="email"
          className="block text-xs font-semibold uppercase tracking-widest text-slate-500"
        >
          Email used at checkout
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-70"
      >
        {pending ? "Looking…" : "Open my report"}
      </button>
    </form>
  );
}
