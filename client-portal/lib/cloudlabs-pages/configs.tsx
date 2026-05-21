import {
  AlertTriangle,
  Award,
  BarChart,
  Bell,
  BookOpen,
  Box,
  CheckSquare,
  Clock,
  Copy,
  Cpu,
  DollarSign,
  Eye,
  FileText,
  Globe,
  HardDrive,
  Headphones,
  Key,
  Layout,
  Lock,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Trash2,
  TrendingUp,
  User,
  Users,
  Wifi,
  Zap,
} from "lucide-react";
import type { IndustryUseCase, ProductPageTemplateProps } from "@/lib/product-pages/types";

const CL_INDUSTRY: IndustryUseCase[] = [
  {
    title: "EdTech",
    description:
      "Deliver cohort labs, LMS launches, and assessment environments with repeatable templates and completion telemetry.",
  },
  {
    title: "AI startups",
    description:
      "Spin up GPU sandboxes, RAG pilots, and investor-ready demos without touching production stacks or shared tenants.",
  },
  {
    title: "BPO / KPO",
    description:
      "Provision agent training labs, UAT pods, and client pilots under strict tenancy, time windows, and audit trails.",
  },
  {
    title: "Manufacturing",
    description:
      "Run IIoT pilots, ERP sandboxes, and plant rollout labs with controlled access, snapshots, and cost guardrails.",
  },
];

const baseCloudLabs = (
  rest: Omit<ProductPageTemplateProps, "eyebrow" | "industryCards">
): ProductPageTemplateProps => ({
  eyebrow: "CLOUDLABS",
  industryCards: CL_INDUSTRY,
  ...rest,
});

export const handsOnLabsConfig = baseCloudLabs({
  title: "Hands-On Labs",
  subtitle:
    "Pre-configured technical lab environments for cloud, DevOps, Kubernetes, AI/ML, and development training — delivered consistently across every cohort.",
  positioningParagraphs: [
    "Racko Hands-On Labs give technical training teams pre-configured, repeatable lab environments that are ready before cohorts start. No setup time, no inconsistency between learner environments, no trainer troubleshooting mid-session.",
    "Built for SpringPeople, edForce, and technical training providers who deliver cloud, DevOps, Kubernetes, data engineering, AI/ML, and full-stack development programs to enterprise cohorts.",
  ],
  specs: [
    "Pre-configured lab templates",
    "Fast provisioning before cohorts",
    "Consistent learner environments",
    "Snapshot-based lab reset",
    "Lab health monitoring",
    "Usage and completion reporting",
    "Auto-cleanup post-cohort",
    "24/7 lab support",
  ],
  bestFitChips: [
    "Cloud Training",
    "DevOps Labs",
    "Kubernetes Labs",
    "AI/ML Training",
    "Data Engineering",
    "Full-Stack Development",
    "Enterprise Cohorts",
    "Certification Programs",
  ],
  features: [
    {
      Icon: Clock,
      title: "Fast Provisioning",
      description: "Labs ready before cohorts start — no manual setup or waiting.",
    },
    {
      Icon: RefreshCw,
      title: "Snapshot Reset",
      description: "Reset lab environments to clean state between sessions instantly.",
    },
    {
      Icon: Layout,
      title: "Consistent Environments",
      description: "Every learner gets the same environment — no configuration drift.",
    },
    {
      Icon: BarChart,
      title: "Completion Reporting",
      description: "Track lab completion rates and learner progress across cohorts.",
    },
    {
      Icon: Trash2,
      title: "Auto-Cleanup",
      description: "Environments auto-clean after cohort completion — no waste.",
    },
    {
      Icon: Headphones,
      title: "Lab Support",
      description: "Racko team handles lab issues so trainers focus on delivery.",
    },
  ],
  deployCtaProductName: "Hands-On Labs",
});

