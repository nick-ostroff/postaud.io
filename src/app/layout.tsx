import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PostAud.io — Interviews, without the interview",
  description:
    "Send a text, get a transcript, a summary, and the exact output you need — from a 3-minute AI-guided phone call your recipient takes whenever they want.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
