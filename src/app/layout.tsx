import type { Metadata } from "next";
import { Newsreader, Instrument_Sans } from "next/font/google";
import { SITE_URL } from "./(marketing)/content";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-instrument-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PostAud.io — An AI interviewer that builds knowledge through conversation",
    template: "%s — PostAud.io",
  },
  description:
    "Voice-first AI interviews that build a living knowledge base — not just a transcript. Export what you learn as Markdown, anytime.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${instrumentSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
