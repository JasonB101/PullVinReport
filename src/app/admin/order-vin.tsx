import Link from "next/link";

import { orderReportHref } from "@/lib/admin-ops";
import type { OrderStatus } from "@/lib/store";

type Props = {
  vin: string;
  status: OrderStatus;
  accessToken: string;
};

const VIN_CLASS = "font-mono text-xs";

/**
 * VIN on an /admin money-activity row.
 *
 * Fulfilled orders reuse the same report URL and new-tab target as
 * OrderActions "View report". Paid / failed rows stay plain text so
 * there is no dead link before a report exists.
 */
export function OrderVin({ vin, status, accessToken }: Props) {
  if (status !== "fulfilled") {
    return <span className={`${VIN_CLASS} text-slate-900`}>{vin}</span>;
  }

  return (
    <Link
      href={orderReportHref(accessToken)}
      target="_blank"
      className={`${VIN_CLASS} text-brand-600 hover:underline`}
    >
      {vin}
    </Link>
  );
}
