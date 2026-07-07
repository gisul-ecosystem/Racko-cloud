import type { Metadata } from "next";
import ProductPageTemplate from "@/components/templates/ProductPageTemplate";
export const metadata: Metadata = {
  title: "GPU Cloud India — Racko Cloud",
  description:
    "Accelerated cloud environments for AI, ML, inference, HPC, rendering, and visual inspection workloads.",
};

export default function GpuCloudProductPage() {
  return <ProductPageTemplate slug="gpu-cloud" />;
}
