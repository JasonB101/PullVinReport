import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal-page";
import { BRAND, emailConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Disclaimer",
  description:
    "What a vehicle history report can and cannot tell you, in plain language.",
};

const UPDATED = "January 2026";

export default function DisclaimerPage() {
  return (
    <LegalPage
      title="Disclaimer"
      intro="A vehicle history report is a useful tool and a poor substitute for a mechanic. Here is exactly what ours can and cannot tell you."
      updated={UPDATED}
    >
      <LegalSection heading="Informational purposes only">
        <p>
          Reports sold by {BRAND.name} are provided for informational purposes
          only. They are not an inspection, an appraisal, a warranty, a
          certification, a title guarantee, or legal or financial advice. Do not
          treat a report as the final word on a vehicle.
        </p>
      </LegalSection>

      <LegalSection heading="A clean report is not proof of a clean vehicle">
        <p>
          A report can only show what someone reported. Accidents settled
          privately, damage repaired without an insurance claim, and events in
          jurisdictions that report late or not at all will simply not appear.
          The absence of a record is not evidence that nothing happened.
        </p>
      </LegalSection>

      <LegalSection heading="Records can be wrong">
        <p>
          Data reaches us through a chain of states, insurers, auctions,
          recyclers and dealers. Any link can mistype a VIN, file the wrong
          odometer reading, or submit a record late. We pass on what our provider
          returns and cannot independently verify it. If you believe a specific
          record is inaccurate, the correction has to be made by the organisation
          that reported it.
        </p>
      </LegalSection>

      <LegalSection heading="Coverage varies">
        <p>
          Coverage is strongest for vehicles titled in the United States from
          roughly 1981 onwards. Very new vehicles, imports, and vehicles that
          have spent time outside the reporting system may return few records or
          none at all. If your VIN returns nothing usable, contact us at{" "}
          <a
            className="font-semibold text-brand-600 hover:underline"
            href={`mailto:${emailConfig.supportEmail}`}
          >
            {emailConfig.supportEmail}
          </a>{" "}
          for a refund.
        </p>
      </LegalSection>

      <LegalSection heading="Always inspect the vehicle">
        <p>
          Pair every report with an in-person inspection by a qualified mechanic,
          a test drive, and a careful look at the paperwork. A report tells you
          where to look harder; it does not tell you whether the timing chain is
          about to fail.
        </p>
      </LegalSection>

      <LegalSection heading="Sample reports are fictional">
        <p>
          The{" "}
          <Link href="/sample" className="font-semibold text-brand-600 hover:underline">
            sample report
          </Link>{" "}
          published on this site contains invented data for a vehicle that does
          not exist. It is labelled SAMPLE throughout and exists only to show the
          format. It is never served in place of a report you paid for.
        </p>
      </LegalSection>

      <LegalSection heading="Not a consumer report">
        <p>
          {BRAND.name} is not a consumer reporting agency and its reports are not
          consumer reports under the Fair Credit Reporting Act. They may not be
          used to establish eligibility for credit, insurance, employment,
          housing, or any similar purpose.
        </p>
      </LegalSection>

      <LegalSection heading="No affiliation">
        <p>
          {BRAND.name} is independent and is not affiliated with, endorsed by, or
          sponsored by any vehicle manufacturer, any government agency, or any
          other vehicle history reporting company. Any third-party names are the
          trademarks of their respective owners and are used only to describe
          what our service does.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
