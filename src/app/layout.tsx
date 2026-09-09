import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { BRAND, siteUrl } from "@/lib/config";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${BRAND.name} — VIN history reports in about a minute`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    "Pull a full vehicle history report for any VIN: title brands, salvage and junk records, odometer readings, accidents, liens, prior listings and open recalls.",
  applicationName: BRAND.name,
  keywords: [
    "VIN history report",
    "vehicle history report",
    "VIN check",
    "salvage title check",
    "odometer check",
  ],
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: `${BRAND.name} — VIN history reports`,
    description:
      "Title brands, salvage records, odometer history, accidents, liens and recalls for any VIN.",
    url: siteUrl(),
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — VIN history reports`,
    description:
      "Title brands, salvage records, odometer history, accidents, liens and recalls for any VIN.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#05080f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh bg-white font-sans">{children}</body>
    </html>
  );
}
