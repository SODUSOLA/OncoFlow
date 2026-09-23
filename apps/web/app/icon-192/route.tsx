import { ImageResponse } from "next/og";
import { RIBBON_PATH, RIBBON_VIEWBOX } from "@/components/brand/ribbon-paths";

export const runtime = "edge";

// Serves the 192px app icon.
export async function GET() {
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
        <svg width="120" height="120" viewBox={`${minX} ${minY} ${w} ${h}`}>
          <path d={RIBBON_PATH} fill="#ffcc29" />
        </svg>
      </div>
    ),
    { width: 192, height: 192 }
  );
}