export const sandboxesConfig = baseCloudLabs({
  title: "Cloud Sandboxes",
  subtitle:
    "Isolated cloud environments for experimentation, testing, and exploration — with cost guardrails and auto-cleanup built in.",
  positioningParagraphs: [
    "Racko Cloud Sandboxes give development teams, AI researchers, and enterprise buyers isolated environments to experiment, test, and explore — without risk of impacting production workloads or accumulating uncontrolled cloud spend.",
    "Every sandbox comes with time-boxing, cost guardrails, usage dashboards, and auto-cleanup — so teams get the freedom to explore without the chaos of environment sprawl.",
  ],
  specs: [
    "Isolated sandbox environment",
    "Time-boxed access windows",
    "Cost guardrails per sandbox",
    "Auto-cleanup on expiry",
    "Usage and spend dashboards",
    "Self-provisioning capability",
    "Snapshot and restore support",
    "24/7 support",
  ],
  bestFitChips: [
    "AI Experimentation",
    "Developer Testing",
    "Feature Development",
    "Client Demos",
    "Technology Evaluation",
    "Proof of Concept",
    "Security Testing",
    "Architecture Validation",
  ],
  features: [
    {
      Icon: Box,
      title: "Full Isolation",
      description: "Sandboxes are fully isolated — experiment freely without production risk.",
    },
    {
      Icon: Clock,
      title: "Time-Boxed",
      description: "Set access duration — sandboxes expire and clean up automatically.",
    },
    {
      Icon: DollarSign,
      title: "Cost Guardrails",
      description: "Spend limits enforced per sandbox — no surprise cloud bills.",
    },
    {
      Icon: Trash2,
      title: "Auto-Cleanup",
      description: "Environments are cleaned up on expiry — zero environment sprawl.",
    },
    {
      Icon: User,
      title: "Self-Provisioning",
      description: "Teams provision their own sandboxes from approved templates.",
    },
    {
      Icon: BarChart,
      title: "Usage Visibility",
      description: "Real-time dashboards showing who's using what and at what cost.",
    },
  ],
  deployCtaProductName: "cloud sandboxes",
});

export const workspacesConfig = baseCloudLabs({
  title: "Self-Provisioned Workspaces",
  subtitle:
    "Developer and learner workspaces that teams can provision themselves from pre-approved templates — no IT ticket required.",
  positioningParagraphs: [
    "Racko Self-Provisioned Workspaces give developers, data scientists, and learners the ability to launch their own governed cloud environment — from a curated library of approved templates — without raising an IT support ticket.",
    "Administrators define what's available. Users pick what they need. Racko handles provisioning, lifecycle, cost guardrails, and cleanup. The result: faster productivity, less IT overhead, and full governance.",
  ],
  specs: [
    "Self-service provisioning from templates",
    "SSO / RBAC access model",
    "Cost guardrails per workspace",
    "Time-boxed access",
    "Auto-cleanup on expiry",
    "Admin dashboard and controls",
    "Usage and spend visibility",
    "Template library management",
  ],
  bestFitChips: [
    "Developer Workspaces",
    "Data Science Environments",
    "AI Experiment Workspaces",
    "Learner Environments",
    "Remote Teams",
    "Enterprise Developer Platforms",
  ],
  features: [
    {
      Icon: User,
      title: "Self-Service",
      description: "Users provision their own workspace from approved templates — no tickets.",
    },
    {
      Icon: Lock,
      title: "Governed Access",
      description: "SSO and RBAC ensure only authorized users access approved environments.",
    },
    {
      Icon: DollarSign,
      title: "Cost Guardrails",
      description: "Spend limits per workspace prevent uncontrolled cloud consumption.",
    },
    {
      Icon: Layout,
      title: "Template Library",
      description: "Admins define and curate the template library — users choose from approved options.",
    },
    {
      Icon: Trash2,
      title: "Auto-Cleanup",
      description: "Workspaces expire and clean up automatically based on set duration.",
    },
    {
      Icon: BarChart,
      title: "Admin Dashboard",
      description: "Full visibility into all active workspaces, usage, and spend.",
    },
  ],
  deployCtaProductName: "self-provisioned workspaces",
});

