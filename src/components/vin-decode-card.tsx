import { VIN_DECODE_UNAVAILABLE } from "@/lib/customer-copy";
import { decodeVin } from "@/lib/nhtsa";
import { prettyVin } from "@/lib/vin";

function IdentityFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="bg-[radial-gradient(36rem_22rem_at_100%_0%,rgba(37,99,235,0.07),transparent_58%),radial-gradient(28rem_18rem_at_0%_110%,rgba(14,165,233,0.05),transparent_52%)] bg-slate-50 px-5 py-6 sm:px-7 sm:py-7">
        {children}
      </div>
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
      {children}
    </p>
  );
}

/** Holds the card's space while the decode is in flight. */
export function VinDecodeSkeleton() {
  return (
    <IdentityFrame>
      <Kicker>Identifying this vehicle</Kicker>
      <div className="mt-3 h-8 w-64 animate-pulse rounded bg-slate-200 sm:w-80" />
      <div className="mt-3 h-4 w-52 animate-pulse rounded bg-slate-100" />
    </IdentityFrame>
  );
}

/**
 * The free, pre-payment sanity check: does this VIN describe the car the buyer
 * thinks it does?
 *
 * The decode comes from the public vPIC database rather than the records the
 * paid report is built from — nothing chargeable is pulled before checkout.
 * Colour and the illustrated hero arrive only on the paid report, where the
 * listings actually name the paint.
 */
export async function VinDecodeCard({
  vin,
  fallbackYear,
}: {
  vin: string;
  /** Model year read straight out of the VIN, shown if the decode comes back empty. */
  fallbackYear?: number;
}) {
  const result = await decodeVin(vin);

  if (result.status !== "decoded") {
    return (
      <IdentityFrame>
        <Kicker>Step 1 of 2 · Your vehicle</Kicker>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {fallbackYear ? `${fallbackYear} vehicle` : "VIN confirmed"}
        </h1>
        <p className="mt-2 font-mono text-sm tracking-wider text-slate-500">
          {prettyVin(vin)}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {VIN_DECODE_UNAVAILABLE}
          {fallbackYear
            ? ` The VIN's own year code puts it at a ${fallbackYear} model.`
            : ""}
        </p>
      </IdentityFrame>
    );
  }

  const { decode } = result;

  return (
    <IdentityFrame>
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
        <div className="min-w-0 flex-1">
          <Kicker>Step 1 of 2 · Your vehicle</Kicker>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {decode.label}
          </h1>
          <p className="mt-2 font-mono text-sm tracking-wider text-slate-500">
            {prettyVin(vin)}
          </p>

          {decode.details.length > 0 && (
            <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
              {decode.details.map((detail) => (
                <div key={detail.label} className="flex items-baseline gap-1.5">
                  <dt className="text-xs text-slate-400">{detail.label}</dt>
                  <dd className="text-xs font-medium text-slate-700">
                    {detail.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Decoded free of charge from the VIN itself, using the US Department of
            Transportation&apos;s public vPIC database. It describes how the vehicle
            left the factory — your paid report adds the title, brand, odometer,
            accident and lien history that has accumulated since.
          </p>
        </div>

        <VehicleMark />
      </div>
    </IdentityFrame>
  );
}

/** Decorative silhouette so the identified car has a face — not a photo of this VIN. */
function VehicleMark() {
  return (
    <figure
      className="mx-auto w-full max-w-[13.5rem] shrink-0 sm:max-w-xs md:mx-0 md:w-[min(42%,18rem)]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 320 190" className="h-auto w-full text-slate-400">
        <defs>
          <linearGradient id="vin-mark-wash" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#dbeafe" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#f8fafc" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#e0f2fe" stopOpacity="0.4" />
          </linearGradient>
        </defs>
        <rect width="320" height="190" fill="url(#vin-mark-wash)" rx="16" />
        <g
          fill="none"
          stroke="#64748b"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="96" cy="142" r="24" strokeWidth="1.3" />
          <circle cx="228" cy="142" r="24" strokeWidth="1.3" />
          <circle cx="96" cy="142" r="9" strokeWidth="1" opacity="0.45" />
          <circle cx="228" cy="142" r="9" strokeWidth="1" opacity="0.45" />
          <path
            strokeWidth="1.7"
            d="M42 140c6-28 22-44 48-52l28-28c8-8 16-12 36-12h52c22 0 36 8 50 24l22 16c10 4 18 12 22 28 2 8 6 18 8 24"
          />
          <path
            strokeWidth="1.35"
            d="M54 128h28c6-18 16-30 34-38m48-2c22 4 40 16 54 34h36"
          />
        </g>
      </svg>
    </figure>
  );
}
