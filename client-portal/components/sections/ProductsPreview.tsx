"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, Globe, Shield, Zap, Database } from "lucide-react";
import { useDemoModal } from "@/components/ui/DemoModalContext";

type ProductsPreviewProps = {
  id?: string;
  bgImage?: string;
};

const products = [
  {
    number: "01",
    title: "VPS",
    href: "/products/vps",
    description:
      "Cost-efficient isolated compute for apps, portals, dev/test, and lightweight workloads.",
  },
  {
    number: "02",
    title: "Cloud VPS",
    href: "/products/cloud-vps",
    description:
      "Scalable, high-performance VPS with SSD/NVMe storage, root access, and 24/7 support.",
  },
  {
    number: "03",
    title: "Dedicated Server",
    href: "/products/dedicated-server",
    description:
      "Dedicated hardware for databases, ERP, analytics, and mission-critical workloads.",
  },
  {
    number: "04",
    title: "HA Dedicated Cloud",
    href: "/products/dedicated-cloud",
    description:
      "100% dedicated resources with NVMe storage, HA architecture, and advanced security.",
  },
  {
    number: "05",
    title: "Private Cloud",
    href: "/products/private-cloud",
    description:
      "Controlled environments for sensitive, regulated, or client-dedicated workloads.",
  },
  {
    number: "06",
    title: "GPU Cloud",
    href: "/products/gpu-cloud",
    description:
      "Accelerated environments for AI, ML, inference, HPC, and rendering workloads.",
  },
  {
    number: "07",
    title: "S3 Storage",
    href: "/products/s3-storage",
    description:
      "S3-compatible object storage for backups, media, datasets, logs, and archival workloads.",
  },
  {
    number: "08",
    title: "Backup Storage",
    href: "/products/backup-storage",
    description:
      "Centralized backup and recovery for cloud, on-prem, hybrid, and SaaS workloads.",
  },
  {
    number: "09",
    title: "Web Hosting",
    href: "/products/web-hosting",
    description:
      "Managed hosting for websites, portals, CMS, WordPress, and business applications.",
  },
  {
    number: "10",
    title: "Managed Ops",
    href: "/products/managed-ops",
    description:
      "Day-2 operations — monitoring, governance, backup, optimization, and expert support.",
  },
] as const;

const fadeUpBase = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" as const },
};

