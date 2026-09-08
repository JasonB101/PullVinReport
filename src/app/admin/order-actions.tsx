"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  refundOrderAction,
  resendEmailAction,
  retryFulfillmentAction,
  rewriteBriefAction,
  type RetryState,
} from "@/app/admin/actions";
import type { OrderStatus } from "@/lib/store";

const INITIAL: RetryState = {};

type Props = {
  orderId: string;
  accessToken: string;
  status: OrderStatus;
  /** Formatted amount, used in the refund confirmation prompt. */
  amountLabel: string;
  /** True when the order has a Stripe charge that has not been sent back. */
  refundable: boolean;
  refunded: boolean;
};

export function OrderActions({
  orderId,
  accessToken,
  status,
  amountLabel,
  refundable,
  refunded,
}: Props) {
  const [retryState, retry, retrying] = useActionState(
    retryFulfillmentAction,
    INITIAL,
  );
  const [emailState, resend, resending] = useActionState(
    resendEmailAction,
    INITIAL,
  );
  const [refundState, refund, refunding] = useActionState(
    refundOrderAction,
    INITIAL,
  );
  const [briefState, rewriteBrief, rewriting] = useActionState(
    rewriteBriefAction,
    INITIAL,
  );

  const feedback =
    retryState.error ??
    emailState.error ??
    refundState.error ??
    briefState.error ??
    retryState.message ??
    emailState.message ??
    refundState.message ??
    briefState.message;
  const isError = Boolean(
    retryState.error ?? emailState.error ?? refundState.error ?? briefState.error,
  );

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

        {status === "fulfilled" && (
          <form action={rewriteBrief}>
            <input type="hidden" name="orderId" value={orderId} />
            <button
              type="submit"
              disabled={rewriting}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {rewriting ? "Writing…" : "Rewrite brief"}
            </button>
          </form>
        )}

        {refunded && (
          <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-500">
            Refunded
          </span>
        )}

        {refundable && (
          <form action={refund}>
            <input type="hidden" name="orderId" value={orderId} />
            <button
              type="submit"
              disabled={refunding}
              // A refund cannot be undone, so make it a deliberate click.
              onClick={(event) => {
                if (
                  !window.confirm(
                    `Refund ${amountLabel} to this customer? This cannot be undone.`,
                  )
                ) {
                  event.preventDefault();
                }
              }}
              className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
            >
              {refunding ? "Refunding…" : "Refund"}
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