export const demosConfig = baseCloudLabs({
  title: "Demo / POC Environments",
  subtitle:
    "Customer-ready demo and proof-of-concept environments launched in minutes — with time-boxing, access controls, and auto-cleanup.",
  positioningParagraphs: [
    "Racko Demo and POC Environments let sales and presales teams launch live product demonstrations and proof-of-concept deployments for customers — fast, consistently, and without involving the engineering team every time.",
    "Each demo environment is isolated, time-boxed, and access-controlled. Share a link with your customer, run the demo, and the environment cleans itself up when the session ends.",
  ],
  specs: [
    "Fast demo environment launch",
    "Customer access link sharing",
    "Time-boxed session access",
    "Isolated per-customer environment",
    "Auto-cleanup post-demo",
    "Template-based consistency",
    "Usage tracking and reporting",
    "Managed support during demos",
  ],
  bestFitChips: [
    "Product Demonstrations",
    "Customer Pilots",
    "Enterprise POCs",
    "Sales Engineering",
    "Presales Teams",
    "Partner Enablement",
    "Technology Evaluation",
    "RFP Support",
  ],
  features: [
    {
      Icon: Zap,
      title: "Fast Launch",
      description: "Demo environments ready in minutes from pre-configured templates.",
    },
    {
      Icon: Globe,
      title: "Access Link",
      description: "Share a customer-specific access link — no account creation required.",
    },
    {
      Icon: Clock,
      title: "Time-Boxed",
      description: "Sessions expire automatically — no manual cleanup needed post-demo.",
    },
    {
      Icon: Box,
      title: "Isolated",
      description: "Each customer gets their own isolated environment — no cross-contamination.",
    },
    {
      Icon: Layout,
      title: "Consistent",
      description: "Template-based environments ensure every demo runs the same way.",
    },
    {
      Icon: BarChart,
      title: "Usage Tracking",
      description: "Track which demos ran, for how long, and what was accessed.",
    },
  ],
  deployCtaProductName: "demo environments",
});

export const eventsConfig = baseCloudLabs({
  title: "Event & Hackathon Environments",
  subtitle:
    "Scalable event infrastructure for hackathons, bootcamps, and tech events — team sandboxes, usage reporting, and managed support.",
  positioningParagraphs: [
    "Racko Event Environments give hackathon organizers, bootcamp facilitators, and tech event teams the compute infrastructure to run high-participation events without the setup complexity, cost unpredictability, or post-event cleanup burden.",
    "Whether you need 50 or 500 participant environments, Racko provisions, monitors, and cleans up — so your team focuses on the event, not the infrastructure.",
  ],
  specs: [
    "Scalable to 500+ participant environments",
    "Team and individual sandbox models",
    "Event-specific access window",
    "GPU-ready environments available",
    "Usage and participation reporting",
    "Auto-cleanup post-event",
    "Managed support during event",
    "Template-based consistency",
  ],
  bestFitChips: [
    "Hackathons",
    "Tech Bootcamps",
    "Developer Events",
    "AI Challenges",
    "Cloud Competitions",
    "Training Events",
    "University Programs",
    "Community Tech Events",
  ],
  features: [
    {
      Icon: Users,
      title: "Scalable",
      description: "Provision 50 to 500+ participant environments from one event template.",
    },
    {
      Icon: Clock,
      title: "Event Windows",
      description: "Set event duration — all environments launch and expire together.",
    },
    {
      Icon: Cpu,
      title: "GPU-Ready",
      description: "GPU-backed environments available for AI and ML hackathon events.",
    },
    {
      Icon: BarChart,
      title: "Participation Reports",
      description: "Track participation, environment usage, and activity across the event.",
    },
    {
      Icon: Trash2,
      title: "Post-Event Cleanup",
      description: "All environments automatically cleaned up when the event ends.",
    },
    {
      Icon: Headphones,
      title: "Event Support",
      description: "Racko team on standby during your event for any environment issues.",
    },
  ],
  deployCtaProductName: "event environments",
});

