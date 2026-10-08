import type { Metadata, Viewport } from "next";
import { Caveat, Saira, Saira_Extra_Condensed, Vazirmatn } from "next/font/google";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

// Variable Saira for the wordmark only: its width axis reaches ultra-condensed, taller letters at the comp's width.
const wordmark = Saira({ subsets: ["latin"], axes: ["wdth"], variable: "--font-saira-var", display: "swap" });
const caps = Saira_Extra_Condensed({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-saira", display: "swap" });
const note = Caveat({ subsets: ["latin"], weight: "600", variable: "--font-caveat", display: "swap" });
const body = Vazirmatn({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-vazirmatn", display: "swap" });

export const metadata: Metadata = {
  title: "Cream City Almanac",
  description: "Find, understand, and download Milwaukee's public data. Unofficial; built on Data You Can Use's public data.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${wordmark.variable} ${caps.variable} ${body.variable} ${note.variable}`}>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
