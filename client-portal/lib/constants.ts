import type { InsightCard, NavItem, SolutionCard } from "@/types";

export const NAV_LINKS: NavItem[] = [
  { label: "Products", href: "/products", hasDropdown: true },
  { label: "Solution", href: "/solutions", hasDropdown: true },
  { label: "Pricing", href: "/products", hasDropdown: false },
];

export const PRODUCT_NAV_LINKS = [
  { label: "Cloud VPS", href: "/products/cloud-vps" },
  { label: "VPS", href: "/products/vps" },
  { label: "Dedicated Server", href: "/products/dedicated-server" },
  { label: "Dedicated Cloud", href: "/products/dedicated-cloud" },
  { label: "GPU Cloud", href: "/products/gpu-cloud" },
  { label: "Private Cloud", href: "/products/private-cloud" },
  { label: "S3 Storage", href: "/products/s3-storage" },
  { label: "Backup Storage", href: "/products/backup-storage" },
] as const;

export const SOLUTION_NAV_LINKS = [
  { label: "Workload Cloud", href: "/products" },
  { label: "AI-Ready Cloud", href: "/products/gpu-cloud" },
  { label: "CloudLabs for Teams", href: "/cloudlabs" },
  { label: "Backup & DR", href: "/products/backup-storage" },
  { label: "Cloud Cost Benchmarking", href: "/benchmark" },
  { label: "Secure Workspaces", href: "/products/private-cloud" },
] as const;

export const TRUST_LOGOS = [
  "Sutherland",
  "TeamLease Digital",
  "SpringPeople",
  "MedResearch",
  "Webyne",
];

export const SOLUTION_CARDS: SolutionCard[] = [
  {
    icon: "💰",
    title: "Cloud Cost Optimization",
    desc: "FinOps intelligence, workload placement analysis, repatriation planning.",
  },
  {
    icon: "🌐",
    title: "Hybrid / Multi-Cloud Management",
    desc: "Unified operations, governance, and observability across every environment.",
  },
  {
    icon: "🤖",
    title: "AI Infrastructure Enablement",
    desc: "GPU clusters, inference environments, MLOps pipelines, managed AI compute.",
  },
  {
    icon: "🏗️",
    title: "Managed Infrastructure",
    desc: "End-to-end provisioning, operations, monitoring, and lifecycle management.",
  },
  {
    icon: "🚚",
    title: "Cloud Migration & Modernization",
    desc: "Structured migration with minimal disruption and clear post-migration model.",
  },
  {
    icon: "📊",
    title: "Observability & Performance",
    desc: "Cross-environment monitoring, anomaly detection, and operational insight.",
  },
  {
    icon: "⚖️",
    title: "Governance & Compliance",
    desc: "Policy guardrails, access controls, audit trails, compliance-readiness.",
  },
  {
    icon: "🔧",
    title: "Platform Engineering",
    desc: "Internal developer platform enablement, toolchain integration, automation.",
  },
];

export const INSIGHT_CARDS: InsightCard[] = [
  {
    type: "Guide",
    title: "Hybrid Workload Placement Framework",
    desc: "Decision criteria for assigning workloads across private, cloud, and AI compute.",
    tags: "Hybrid Cloud · Architecture",
    cta: "Read",
  },
  {
    type: "Checklist",
    title: "AI Infrastructure Readiness Assessment",
    desc: "Evaluate your environment readiness for production AI workloads.",
    tags: "AI Infrastructure · GPU",
    cta: "Download",
  },
  {
    type: "Architecture Brief",
    title: "Governance for Regulated Environments",
    desc: "Practical framework for data placement, access governance, and audit readiness.",
    tags: "Governance · Compliance",
    cta: "Read",
  },
];
