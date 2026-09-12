import { ABANDONED_CHECKOUT_LABEL } from "@/lib/admin-ops";
import type { AbandonedCheckoutStats } from "@/lib/admin-ops";
import { formatPrice } from "@/lib/config";
import { formatGeneratedAt } from "@/lib/report";
import type { Order } from "@/lib/store";

type Props = {
  orders: Order[];
  stats: AbandonedCheckoutStats;
};

export function AbandonedCheckouts({ orders, stats }: Props) {
  const cards = [
    { label: "Abandoned today", value: String(stats.today) },
    { label: "Abandoned MTD", value: String(stats.month) },
    { label: "Unpaid (all)", value: String(stats.total) },
    { label: "Checkout conversion", value: stats.conversionLabel },
  ];

  return (
    <section className="mt-10">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Abandoned checkouts
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Unpaid Stripe sessions — never collected. Stripe expires a session
          after one hour; until then it stays Pending. Neither is an order.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">
            No abandoned checkouts
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Unpaid checkout sessions will appear here, not in the orders list.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="hidden grid-cols-[12rem_11rem_1fr_6rem_13rem] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 lg:grid">
            <span>Created (Denver)</span>
            <span>VIN</span>
            <span>Customer</span>
            <span>Amount</span>
            <span>Status</span>
          </div>

          <ul className="divide-y divide-slate-100">
            {orders.map((order) => (
              <li
                key={order.id}
                className="grid gap-3 px-5 py-4 lg:grid-cols-[12rem_11rem_1fr_6rem_13rem] lg:items-start lg:gap-4"
              >
                <span className="text-xs text-slate-500">
                  {formatGeneratedAt(order.createdAt)}
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
                </span>

                <span className="text-sm text-slate-800">
                  {formatPrice(order.amountCents, order.currency)}
                </span>

                <span>
                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                    {ABANDONED_CHECKOUT_LABEL}
                  </span>
                  {order.status === "expired" && (
                    <span className="mt-1 block text-[11px] text-slate-400">
                      Stripe session expired
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
