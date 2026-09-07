import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/admin/actions";
import { OrderActions } from "@/app/admin/order-actions";
import { Logo } from "@/components/logo";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { formatPrice, isVinAuditConfigured } from "@/lib/config";
import { getStore } from "@/lib/store";
import type { OrderStatus } from "@/lib/store";

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

function timestamp(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16);
}

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");

  const store = getStore();
  await store.init();
  const [orders, stats] = await Promise.all([store.list(200), store.stats()]);

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
            <p className="mt-1 text-sm text-slate-500">
              Storage: {store.description}
            </p>
          </div>
          {!isVinAuditConfigured() && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
              VinAudit is not configured — new orders are blocked and retries
              will fail.
            </p>
          )}
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

        {orders.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-700">No orders yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Orders appear here as soon as a customer starts checkout.
            </p>
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="hidden grid-cols-[9rem_11rem_1fr_7rem_6rem_13rem] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 lg:grid">
              <span>Created (UTC)</span>
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
                  className="grid gap-3 px-5 py-4 lg:grid-cols-[9rem_11rem_1fr_7rem_6rem_13rem] lg:items-start lg:gap-4"
                >
                  <span className="font-mono text-xs text-slate-500">
                    {timestamp(order.createdAt)}
                  </span>

                  <span className="font-mono text-xs text-slate-900">
                    {order.vin}
                  </span>

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
                        refunded {timestamp(order.refundedAt).slice(0, 10)}
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
      </main>
    </div>
  );
}
