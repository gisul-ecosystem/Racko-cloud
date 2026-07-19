import {
  Archive,
  Copy,
  Cpu,
  Database,
  DollarSign,
  Eye,
  Globe,
  HardDrive,
  Headphones,
  Lock,
  Mail,
  MapPin,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Terminal,
  TrendingDown,
  TrendingUp,
  Users,
  Wifi,
  Zap,
} from "lucide-react";
import type { ProductPageTemplateProps } from "./types";

const industry = (
  ed: string,
  ai: string,
  bpo: string,
  mfg: string
): ProductPageTemplateProps["industryCards"] => [
  { title: "EdTech", description: ed },
  { title: "AI startups", description: ai },
  { title: "BPO / KPO", description: bpo },
  { title: "Manufacturing", description: mfg },
];

export const vpsProductConfig: ProductPageTemplateProps = {
  eyebrow: "VPS",
  title: "Virtual Private Server",
  subtitle:
    "Cost-efficient isolated compute with root access, SSD/NVMe storage, and flexible scaling — built for applications, portals, dev/test, and business workloads.",
  positioningParagraphs: [
    "Racko VPS gives you dedicated resources in a virtualized environment — isolated from other users, with root access and the flexibility to configure your stack exactly as needed. Unlike shared hosting, your resources are guaranteed. Unlike bare-metal, you get the flexibility to scale.",
    "Ideal for teams that need a reliable, cost-predictable compute environment for apps, internal tools, staging environments, dashboards, or client portals — without the overhead of a dedicated server.",
  ],
  specs: [
    "Isolated vCPU and RAM resources",
    "SSD / NVMe-backed storage",
    "Root / administrator access",
    "Linux and Windows OS options",
    "1 Gbps network connectivity",
    "DDoS protection",
    "Snapshot and backup capability",
    "99.95% uptime SLA",
    "24/7 support",
  ],
  bestFitChips: [
    "Business Applications",
    "Dev / Test Environments",
    "Client Portals",
    "Internal Tools",
    "Dashboards",
    "Staging Environments",
    "Lightweight SaaS",
    "CMS Platforms",
  ],
  features: [
    {
      Icon: Zap,
      title: "NVMe Performance",
      description: "High-speed NVMe storage delivers fast read/write for app and database workloads.",
    },
    {
      Icon: Shield,
      title: "Isolated Resources",
      description: "Your vCPU and RAM are dedicated — no noisy-neighbour performance risk.",
    },
    {
      Icon: Terminal,
      title: "Full Root Access",
      description: "Complete control over your server environment, OS, and software stack.",
    },
    {
      Icon: RefreshCw,
      title: "Snapshot & Backup",
      description: "Point-in-time snapshots and backup capability for data protection.",
    },
    {
      Icon: Wifi,
      title: "DDoS Protection",
      description: "Network-level DDoS protection included to keep your workloads online.",
    },
    {
      Icon: Headphones,
      title: "24/7 Support",
      description: "Expert support team available round the clock for any issue.",
    },
  ],
  industryCards: industry(
    "Host LMS shells, assessment portals, and cohort lab gateways on predictable VPS economics.",
    "Run admin consoles, billing services, and early-stage APIs before moving inference to GPU tiers.",
    "Isolate campaign tools, QA sandboxes, and voice-pipeline staging without shared-hosting risk.",
    "Power plant-floor HMIs, lightweight MES bridges, and supplier portals with stable connectivity.",
  ),
  deployCtaProductName: "VPS",
};