export default function ProductsPreview({
  id,
  bgImage = "/images/solutions-bg.png",
}: ProductsPreviewProps) {
  const { openModal } = useDemoModal();

  return (
    <section id={id} className="relative flex min-h-[640px] flex-col overflow-hidden bg-[#0A0A0A]">
      <div className="absolute inset-0 z-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bgImage}
          alt=""
          className="h-full w-full object-cover object-[center_right]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(10,10,10,0.98)_0%,rgba(10,10,10,0.95)_35%,rgba(10,10,10,0.82)_60%,rgba(10,10,10,0.60)_80%,rgba(10,10,10,0.35)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(10,10,10,1)_0%,rgba(10,10,10,0.95)_45%,rgba(10,10,10,0.88)_65%,rgba(10,10,10,0.65)_82%,rgba(10,10,10,0.3)_100%)]" />
        <div className="absolute left-0 right-0 top-0 h-20 bg-[linear-gradient(to_bottom,#0A0A0A,transparent)]" />
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-[linear-gradient(to_top,#0A0A0A,transparent)]" />
      </div>

      <div className="relative z-[1] mx-auto w-full max-w-[1280px] px-4 py-16 sm:px-6 sm:py-20 md:px-12">
        <div>
          <motion.div
            {...fadeUpBase}
            transition={{ duration: 0.55, delay: 0, ease: "easeOut" }}
            className="mb-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[#B91C1C]"
          >
            WHAT WE OFFER
          </motion.div>

          <motion.h2
            {...fadeUpBase}
            transition={{ duration: 0.55, delay: 0.1, ease: "easeOut" }}
            className="mb-6 font-sans text-[clamp(32px,3.2vw,46px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-white"
          >
            Choose the cloud product
            <br />
            that fits the workload.
          </motion.h2>

          <motion.p
            {...fadeUpBase}
            transition={{ duration: 0.55, delay: 0.2, ease: "easeOut" }}
            className="mb-8 max-w-[760px] font-sans text-[16px] leading-[1.65] text-[#A1A1A1]"
          >
            From VPS and Cloud VPS to GPU Cloud, S3 storage, backup, web hosting, and managed
            operations - one productized cloud portfolio, one accountable partner.
          </motion.p>

          <motion.div
            {...fadeUpBase}
            transition={{ duration: 0.55, delay: 0.3, ease: "easeOut" }}
            className="flex flex-wrap gap-3"
          >
            <Link
              href="/products"
              className="inline-flex rounded-[5px] bg-[#B91C1C] px-7 py-[11px] font-sans text-[13px] font-medium text-white transition-all duration-150 hover:-translate-y-[1px] hover:bg-[#DC2626]"
            >
              Explore all products →
            </Link>
            <button
              type="button"
              onClick={openModal}
              className="inline-flex rounded-[5px] border border-[rgba(255,255,255,0.2)] bg-transparent px-7 py-[11px] font-sans text-[13px] font-medium text-white transition-all duration-150 hover:bg-[rgba(255,255,255,0.04)]"
            >
              Book a Demo →
            </button>
          </motion.div>

          <motion.div
            {...fadeUpBase}
            transition={{ duration: 0.55, delay: 0.4, ease: "easeOut" }}
            className="mt-8 flex flex-wrap gap-6"
          >
            {[
              { icon: <Database size={14} color="#B91C1C" />, text: "Dedicated Server" },
              { icon: <Zap size={14} color="#B91C1C" />, text: "GPU Cloud" },
              { icon: <Shield size={14} color="#B91C1C" />, text: "Private Cloud" },
              { icon: <Clock size={14} color="#B91C1C" />, text: "Managed Ops" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2">
                {item.icon}
                <span className="font-sans text-[13px] text-[#6B6B6B]">{item.text}</span>
              </div>
            ))}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55, delay: 0.2, ease: "easeOut" }}
            className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5"
          >
            {products.map((product, index) => (
              <motion.div
                key={product.number}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.35, delay: 0.04 * index, ease: "easeOut" }}
              >
                <Link
                  href={product.href}
                  className="group flex h-[220px] flex-col rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[rgba(15,15,15,0.85)] p-5 backdrop-blur-[12px] transition-all duration-150 hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(22,22,22,0.9)]"
                >
                  <CardTop number={product.number} />
                  <IconBox icon={<Database size={18} color="#B91C1C" />} />
                  <h3 className="mb-2 font-sans text-[18px] font-bold text-white">{product.title}</h3>
                  <p className="font-sans text-[13px] leading-[1.55] text-[#6B6B6B]">{product.description}</p>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
        className="relative z-[1] border-t border-[rgba(255,255,255,0.08)] bg-[rgba(10,10,10,0.9)] px-4 py-5 sm:px-6 md:px-16"
      >
        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:items-center">
          {[
            { icon: <Clock size={15} color="#B91C1C" />, value: "10", label: "Cloud Products" },
            { icon: <Shield size={15} color="#B91C1C" />, value: "24/7", label: "Managed Ops" },
            { icon: <Zap size={15} color="#B91C1C" />, value: "AI Ready", label: "GPU + Compute" },
            { icon: <Globe size={15} color="#B91C1C" />, value: "India", label: "Data Centres" },
          ].map((stat, idx) => (
            <div
              key={stat.label}
              className={`flex items-center gap-3 lg:px-10 ${idx === 0 ? "lg:pl-0" : ""} ${idx < 3 ? "lg:border-r lg:border-[rgba(255,255,255,0.08)]" : ""}`}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(185,28,28,0.35)] bg-[rgba(185,28,28,0.15)]">
                {stat.icon}
              </span>
              <div>
                <p className="font-sans text-[20px] font-extrabold text-white">{stat.value}</p>
                <p className="font-sans text-[12px] text-[#6B6B6B]">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

function CardTop({ number }: { number: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] text-[#B91C1C]">{number}</span>
      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[4px] border border-[rgba(185,28,28,0.25)] bg-[rgba(185,28,28,0.15)] font-sans text-[14px] text-[#B91C1C]">
        +
      </span>
    </div>
  );
}

function IconBox({ icon }: { icon: ReactNode }) {
  return (
    <div className="mb-[14px] mt-[14px] flex h-10 w-10 items-center justify-center rounded-[8px] border border-[rgba(185,28,28,0.2)] bg-[rgba(185,28,28,0.1)]">
      {icon}
    </div>
  );
}
