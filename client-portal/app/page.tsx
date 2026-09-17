import Hero from "@/components/sections/Hero";
import VideoBanner from "@/components/sections/VideoBanner";
import ExploreProducts from "@/components/sections/ExploreProducts";
import OwnFoundationSection from "@/components/sections/OwnFoundationSection";
import GlobalInfrastructureSection from "@/components/sections/GlobalInfrastructureSection";
import DeployPathSection from "@/components/sections/DeployPathSection";
import ReadyToBuildSection from "@/components/sections/ReadyToBuildSection";

export const metadata = {
  title: "Racko | Infrastructure as a Solution for Enterprise Workloads",
  description:
    "Racko delivers bare metal, VPS, private cloud, GPU-ready infrastructure, hybrid cloud migration, AI infrastructure, and managed operations across Mumbai, Noida, and Chennai.",
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <VideoBanner />
      <ExploreProducts />
      <OwnFoundationSection />
      <GlobalInfrastructureSection />
      <DeployPathSection />
      <ReadyToBuildSection />
    </>
  );
}
