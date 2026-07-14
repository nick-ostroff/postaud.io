import type { Metadata, Viewport } from "next";
import { Newsreader, Instrument_Sans } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { APPLE_STARTUP_IMAGES } from "@/lib/pwa/splash";
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
  applicationName: "PostAud.io",
  // Installed on an iPhone home screen, this runs chromeless. `statusBarStyle:
  // "default"` keeps the web view *below* the status bar rather than under it,
  // so the sticky AppTopNav doesn't slide beneath the clock and no
  // safe-area-inset-top padding is needed.
  appleWebApp: {
    capable: true,
    title: "PostAud.io",
    statusBarStyle: "default",
    startupImage: APPLE_STARTUP_IMAGES,
  },
  // iOS ignores the manifest's icons and reads this instead.
  icons: { apple: "/apple-touch-icon.png" },
  other: {
    // Next emits only the standardized `mobile-web-app-capable`. Safari before
    // iOS 16.4 doesn't read `display` off the manifest and honors just this
    // legacy tag — without it, those iPhones launch the app in a browser tab
    // with the URL bar showing. Emitting both keeps Chrome's deprecation
    // warning quiet.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#F7F5F0", // --paper: tints the iOS status bar / Android chrome
  // Let the page paint into the notch/home-indicator area; components opt back
  // out with env(safe-area-inset-*) where it matters (e.g. StoryBar).
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${instrumentSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
