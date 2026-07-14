/**
 * Renders the favicon, the PWA icons and the iOS splash set from the app's own
 * design tokens, so every place the brand appears — browser tab, home screen,
 * launch screen — is the same waveform mark as `components/nav/LogoMark` in the
 * same green as `--green` in `globals.css`.
 *
 *   node scripts/generate-pwa-assets.mjs
 *
 * Re-run after changing the mark or the brand colors. Output lands in `public/`
 * and `src/app/` and is committed — nothing generates at build time.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const PUBLIC = path.join(import.meta.dirname, "..", "public");
const APP = path.join(import.meta.dirname, "..", "src", "app");

/** `--green: oklch(0.52 0.06 165)` and `--paper`, straight from globals.css. */
const GREEN = oklchToHex(0.52, 0.06, 165);
const PAPER = "#F7F5F0";

/**
 * The mark's bars, in the 24-unit box LogoMark draws them in: three thin bars
 * and one wide one, at descending heights. Kept in sync by eye with
 * `components/nav/LogoMark.tsx` — the proportions are the logo.
 */
const BARS = [
  { h: 0.25, w: 2, o: 0.55 },
  { h: 0.46, w: 2, o: 0.8 },
  { h: 0.33, w: 2, o: 0.8 },
  { h: 0.46, w: 4, o: 1 },
];
const GAP = 1.5;
const BOX = 24;

/** The waveform bars as SVG, centered in a `size`-wide canvas, scaled by `scale`. */
function barsSvg(size, scale = 1) {
  const u = (size / BOX) * scale;
  const totalW = (BARS.reduce((sum, b) => sum + b.w, 0) + GAP * (BARS.length - 1)) * u;
  let x = (size - totalW) / 2;
  return BARS.map((b) => {
    const w = b.w * u;
    const h = b.h * BOX * u;
    const rect = `<rect x="${x}" y="${(size - h) / 2}" width="${w}" height="${h}" rx="${u}" fill="#fff" opacity="${b.o}"/>`;
    x += w + GAP * u;
    return rect;
  }).join("");
}

/** A green tile carrying the mark. `radius` in px; `scale` shrinks the mark. */
function iconSvg(size, { radius = 0, scale = 1 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${radius}" fill="${GREEN}"/>
    ${barsSvg(size, scale)}
  </svg>`;
}

/** A paper-colored launch screen with the rounded icon tile centered. */
function splashSvg(width, height) {
  const tile = Math.round(Math.min(width, height) * 0.22);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="${PAPER}"/>
    <g transform="translate(${(width - tile) / 2}, ${(height - tile) / 2})">
      <rect width="${tile}" height="${tile}" rx="${tile * 0.22}" fill="${GREEN}"/>
      ${barsSvg(tile)}
    </g>
  </svg>`;
}

const png = (svg, file) =>
  sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.join(PUBLIC, file));

/**
 * Packs PNGs into a multi-resolution .ico. Windows Vista onward — which is to
 * say every browser in use — reads PNG-compressed ICO entries, so the ancient
 * BMP+AND-mask encoding isn't needed. sharp can't write .ico, and the format is
 * a 6-byte header plus one 16-byte directory entry per image, so we do it here
 * rather than take a dependency.
 */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette size: none
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

/**
 * The iPhones this app is likely to be installed on. iOS only paints a launch
 * image when a startup-image `media` query matches the device *exactly*, so
 * each screen needs its own file. CSS px = device px / scale.
 */
export const IPHONE_SCREENS = [
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

export const splashFile = ({ w, h, scale }) => `splash/${w}x${h}@${scale}x.png`;

/** OKLCH → sRGB hex, so the icon green can't drift from the CSS token. */
function oklchToHex(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const rgb = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  return (
    "#" +
    rgb
      .map((v) => {
        const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
        const byte = Math.round(Math.min(1, Math.max(0, srgb)) * 255);
        return byte.toString(16).padStart(2, "0");
      })
      .join("")
  );
}

/**
 * Favicon sizes. 16 is the classic tab, 32 what retina tabs and most browsers
 * actually pick, 48 the Windows taskbar / bookmark bar.
 */
const FAVICON_SIZES = [16, 32, 48];

/**
 * The mark carries more breathing room than a 16px tab can afford, so the
 * favicon renders it 20% larger inside the tile. At app-icon scale that padding
 * reads as poise; at tab scale it just reads as small.
 */
const FAVICON_SCALE = 1.2;

async function main() {
  await mkdir(path.join(PUBLIC, "splash"), { recursive: true });

  // Tab icon. Next picks up `app/favicon.ico` and `app/icon.svg` by file
  // convention. Browsers that understand the SVG prefer it (it stays crisp at
  // any size); the .ico is the fallback for those that don't.
  const faviconPngs = await Promise.all(
    FAVICON_SIZES.map(async (size) => ({
      size,
      data: await sharp(
        Buffer.from(iconSvg(size, { radius: size * 0.22, scale: FAVICON_SCALE })),
      )
        .png({ compressionLevel: 9 })
        .toBuffer(),
    })),
  );
  await writeFile(path.join(APP, "favicon.ico"), ico(faviconPngs));
  await writeFile(
    path.join(APP, "icon.svg"),
    iconSvg(64, { radius: 64 * 0.22, scale: FAVICON_SCALE }),
  );

  await Promise.all([
    // Android / desktop install. Rounded, since nothing masks these.
    png(iconSvg(192, { radius: 42 }), "icon-192.png"),
    png(iconSvg(512, { radius: 112 }), "icon-512.png"),
    // Maskable: full-bleed, mark pulled into the 80% safe circle.
    png(iconSvg(512, { scale: 0.78 }), "icon-maskable-512.png"),
    // iOS home screen. Square and opaque — iOS applies its own squircle mask,
    // and renders any transparency as black.
    png(iconSvg(180), "apple-touch-icon.png"),
    ...IPHONE_SCREENS.map((s) =>
      png(splashSvg(s.w * s.scale, s.h * s.scale), splashFile(s)),
    ),
  ]);

  await writeFile(
    path.join(PUBLIC, "icons.README.md"),
    `Generated by \`node scripts/generate-pwa-assets.mjs\` — do not hand-edit.\nBrand green: ${GREEN}\n`,
  );

  console.log(
    `Wrote favicon.ico (${FAVICON_SIZES.join("/")}) + icon.svg to src/app/, and ` +
      `icons (green ${GREEN}) + ${IPHONE_SCREENS.length} splash screens to public/`,
  );
}

main();
