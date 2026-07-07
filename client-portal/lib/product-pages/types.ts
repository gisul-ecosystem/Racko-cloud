import type { LucideIcon } from "lucide-react";

export type ProductFeatureItem = {
  Icon: LucideIcon;
  title: string;
  description: string;
};

export type IndustryUseCase = {
  title: string;
  description: string;
};

export type HowItWorksStep = {
  step: string;
  title: string;
  description: string;
};

export type ProductPageTemplateProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  positioningParagraphs: string[];
  specs: string[];
  bestFitChips: string[];
  features: ProductFeatureItem[];
  industryCards: IndustryUseCase[];
  howItWorks?: HowItWorksStep[];
  deployCtaProductName: string;
};