export const cloudVpsProductConfig: ProductPageTemplateProps = {
  eyebrow: "CLOUD VPS",
  title: "Cloud VPS",
  subtitle:
    "Scalable, high-performance VPS environments combining isolated control with cloud-like resource elasticity.",
  positioningParagraphs: [
    "Racko Cloud VPS delivers the control of a VPS with the elasticity of cloud infrastructure. Powered by NVMe storage, 1 Gbps connectivity, and advanced security — Cloud VPS is built for growing applications, high-traffic portals, and LMS platforms that need both reliability and scalability.",
    "Unlike standard VPS, Racko Cloud VPS is engineered for workloads that spike — with rapid resource adjustment, automated backup capability, and DDoS/firewall protection built into the architecture.",
  ],
  specs: [
    "Scalable vCPU / RAM / Storage",
    "High-performance NVMe SSD storage",
    "Root access and custom configuration",
    "DDoS / firewall protection",
    "Automated backup capability",
    "1 Gbps network bandwidth",
    "99.95% uptime SLA",
    "Linux / Windows options",
    "24/7 expert support",
  ],
  bestFitChips: [
    "Growing Applications",
    "High-Traffic Portals",
    "LMS Platforms",
    "Scalable SaaS",
    "Analytics Tools",
    "Client Environments",
    "Resource-Intensive Apps",
    "E-commerce Platforms",
  ],
  features: [
    {
      Icon: TrendingUp,
      title: "Elastic Scaling",
      description: "Scale CPU, RAM, and storage without downtime as your workload grows.",
    },
    {
      Icon: Database,
      title: "NVMe Storage",
      description: "High-performance NVMe-backed storage for fast database and app response.",
    },
    {
      Icon: Shield,
      title: "DDoS & Firewall",
      description: "Built-in network protection to keep your application secure and online.",
    },
    {
      Icon: RefreshCw,
      title: "Automated Backup",
      description: "Scheduled backup capability to protect your data automatically.",
    },
    {
      Icon: Globe,
      title: "1 Gbps Network",
      description: "High-bandwidth connectivity for fast data transfer and low latency.",
    },
    {
      Icon: Headphones,
      title: "24/7 Support",
      description: "Round-the-clock expert support for all technical issues.",
    },
  ],
  industryCards: industry(
    "Burst through live class and exam windows with elastic Cloud VPS behind your LMS edge.",
    "Serve multi-tenant SaaS control planes and experiment sandboxes that need quick vertical scale.",
    "Stand up campaign stacks and transcription pipelines that spike during client delivery cycles.",
    "Run OEE dashboards, quality portals, and partner-facing apps with headroom for seasonal demand.",
  ),
  deployCtaProductName: "Cloud VPS",
};

export const dedicatedServerProductConfig: ProductPageTemplateProps = {
  eyebrow: "DEDICATED SERVER",
  title: "Dedicated Server",
  subtitle:
    "Dedicated hardware for workloads demanding consistent performance, full control, and predictable economics.",
  positioningParagraphs: [
    "Racko Dedicated Servers give you exclusive access to physical hardware — no virtualization overhead, no shared resources, no performance compromise. Built on enterprise-grade Intel and AMD hardware with NVMe/SSD storage options and high-bandwidth network connectivity.",
    "The right choice for production databases, ERP and MES workloads, high-traffic applications, analytics engines, and mission-critical business systems that cannot tolerate resource contention or unpredictable performance.",
  ],
  specs: [
    "100% dedicated physical hardware",
    "Intel Xeon / AMD EPYC processor options",
    "NVMe / SSD storage configurations",
    "Up to 10 Gbps network connectivity",
    "Full root / IPMI access",
    "Custom OS and software stack",
    "Hardware-level security",
    "Managed support options",
    "99.95% uptime SLA",
  ],
  bestFitChips: [
    "Production Databases",
    "ERP / MES Systems",
    "Analytics Engines",
    "High-Traffic Applications",
    "Mission-Critical Workloads",
    "Client-Dedicated Platforms",
    "AI Model Serving",
  ],
  features: [
    {
      Icon: Server,
      title: "Bare Metal Performance",
      description: "No virtualization layer — direct access to hardware for maximum performance.",
    },
    {
      Icon: Cpu,
      title: "Enterprise Hardware",
      description: "Intel Xeon and AMD EPYC processors with ECC RAM and enterprise-grade storage.",
    },
    {
      Icon: Lock,
      title: "Dedicated Security",
      description: "Physical isolation from other customers — no shared attack surface.",
    },
    {
      Icon: HardDrive,
      title: "NVMe / SSD Options",
      description: "Choose NVMe or SSD storage configurations for your workload requirements.",
    },
    {
      Icon: Wifi,
      title: "High Bandwidth",
      description: "Up to 10 Gbps network connectivity for data-intensive applications.",
    },
    {
      Icon: Settings,
      title: "Custom Configuration",
      description: "Full control over hardware configuration, OS, and software stack.",
    },
  ],
  industryCards: industry(
    "Anchor certification databases and proctoring storage on servers with deterministic performance.",
    "Host model registries, feature stores, and high-throughput training orchestrators without noisy neighbours.",
    "Run dialer metadata stores, recording vaults, and QA environments with dedicated NIC headroom.",
    "Drive historian databases, SCADA aggregators, and plant analytics without shared CPU jitter.",
  ),
  deployCtaProductName: "Dedicated Server",
};

