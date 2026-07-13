import { ImageResponse } from "next/og";

export const alt = "PostAud.io — An AI interviewer that builds knowledge through conversation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Generated OG image for the homepage. No custom font file ships in this
 * repo, so this intentionally uses the ImageResponse default font rather
 * than reaching for one that isn't checked in.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#F7F5F0",
          padding: "80px",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, color: "#211E1A" }}>
          post<span style={{ color: "#2F6F5E", fontWeight: 700 }}>aud</span>.io
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 56,
            lineHeight: 1.25,
            color: "#211E1A",
            maxWidth: 920,
          }}
        >
          The stories leave with the person. Unless someone asks.
        </div>
      </div>
    ),
    { ...size },
  );
}
