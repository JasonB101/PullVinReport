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

        <VehicleIdentitySlot />
      </div>
    </IdentityFrame>
  );
}

/**
 * Pre-pay hero slot. A branded identity plate — never a cartoon car, never the
 * sample Camry, never a fal draw. Year, make and model are already the headline;
 * this keeps the card balanced without pretending we have a picture of the car.
 */
function VehicleIdentitySlot() {
  return (
    <figure
      className="mx-auto w-full max-w-[13.5rem] shrink-0 sm:max-w-xs md:mx-0 md:w-[min(42%,18rem)]"
      aria-hidden="true"
    >
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
        <div
          className="absolute inset-0 bg-[radial-gradient(18rem_12rem_at_100%_0%,rgba(37,99,235,0.10),transparent_58%),radial-gradient(14rem_10rem_at_0%_120%,rgba(14,165,233,0.07),transparent_52%)]"
          aria-hidden="true"
        />
        <div className="relative flex aspect-[16/10] flex-col items-center justify-center px-5 py-6 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-[0_8px_20px_-8px_rgba(37,99,235,0.85)]">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="4" width="14" height="16" rx="2" />
              <path d="M8 9h8M8 13h8M8 17h5" />
            </svg>
          </span>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Factory identity
          </p>
          <p className="mt-1 text-xs leading-snug text-slate-400">
            Decoded from this VIN
          </p>
        </div>
      </div>
    </figure>
  );
}