export const dedicatedCloudProductConfig: ProductPageTemplateProps = {
  eyebrow: "HA DEDICATED CLOUD",
  title: "HA Dedicated Cloud",
  subtitle:
    "High-availability dedicated cloud infrastructure for mission-critical workloads that need dedicated resources, redundancy, and enterprise-grade reliability.",
  positioningParagraphs: [
    "Racko HA Dedicated Cloud delivers 100% dedicated cloud infrastructure — no shared compute, no shared storage, no noisy neighbours. Built with NVMe storage, high-availability architecture, and redundancy/failover design for workloads that cannot afford unplanned downtime.",
    "Designed for production applications, healthcare systems, BPO client platforms, financial applications, and any workload where availability, isolation, and performance are non-negotiable.",
  ],
  specs: [
    "100% dedicated resources (no sharing)",
    "NVMe SSD storage",
    "High-availability architecture",
    "Redundancy and failover design",
    "Scalable infrastructure",
    "Advanced security controls",
    "24/7 monitoring and support",
    "99.99% uptime target",
    "Managed operations available",
  ],
  bestFitChips: [
    "Production Applications",
    "Healthcare Systems",
    "BPO Client Platforms",
    "Financial Applications",
    "AI Product Backends",
    "Critical Portals",
    "Manufacturing Plant Systems",
  ],
  features: [
    {
      Icon: Shield,
      title: "100% Dedicated Resources",
      description: "No shared compute or storage — fully isolated dedicated cloud environment.",
    },
    {
      Icon: RefreshCw,
      title: "HA Architecture",
      description: "Redundancy and failover built into the infrastructure design.",
    },
    {
      Icon: HardDrive,
      title: "NVMe Storage",
      description: "Enterprise NVMe storage for high-performance, low-latency workloads.",
    },
    {
      Icon: TrendingUp,
      title: "Scalable",
      description: "Scale your dedicated cloud infrastructure as workload demands grow.",
    },
    {
      Icon: Lock,
      title: "Advanced Security",
      description: "Multi-layer security controls and access governance built in.",
    },
    {
      Icon: Headphones,
      title: "Managed Operations",
      description: "Optional managed operations layer — monitoring, governance, and lifecycle support.",
    },
  ],
  industryCards: industry(
    "Keep student information systems and exam engines on HA clusters with predictable failover paths.",
    "Protect inference gateways and billing services with dedicated nodes and synchronous replication tiers.",
    "Meet contractual SLAs for client pods with isolated HA pairs and audited change windows.",
    "Support OT/IT convergence apps that cannot drop sessions during shift changes or batch peaks.",
  ),
  deployCtaProductName: "HA Dedicated Cloud",
};

