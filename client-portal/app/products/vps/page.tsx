import type { Metadata } from "next";
import ProductPageTemplate from "@/components/templates/ProductPageTemplate";

export const metadata: Metadata = {
  title: "VPS Hosting India — Racko Cloud",
  description:
    "Cost-efficient isolated compute with root access, SSD/NVMe storage, and flexible scaling — built for applications, portals, dev/test, and business workloads.",
};

export default function VpsProductPage() {
  return <ProductPageTemplate slug="vps" />;
}
