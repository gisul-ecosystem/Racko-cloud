import type { Metadata } from "next";
import ProductPageTemplate from "@/components/templates/ProductPageTemplate";
export const metadata: Metadata = {
  title: "Managed Cloud Operations India — Racko Cloud",
  description:
    "Day-2 cloud operations — monitoring, governance, backup, optimization, lifecycle control, and expert support for your cloud workloads.",
};

export default function ManagedOpsProductPage() {
  return <ProductPageTemplate slug="managed-ops" />;
}
