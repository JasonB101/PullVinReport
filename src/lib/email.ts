import { Resend } from "resend";

import { BRAND, absoluteUrl, emailConfig, formatPrice, isEmailConfigured } from "@/lib/config";
import { REPORT_DISCLAIMER_SHORT } from "@/lib/customer-copy";
import { extrasForReport, type ModelExtras } from "@/lib/model-extras";
import { vehicleTitle } from "@/lib/report";
import { withCurrentLayout } from "@/lib/report-layout";
import { renderReportPdf, reportPdfFilename } from "@/lib/report-pdf";
import { getStore, type Order } from "@/lib/store";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function receiptHtml(order: Order, reportUrl: string, hasPdf: boolean): string {
  const vehicle = order.report ? vehicleTitle(order.report.vehicle) : "Your vehicle";
  const amount = formatPrice(order.amountCents, order.currency);
  const intro = hasPdf
    ? "Thanks for your order. The full history report for your VIN has been pulled. A PDF copy is attached to this email — forward it to a seller, a mechanic or your insurer — and the live version is always at the link below."
    : "Thanks for your order. The full history report for your VIN has been pulled and is ready to view.";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr>
        <td style="background:#0b1220;padding:24px;">
          <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.02em;">${BRAND.name}</div>
          <div style="color:#94a3b8;font-size:13px;margin-top:4px;">Your vehicle history report is ready</div>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 24px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${intro}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;margin:0 0 24px;">
            <tr><td style="padding:12px 16px;font-size:13px;color:#64748b;">Vehicle</td><td style="padding:12px 16px;font-size:13px;text-align:right;font-weight:600;">${escapeHtml(vehicle)}</td></tr>
            <tr><td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">VIN</td><td style="padding:12px 16px;font-size:13px;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;border-top:1px solid #e2e8f0;">${escapeHtml(order.vin)}</td></tr>
            <tr><td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Order</td><td style="padding:12px 16px;font-size:13px;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;border-top:1px solid #e2e8f0;">${escapeHtml(order.id)}</td></tr>
            <tr><td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Amount paid</td><td style="padding:12px 16px;font-size:13px;text-align:right;font-weight:600;border-top:1px solid #e2e8f0;">${escapeHtml(amount)}</td></tr>
          </table>
          <a href="${reportUrl}" style="display:block;background:#2563eb;color:#ffffff;text-decoration:none;text-align:center;padding:14px 20px;border-radius:10px;font-weight:600;font-size:15px;">View your report</a>
          <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#64748b;">Keep this link private — anyone with it can view the report. Questions? Reply to this email or write to ${escapeHtml(emailConfig.supportEmail)}.</p>
          <p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">${escapeHtml(REPORT_DISCLAIMER_SHORT)}</p>
        </td>
      </tr>
    </table>
    <p style="max-width:560px;margin:16px auto 0;font-size:11px;color:#94a3b8;text-align:center;">${BRAND.name} · ${BRAND.domain}</p>
  </body>
</html>`;
}

function receiptText(order: Order, reportUrl: string, hasPdf: boolean): string {
  return [
    `${BRAND.name} — your vehicle history report is ready`,
    "",
    `VIN: ${order.vin}`,
    `Order: ${order.id}`,
    `Amount paid: ${formatPrice(order.amountCents, order.currency)}`,
    "",
    ...(hasPdf ? ["A PDF copy of the report is attached to this email."] : []),
    `View it online: ${reportUrl}`,
    "",
    "Keep this link private — anyone with it can view the report.",
    `Support: ${emailConfig.supportEmail}`,
    "",
    REPORT_DISCLAIMER_SHORT,
  ].join("\n");
}

function refundHtml(order: Order, amount: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr>
        <td style="background:#0b1220;padding:24px;">
          <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.02em;">${BRAND.name}</div>
          <div style="color:#94a3b8;font-size:13px;margin-top:4px;">Your ${escapeHtml(amount)} refund is on its way</div>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 24px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">We couldn't deliver the history report you paid for, so we've refunded you in full. Refunds usually appear on your original payment method within 5–10 business days, depending on your bank.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;margin:0 0 24px;">
            <tr><td style="padding:12px 16px;font-size:13px;color:#64748b;">VIN</td><td style="padding:12px 16px;font-size:13px;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(order.vin)}</td></tr>
            <tr><td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Order</td><td style="padding:12px 16px;font-size:13px;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;border-top:1px solid #e2e8f0;">${escapeHtml(order.id)}</td></tr>
            <tr><td style="padding:12px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Refunded</td><td style="padding:12px 16px;font-size:13px;text-align:right;font-weight:600;border-top:1px solid #e2e8f0;">${escapeHtml(amount)}</td></tr>
          </table>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">Nothing else is needed from you. If the refund hasn't landed after 10 business days, reply to this email or write to ${escapeHtml(emailConfig.supportEmail)} with your order reference.</p>
        </td>
      </tr>
    </table>
    <p style="max-width:560px;margin:16px auto 0;font-size:11px;color:#94a3b8;text-align:center;">${BRAND.name} · ${BRAND.domain}</p>
  </body>
</html>`;
}

