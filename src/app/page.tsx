import type { Metadata } from "next";
import { JsonLd } from "./(marketing)/JsonLd";
import { Nav } from "./(marketing)/Nav";
import { Hero } from "./(marketing)/Hero";
import { Stakes } from "./(marketing)/Stakes";
import { HowItWorks } from "./(marketing)/HowItWorks";
import { ProductMoment } from "./(marketing)/ProductMoment";
import { Benefits } from "./(marketing)/Benefits";
import { WhoItsFor } from "./(marketing)/WhoItsFor";
import { Faq } from "./(marketing)/Faq";
import { ClosingCta } from "./(marketing)/ClosingCta";
import { Footer } from "./(marketing)/Footer";
import { SITE_URL } from "./(marketing)/content";

const title = "PostAud.io — An AI interviewer that builds knowledge through conversation";
const description =
  "Voice-first AI interviews that build a living knowledge base — not just a transcript. Capture what only one person knows, and export it as Markdown any time.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: SITE_URL },
  openGraph: { title, description, url: SITE_URL, siteName: "PostAud.io", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function MarketingHome() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-paper text-ink">
      <JsonLd />
      <Nav />
      <main className="w-full flex-1">
        <Hero />
        <Stakes />
        <HowItWorks />
        <ProductMoment />
        <Benefits />
        <WhoItsFor />
        <Faq />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  );
}
