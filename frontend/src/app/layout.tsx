import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PayVault — Digital Wallet",
    template: "%s · PayVault",
  },
  description:
    "Enterprise-grade digital wallet with multi-currency support, real-time balance updates and instant peer-to-peer transfers.",
  keywords: ["digital wallet", "payment system", "fintech", "money transfer"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans bg-surface-50 text-surface-900 antialiased">
        <Providers>
          {children}

          <Toaster
            position="top-right"
            gutter={10}
            toastOptions={{
              duration: 4000,
              style: {
                borderRadius: "14px",
                padding: "12px 16px",
                fontSize: "13.5px",
                fontWeight: "500",
                boxShadow:
                  "0 10px 30px rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.06)",
                border: "1px solid rgba(0,0,0,.06)",
              },
              success: {
                iconTheme: { primary: "#10b981", secondary: "#fff" },
              },
              error: {
                iconTheme: { primary: "#ef4444", secondary: "#fff" },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
