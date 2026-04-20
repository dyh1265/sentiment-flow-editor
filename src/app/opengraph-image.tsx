import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Sentiment Flow Editor";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: 72,
          background:
            "linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #7e22ce 100%)",
          color: "white",
          fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              width: 56,
              height: 56,
              borderRadius: 12,
              background: "#2563eb",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            S
          </div>
          <span style={{ fontSize: 24, opacity: 0.85 }}>Sentiment Flow Editor</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>
            See the emotional curve of your writing.
          </div>
          <div style={{ fontSize: 28, opacity: 0.85, maxWidth: 900 }}>
            Score every sentence, compare against a target arc, and rewrite the weak beats.
          </div>
        </div>

        <svg
          width="1056"
          height="120"
          viewBox="0 0 1056 120"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: "block" }}
        >
          <path
            d="M0 70 C 120 40, 220 110, 340 95 S 600 20, 760 50 S 980 30, 1056 60"
            fill="none"
            stroke="#93c5fd"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M0 60 C 150 55, 300 65, 440 62 S 720 55, 900 50 S 1000 48, 1056 52"
            fill="none"
            stroke="#a855f7"
            strokeWidth="4"
            strokeDasharray="10 10"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
