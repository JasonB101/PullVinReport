import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal-page";
import { BRAND, emailConfig, formatPrice } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms of service",
  description: `The agreement between you and ${BRAND.name} when you buy a vehicle history report.`,
};

const UPDATED = "January 2026";

export default function TermsPage() {
  const price = formatPrice();

  return (
    <LegalPage
      title="Terms of service"
      intro={`These terms apply when you use ${BRAND.name} or buy a vehicle history report from us. They are written to be read, not to hide things.`}
      updated={UPDATED}
    >
      <LegalSection heading="1. What we sell">
        <p>
          We sell a single product: one vehicle history report for one VIN,
          compiled from third-party records. The data processors we rely on to
          produce it are named in our{" "}
          <Link href="/privacy" className="font-semibold text-brand-600 hover:underline">
            privacy policy
          </Link>
          . The current price is <strong className="text-slate-900">{price}</strong>{" "}
          per report. It is a one-time charge. There is no subscription, no
          recurring billing, and nothing to cancel.
        </p>
      </LegalSection>

      <LegalSection heading="2. What the report is">
        <p>
          A report is a compilation of records that third parties — states,
          insurers, salvage yards, auctions, dealers and manufacturers — have
          reported about a VIN. It is provided for informational purposes only.
          It is not an inspection, an appraisal, a warranty, a guarantee, or
          professional advice. See our{" "}
          <Link href="/disclaimer" className="font-semibold text-brand-600 hover:underline">
            disclaimer
          </Link>{" "}
          for the specifics.
        </p>
      </LegalSection>

      <LegalSection heading="3. Delivery">
        <p>
          After your payment is confirmed we request the report from our provider
          and display it in your browser, and we email a private link to the
          address you gave us. Anyone with that link can view the report, so keep
          it to yourself.
        </p>
        <p>
          If our provider cannot return a report for your VIN, we will tell you
          plainly. We will never present sample or placeholder data as if it were
          your report.
        </p>
      </LegalSection>

      <LegalSection heading="4. Refunds">
        <p>
          Because a report is delivered immediately and cannot be returned, sales
          are final once a report has been delivered. We will refund you in full
          when:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>we charged you but could not deliver a report at all;</li>
          <li>
            the provider returned a report with no meaningful records for your
            VIN;
          </li>
          <li>you were charged more than once for the same VIN in error.</li>
        </ul>
        <p>
          Email{" "}
          <a
            className="font-semibold text-brand-600 hover:underline"
            href={`mailto:${emailConfig.supportEmail}`}
          >
            {emailConfig.supportEmail}
          </a>{" "}
          with your order reference and we will sort it out.
        </p>
      </LegalSection>

      <LegalSection heading="5. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            resell, republish, or systematically extract reports or report data;
          </li>
          <li>
            use the service to harass, stalk, or identify an individual, or to
            obtain information about a person rather than a vehicle;
          </li>
          <li>
            use reports for any purpose covered by the Fair Credit Reporting Act,
            including credit, insurance, employment, or tenancy decisions;
          </li>
          <li>
            scrape, automate, or otherwise access the service other than through
            its normal interface.
          </li>
        </ul>
        <p>
          We may refuse or cancel an order, and refund it, if we believe it
          breaches these rules.
        </p>
      </LegalSection>

      <LegalSection heading="6. Accuracy">
        <p>
          We pass on what our provider returns. We do not create the underlying
          records and we cannot verify them. Records may be incomplete,
          out-of-date, or wrong because a reporting party never filed them or
          filed them incorrectly. You accept that risk when you rely on a report.
        </p>
      </LegalSection>

      <LegalSection heading="7. Limitation of liability">
        <p>
          To the maximum extent permitted by law, {BRAND.name} is not liable for
          any indirect, incidental, special, consequential or punitive damages,
          or for any lost profits or lost value, arising from your use of the
          service or a report. Our total liability for any claim relating to a
          report is limited to the amount you paid for that report.
        </p>
        <p>
          Some jurisdictions do not allow these limitations, in which case they
          apply to the fullest extent permitted.
        </p>
      </LegalSection>

      <LegalSection heading="8. Independence">
        <p>
          {BRAND.name} is an independent service. We are not affiliated with,
          endorsed by, or sponsored by any vehicle manufacturer, any government
          agency, or any other vehicle history reporting company. Third-party
          names, where mentioned, are the trademarks of their owners and are used
          only descriptively.
        </p>
      </LegalSection>

      <LegalSection heading="9. Changes to the service and these terms">
        <p>
          We may change the service, its price, or these terms. The price shown
          at checkout is the price you pay for that order. Updated terms take
          effect when posted here.
        </p>
      </LegalSection>

      <LegalSection heading="10. Contact">
        <p>
          Questions about these terms? Email{" "}
          <a
            className="font-semibold text-brand-600 hover:underline"
            href={`mailto:${emailConfig.supportEmail}`}
          >
            {emailConfig.supportEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
