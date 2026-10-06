import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "Mela Wallet",
    template: "%s · Mela Wallet",
  },
  description:
    "Multi-currency wallet with double-entry ledger transfers, tiered limits and auditable statements.",
  applicationName: "Mela Wallet",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white font-sans text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