function refundText(order: Order, amount: string): string {
  return [
    `${BRAND.name} — your ${amount} refund is on its way`,
    "",
    `VIN: ${order.vin}`,
    `Order: ${order.id}`,
    `Refunded: ${amount}`,
    "",
    "We couldn't deliver the history report you paid for, so we've refunded you in full.",
    "Refunds usually appear on your original payment method within 5-10 business days.",
    "",
    `Support: ${emailConfig.supportEmail}`,
  ].join("\n");
}

export type EmailResult = { sent: boolean; detail: string };

type ReportAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

async function loadModelExtras(order: Order): Promise<ModelExtras | null> {
  if (!order.report) return null;
  try {
    return await extrasForReport(order.report, getStore());
  } catch (error) {
    console.error(`[email] model extras failed for order ${order.id}`, error);
    return null;
  }
}

/**
 * Renders the forwardable PDF copy of the report.
 *
 * Best-effort on purpose: the buyer has already paid and the receipt carries a
 * working link either way, so a PDF that fails to render is logged for the
 * operator and dropped rather than costing the customer their receipt. The PDF
 * contains no link or token — a forwarded copy must not hand over access.
 * Model extras ride along when we have them so the attachment matches the page.
 */
async function reportAttachment(
  order: Order,
  modelExtras: ModelExtras | null,
): Promise<{ attachment?: ReportAttachment; detail: string }> {
  if (!order.report) return { detail: "no report to attach" };
  try {
    const content = await renderReportPdf(
      withCurrentLayout(order.report),
      order.aiBrief,
      modelExtras,
    );
    return {
      attachment: {
        filename: reportPdfFilename(order.vin),
        content,
        contentType: "application/pdf",
      },
      detail: `PDF attached (${Math.round(content.byteLength / 1024)} KB)`,
    };
  } catch (error) {
    console.error(`[email] PDF render failed for order ${order.id}`, error);
    return { detail: `PDF skipped: ${(error as Error).message}` };
  }
}

/**
 * Sends the receipt + report link. Email is best-effort: a delivery failure
 * must never block or reverse a successful fulfillment, so this returns a
 * result instead of throwing.
 */
export async function sendReportEmail(
  order: Order,
  modelExtras?: ModelExtras | null,
): Promise<EmailResult> {
  const reportUrl = absoluteUrl(`/report/${order.accessToken}`);

  if (!isEmailConfigured()) {
    return { sent: false, detail: "RESEND_API_KEY not set — receipt email skipped" };
  }
  if (!order.email) {
    return { sent: false, detail: "No customer email on the order" };
  }

  const extras =
    modelExtras !== undefined ? modelExtras : await loadModelExtras(order);
  const pdf = await reportAttachment(order, extras);

  try {
    const resend = new Resend(emailConfig.apiKey);
    const { data, error } = await resend.emails.send({
      from: emailConfig.from,
      to: order.email,
      replyTo: emailConfig.supportEmail,
      subject: `Your ${BRAND.name} report for VIN ${order.vin}`,
      html: receiptHtml(order, reportUrl, Boolean(pdf.attachment)),
      text: receiptText(order, reportUrl, Boolean(pdf.attachment)),
      attachments: pdf.attachment ? [pdf.attachment] : undefined,
    });
    if (error) {
      return { sent: false, detail: `Resend error: ${error.message}` };
    }
    return { sent: true, detail: `Sent (${data?.id ?? "no id"}) · ${pdf.detail}` };
  } catch (error) {
    return { sent: false, detail: `Resend threw: ${(error as Error).message}` };
  }
}

/**
 * Tells the customer their money is on the way back. Best-effort for the same
 * reason as the receipt: the refund has already happened at Stripe, and a mail
 * failure must not look like a refund failure.
 */
export async function sendRefundEmail(order: Order): Promise<EmailResult> {
  const amount = formatPrice(order.amountCents, order.currency);

  if (!isEmailConfigured()) {
    return { sent: false, detail: "RESEND_API_KEY not set — refund email skipped" };
  }
  if (!order.email) {
    return { sent: false, detail: "No customer email on the order" };
  }

  try {
    const resend = new Resend(emailConfig.apiKey);
    const { data, error } = await resend.emails.send({
      from: emailConfig.from,
      to: order.email,
      replyTo: emailConfig.supportEmail,
      subject: `Refunded: your ${BRAND.name} order for VIN ${order.vin}`,
      html: refundHtml(order, amount),
      text: refundText(order, amount),
    });
    if (error) {
      return { sent: false, detail: `Resend error: ${error.message}` };
    }
    return { sent: true, detail: `Refund email sent (${data?.id ?? "no id"})` };
  } catch (error) {
    return { sent: false, detail: `Resend threw: ${(error as Error).message}` };
  }
}
