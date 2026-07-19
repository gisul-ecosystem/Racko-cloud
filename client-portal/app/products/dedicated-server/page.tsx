import type { Metadata } from "next";
import ProductPageTemplate from "@/components/templates/ProductPageTemplate";
export const metadata: Metadata = {
  title: "Dedicated Server India — Racko Cloud",
  description:
    "Dedicated hardware for workloads demanding consistent performance, full control, and predictable economics.",
};

export default function DedicatedServerProductPage() {
  return <ProductPageTemplate slug="dedicated-server" />;
}