export const privateCloudProductConfig: ProductPageTemplateProps = {
  eyebrow: "PRIVATE CLOUD",
  title: "Private Cloud",
  subtitle:
    "Controlled cloud environments for sensitive, regulated, or client-dedicated workloads with full isolation and governance.",
  positioningParagraphs: [
    "Racko Private Cloud gives organizations a dedicated, isolated cloud environment — fully separated from shared public cloud infrastructure. Built for workloads that require data sovereignty, compliance-ready access controls, and private workload isolation inside Indian jurisdiction.",
    "The right model for healthcare data, BPO client pods, manufacturing production data, enterprise apps, and any workload where data cannot reside on shared multi-tenant infrastructure.",
  ],
  specs: [
    "Private workload isolation",
    "Data sovereignty inside India",
    "Access governance and RBAC",
    "Dedicated resource model",
    "Backup / DR integration",
    "Compliance-ready architecture",
    "Managed lifecycle support",
    "Security audit trail",
    "24/7 support",
  ],
  bestFitChips: [
    "Healthcare Data",
    "BPO Client Pods",
    "Manufacturing Production Data",
    "Enterprise Applications",
    "Regulated Workloads",
    "Dedicated Customer Environments",
    "Financial Data",
  ],
  features: [
    {
      Icon: Lock,
      title: "Full Isolation",
      description: "Your workloads run in a fully private environment — completely separated from other users.",
    },
    {
      Icon: MapPin,
      title: "India Data Sovereignty",
      description: "Data stays inside Indian jurisdiction — Mumbai, Noida, or Chennai data centres.",
    },
    {
      Icon: Users,
      title: "Access Governance",
      description: "Role-based access control and audit trails for every environment.",
    },
    {
      Icon: RefreshCw,
      title: "Backup & DR",
      description: "Integrated backup and disaster recovery for business continuity.",
    },
    {
      Icon: Shield,
      title: "Compliance-Ready",
      description: "Architecture designed to support governance and audit requirements.",
    },
    {
      Icon: Settings,
      title: "Managed Lifecycle",
      description: "Provisioning, monitoring, and lifecycle management handled end-to-end.",
    },
  ],
  industryCards: industry(
    "Host EMR interfaces, diagnostic exchanges, and consent-managed research sandboxes privately.",
    "Ring-fence model artifacts, customer data lakes, and fine-tuning jobs for enterprise AI programs.",
    "Operate multi-tenant BPO pods with strict segmentation, logging, and per-client network policies.",
    "Keep MES historians, quality labs, and supplier collaboration hubs off shared public footprints.",
  ),
  deployCtaProductName: "Private Cloud",
};

export const gpuCloudProductConfig: ProductPageTemplateProps = {
  eyebrow: "GPU CLOUD",
  title: "GPU Cloud",
  subtitle:
    "Accelerated cloud environments for AI, ML, inference, HPC, rendering, and visual inspection workloads.",
  positioningParagraphs: [
    "Racko GPU Cloud provides NVIDIA GPU-backed compute environments for teams building AI models, running inference APIs, processing video/voice analytics, executing HPC workloads, and running scientific or rendering compute.",
    "With managed lifecycle support, cost-attribution visibility, and hybrid cloud fit, Racko GPU Cloud moves AI workloads from experiment to production without the cost unpredictability of public cloud GPU instances.",
  ],
  specs: [
    "NVIDIA GPU-backed compute (V100, P1000 options)",
    "AI / ML framework support",
    "Inference-ready environments",
    "HPC and rendering support",
    "Scalable GPU capacity",
    "Hybrid cloud integration",
    "Cost-per-workload attribution",
    "Enterprise security",
    "24/7 support",
  ],
  bestFitChips: [
    "AI Model Training",
    "Inference APIs",
    "RAG / LLM Workloads",
    "HPC Compute",
    "Video / Voice Analytics",
    "Medical Imaging",
    "Predictive Maintenance",
    "Scientific Compute",
    "Rendering",
  ],
  features: [
    {
      Icon: Cpu,
      title: "NVIDIA GPU Compute",
      description: "NVIDIA V100 and P1000 GPU options for AI, ML, and accelerated workloads.",
    },
    {
      Icon: Zap,
      title: "Inference-Ready",
      description: "Pre-configured inference environments for production AI model serving.",
    },
    {
      Icon: TrendingUp,
      title: "Scalable Capacity",
      description: "Scale GPU resources up or down based on workload demand.",
    },
    {
      Icon: DollarSign,
      title: "Cost Attribution",
      description: "Workload-level cost visibility — understand your GPU spend precisely.",
    },
    {
      Icon: Shield,
      title: "Enterprise Security",
      description: "Secure GPU environments with access controls and data protection.",
    },
    {
      Icon: Settings,
      title: "Managed Lifecycle",
      description: "Provisioning, monitoring, and lifecycle management handled by Racko.",
    },
  ],
  industryCards: industry(
    "Train and assess models near learner data residency with burst-friendly GPU pools.",
    "Serve low-latency inference, embeddings, and batch scoring for product-led AI teams.",
    "Accelerate transcription, diarization, and voice-bot training pipelines for CX programs.",
    "Run vision QA, digital twin renders, and predictive maintenance models close to plants.",
  ),
  deployCtaProductName: "GPU Cloud",
};

