"use client";

import { usePathname } from "next/navigation";
import { useEffect, type MouseEvent, type ReactNode } from "react";

/** The homepage hero — the only place a priced CTA is allowed to land. */
export const START_HREF = "/#vin";

export function scrollToVinLookup(): void {
  const section = document.getElementById("vin");
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("vin-input")?.focus({ preventScroll: true });
}

/**
 * A link that actually starts a report.
 *
 * Next.js client navigation to `/#vin` often lands at the top of the home
 * page and never scrolls, which is why the header's $14.99 button looked
 * dead. A plain hash link does a full load from other pages (the browser
 * honours the fragment); on the home page we scroll and focus ourselves.
 */
export function StartReportLink({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/") return;
    event.preventDefault();
    scrollToVinLookup();
    history.replaceState(null, "", "#vin");
  }

  return (
    <a href={START_HREF} className={className} onClick={onClick}>
      {children}
    </a>
  );
}

/** Honours `/#vin` after a client navigation that would otherwise ignore it. */
export function VinHashTarget() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;

    const go = () => {
      if (window.location.hash === "#vin") scrollToVinLookup();
    };

    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [pathname]);

  return null;
}
