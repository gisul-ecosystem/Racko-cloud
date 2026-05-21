import type { Metadata } from "next";
import ProductPageTemplate from "@/components/templates/ProductPageTemplate";
export const metadata: Metadata = {
  title: "S3-Compatible Storage India — Racko Cloud",
  description:
    "Object storage for backups, media, application data, logs, datasets, and archival workloads — with full S3 API compatibility.",
};

export default function S3StorageProductPage() {
  return <ProductPageTemplate slug="s3-storage" />;
}
