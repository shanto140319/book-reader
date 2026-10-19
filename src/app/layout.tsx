import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, Tiro_Bangla } from "next/font/google";
import "./globals.css";

// next/font self-hosts the fonts at build time: no runtime request to Google, no layout shift.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });
// Only for the "পাতা" next to the logo, so it isn't preloaded on every page.
const tiroBangla = Tiro_Bangla({ variable: "--font-tiro-bangla", subsets: ["bengali"], weight: "400", preload: false });

export const metadata: Metadata = {
  title: { default: "Pata", template: "%s · Pata" },
  description: "Your private library. Pick up every book exactly where you left off, on any device.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0e0c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${tiroBangla.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
