import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import TopNav from "@/components/TopNav";
import { CasesProvider } from "@/lib/state/CasesContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PRAMAAN · IDFC FIRST Bank LAP Valuation",
  description:
    "Evidence-backed, confidence-gated LAP property valuation prototype for IDFC FIRST Bank (FAME 6.0).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-canvas text-ink antialiased`}>
        <CasesProvider>
          <TopNav />
          <main className="mx-auto w-full max-w-[1440px] px-4 py-6 lg:px-6">{children}</main>
        </CasesProvider>
      </body>
    </html>
  );
}
