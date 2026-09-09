import { ImageResponse } from "next/og";

// Static, typography-only share card. No remote fetches at build time —
// we deliberately skip custom font loading so satori falls back to its
// bundled defaults rather than reaching out for Google Fonts.

export const alt = "Better Bookmarks — tags, not folders";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The site is built with `output: "export"`, so the OG route has to
// prerender at build time rather than run per-request.
export const dynamic = "force-static";

// Rough sRGB stand-ins for the dark-theme design tokens in globals.css
// (oklch is not yet safe to hand to satori). Kept close to the values
// the site renders so the card feels of a piece with the landing page.
const BG = "#0a0a0a"; // oklch(0.145 0 0)
const FG = "#fafafa"; // oklch(0.985 0 0)
const MUTED = "#a3a3a3"; // oklch(0.708 0 0)
const BORDER = "rgba(255,255,255,0.10)";
const CARD = "rgba(255,255,255,0.04)";
const ACCENT = "#10b981"; // emerald-500, matches hero pill dot

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: BG,
        // Subtle radial glow, mirrors the hero's purple-tinted spotlight
        backgroundImage:
          "radial-gradient(60% 55% at 50% 0%, rgba(139,92,246,0.22), transparent 70%)",
        color: FG,
        padding: "80px",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        letterSpacing: "-0.02em",
      }}
    >
      {/* Eyebrow pill */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "10px 20px",
          borderRadius: "9999px",
          border: `1px solid ${BORDER}`,
          background: CARD,
          color: MUTED,
          fontSize: "24px",
          letterSpacing: "0",
        }}
      >
        <span
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "9999px",
            background: ACCENT,
            display: "flex",
          }}
        />
        Chrome extension · open source
      </div>

      {/* Wordmark */}
      <div
        style={{
          marginTop: "48px",
          fontSize: "132px",
          fontWeight: 700,
          lineHeight: 1,
          textAlign: "center",
          color: FG,
        }}
      >
        Better Bookmarks
      </div>

      {/* Tagline */}
      <div
        style={{
          marginTop: "32px",
          fontSize: "56px",
          fontWeight: 500,
          lineHeight: 1.1,
          color: FG,
          textAlign: "center",
          letterSpacing: "-0.015em",
        }}
      >
        Tags, not folders.
      </div>

      {/* Stats line */}
      <div
        style={{
          marginTop: "48px",
          fontSize: "30px",
          color: MUTED,
          letterSpacing: "0",
        }}
      >
        Open source · MIT · 20,000+ bookmarks
      </div>
    </div>,
    {
      ...size,
    },
  );
}