export const lmsConfig = baseCloudLabs({
  title: "LMS Integration",
  subtitle:
    "Connect CloudLabs directly with your LMS — launch labs from within your learning platform with SSO and session tracking.",
  positioningParagraphs: [
    "Racko CloudLabs LMS Integration lets EdTech platforms and training providers embed cloud lab access directly inside their LMS — so learners click a button in the course and their lab environment launches instantly, no separate login or portal required.",
    "Built for Moodle, Canvas, TalentLMS, and custom LMS platforms. SSO ensures seamless authentication. Session tracking feeds completion data back into your LMS grade book and reporting dashboards.",
  ],
  specs: [
    "LMS-embedded lab launch",
    "SSO authentication (SAML / OAuth)",
    "Session tracking and completion reporting",
    "Grade book integration",
    "Per-learner environment isolation",
    "Automated provisioning on course start",
    "Usage and cost reporting",
    "Supports Moodle, Canvas, TalentLMS, custom LMS",
  ],
  bestFitChips: [
    "EdTech Platforms",
    "Technical Training Providers",
    "Enterprise L&D Teams",
    "Certification Programs",
    "University Programs",
    "Corporate Training Academies",
  ],
  features: [
    {
      Icon: BookOpen,
      title: "Embedded Launch",
      description: "Labs launch from within the LMS — no separate portal or login.",
    },
    {
      Icon: Lock,
      title: "SSO Authentication",
      description: "SAML and OAuth support for seamless single sign-on.",
    },
    {
      Icon: CheckSquare,
      title: "Completion Tracking",
      description: "Lab completion data feeds back into LMS grade book automatically.",
    },
    {
      Icon: User,
      title: "Per-Learner Isolation",
      description: "Each learner gets their own isolated environment — no sharing.",
    },
    {
      Icon: RefreshCw,
      title: "Auto-Provisioning",
      description: "Environments provision automatically when a learner starts the course module.",
    },
    {
      Icon: BarChart,
      title: "Usage Reporting",
      description: "Detailed usage and completion reports for course administrators.",
    },
  ],
  deployCtaProductName: "LMS-integrated labs",
});

export const assessmentConfig = baseCloudLabs({
  title: "Skill Validation & Assessment",
  subtitle:
    "Track learner progress, capture environment outputs, and generate assessment reports for certification and skill validation programs.",
  positioningParagraphs: [
    "Racko CloudLabs Assessment environments go beyond just giving learners a cloud environment — they capture what learners do inside it. Commands run, services deployed, configurations applied, and outputs generated are logged and reported for skill validation.",
    "Built for training providers and L&D teams that need to demonstrate learner competency to enterprise clients, certification bodies, or internal HR stakeholders.",
  ],
  specs: [
    "Environment output capture",
    "Command and activity logging",
    "Assessment report generation",
    "Skill validation scoring",
    "Certification-ready evidence",
    "LMS grade book integration",
    "Per-learner progress tracking",
    "Cohort-level reporting",
  ],
  bestFitChips: [
    "Certification Programs",
    "Enterprise L&D",
    "Skills Assessment",
    "Hire-Train-Deploy Programs",
    "Technical Competency Validation",
    "EdTech Providers",
    "Corporate Training",
  ],
  features: [
    {
      Icon: CheckSquare,
      title: "Output Capture",
      description: "Capture environment outputs as evidence of learner task completion.",
    },
    {
      Icon: BarChart,
      title: "Assessment Reports",
      description: "Generate per-learner and cohort-level assessment reports automatically.",
    },
    {
      Icon: Award,
      title: "Certification Evidence",
      description: "Certification-ready evidence packages for learner credentialing.",
    },
    {
      Icon: Eye,
      title: "Activity Logging",
      description: "Log commands, deployments, and configuration changes inside each environment.",
    },
    {
      Icon: Users,
      title: "Cohort Reporting",
      description: "Aggregate skill scores and completion data across entire training cohorts.",
    },
    {
      Icon: BookOpen,
      title: "LMS Integration",
      description: "Push assessment results directly into LMS grade book and dashboards.",
    },
  ],
  deployCtaProductName: "assessment environments",
});

