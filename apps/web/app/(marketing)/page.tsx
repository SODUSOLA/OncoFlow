import { Hero } from "@/components/marketing/Hero";
import { BuiltForModernCare } from "@/components/marketing/BuiltForModernCare";
import { PlatformOverview } from "@/components/marketing/PlatformOverview";
import { WhoWeServe } from "@/components/marketing/WhoWeServe";
import { PlatformAtAGlance } from "@/components/marketing/PlatformAtAGlance";
import { HealthcareChallenges } from "@/components/marketing/HealthcareChallenges";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { RoleBasedExperience } from "@/components/marketing/RoleBasedExperience";
import { SecurityGrid } from "@/components/marketing/SecurityGrid";
import { WhyChoose } from "@/components/marketing/WhyChoose";
import { Impact } from "@/components/marketing/Impact";
import { Testimonials } from "@/components/marketing/Testimonials";
import { FAQSection } from "@/components/marketing/FAQSection";
import { ResourcesPreview } from "@/components/marketing/ResourcesPreview";
import { EnterpriseCTA } from "@/components/marketing/EnterpriseCTA";

// Marketing home page composed of the landing sections.
export default function Home() {
  return (
    <>
      <Hero />
      <BuiltForModernCare />
      <PlatformOverview />
      <WhoWeServe />
      <PlatformAtAGlance />
      <HealthcareChallenges />
      <HowItWorks />
      <FeatureGrid />
      <RoleBasedExperience />
      <SecurityGrid />
      <WhyChoose />
      <Impact />
      <Testimonials />
      <FAQSection />
      <ResourcesPreview />
      <EnterpriseCTA />
    </>
  );
}