export const s3StorageProductConfig: ProductPageTemplateProps = {
  eyebrow: "S3-COMPATIBLE STORAGE",
  title: "S3-Compatible Storage",
  subtitle:
    "Object storage for backups, media, application data, logs, datasets, and archival workloads — with full S3 API compatibility.",
  positioningParagraphs: [
    "Racko S3-Compatible Storage delivers scalable object storage with full Amazon S3 API compatibility — so your existing tools, SDKs, and integrations work without modification. Built for media hosting, application data, healthcare diagnostics files, AI datasets, and backup targets.",
    "With lifecycle policies, encryption, access controls, and asynchronous replication, Racko S3 Storage provides enterprise-grade object storage inside Indian data centres — keeping your data local and sovereign.",
  ],
  specs: [
    "Full S3 API compatibility",
    "Object locking and immutability",
    "ACL and role-based permissions",
    "Lifecycle policies",
    "Encryption at rest and in transit",
    "Asynchronous replication",
    "Version management",
    "High availability",
    "Multi-cloud interoperability",
  ],
  bestFitChips: [
    "Media Hosting",
    "Application Data",
    "Learning Assets",
    "Healthcare Diagnostics Files",
    "AI Datasets",
    "Manufacturing Data Lakes",
    "BPO Archives",
    "Backup Targets",
  ],
  features: [
    {
      Icon: Database,
      title: "S3 API Compatible",
      description: "Full Amazon S3 API compatibility — use existing tools and SDKs without changes.",
    },
    {
      Icon: Lock,
      title: "Object Locking",
      description: "Immutability and object locking to protect critical data from deletion.",
    },
    {
      Icon: RefreshCw,
      title: "Lifecycle Policies",
      description: "Automate data tiering, archival, and deletion with lifecycle rules.",
    },
    {
      Icon: Shield,
      title: "Encryption",
      description: "Encryption at rest and in transit for all stored objects.",
    },
    {
      Icon: Copy,
      title: "Replication",
      description: "Asynchronous replication for redundancy and disaster recovery readiness.",
    },
    {
      Icon: MapPin,
      title: "India Data Sovereignty",
      description: "All data stored inside Indian data centres — compliant with local data requirements.",
    },
  ],
  industryCards: industry(
    "Store lecture recordings, SCORM assets, and proctoring evidence with WORM-friendly policies.",
    "Version datasets, checkpoints, and evaluation artifacts for reproducible model development.",
    "Archive interaction logs, voice files, and QA media with geo-resident buckets per client.",
    "Centralize sensor files, batch exports, and supplier document lakes with lifecycle tiering.",
  ),
  deployCtaProductName: "S3-compatible storage",
};

