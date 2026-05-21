import type { Metadata } from "next";
import ProductPageTemplate from "@/components/templates/ProductPageTemplate";
export const metadata: Metadata = {
  title: "Cloud VPS India — Racko Cloud",
  description:
    "Scalable, high-performance VPS environments combining isolated control with cloud-like resource elasticity.",
};

export default function CloudVpsProductPage() {
  return <ProductPageTemplate slug="cloud-vps" />;
}
