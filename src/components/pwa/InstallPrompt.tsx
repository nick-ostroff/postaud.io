"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

const DISMISSED_KEY = "postaudio:a2hs-dismissed";

const STANDALONE = "(display-mode: standalone)";

/** Re-check when the app transitions into standalone (i.e. it just got installed). */
function subscribe(onChange: () => void) {
  const query = window.matchMedia(STANDALONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether to pitch "Add to Home Screen" at all. Read through
 * `useSyncExternalStore` rather than an effect: every input here is
 * browser-only, so the server has nothing to say and must render nothing.
 */
function shouldPitchInstall() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  // Safari-family only. Chrome/Firefox/Edge on iOS cannot add to the home
  // screen at all, so the instructions would be a dead end there.
  const isSafari = !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  const isInstalled = window.matchMedia(STANDALONE).matches;

  let dismissed = false;
  try {
    dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Private mode can throw on localStorage. Treat as "not dismissed" — worst
    // case the hint comes back.
  }

  return isIOS && isSafari && !isInstalled && !dismissed;
}

/**
 * A dismissible nudge to install the app on iOS.
 *
 * Safari deliberately ships no install API — `beforeinstallprompt` doesn't
 * exist there — so the only route onto an iPhone home screen is the user
 * tapping Share → Add to Home Screen. All we can do is point at it. Android and
 * desktop get the browser's own install affordance off the manifest, so they
 * see nothing here.
 */
export function InstallPrompt() {
  const [dismissed, setDismissed] = useState(false);
  const pitch = useSyncExternalStore(
    subscribe,
    shouldPitchInstall,
    () => false, // server: no UA, no matchMedia — render nothing
  );

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Non-fatal: it just means the hint can return next visit.
    }
    setDismissed(true);
  }, []);

  if (!pitch || dismissed) return null;

  return (
    <div className="mb-5 flex items-start gap-3 rounded-card border border-line bg-card px-4 py-3.5 shadow-card lg:hidden">
      <p className="min-w-0 flex-1 text-[13.5px] text-muted">
        <span className="font-semibold text-ink">Keep PostAud.io on your home screen.</span>{" "}
        Tap <ShareIcon /> in the Safari toolbar, then{" "}
        <span className="font-semibold text-ink">Add to Home Screen</span> — it opens
        full-screen, like an app.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 shrink-0 cursor-pointer p-1 text-[16px] leading-none text-faint hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}

/** The iOS share glyph — a box with an arrow leaving the top. */
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="-mt-0.5 inline-block align-middle text-green-deep"
      role="img"
      aria-label="the Share button"
    >
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}