export const backupStorageProductConfig: ProductPageTemplateProps = {
  eyebrow: "BACKUP STORAGE",
  title: "Backup Storage",
  subtitle:
    "Centralized backup and recovery for cloud, on-prem, hybrid, databases, and business-critical systems.",
  positioningParagraphs: [
    "Racko Backup Storage provides a centralized backup and recovery layer for all your workloads — cloud servers, on-premises systems, databases, files, endpoints, and SaaS applications. With automated schedules, retention policies, and restore readiness, backup becomes a managed outcome rather than an IT task.",
    "Built for organizations that need DR readiness, compliance-sensitive data protection, and ransomware-resilient backup architecture — without building and managing backup infrastructure themselves.",
  ],
  specs: [
    "Centralized backup management",
    "Automated backup schedules",
    "Retention policy management",
    "Encryption in transit and at rest",
    "Recovery workflow support",
    "Ransomware-resilient positioning",
    "Backup monitoring and alerting",
    "Multi-environment protection",
    "DR planning support",
  ],
  bestFitChips: [
    "Server Backups",
    "Database Backup",
    "File and Folder Backup",
    "Cloud Workloads",
    "Endpoint Backup",
    "SaaS Backup",
    "Compliance-Sensitive Data",
    "DR Readiness",
  ],
  features: [
    {
      Icon: Archive,
      title: "Automated Schedules",
      description: "Set backup schedules and let Racko handle execution and monitoring.",
    },
    {
      Icon: Shield,
      title: "Ransomware-Resilient",
      description: "Backup architecture designed to survive ransomware and data corruption events.",
    },
    {
      Icon: RefreshCw,
      title: "Restore Readiness",
      description: "Tested restore workflows so recovery happens fast when you need it.",
    },
    {
      Icon: Lock,
      title: "Encryption",
      description: "All backup data encrypted in transit and at rest for maximum protection.",
    },
    {
      Icon: Eye,
      title: "Monitoring & Alerts",
      description: "Backup health monitoring with alerts for failed or missed backup jobs.",
    },
    {
      Icon: Settings,
      title: "Multi-Environment",
      description: "Protect cloud, on-prem, hybrid, and SaaS workloads from one backup layer.",
    },
  ],
  industryCards: industry(
    "Protect registrar systems, LMS databases, and compliance archives with immutable copies.",
    "Safeguard experiment clusters, vector stores, and notebook exports with tiered retention.",
    "Meet contractual RPO/RTO for client workloads with monitored backup chains.",
    "Capture PLC exports, historian snapshots, and ERP deltas for rapid plant recovery.",
  ),
  deployCtaProductName: "Backup Storage",
};

export const webHostingProductConfig: ProductPageTemplateProps = {
  eyebrow: "WEB HOSTING",
  title: "Web Hosting / Managed Hosting",
  subtitle:
    "Secure, managed hosting for websites, business portals, CMS, WordPress, and digital experiences — with SSL, backups, and 24/7 support.",
  positioningParagraphs: [
    "Racko Web Hosting delivers secure, high-performance hosting for business websites, company portals, CMS platforms, WordPress sites, and marketing applications. Backed by NVMe/SSD performance, SSL support, automated backups, and a dedicated support team.",
    "Managed hosting means your web infrastructure is monitored, secured, and supported by Racko — so your team focuses on your website, not on server management.",
  ],
  specs: [
    "NVMe / SSD performance",
    "SSL certificate support",
    "Automated backup included",
    "WordPress / CMS compatible",
    "DDoS and security posture",
    "Control panel options",
    "Email / web panel support",
    "Migration support",
    "24/7 managed support",
  ],
  bestFitChips: [
    "Company Websites",
    "Business Portals",
    "CMS Platforms",
    "WordPress Sites",
    "Marketing Sites",
    "High-Traffic Pages",
    "SMB Websites",
    "Managed Web Workloads",
  ],
  features: [
    {
      Icon: Zap,
      title: "NVMe Performance",
      description: "Fast SSD and NVMe-backed storage for quick page load times.",
    },
    {
      Icon: Shield,
      title: "SSL & Security",
      description: "SSL certificate support and DDoS protection for secure web presence.",
    },
    {
      Icon: RefreshCw,
      title: "Automated Backup",
      description: "Daily backups included so your website data is always protected.",
    },
    {
      Icon: Globe,
      title: "CMS Compatible",
      description: "Full compatibility with WordPress, Joomla, Drupal, and other CMS platforms.",
    },
    {
      Icon: Mail,
      title: "Email & Web Panel",
      description: "Email hosting and web panel support included with managed hosting.",
    },
    {
      Icon: Headphones,
      title: "24/7 Support",
      description: "Expert support for all hosting issues — available round the clock.",
    },
  ],
  industryCards: industry(
    "Publish campus sites, enrollment portals, and alumni communities on managed stacks.",
    "Launch marketing sites, changelog portals, and docs without babysitting servers.",
    "Host client microsites, knowledge bases, and support hubs with hardened TLS defaults.",
    "Serve distributor portals, spare-parts catalogs, and service microsites with uptime SLAs.",
  ),
  deployCtaProductName: "managed web hosting",
};

