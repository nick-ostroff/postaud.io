/**
 * iOS launch images. Safari only paints one when a `media` query matches the
 * device exactly — no fallback, no scaling — so every supported iPhone needs
 * its own entry. The images themselves are built by
 * `scripts/generate-pwa-assets.mjs`; this list must stay in step with the
 * `IPHONE_SCREENS` list there.
 *
 * Portrait only: the manifest locks the app to portrait.
 */
const IPHONE_SCREENS = [
  { w: 320, h: 568, scale: 2 }, // SE (1st gen), 5s
  { w: 375, h: 667, scale: 2 }, // SE (2nd/3rd gen), 8
  { w: 414, h: 736, scale: 3 }, // 8 Plus
  { w: 375, h: 812, scale: 3 }, // X, XS, 11 Pro, 12/13 mini
  { w: 414, h: 896, scale: 2 }, // XR, 11
  { w: 414, h: 896, scale: 3 }, // XS Max, 11 Pro Max
  { w: 390, h: 844, scale: 3 }, // 12, 13, 14
  { w: 428, h: 926, scale: 3 }, // 12/13 Pro Max, 14 Plus
  { w: 393, h: 852, scale: 3 }, // 14 Pro, 15, 16
  { w: 430, h: 932, scale: 3 }, // 14 Pro Max, 15 Plus, 16 Plus
  { w: 402, h: 874, scale: 3 }, // 16 Pro
  { w: 440, h: 956, scale: 3 }, // 16 Pro Max
];

export const APPLE_STARTUP_IMAGES = IPHONE_SCREENS.map(({ w, h, scale }) => ({
  url: `/splash/${w}x${h}@${scale}x.png`,
  media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: portrait)`,
}));
