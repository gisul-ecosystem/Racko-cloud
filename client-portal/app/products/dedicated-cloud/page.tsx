import type { Metadata } from "next";
import ProductPageTemplate from "@/components/templates/ProductPageTemplate";
export const metadata: Metadata = {
  title: "HA Dedicated Cloud India — Racko Cloud",
  description:
    "High-availability dedicated cloud infrastructure for mission-critical workloads that need dedicated resources, redundancy, and enterprise-grade reliability.",
};

export default function DedicatedCloudProductPage() {
  return <ProductPageTemplate slug="dedicated-cloud" />;
}
