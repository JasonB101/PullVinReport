import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/legal-page";
import { BRAND, emailConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${BRAND.name} collects, uses and retains the small amount of personal information needed to sell you a vehicle history report.`,
};

const UPDATED = "September 2026";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={`${BRAND.name} collects as little as possible: the VIN you look up, the email address your report is sent to, and the payment record Stripe returns to us. This page explains what happens to each of those.`}
      updated={UPDATED}
    >
      <LegalSection heading="What we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-slate-900">The VIN you enter.</strong> It is
            sent to our data provider to produce your report and stored with your
            order so you can open the report again later.
          </li>
          <li>
            <strong className="text-slate-900">Your email address.</strong> Used
            to deliver the report link and the receipt, and to reach you about
            that specific order.
          </li>
          <li>
            <strong className="text-slate-900">Payment metadata.</strong> Stripe
            processes your payment. We receive an identifier, the amount, and
            whether it succeeded. We never see or store your full card number.
          </li>
          <li>
            <strong className="text-slate-900">The report contents.</strong> The
            records returned for your VIN are stored with your order so the link
            keeps working and so we can help if you dispute a charge.
          </li>
          <li>
            <strong className="text-slate-900">Basic request data.</strong>{" "}
            Standard server logs, including IP address, used for security and
            rate limiting.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="What we do not do">
        <p>
          We do not sell your personal information. We do not send marketing
          email unless you ask us to. We do not enrol you in a subscription. We
          do not use your VIN or report to build a profile about you.
        </p>
      </LegalSection>

      <LegalSection heading="Who we share it with">
        <p>
          Only the processors needed to deliver your order: vehicle history
          data providers, <strong className="text-slate-900">Stripe</strong>{" "}
          (payments), our transactional email provider, and{" "}
          <strong className="text-slate-900">Google</strong> (a conversion tag
          after a paid checkout, so the purchase can be recorded for advertising
          measurement). Each receives only what its job requires. We may also
          disclose information where we are legally required to.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <p>
          Order records, including the VIN and the report, are kept for as long
          as we need them to support the purchase and satisfy tax, accounting and
          chargeback obligations — generally seven years for the financial
          record. You can ask us to delete the report contents sooner and we
          will, keeping only the minimum transaction record.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies">
        <p>
          The public marketing pages, the sample report, and an abandoned
          checkout do not load advertising or analytics tags. After a paid
          Stripe checkout we load Google&apos;s conversion tag on the order
          confirmation so the purchase can be recorded. A single first-party
          cookie is also set when an administrator signs in to the internal
          console. Stripe sets its own cookies on its hosted checkout page under
          its own policy.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices">
        <p>
          Email{" "}
          <a
            className="font-semibold text-brand-600 hover:underline"
            href={`mailto:${emailConfig.supportEmail}`}
          >
            {emailConfig.supportEmail}
          </a>{" "}
          to request a copy of what we hold about you, correct it, or delete it.
          Depending on where you live you may have additional rights under laws
          such as the GDPR or the CCPA; we honour those requests regardless of
          where you are.
        </p>
      </LegalSection>

      <LegalSection heading="Not a consumer reporting agency">
        <p>
          {BRAND.name} is not a consumer reporting agency as defined by the Fair
          Credit Reporting Act, and our reports are not consumer reports. They
          may not be used to make decisions about a person&apos;s eligibility for
          credit, insurance, employment, housing, or any other purpose covered by
          the FCRA.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          The service is intended for adults purchasing vehicle information. We
          do not knowingly collect personal information from children.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If this policy changes materially we will update the date at the top of
          this page. Continuing to use the service after a change means you
          accept the updated policy.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