export const managedOpsProductConfig: ProductPageTemplateProps = {
  eyebrow: "MANAGED CLOUD OPERATIONS",
  title: "Managed Cloud Operations",
  subtitle:
    "Day-2 cloud operations — monitoring, governance, backup, optimization, lifecycle control, and expert support for your cloud workloads.",
  positioningParagraphs: [
    "Racko Managed Cloud Operations handles everything that happens after your workload goes live — monitoring, governance enforcement, backup management, cost optimization, lifecycle automation, and escalation support. One accountable partner for your entire cloud operations layer.",
    "For organizations that want fewer internal cloud operations dependencies, cleaner ownership, and stronger operational outcomes — without expanding their internal cloud team.",
  ],
  specs: [
    "Workload provisioning support",
    "24/7 monitoring and alerting",
    "Backup and DR management",
    "Cost optimization and reporting",
    "Governance and access control",
    "Lifecycle automation",
    "Incident response and escalation",
    "Cloud readiness assessment",
    "Usage intelligence dashboards",
  ],
  bestFitChips: [
    "Production Cloud Workloads",
    "Multi-Environment Operations",
    "Teams Without Dedicated Cloud Ops",
    "Compliance-Heavy Workloads",
    "Cost Optimization Programs",
    "Lifecycle Management",
  ],
  features: [
    {
      Icon: Eye,
      title: "24/7 Monitoring",
      description: "Round-the-clock workload monitoring with alerting and incident detection.",
    },
    {
      Icon: RefreshCw,
      title: "Backup Management",
      description: "Backup scheduling, monitoring, and restore support handled by Racko.",
    },
    {
      Icon: TrendingDown,
      title: "Cost Optimization",
      description: "Continuous cost review and optimization recommendations for your cloud spend.",
    },
    {
      Icon: Shield,
      title: "Governance",
      description: "Access control, policy enforcement, and compliance-ready governance layer.",
    },
    {
      Icon: Settings,
      title: "Lifecycle Automation",
      description: "Automate provisioning, scaling, cleanup, and retirement of cloud resources.",
    },
    {
      Icon: Headphones,
      title: "Expert Support",
      description: "Dedicated support team with defined SLAs and escalation paths.",
    },
  ],
  industryCards: industry(
    "Operate term starts, exam windows, and content delivery with Racko-run monitoring playbooks.",
    "Keep inference clusters, data pipelines, and cost guardrails under one operations owner.",
    "Coordinate client cutovers, patch windows, and SLA reporting without expanding NOC headcount.",
    "Align plant systems, remote sites, and ERP integrations with unified governance tooling.",
  ),
  deployCtaProductName: "Managed Cloud Operations",
};

export const PRODUCT_PAGE_SLUGS = [
  "vps",
  "cloud-vps",
  "dedicated-server",
  "dedicated-cloud",
  "private-cloud",
  "gpu-cloud",
  "s3-storage",
  "backup-storage",
  "web-hosting",
  "managed-ops",
] as const;

export type ProductPageSlug = (typeof PRODUCT_PAGE_SLUGS)[number];

export const PRODUCT_PAGE_CONFIG_MAP: Record<ProductPageSlug, ProductPageTemplateProps> = {
  vps: vpsProductConfig,
  "cloud-vps": cloudVpsProductConfig,
  "dedicated-server": dedicatedServerProductConfig,
  "dedicated-cloud": dedicatedCloudProductConfig,
  "private-cloud": privateCloudProductConfig,
  "gpu-cloud": gpuCloudProductConfig,
  "s3-storage": s3StorageProductConfig,
  "backup-storage": backupStorageProductConfig,
  "web-hosting": webHostingProductConfig,
  "managed-ops": managedOpsProductConfig,
};
