import type { Metadata } from "next";
import ProductPageTemplate from "@/components/templates/ProductPageTemplate";
export const metadata: Metadata = {
  title: "Backup Storage India — Racko Cloud",
  description:
    "Centralized backup and recovery for cloud, on-prem, hybrid, databases, and business-critical systems.",
};

export default function BackupStorageProductPage() {
  return <ProductPageTemplate slug="backup-storage" />;
}
