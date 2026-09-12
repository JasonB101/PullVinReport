import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/admin/actions";
import { AbandonedCheckouts } from "@/app/admin/abandoned-checkouts";
import { ApiCredits } from "@/app/admin/api-credits";
import { OrderActions } from "@/app/admin/order-actions";
import { Logo } from "@/components/logo";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  MONEY_ACTIVITY_STATUSES,
  UNPAID_CHECKOUT_STATUSES,
  abandonedCheckoutStats,
  firstSalesGoal,
} from "@/lib/admin-ops";
import { formatPrice, isVinAuditConfigured } from "@/lib/config";
import { formatGeneratedAt } from "@/lib/report";
import { getStore } from "@/lib/store";
import type { OrderStatus } from "@/lib/store";
import { emptyVendorCredits, fetchVendorCredits } from "@/lib/vendor-credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Orders · Admin",
  robots: { index: false, follow: false },
};

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: "bg-slate-100 text-slate-600 ring-slate-200",
  paid: "bg-blue-50 text-blue-700 ring-blue-200",
  fulfilled: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
  expired: "bg-slate-100 text-slate-500 ring-slate-200",
};

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");

  const store = getStore();
  await store.init();
  const [orders, abandoned, stats, credits] = await Promise.all([
    store.list(200, { statuses: MONEY_ACTIVITY_STATUSES }),
    store.list(200, { statuses: UNPAID_CHECKOUT_STATUSES }),
    store.stats(),
    fetchVendorCredits().catch(() => emptyVendorCredits()),
  ]);

  const goal = firstSalesGoal(stats.revenueCents);
  const abandonedStats = abandonedCheckoutStats(stats);
  const cards = [
    { label: "Orders", value: String(stats.total) },
    { label: "Awaiting delivery", value: String(stats.pending) },
    { label: "Delivered", value: String(stats.fulfilled) },
    { label: "Needs attention", value: String(stats.failed) },
    { label: "Collected", value: formatPrice(stats.revenueCents) },
    { label: "Refunded", value: formatPrice(stats.refundedCents) },
  ];

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo href={null} />
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/status"
              className="hidden text-sm font-medium text-slate-600 hover:text-slate-900 sm:inline"
            >
              Status
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="container-page py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Orders
            </h1>
            <p className="mt-1 text-sm text-slate-500">Times in Denver</p>
          </div>
          {!isVinAuditConfigured() && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
              VinAudit is not configured — new orders are blocked and retries
              will fail.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              First $1,000
            </p>
            <p className="text-sm font-medium text-slate-800">{goal.label}</p>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label="Collected toward first $1,000"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={goal.percent}
          >
            <div
              className={`h-full rounded-full ${
                goal.reached ? "bg-emerald-500" : "bg-brand-600"
              }`}
              style={{ width: `${goal.percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {goal.reached
              ? "Milestone hit. Collected is kept money — refunds are counted separately."
              : `${formatPrice(goal.remainingCents)} to go. Collected is kept money — refunds are counted separately.`}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {card.label}
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                {card.value}
              </p>
            </div>
          ))}
        </div>

        <ApiCredits report={credits} />

        {orders.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-700">No paid orders yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Paid, fulfilled, refunded, and failed-after-pay orders appear
              here. Unpaid checkouts are listed under Abandoned checkouts.
            </p>
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="hidden grid-cols-[12rem_11rem_1fr_7rem_6rem_13rem] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 lg:grid">
              <span>Created (Denver)</span>
              <span>VIN</span>
              <span>Customer</span>
              <span>Status</span>
              <span>Amount</span>
              <span>Actions</span>
            </div>

            <ul className="divide-y divide-slate-100">
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="grid gap-3 px-5 py-4 lg:grid-cols-[12rem_11rem_1fr_7rem_6rem_13rem] lg:items-start lg:gap-4"
                >
                  <span className="text-xs text-slate-500">
                    {formatGeneratedAt(order.createdAt)}
                  </span>

                  {order.status === "fulfilled" && order.report ? (
                    <Link
                      href={`/report/${order.accessToken}`}
                      target="_blank"
                      className="font-mono text-xs text-brand-600 hover:underline"
                    >
                      {order.vin}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs text-slate-900">
                      {order.vin}
                    </span>
                  )}

                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-800">
                      {order.email}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-slate-400">
                      {order.id}
                    </span>
                    {order.providerError && (
                      <span className="mt-1 block text-[11px] leading-snug text-red-600">
                        {order.providerError}
                      </span>
                    )}
                    {/* The buyer's report no longer links out to VinAudit, so
                        this is where support reaches the supplier's copy. */}
                    {order.report?.providerReportUrl && (
                      <a
                        href={order.report.providerReportUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1 block text-[11px] text-brand-600 hover:underline"
                      >
                        VinAudit copy ↗
                      </a>
                    )}
                  </span>

                  <span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ${STATUS_STYLES[order.status]}`}
                    >
                      {order.status}
                    </span>
                    {order.emailSentAt && (
                      <span className="mt-1 block text-[11px] text-slate-400">
                        emailed
                      </span>
                    )}
                    {order.refundedAt && (
                      <span className="mt-1 block text-[11px] text-slate-400">
                        refunded {formatGeneratedAt(order.refundedAt)}
                      </span>
                    )}
                  </span>

                  <span className="text-sm text-slate-800">
                    {formatPrice(order.amountCents, order.currency)}
                  </span>

                  <OrderActions
                    orderId={order.id}
                    accessToken={order.accessToken}
                    status={order.status}
                    amountLabel={formatPrice(order.amountCents, order.currency)}
                    refundable={Boolean(
                      order.stripePaymentIntentId && !order.refundedAt,
                    )}
                    refunded={Boolean(order.refundedAt)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <AbandonedCheckouts orders={abandoned} stats={abandonedStats} />
      </main>
    </div>
  );
}
