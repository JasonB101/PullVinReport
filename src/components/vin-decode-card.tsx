import { VIN_DECODE_UNAVAILABLE } from "@/lib/customer-copy";
import { decodeVin } from "@/lib/nhtsa";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 max-w-2xl rounded-xl border border-slate-200 bg-white px-4 py-3.5">
      {children}
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
      {children}
    </p>
  );
}

/** Holds the card's space while the decode is in flight. */
export function VinDecodeSkeleton() {
  return (
    <Frame>
      <Kicker>Checking this VIN</Kicker>
      <div className="mt-2 h-5 w-52 animate-pulse rounded bg-slate-200" />
      <div className="mt-2 h-3 w-72 animate-pulse rounded bg-slate-100" />
    </Frame>
  );
}

/**
 * The free, pre-payment sanity check: does this VIN describe the car the buyer
 * thinks it does?
 *
 * The decode comes from the public vPIC database rather than the records the
 * paid report is built from — nothing chargeable is pulled before checkout.
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
      <Frame>
        <Kicker>Vehicle</Kicker>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          {VIN_DECODE_UNAVAILABLE}
          {fallbackYear
            ? ` The VIN's own year code puts it at a ${fallbackYear} model.`
            : ""}
        </p>
      </Frame>
    );
  }

  const { decode } = result;

  return (
    <Frame>
      <Kicker>This VIN decodes to</Kicker>
      <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
        {decode.label}
      </p>

      {decode.details.length > 0 && (
        <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
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

      <p className="mt-3 border-t border-slate-100 pt-2.5 text-xs leading-relaxed text-slate-500">
        Decoded free of charge from the VIN itself, using the US Department of
        Transportation&apos;s public vPIC database. It describes how the vehicle
        left the factory — your paid report adds the title, brand, odometer,
        accident and lien history that has accumulated since.
      </p>
    </Frame>
  );
}
