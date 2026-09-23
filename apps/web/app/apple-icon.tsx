import { ImageResponse } from "next/og";
import { RIBBON_PATH, RIBBON_VIEWBOX } from "@/components/brand/ribbon-paths";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Generates the Apple touch icon from the ribbon logo.
export default async function AppleIcon() {
  const [minX, minY, w, h] = RIBBON_VIEWBOX.split(" ").map(Number);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#002147",
        }}
      >
        <svg width="112" height="112" viewBox={`${minX} ${minY} ${w} ${h}`}>
          <path d={RIBBON_PATH} fill="#ffcc29" />
        </svg>
      </div>
    ),
    size
  );
}
