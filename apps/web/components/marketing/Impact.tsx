import { Section, SectionHeading } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { metrics } from "@/lib/content/metrics";

export function Impact() {
  return (
    <Section tone="muted">
      <div className="flex flex-col items-center gap-4 text-center">
        <SectionHeading eyebrow="Impact" title="Where the platform stands today" className="mb-0" />
        <Badge variant="sample">Sample figures — replace at launch</Badge>
      </div>
      <div className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-5">
        {metrics.map((metric, i) => (
          <Reveal key={metric.label} delay={i * 0.04} className="text-center">
            <p className="font-display text-3xl font-bold text-primary sm:text-4xl">{metric.value}</p>
            <p className="mt-2 text-sm text-neutral-600">{metric.label}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
