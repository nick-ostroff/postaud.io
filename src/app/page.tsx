import Link from "next/link";
import React from "react";

export default function MarketingHome() {
  return (
    <div className="flex flex-col items-center min-h-screen bg-[var(--background)]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[var(--background)]/80 backdrop-blur-xl border-b border-neutral-200/50 dark:border-neutral-800/50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-semibold text-xl tracking-tight">PostAud.io</Link>
          <div className="flex items-center gap-6 text-sm font-medium text-neutral-500 dark:text-neutral-400">
            <Link href="/pricing" className="hover:text-neutral-900 dark:hover:text-white transition-colors">Pricing</Link>
            <Link href="/sign-in" className="hover:text-neutral-900 dark:hover:text-white transition-colors">Sign In</Link>
            <Link href="/sign-in" className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-1.5 rounded-full hover:scale-105 transition-transform duration-300">Get Started</Link>
          </div>
        </div>
      </nav>

      <main className="w-full flex-grow pt-32 pb-16">
        {/* Hero Section */}
        <section className="text-center px-6 max-w-5xl mx-auto animate-fade-in-up">
          <h1 className="text-6xl md:text-8xl font-semibold tracking-tight leading-none text-neutral-900 dark:text-neutral-50 mb-6 py-2">
            Interviews,<br/> without the interview.
          </h1>
          <p className="mt-6 text-xl md:text-2xl text-neutral-500 dark:text-neutral-400 max-w-3xl mx-auto font-medium leading-relaxed">
            Send a text, get a transcript, a summary, and the exact output you need. From a 3-minute AI-guided phone call your recipient takes whenever they want.
          </p>
          
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/sign-in" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-full text-lg font-medium transition-all hover:scale-105 flex items-center gap-2">
              Start for free
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                 <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </section>

        {/* Hero Visual abstraction */}
        <section className="mt-24 max-w-5xl mx-auto px-6 opacity-0 animate-scale-up" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>
          <div className="w-full aspect-video rounded-[3rem] bg-neutral-100 dark:bg-[#111111] overflow-hidden flex items-center justify-center relative border border-neutral-200/50 dark:border-neutral-800/50 shadow-2xl">
            {/* Audio Wave SVG Abstraction */}
            <svg viewBox="0 0 800 400" className="w-full h-full text-blue-500 opacity-60 z-10">
              <g className="fill-current">
                <rect x="230" y="150" width="16" height="100" rx="8" className="animate-pulse" style={{ animationDelay: '0ms' }} />
                <rect x="270" y="100" width="16" height="200" rx="8" className="animate-pulse" style={{ animationDelay: '200ms' }} />
                <rect x="310" y="140" width="16" height="120" rx="8" className="animate-pulse" style={{ animationDelay: '400ms' }} />
                <rect x="350" y="50" width="16" height="300" rx="8" className="animate-pulse" style={{ animationDelay: '600ms' }} />
                <rect x="390" y="80" width="16" height="240" rx="8" className="animate-pulse" style={{ animationDelay: '800ms' }} />
                <rect x="430" y="110" width="16" height="180" rx="8" className="animate-pulse" style={{ animationDelay: '300ms' }} />
                <rect x="470" y="160" width="16" height="80" rx="8" className="animate-pulse" style={{ animationDelay: '500ms' }} />
                <rect x="510" y="90" width="16" height="220" rx="8" className="animate-pulse" style={{ animationDelay: '100ms' }} />
                <rect x="550" y="130" width="16" height="140" rx="8" className="animate-pulse" style={{ animationDelay: '700ms' }} />
              </g>
            </svg>
            <div className="absolute inset-x-0 bottom-0 top-1/2 bg-gradient-to-t from-neutral-100 dark:from-[#111111] via-transparent to-transparent pointer-events-none" />
          </div>
        </section>

        {/* Features Bento Grid */}
        <section className="mt-32 max-w-7xl mx-auto px-6 opacity-0 animate-fade-in-up" style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Card 1 */}
            <div className="bg-neutral-50 dark:bg-[#111111] p-12 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 flex flex-col justify-between h-[28rem] transition-transform hover:scale-[1.02]">
              <div>
                <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-8">
                  <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <h3 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 leading-tight">Text to transcript in minutes.</h3>
                <p className="mt-4 text-lg text-neutral-500 dark:text-neutral-400 font-medium">One SMS, one tap, one call. Your recipient answers entirely on their own schedule.</p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-neutral-50 dark:bg-[#111111] p-12 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 flex flex-col justify-between h-[28rem] md:col-span-2 transition-transform hover:scale-[1.01]">
              <div>
                <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-8">
                  <svg className="w-7 h-7 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"></path></svg>
                </div>
                <h3 className="text-4xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 mb-4">AI that listens and follows up.</h3>
                <p className="text-xl text-neutral-500 dark:text-neutral-400 max-w-xl font-medium leading-relaxed">It doesn't just read a script. The AI engages in a dynamic conversation, asking the precise clarifying questions you would ask yourself.</p>
              </div>
            </div>

            {/* Card 3 (Webhooks) */}
            <div className="bg-neutral-50 dark:bg-[#111111] p-12 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 flex flex-col justify-between md:col-span-3 transition-transform hover:scale-[1.01]">
              <div className="md:w-1/2">
                <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-8">
                  <svg className="w-7 h-7 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                </div>
                <h3 className="text-4xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 mb-4">Goes where your work lives.</h3>
                <p className="text-xl text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed">Automatic pushing to Webhooks, your CRM, or directly into your inbox. The gathered insights integrate perfectly into your existing stack.</p>
              </div>
            </div>

          </div>
        </section>

      </main>

      {/* Footer / Final CTA */}
      <footer className="w-full bg-black py-40 text-center text-white mt-16 select-none">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-5xl md:text-7xl font-semibold tracking-tight mb-10">Ready to skip the call?</h2>
          <Link href="/sign-in" className="inline-block bg-white text-black px-10 py-5 rounded-full text-xl font-medium transition-all hover:scale-105 shadow-[0_0_40px_rgba(255,255,255,0.2)]">
            Explore PostAud.io
          </Link>
          <p className="mt-16 text-neutral-600 text-sm font-medium">© {new Date().getFullYear()} PostAud.io. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
