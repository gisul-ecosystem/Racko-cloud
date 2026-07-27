import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductPageTemplate from "@/components/templates/ProductPageTemplate";
import {
  CLOUDLABS_PAGE_CONFIG_MAP,
  CLOUDLABS_PAGE_SLUGS,
  CLOUDLABS_SEO_TITLES,
  isCloudLabsSlug,
} from "@/lib/cloudlabs-pages/configs";

export function generateStaticParams() {
  return CLOUDLABS_PAGE_SLUGS.map((slug) => ({ slug }));
}

type Props = { params: { slug: string } };

export function generateMetadata({ params }: Props): Metadata {
  const slug = params.slug;
  if (!isCloudLabsSlug(slug)) {
    return { title: "CloudLabs — Racko" };
  }
  const cfg = CLOUDLABS_PAGE_CONFIG_MAP[slug];
  return {
    title: CLOUDLABS_SEO_TITLES[slug],
    description: cfg.subtitle,
  };
}

export default function CloudLabsEnvironmentPage({ params }: Props) {
  const slug = params.slug;
  if (!isCloudLabsSlug(slug)) {
    notFound();
  }
  return <ProductPageTemplate slug={slug} />;
}
