import type { Metadata, Viewport } from "next";
import { Karantina, Saira_Extra_Condensed, Vazirmatn } from "next/font/google";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const display = Karantina({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-karantina", display: "swap" });
const caps = Saira_Extra_Condensed({ subsets: ["latin"], weight: ["700"], variable: "--font-saira", display: "swap" });
const body = Vazirmatn({ subsets: ["latin"], weight: ["300", "500", "700"], variable: "--font-vazirmatn", display: "swap" });

export const metadata: Metadata = {
  title: "Cream City Almanac",
  description: "Find, understand, and download Milwaukee's public data. Unofficial; built on Data You Can Use's public data.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${caps.variable} ${body.variable}`}>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
