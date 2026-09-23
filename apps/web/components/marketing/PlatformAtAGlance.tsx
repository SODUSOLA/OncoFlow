import { Section, SectionHeading } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { platformGlance } from "@/lib/content/platformGlance";

// Platform-at-a-glance section.
export function PlatformAtAGlance() {
  return (
    <Section tone="primary">
      <SectionHeading
        eyebrow="Platform at a Glance"
        title="The full capability set, in one scan"
        align="center"
        className="[&_h2]:text-white [&_p]:text-white/70"
      />
      <Reveal>
        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {platformGlance.map((item) => (
            <div
              key={item.label}
              className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center"
            >
              <item.icon className="size-6 text-accent" aria-hidden="true" />
              <span className="text-sm font-medium text-white">{item.label}</span>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