export const portalConfig = baseCloudLabs({
  title: "Cloud Portal",
  subtitle:
    "A unified portal for launching, monitoring, and managing all CloudLabs environments — with usage dashboards and cost visibility.",
  positioningParagraphs: [
    "The Racko CloudLabs Portal is the central control plane for all your cloud lab environments. Launch new environments, monitor active sessions, review usage and cost, and manage lifecycle — all from one dashboard.",
    "Built for administrators, training managers, and IT teams who need full visibility and control over their cloud environment estate — without building custom tooling.",
  ],
  specs: [
    "Unified environment dashboard",
    "Launch and manage environments",
    "Usage and cost monitoring",
    "Active session visibility",
    "Lifecycle management",
    "Role-based admin access",
    "Template library management",
    "Reporting and export",
  ],
  bestFitChips: [
    "Training Operations",
    "IT Administration",
    "FinOps Visibility",
    "Program Managers",
    "L&D Leadership",
    "Compliance Teams",
  ],
  features: [
    {
      Icon: Layout,
      title: "Unified Dashboard",
      description: "All active environments visible in one control plane.",
    },
    {
      Icon: BarChart,
      title: "Usage & Cost",
      description: "Real-time usage and cost data per environment, team, and period.",
    },
    {
      Icon: Eye,
      title: "Session Visibility",
      description: "See who is in which environment and what they're doing.",
    },
    {
      Icon: Settings,
      title: "Lifecycle Management",
      description: "Extend, terminate, or reset environments from the portal.",
    },
    {
      Icon: Lock,
      title: "RBAC Access",
      description: "Role-based access control — admins see everything, users see their own.",
    },
    {
      Icon: FileText,
      title: "Reports & Export",
      description: "Generate and export usage, cost, and activity reports.",
    },
  ],
  deployCtaProductName: "your CloudLabs portal",
});

export const dashboardsConfig = baseCloudLabs({
  title: "Usage, Cost & Analytics Dashboards",
  subtitle:
    "Real-time visibility into environment usage, resource consumption, cost attribution, and idle resource detection.",
  positioningParagraphs: [
    "Racko CloudLabs Dashboards give administrators and finance teams real-time visibility into cloud environment consumption — which teams are using what, at what cost, for how long, and what's sitting idle.",
    "Built for organizations that need cloud cost governance without complexity — clear numbers, actionable insights, and no surprise bills.",
  ],
  specs: [
    "Real-time usage monitoring",
    "Per-environment cost attribution",
    "Idle resource detection",
    "Team and cohort level reporting",
    "Cost trend analysis",
    "Budget and spend alerts",
    "Report export and sharing",
    "Historical usage data",
  ],
  bestFitChips: [
    "FinOps Teams",
    "Training Operations",
    "IT Finance",
    "Program Managers",
    "Compliance",
    "Executive Reporting",
  ],
  features: [
    {
      Icon: BarChart,
      title: "Real-Time Usage",
      description: "Live dashboards showing active environments and resource consumption.",
    },
    {
      Icon: DollarSign,
      title: "Cost Attribution",
      description: "Attribute cloud costs per environment, team, cohort, or project.",
    },
    {
      Icon: AlertTriangle,
      title: "Idle Detection",
      description: "Automatically flag idle or abandoned environments for cleanup.",
    },
    {
      Icon: TrendingUp,
      title: "Trend Analysis",
      description: "Track cost and usage trends over time to optimize spend.",
    },
    {
      Icon: Bell,
      title: "Spend Alerts",
      description: "Set budget thresholds — get alerts before overspend happens.",
    },
    {
      Icon: FileText,
      title: "Report Export",
      description: "Export usage and cost reports for finance, management, and auditing.",
    },
  ],
  deployCtaProductName: "usage & cost dashboards",
});

