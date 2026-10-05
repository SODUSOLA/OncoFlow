import { useState } from "react";
import { VITAL_LABELS, VITAL_UNITS } from "../../consulting-oncologist/lib/clinicalTypes";

export interface VitalSeries { vitalType: string; readings: { id: string; value: number; recordedAt: string }[] }

const COLORS = ["#002147", "#E67E22", "#2D6A4F", "#C92A2A", "#708AB5", "#745C00"];
const W = 640, H = 180, PAD = { l: 36, r: 12, t: 12, b: 20 };

// Multi-line timeline with a legend and a hover tooltip. Each series is scaled to its own range, so vitals
// with different units (bpm vs °C) read side by side as shape, and the tooltip shows the real value.
export function VitalsTimeline({ series }: { series: VitalSeries[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ x: number; lines: { label: string; text: string; color: string }[]; at: string } | null>(null);
  const shown = series.filter((s) => s.readings.length > 0);
  if (shown.length === 0) return <p className="py-8 text-center text-admin-body-sm text-admin-text-secondary">No vital readings recorded yet.</p>;

  const times = shown.flatMap((s) => s.readings.map((r) => new Date(r.recordedAt).getTime()));
  const t0 = Math.min(...times), t1 = Math.max(...times);
  const x = (t: number) => PAD.l + (t1 === t0 ? (W - PAD.l - PAD.r) / 2 : ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r));
  const yFor = (s: VitalSeries) => {
    const vs = s.readings.map((r) => r.value); const lo = Math.min(...vs), hi = Math.max(...vs);
    return (v: number) => PAD.t + (hi === lo ? (H - PAD.t - PAD.b) / 2 : (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b));
  };

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const t = t0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (t1 - t0);
    let nearest = times[0]!;
    for (const tt of times) if (Math.abs(tt - t) < Math.abs(nearest - t)) nearest = tt;
    const lines = shown.filter((s) => !hidden.has(s.vitalType)).flatMap((s, i) => {
      const r = s.readings.find((rr) => new Date(rr.recordedAt).getTime() === nearest);
      return r ? [{ label: VITAL_LABELS[s.vitalType] ?? s.vitalType, text: `${r.value} ${VITAL_UNITS[s.vitalType] ?? ""}`, color: COLORS[series.indexOf(s) % COLORS.length]! }] : [];
    });
    setHover({ x: x(nearest), lines, at: new Date(nearest).toLocaleString() });
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3">
        {shown.map((s) => {
          const color = COLORS[series.indexOf(s) % COLORS.length]!;
          const off = hidden.has(s.vitalType);
          return (
            <button key={s.vitalType} type="button" aria-pressed={!off}
              onClick={() => setHidden((h) => { const n = new Set(h); if (off) n.delete(s.vitalType); else n.add(s.vitalType); return n; })}
              className={`flex items-center gap-1.5 text-admin-caption ${off ? "text-admin-text-secondary line-through opacity-60" : "text-admin-text"}`}>
              <span className="size-2.5 rounded-full" style={{ background: color }} /> {VITAL_LABELS[s.vitalType] ?? s.vitalType}
            </button>
          );
        })}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Vital signs timeline">
          <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="#C4C6CF" />
          {shown.filter((s) => !hidden.has(s.vitalType)).map((s) => {
            const y = yFor(s); const color = COLORS[series.indexOf(s) % COLORS.length]!;
            const pts = s.readings.map((r) => `${x(new Date(r.recordedAt).getTime())},${y(r.value)}`).join(" ");
            return (
              <g key={s.vitalType}>
                <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
                {s.readings.map((r) => <circle key={r.id} cx={x(new Date(r.recordedAt).getTime())} cy={y(r.value)} r="3" fill={color} />)}
              </g>
            );
          })}
          {hover && <line x1={hover.x} x2={hover.x} y1={PAD.t} y2={H - PAD.b} stroke="#44474E" strokeDasharray="3 3" />}
        </svg>
        {hover && hover.lines.length > 0 && (
          <div className="pointer-events-none absolute top-0 rounded-admin-sm border border-admin-border bg-white p-2 text-admin-caption shadow-admin-card"
            style={{ left: `${Math.min(80, (hover.x / W) * 100)}%` }}>
            <p className="mb-1 text-admin-text-secondary">{hover.at}</p>
            {hover.lines.map((l) => <p key={l.label} style={{ color: l.color }}>{l.label}: <b>{l.text}</b></p>)}
          </div>
        )}
      </div>
    </div>
  );
}
