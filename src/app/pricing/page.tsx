import Link from "next/link";
import React from "react";

export default function PricingPage() {
  return (
    <div className="flex flex-col items-center min-h-screen bg-[var(--background)] pt-32 pb-16 px-6">
      <div className="w-full max-w-4xl animate-fade-in-up">
        
        <div className="text-center mb-16">
          <Link href="/" className="inline-block text-lg font-semibold tracking-tight text-neutral-500 mb-6 hover:text-neutral-900 dark:hover:text-white transition-colors">
            ← Back to PostAud.io
          </Link>
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 mb-4">
            Simple, honest pricing.
          </h1>
          <p className="text-xl text-neutral-500 dark:text-neutral-400 font-medium">
            Start for free. Upgrade when you need more volume.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Free Tier */}
          <div className="bg-neutral-50 dark:bg-[#111111] p-10 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 transition-transform hover:scale-[1.02]">
            <h3 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">Free</h3>
            <div className="my-6">
              <span className="text-5xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">$0</span>
              <span className="text-neutral-500 font-medium">/month</span>
            </div>
            <p className="text-neutral-600 dark:text-neutral-400 font-medium mb-8">
              Perfect for trying out the core experience.
            </p>
            <ul className="space-y-4 text-[15px] font-medium text-neutral-700 dark:text-neutral-300 mb-8">
              <li className="flex items-center gap-3"><span className="text-emerald-500">✓</span> 3 interviews per month</li>
              <li className="flex items-center gap-3"><span className="text-emerald-500">✓</span> AI transcripts & summaries</li>
              <li className="flex items-center gap-3"><span className="text-emerald-500">✓</span> Standard webhooks</li>
            </ul>
            <Link href="/sign-in" className="block w-full text-center rounded-xl bg-neutral-200 dark:bg-neutral-800 px-4 py-3.5 text-[15px] font-medium text-neutral-900 dark:text-neutral-100 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors">
              Get Started
            </Link>
          </div>

          {/* Paid Tiers */}
          <div className="bg-neutral-900 dark:bg-[#1c1c1e] p-10 rounded-[2rem] border border-neutral-800 transition-transform hover:scale-[1.02] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
              <span className="bg-blue-600 text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">Pro</span>
            </div>
            <h3 className="text-2xl font-semibold text-white">Paid Plans</h3>
            <p className="text-neutral-400 font-medium mt-2 mb-8">
              Scale your usage with predictable volume pricing.
            </p>
            
            <div className="space-y-6">
              <div className="flex justify-between items-center border-b border-neutral-800 pb-4">
                <div>
                  <div className="text-white font-medium">Starter</div>
                  <div className="text-sm text-neutral-500">20 interviews</div>
                </div>
                <div className="text-xl font-semibold text-white">$29<span className="text-sm font-normal text-neutral-500">/mo</span></div>
              </div>
              
              <div className="flex justify-between items-center border-b border-neutral-800 pb-4">
                <div>
                  <div className="text-white font-medium">Growth</div>
                  <div className="text-sm text-neutral-500">100 interviews</div>
                </div>
                <div className="text-xl font-semibold text-white">$99<span className="text-sm font-normal text-neutral-500">/mo</span></div>
              </div>

              <div className="flex justify-between items-center pb-4">
                <div>
                  <div className="text-white font-medium">Scale</div>
                  <div className="text-sm text-neutral-500">400 interviews</div>
                </div>
                <div className="text-xl font-semibold text-white">$299<span className="text-sm font-normal text-neutral-500">/mo</span></div>
              </div>
            </div>

            <Link href="/sign-in" className="mt-8 block w-full text-center rounded-xl bg-blue-600 px-4 py-3.5 text-[15px] font-medium text-white hover:bg-blue-700 transition-colors">
              Upgrade Now
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
