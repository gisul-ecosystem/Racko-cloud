import type { Metadata } from "next";
import Link from "next/link";
import {
  Archive,
  Cloud,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Lock,
  Server,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react";
import BottomCTA from "@/components/sections/BottomCTA";

export const metadata: Metadata = {
  title: "Cloud Products — Racko",
  description:
    "VPS, Cloud VPS, Dedicated Server, HA Dedicated Cloud, Private Cloud, GPU Cloud, S3 Storage, Backup Storage, Web Hosting, and Managed Cloud Operations.",
};

type ProductCard = {
  num: string;
  title: string;
  description: string;
  href: string;
  Icon: LucideIcon;
};

const PRODUCTS: ProductCard[] = [
  {
    num: "01",
    title: "VPS / Virtual Private Server",
    description:
      "Cost-efficient isolated compute for applications, portals, dev/test environments, dashboards, and lightweight workloads. Root access, SSD storage, and flexible scaling.",
    href: "/products/vps",
    Icon: Server,
  },
  {
    num: "02",
    title: "Cloud VPS",
    description:
      "Scalable, high-performance cloud server environments combining VPS control with cloud-like resource scalability. NVMe-backed storage, DDoS protection, and 24/7 support.",
    href: "/products/cloud-vps",
    Icon: Cloud,
  },
  {
    num: "03",
    title: "Dedicated Server",
    description:
      "Dedicated hardware for workloads that demand consistent performance, full control, and predictable economics. Ideal for databases, ERP, analytics, and high-traffic apps.",
    href: "/products/dedicated-server",
    Icon: HardDrive,
  },
  {
    num: "04",
    title: "HA Dedicated Cloud",
    description:
      "High-availability dedicated cloud for mission-critical workloads. 100% dedicated resources, NVMe storage, redundancy architecture, and enterprise-grade reliability.",
    href: "/products/dedicated-cloud",
    Icon: Shield,
  },
  {
    num: "05",
    title: "Private Cloud",
    description:
      "Controlled cloud environments for sensitive, regulated, or client-dedicated workloads. Private isolation, access governance, and compliance-ready architecture.",
    href: "/products/private-cloud",
    Icon: Lock,
  },
  {
    num: "06",
    title: "GPU Cloud",
    description:
      "Accelerated environments for AI, ML, inference, HPC, rendering, simulations, and visual inspection. NVIDIA GPU-backed compute with managed lifecycle support.",
    href: "/products/gpu-cloud",
    Icon: Cpu,
  },
  {
    num: "07",
    title: "S3-Compatible Storage",
    description:
      "Object storage for backups, media, application data, logs, reports, datasets, and archival workloads. Full S3 API compatibility with lifecycle policies.",
    href: "/products/s3-storage",
    Icon: Database,
  },
  {
    num: "08",
    title: "Backup Storage",
    description:
      "Centralized backup and recovery for cloud, on-prem, hybrid, databases, and business-critical systems. Automated schedules, retention policies, and restore readiness.",
    href: "/products/backup-storage",
    Icon: Archive,
  },
  {
    num: "09",
    title: "Web Hosting / Managed Hosting",
    description:
      "Secure hosting for websites, portals, CMS, WordPress, business applications, email panels, SSL, backups, and 24/7 managed support.",
    href: "/products/web-hosting",
    Icon: Globe,
  },
  {
    num: "10",
    title: "Managed Cloud Operations",
    description:
      "Day-2 operations for your cloud workloads — monitoring, governance, backup, optimization, lifecycle control, and support. One accountable managed operations partner.",
    href: "/products/managed-ops",
    Icon: Settings,
  },
];

export default function ProductsPage() {
  return (
    <>
      <section className="bg-[#0A0A0A] pb-20 pt-[140px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 md:px-16">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#B91C1C]">
            PRODUCTS
          </p>
          <h1 className="mt-5 max-w-[920px] font-sans text-[clamp(36px,5vw,64px)] font-extrabold leading-[1.08] tracking-[-0.03em] text-white md:text-[64px]">
            Cloud products for every workload stage.
          </h1>
          <p className="mt-6 max-w-[560px] font-sans text-[18px] font-normal leading-[1.7] text-[#6B6B6B]">
            From VPS and Cloud VPS to Dedicated Cloud, GPU Cloud, S3-compatible storage, backup, and
            managed hosting — one complete productized cloud portfolio with one accountable partner.
          </p>
        </div>
      </section>

      <section className="bg-[#0E0E0E] py-20">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 md:px-16">
          <div className="overflow-hidden rounded-lg bg-[rgba(185,28,28,0.1)] p-px">
            <div className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3">
              {PRODUCTS.map((product) => {
                const Icon = product.Icon;
                return (
                  <Link
                    key={product.href}
                    href={product.href}
                    className="group relative block bg-[#111111] px-8 py-9 transition-colors duration-200 hover:bg-[#161616]"
                  >
                    <div
                      className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#B91C1C] to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                      aria-hidden
                    />
                    <div className="mb-4 text-[#B91C1C]">
                      <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                    </div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#B91C1C]">
                      {product.num}
                    </p>
                    <h3 className="mt-3 font-sans text-[20px] font-bold leading-tight text-white">
                      {product.title}
                    </h3>
                    <p className="mt-2.5 font-sans text-[13px] leading-[1.65] text-[#A1A1A1]">
                      {product.description}
                    </p>
                    <div className="mt-5 border-t border-[rgba(255,255,255,0.06)] pt-4">
                      <span className="font-mono text-[11px] text-[#B91C1C] transition-colors duration-150 group-hover:text-[#DC2626]">
                        Learn more →
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <BottomCTA />
    </>
  );
}
