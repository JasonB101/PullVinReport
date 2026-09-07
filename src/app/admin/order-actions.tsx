"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  resendEmailAction,
  retryFulfillmentAction,
  type RetryState,
} from "@/app/admin/actions";
import type { OrderStatus } from "@/lib/store";

const INITIAL: RetryState = {};

type Props = {
  orderId: string;
  accessToken: string;
  status: OrderStatus;
};

export function OrderActions({ orderId, accessToken, status }: Props) {
  const [retryState, retry, retrying] = useActionState(
    retryFulfillmentAction,
    INITIAL,
  );
  const [emailState, resend, resending] = useActionState(
    resendEmailAction,
    INITIAL,
  );

  const feedback = retryState.error ?? emailState.error ?? retryState.message ?? emailState.message;
  const isError = Boolean(retryState.error ?? emailState.error);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "fulfilled" && (
          <Link
            href={`/report/${accessToken}`}
            target="_blank"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View report
          </Link>
        )}

        {(status === "paid" || status === "failed") && (
          <form action={retry}>
            <input type="hidden" name="orderId" value={orderId} />
            <button
              type="submit"
              disabled={retrying}
              className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:opacity-60"
            >
              {retrying ? "Retrying…" : "Retry pull"}
            </button>
          </form>
        )}

        {status === "fulfilled" && (
          <form action={resend}>
            <input type="hidden" name="orderId" value={orderId} />
            <button
              type="submit"
              disabled={resending}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {resending ? "Sending…" : "Re-send email"}
            </button>
          </form>
        )}
      </div>

      {feedback && (
        <p
          className={`text-xs ${isError ? "text-red-600" : "text-emerald-700"}`}
          role="status"
        >
          {feedback}
        </p>
      )}
    </div>
  );
}
