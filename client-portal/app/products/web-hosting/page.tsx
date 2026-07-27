import type { Metadata } from "next";
import ProductPageTemplate from "@/components/templates/ProductPageTemplate";
export const metadata: Metadata = {
  title: "Web Hosting India — Racko Cloud",
  description:
    "Secure, managed hosting for websites, business portals, CMS, WordPress, and digital experiences — with SSL, backups, and 24/7 support.",
};

export default function WebHostingProductPage() {
  return <ProductPageTemplate slug="web-hosting" />;
}
