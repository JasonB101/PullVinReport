/**
 * City / highway / combined as figures — not a jammed "21 city / 31 hwy" line.
 *
 * Used for VIN-build mileage on the vehicle card (slate) and model-year EPA
 * in the About-this-model zone (amber). Callers pass the numbers they already
 * hold; nothing is invented here.
 */
export type MpgFigureView = {
  key: string;
  label: string;
  display?: string | number;
  value?: string | number;
};

export function MpgFigures({
  headingId,
  heading,
  figures,
  note,
  fuelType,
  tone = "slate",
  emphasize = "combined",
}: {
  headingId?: string;
  heading: string;
  figures: MpgFigureView[];
  note: string;
  fuelType?: string;
  tone?: "slate" | "amber";
  emphasize?: "combined" | "none";
}) {
  if (figures.length === 0) return null;

  const columns = figures.length === 2 ? "grid-cols-2" : "grid-cols-3";
  const chip =
    tone === "amber"
      ? "bg-white text-slate-600 ring-amber-200"
      : "bg-white text-slate-600 ring-slate-200";

  return (
    <div>
      <p
        id={headingId}
        className="text-[11px] font-semibold uppercase tracking-wider text-slate-400"
      >
        {heading}
      </p>
      <ul
        aria-labelledby={headingId}
        className={`mt-2 grid gap-2 ${columns}`}
      >
        {figures.map((row) => {
          const featured = emphasize === "combined" && row.key === "combined";
          const face =
            tone === "amber"
              ? featured
                ? "border-amber-300 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                : "border-amber-200/80 bg-white/80"
              : featured
                ? "border-slate-300 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                : "border-slate-200 bg-slate-50/80";
          return (
            <li
              key={row.key}
              className={`rounded-xl border px-2 py-3 text-center sm:px-3 ${face}`}
            >
              <p
                className={`font-semibold tabular-nums tracking-tight text-slate-900 ${
                  featured ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"
                }`}
              >
                {row.display ?? row.value}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {row.label}
              </p>
              <p className="text-[11px] text-slate-400">mpg</p>
            </li>
          );
        })}
      </ul>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {fuelType ? (
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${chip}`}
          >
            {fuelType}
          </span>
        ) : null}
        <p className="text-xs leading-relaxed text-slate-500">{note}</p>
      </div>
    </div>
  );
}