export const templatesConfig = baseCloudLabs({
  title: "Lab Templates & Environment Blueprints",
  subtitle:
    "Reusable, pre-validated environment templates for consistent lab delivery — reducing setup time and trainer overhead.",
  positioningParagraphs: [
    "Racko Lab Templates let training teams define an environment once and reuse it across every cohort — same configuration, same tools, same data — every time. No manual rebuild, no configuration drift, no pre-cohort setup calls.",
    "Templates are version-controlled, validated by Racko before deployment, and available for instant provisioning from the CloudLabs portal or LMS integration.",
  ],
  specs: [
    "Pre-configured template library",
    "Version-controlled templates",
    "Racko-validated before deployment",
    "Instant provisioning from template",
    "Custom template creation support",
    "Technology-specific blueprints",
    "OS, software, and data pre-loaded",
    "Template cloning and forking",
  ],
  bestFitChips: [
    "Training Providers",
    "Bootcamps",
    "Enterprise L&D",
    "Certification Programs",
    "OEM Labs",
    "Partner Enablement",
  ],
  features: [
    {
      Icon: Layout,
      title: "Template Library",
      description: "Curated library of pre-validated templates for common lab types.",
    },
    {
      Icon: RefreshCw,
      title: "Version Control",
      description: "Templates are versioned — roll back or update across all users.",
    },
    {
      Icon: Zap,
      title: "Instant Provisioning",
      description: "Launch from template in minutes — no manual configuration.",
    },
    {
      Icon: Copy,
      title: "Clone & Fork",
      description: "Clone existing templates and modify for new use cases quickly.",
    },
    {
      Icon: Shield,
      title: "Racko-Validated",
      description: "All templates validated by Racko before they're made available.",
    },
    {
      Icon: Settings,
      title: "Custom Templates",
      description: "Work with Racko to create custom blueprints for your specific program.",
    },
  ],
  deployCtaProductName: "lab templates",
});

export const subscriptionsConfig = baseCloudLabs({
  title: "Cloud Subscriptions & Cloud Server Licences",
  subtitle:
    "Managed cloud server subscriptions and software licences for training cohorts — with access control, billing visibility, and lifecycle management.",
  positioningParagraphs: [
    "Racko Cloud Subscriptions and Cloud Server Licences give training providers and enterprise L&D teams a clean, manageable way to provision cloud access for learners — by cohort, by duration, and by program — with full visibility into cost and usage.",
    "No more managing individual cloud accounts. No surprise overages. No manual provisioning. Racko manages the subscription layer so you focus on program delivery.",
  ],
  specs: [
    "Per-cohort subscription management",
    "Cloud server licence provisioning",
    "Access control per learner or team",
    "Usage and cost visibility",
    "Billing consolidation",
    "Lifecycle management by cohort",
    "Auto-expiry on program end",
    "Support and reporting included",
  ],
  bestFitChips: [
    "Training Cohorts",
    "Enterprise L&D",
    "EdTech Providers",
    "Certification Programs",
    "Partner Resellers",
    "Finance Teams",
  ],
  features: [
    {
      Icon: Key,
      title: "Licence Management",
      description: "Provision and manage cloud server licences by cohort and program.",
    },
    {
      Icon: Users,
      title: "Cohort Access",
      description: "Grant and revoke access by cohort — no manual account management.",
    },
    {
      Icon: DollarSign,
      title: "Billing Visibility",
      description: "Clear cost visibility per subscription, cohort, and period.",
    },
    {
      Icon: Clock,
      title: "Auto-Expiry",
      description: "Subscriptions and licences expire when the program ends — no waste.",
    },
    {
      Icon: BarChart,
      title: "Usage Reporting",
      description: "Detailed usage reports by learner and cohort for billing and audit.",
    },
    {
      Icon: Headphones,
      title: "Managed Support",
      description: "Racko handles subscription administration and support queries.",
    },
  ],
  deployCtaProductName: "cloud subscriptions & licences",
});

