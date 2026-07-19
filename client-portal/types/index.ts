export interface NavItem {
  label: string;
  href: string;
  hasDropdown?: boolean;
}

export interface SolutionCard {
  icon: string;
  title: string;
  desc: string;
  href?: string;
}

export interface InsightCard {
  type: string;
  title: string;
  desc: string;
  tags: string;
  cta: string;
  href?: string;
}

export interface HeroProps {
  bgImage?: string;
}

export interface EyebrowProps {
  label: string;
  centered?: boolean;
}

export interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  arrow?: boolean;
  href?: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}
