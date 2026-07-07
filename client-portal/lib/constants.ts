import type { InsightCard, NavItem, SolutionCard } from "@/types";

export const NAV_LINKS: NavItem[] = [
  { label: "Products", href: "/products", hasDropdown: false },
  { label: "Solutions", href: "/solutions", hasDropdown: false },
  { label: "Industries", href: "/industries", hasDropdown: true },
  { label: "Platform", href: "/platform", hasDropdown: false },
  { label: "Resources", href: "/resources", hasDropdown: false },
  { label: "Company", href: "/company", hasDropdown: true },
];

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