export const bareMetalLabsConfig = baseCloudLabs({
  title: "Bare Metal / Dedicated Lab Servers",
  subtitle:
    "High-performance dedicated lab environments for intensive workloads — Kubernetes, databases, GPU labs, and DevOps pipelines.",
  positioningParagraphs: [
    "Some lab workloads need more than VPS compute. Racko Bare Metal Lab Servers give technical training providers dedicated physical hardware for labs that need raw performance — Kubernetes clusters, production database labs, GPU-backed AI/ML environments, and intensive DevOps pipeline labs.",
    "No virtualization overhead, no shared resources. Each cohort or lab session gets dedicated hardware with snapshot-based reset between sessions.",
  ],
  specs: [
    "Dedicated physical lab hardware",
    "No virtualization overhead",
    "NVMe / SSD storage options",
    "GPU-backed options available",
    "Snapshot-based environment reset",
    "Pre-configured lab images",
    "High-bandwidth network connectivity",
    "Managed provisioning and support",
  ],
  bestFitChips: [
    "Kubernetes Training",
    "Database Labs",
    "GPU AI/ML Labs",
    "DevOps Pipeline Labs",
    "High-Performance Computing",
    "Network Engineering Labs",
    "Security Training Labs",
  ],
  features: [
    {
      Icon: Server,
      title: "Dedicated Hardware",
      description: "Physical bare metal servers — no virtualization overhead, no sharing.",
    },
    {
      Icon: Cpu,
      title: "GPU-Backed Options",
      description: "GPU-backed bare metal available for AI, ML, and accelerated compute labs.",
    },
    {
      Icon: HardDrive,
      title: "NVMe Performance",
      description: "NVMe storage for fast lab environment load and data access.",
    },
    {
      Icon: RefreshCw,
      title: "Snapshot Reset",
      description: "Reset lab hardware to clean state between cohorts using snapshots.",
    },
    {
      Icon: Layout,
      title: "Pre-Configured Images",
      description: "Lab-specific OS images and software pre-loaded for instant use.",
    },
    {
      Icon: Wifi,
      title: "High Bandwidth",
      description: "High-bandwidth connectivity for labs that involve large data transfers.",
    },
  ],
  deployCtaProductName: "bare metal lab servers",
});

export const CLOUDLABS_PAGE_SLUGS = [
  "hands-on-labs",
  "sandboxes",
  "workspaces",
  "demos",
  "events",
  "lms",
  "assessment",
  "portal",
  "dashboards",
  "templates",
  "subscriptions",
  "bare-metal-labs",
] as const;

export type CloudLabsPageSlug = (typeof CLOUDLABS_PAGE_SLUGS)[number];

/** Browser tab titles for CloudLabs environment pages */
export const CLOUDLABS_SEO_TITLES: Record<CloudLabsPageSlug, string> = {
  "hands-on-labs": "Hands-On Cloud Labs — Racko CloudLabs",
  sandboxes: "Cloud Sandboxes — Racko CloudLabs",
  workspaces: "Self-Provisioned Workspaces — Racko CloudLabs",
  demos: "Demo & POC Environments — Racko CloudLabs",
  events: "Event & Hackathon Environments — Racko CloudLabs",
  lms: "LMS Integration — Racko CloudLabs",
  assessment: "Skill Validation & Assessment — Racko CloudLabs",
  portal: "CloudLabs Portal — Racko CloudLabs",
  dashboards: "Usage & Cost Dashboards — Racko CloudLabs",
  templates: "Lab Templates & Environment Blueprints — Racko CloudLabs",
  subscriptions: "Cloud Subscriptions & Licences — Racko CloudLabs",
  "bare-metal-labs": "Bare Metal Lab Servers — Racko CloudLabs",
};

export const CLOUDLABS_PAGE_CONFIG_MAP: Record<CloudLabsPageSlug, ProductPageTemplateProps> = {
  "hands-on-labs": handsOnLabsConfig,
  sandboxes: sandboxesConfig,
  workspaces: workspacesConfig,
  demos: demosConfig,
  events: eventsConfig,
  lms: lmsConfig,
  assessment: assessmentConfig,
  portal: portalConfig,
  dashboards: dashboardsConfig,
  templates: templatesConfig,
  subscriptions: subscriptionsConfig,
  "bare-metal-labs": bareMetalLabsConfig,
};

export function isCloudLabsSlug(slug: string): slug is CloudLabsPageSlug {
  return Object.prototype.hasOwnProperty.call(CLOUDLABS_PAGE_CONFIG_MAP, slug);
}
