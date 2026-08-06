import { ImageResponse } from "next/og";
import { RIBBON_PATH, RIBBON_VIEWBOX } from "@/components/brand/ribbon-paths";

export const runtime = "edge";

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
        <svg width="320" height="320" viewBox={`${minX} ${minY} ${w} ${h}`}>
          <path d={RIBBON_PATH} fill="#ffcc29" />
        </svg>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
