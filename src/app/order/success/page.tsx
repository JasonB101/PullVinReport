import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { emailConfig, isStripeConfigured } from "@/lib/config";
import { fulfillOrder } from "@/lib/fulfillment";
import { getStore } from "@/lib/store";
import type { Order } from "@/lib/store";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Finishing your order",
  robots: { index: false, follow: false },
};

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <SiteHeader />
      <main className="container-page flex-1 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-7 shadow-card">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          <div className="mt-3 space-y-4 text-sm leading-relaxed text-slate-600">
            {children}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function SupportNote({ order }: { order?: Order | null }) {
  return (
    <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
      {order && (
        <>
          Order reference{" "}
          <span className="font-mono text-slate-700">{order.id}</span>.{" "}
        </>
      )}
      Email{" "}
      <a
        className="font-semibold text-brand-600 hover:underline"
        href={`mailto:${emailConfig.supportEmail}`}
      >
        {emailConfig.supportEmail}
      </a>{" "}
      and we will sort it out or refund you.
    </p>
  );
}

export default async function OrderSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    return (
      <Shell title="We couldn't find that checkout session">
        <p>
          The link is missing its session reference. If you completed a payment,
          check your email for the report link.
        </p>
        <SupportNote />
      </Shell>
    );
  }

  if (!isStripeConfigured()) {
    return (
      <Shell title="Payments are not connected">
        <p>
          This deployment has no Stripe credentials, so no order could have been
          created here.
        </p>
        <SupportNote />
      </Shell>
    );
  }

  const store = getStore();
  await store.init();

  let order: Order | null = null;
  let failure: string | null = null;

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    order =
      (session.metadata?.orderId
        ? await store.getById(session.metadata.orderId)
        : null) ?? (await store.getByStripeSessionId(session.id));

    if (!order) {
      failure = "We couldn't match that payment to an order.";
    } else if (session.payment_status !== "paid") {
      failure = "pending-payment";
    } else {
      if (order.status === "pending") {
        order = await store.update(order.id, {
          status: "paid",
          stripePaymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
          email: session.customer_details?.email ?? order.email,
        });
      }
      if (order.status !== "fulfilled") {
        // The webhook usually gets here first; this is the belt-and-braces path
        // for when it is delayed or not configured in a local environment.
        const result = await fulfillOrder(order.id);
        order = result.order;
      }
    }
  } catch (error) {
    failure = (error as Error).message;
  }

  if (order && order.status === "fulfilled" && !failure) {
    redirect(`/report/${order.accessToken}?new=1`);
  }

  if (failure === "pending-payment") {
    return (
      <Shell title="Your payment is still processing">
        <p>
          Some payment methods take a little longer to clear. As soon as Stripe
          confirms it we pull your report and email you the link — you do not
          need to do anything.
        </p>
        <SupportNote order={order} />
      </Shell>
    );
  }

  return (
    <Shell title="Your payment went through, but the report didn't">
      <p>
        We charged you and then could not retrieve the vehicle history record.
        We will not show you sample data in its place.
      </p>
      {failure && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-mono text-xs text-red-700">
          {failure}
        </p>
      )}
      <p>
        Our team can see this order and will retry it. If a retry doesn&apos;t
        work we will refund you in full.
      </p>
      <SupportNote order={order} />
      <p>
        <Link href="/" className="font-semibold text-brand-600 hover:underline">
          Back to home
        </Link>
      </p>
    </Shell>
  );
}
