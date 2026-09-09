"use client";

import { useRef, type ReactNode } from "react";

/**
 * A disclosure that scrolls itself into view after it opens.
 *
 * The report header and jump nav are sticky, so an expand that happens near
 * the top of the viewport can leave its new content under those bars or below
 * the fold. Native `<details>` still works with no JavaScript; this only adds
 * the scroll once the open layout has been painted.
 */
export function ScrollOpenDetails({
  className,
  summaryClassName,
  summary,
  children,
}: {
  className?: string;
  summaryClassName?: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  return (
    <details
      ref={ref}
      className={className}
      onToggle={(event) => {
        if (!event.currentTarget.open) return;
        const node = ref.current;
        if (!node) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            node.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        });
      }}
    >
      <summary className="disclosure-summary">
        <div className={summaryClassName}>{summary}</div>
      </summary>
      {children}
    </details>
  );
}
