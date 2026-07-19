import type { Metadata } from "next";
import ProductPageTemplate from "@/components/templates/ProductPageTemplate";
export const metadata: Metadata = {
  title: "Private Cloud India — Racko Cloud",
  description:
    "Controlled cloud environments for sensitive, regulated, or client-dedicated workloads with full isolation and governance.",
};

export default function PrivateCloudProductPage() {
  return <ProductPageTemplate slug="private-cloud" />;
}
