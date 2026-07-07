import Hero from "@/components/sections/Hero";
import TrustStrip from "@/components/sections/TrustStrip";
import ProblemSection from "@/components/sections/ProblemSection";
import FootprintSection from "@/components/sections/FootprintSection";
import WhyRackoSection from "@/components/sections/WhyRackoSection";
import ProductsPreview from "@/components/sections/ProductsPreview";
import CloudLabsSection from "@/components/sections/CloudLabsSection";
import WorkloadPlacementSection from "@/components/sections/WorkloadPlacementSection";
import OutcomesSection from "@/components/sections/OutcomesSection";
import IndustriesTeaser from "@/components/sections/IndustriesTeaser";
import ArchPreviewSection from "@/components/sections/ArchPreviewSection";
import SecuritySection from "@/components/sections/SecuritySection";
import QuoteSection from "@/components/sections/QuoteSection";
import InsightsSection from "@/components/sections/InsightsSection";
import BottomCTA from "@/components/sections/BottomCTA";

export const metadata = {
  title: "Racko | Infrastructure as a Solution for Enterprise Workloads",
  description:
    "Racko delivers bare metal, VPS, private cloud, GPU-ready infrastructure, hybrid cloud migration, AI infrastructure, and managed operations across Mumbai, Noida, and Chennai.",
};

export default function HomePage() {
  return (
    <>
      <Hero bgImage="/images/racko-server.png" />
      <TrustStrip />
      <ProblemSection />
      <FootprintSection />
      <WhyRackoSection />
      <ProductsPreview />
      <CloudLabsSection />
      <WorkloadPlacementSection />
      <OutcomesSection bgImage="/images/outcomes-bg.png" />
      <IndustriesTeaser />
      <ArchPreviewSection />
      <SecuritySection />
      <QuoteSection />
      <InsightsSection />
      <BottomCTA />
    </>
  );
}
