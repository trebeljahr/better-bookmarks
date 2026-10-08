import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type * as React from "react";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const SITE_URL = "https://bookmarks.trebeljahr.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Better Bookmarks",
  description:
    "A better way to organize your Chrome bookmarks — tags, ratings, notes, connections, and aggressive URL deduplication.",
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-256.png", sizes: "256x256", type: "image/png" },
      { url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={geist.variable}>
      <head>
        {/* Self-hosted, cookieless Plausible — see app/privacy/page.tsx. */}
        <script
          defer
          data-domain="bookmarks.trebeljahr.com"
          src="https://plausible.trebeljahr.com/js/script.outbound-links.js"
        />
      </head>
      <body className="font-sans">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
