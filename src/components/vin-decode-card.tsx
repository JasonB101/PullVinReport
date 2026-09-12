import { VehicleHero } from "@/components/vehicle-hero";
import { VIN_DECODE_UNAVAILABLE } from "@/lib/customer-copy";
import { cachedHeroForFacts } from "@/lib/order-hero";
import { decodeVin } from "@/lib/nhtsa";
import {
  HERO_ILLUSTRATION_LABEL,
  heroAlt,
  heroFactsFromParts,
} from "@/lib/vehicle-hero";
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
 * paid report is built from — nothing chargeable at the records vendor is
 * pulled before checkout. The illustrated hero uses the same fal cache as a
 * paid report (year/make/model family). Colour from listings still arrives
 * only after purchase; a pre-pay drawing without paint is reused then.
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
  const facts = heroFactsFromParts({
    year: decode.vehicle.year ?? (fallbackYear ? String(fallbackYear) : ""),
    make: decode.vehicle.make,
    model: decode.vehicle.model,
    trim: decode.vehicle.trim,
    bodyStyle: decode.vehicle.bodyStyle,
    engine: decode.vehicle.engine,
  });
  const cached = facts ? await cachedHeroForFacts(facts) : null;
  const illustrationAlt = facts ? heroAlt(facts) : `Illustrated ${decode.label}`;

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

        {facts ? (
          <VehicleHero
            src={cached?.src}
            vin={vin}
            alt={illustrationAlt}
            caption={HERO_ILLUSTRATION_LABEL}
          />
        ) : null}
      </div>
    </IdentityFrame>
  );
}
