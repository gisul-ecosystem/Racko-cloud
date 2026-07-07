"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Lock,
  Database,
  Cpu,
  Archive,
  Shield,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import Eyebrow from "@/components/ui/Eyebrow";
import { useDemoModal } from "@/components/ui/DemoModalContext";

const problems = [
  "Patient applications and clinical systems need uptime that commodity hosting cannot deliver",
  "Medical imaging and diagnostics data needs secure, governed storage — not shared buckets",
  "Healthcare teams lack visibility into cloud cost and workload health",
  "Backup and DR are not treated as critical until recovery is needed",
];

const solutionCards = [
  {
    Icon: Lock,
    title: "Healthcare Workload Environments",
    description:
      "Private and Dedicated Cloud for hospital applications, patient portals, diagnostics platforms, and reporting systems.",
  },
  {
    Icon: Database,
    title: "Medical Data & Imaging Storage",
    description:
      "S3-compatible storage for diagnostic files, medical images, scanned records, reports, and healthcare data lakes.",
  },
  {
    Icon: Cpu,
    title: "AI-Ready Diagnostics",
    description:
      "GPU-ready environments for medical imaging analytics, AI-assisted triage, and clinical document intelligence.",
  },
  {
    Icon: Archive,
    title: "Backup & DR",
    description:
      "Centralized backup for patient-data workloads, healthcare applications, databases, and operational records.",
  },
];

const stackItems = [
  { name: "Private Cloud", desc: "Sensitive patient data and regulated workloads" },
  { name: "Dedicated Cloud", desc: "Hospital platforms and diagnostics systems" },
  { name: "Cloud VPS", desc: "Healthcare portals, dashboards, and internal tools" },
  { name: "GPU Cloud", desc: "Medical imaging analytics and AI-assisted workflows" },
  { name: "S3 Storage", desc: "Diagnostic files, reports, medical images, records" },
  { name: "Backup Storage", desc: "Patient-data, applications, operational records" },
  { name: "Managed Ops", desc: "24/7 monitoring, access governance, uptime" },
];

const flowSteps = [
  "Healthcare application identified",
  "Secure cloud environment provisioned",
  "Patient / diagnostics data protected",
  "Analytics and AI workloads active",
  "Backup and DR running",
  "Continuous care operations",
];

const outcomes = [
  {
    Icon: Shield,
    title: "Stronger data protection",
    description: "Private Cloud and access governance keep patient data isolated and audit-ready.",
  },
  {
    Icon: TrendingUp,
    title: "Faster digital rollout",
    description: "Template-based environments reduce healthcare app deployment time significantly.",
  },
  {
    Icon: RefreshCw,
    title: "Care continuity",
    description: "Backup and DR support ensures clinical systems survive infrastructure incidents.",
  },
];

const useCasePills = [
  { label: "Patient Application Hosting", href: "/use-cases/healthcare#patient-application-hosting" },
  { label: "Diagnostics Storage", href: "/use-cases/healthcare#diagnostics-storage" },
  { label: "Healthcare Analytics", href: "/use-cases/healthcare#healthcare-analytics" },
];

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.35, ease: "easeOut" as const },
};

export default function HealthcarePageContent() {
  const { openModal } = useDemoModal();

  return (
    <main className="min-w-0">
      <section className="bg-[#0A0A0A] pb-20 pt-[140px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <Eyebrow label="HEALTHCARE" />
          <h1 className="mt-5 max-w-[900px] font-sans text-[40px] font-extrabold leading-[1.06] tracking-[-0.03em] text-white sm:text-[48px] md:text-[56px]">
            Cloud for secure healthcare applications, diagnostics, and continuity.
          </h1>
          <p className="mt-6 max-w-[620px] font-sans text-[18px] leading-[1.7] text-[#6B6B6B]">
            Racko Cloud helps healthcare teams run patient applications, diagnostics workloads, medical data, analytics,
            and AI-ready environments with stronger data control, uptime, and backup.
          </p>
          <button
            type="button"
            onClick={openModal}
            className="mt-8 inline-flex items-center rounded-[6px] bg-[#B91C1C] px-8 py-3 font-sans text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-[#DC2626]"
          >
            Book a Racko Meet →
          </button>
        </div>
      </section>

      <section className="bg-[#0E0E0E] py-24">
        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 xl:px-8">
          <motion.div {...fadeUp}>
            <Eyebrow label="THE CHALLENGE" />
            <h2 className="mt-4 max-w-[620px] font-sans text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-white md:text-[40px]">
              Healthcare cloud failures have real patient impact.
            </h2>
          </motion.div>
          <motion.div {...fadeUp} className="space-y-4">
            {problems.map((problem) => (
              <p key={problem} className="flex gap-2 font-sans text-[14px] leading-[1.65] text-[#A1A1A1]">
                <span className="font-mono text-[11px] text-[#B91C1C]">&gt;</span>
                <span>{problem}</span>
              </p>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="bg-[#0A0A0A] py-24">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <motion.div {...fadeUp} className="text-center">
            <Eyebrow label="RACKO CLOUD SOLUTION" centered />
            <h2 className="mx-auto mt-4 max-w-[860px] font-sans text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-white md:text-[40px]">
              One governed cloud model for every healthcare workload.
            </h2>
          </motion.div>
          <div className="mt-10 grid grid-cols-1 gap-px bg-[#B91C1C] md:grid-cols-2 xl:grid-cols-4">
            {solutionCards.map((item) => (
              <motion.article
                key={item.title}
                {...fadeUp}
                className="rounded-[4px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-6 py-7"
              >
                <div className="text-[#B91C1C]">
                  <item.Icon size={22} />
                </div>
                <h3 className="mt-3 font-sans text-[16px] font-bold text-white">{item.title}</h3>
                <p className="mt-3 font-sans text-[13px] leading-[1.6] text-[#6B6B6B]">{item.description}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0A0A0A] pb-12 pt-0">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <p className="mb-4 font-mono text-[9px] uppercase tracking-[0.1em] text-[#3D3D3D]">SPECIFIC USE CASES</p>
          <div className="flex flex-wrap gap-2">
            {useCasePills.map((pill) => (
              <Link
                key={pill.label}
                href={pill.href}
                className="rounded-[4px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-2 font-mono text-[10px] text-[#6B6B6B] transition-colors duration-150 hover:border-[#B91C1C] hover:text-white"
              >
                {pill.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0E0E0E] py-24">
        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 xl:px-8">
          <motion.div {...fadeUp}>
            <Eyebrow label="RECOMMENDED STACK" />
            <h3 className="mt-4 font-sans text-[28px] font-bold leading-[1.15] text-white">
              Products Racko deploys for healthcare workloads.
            </h3>
            <div className="mt-6 space-y-3">
              {stackItems.map((item) => (
                <div key={item.name} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#B91C1C]" />
                  <p className="font-sans text-[13px] leading-[1.65] text-[#6B6B6B]">
                    <span className="font-sans text-[14px] font-semibold text-white">{item.name}</span> — {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div {...fadeUp} className="relative">
            <div className="absolute left-[17px] top-6 h-[calc(100%-48px)] border-l border-dashed border-[rgba(185,28,28,0.2)]" />
            <div className="space-y-5">
              {flowSteps.map((step, idx) => (
                <div key={step} className="flex items-center gap-4">
                  <span className="relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(185,28,28,0.2)] bg-[rgba(185,28,28,0.1)] font-mono text-[11px] text-[#B91C1C]">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <p className="font-sans text-[13px] text-[#A1A1A1]">{step}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="bg-[#0A0A0A] py-24">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <motion.div {...fadeUp}>
            <Eyebrow label="OUTCOMES" />
            <h2 className="mt-4 max-w-[760px] font-sans text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-white md:text-[40px]">
              What healthcare teams achieve with Racko Cloud.
            </h2>
          </motion.div>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {outcomes.map((item) => (
              <motion.article
                key={item.title}
                {...fadeUp}
                className="rounded-[4px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-6 py-7"
              >
                <div className="text-[#B91C1C]">
                  <item.Icon size={22} />
                </div>
                <h3 className="mt-3 font-sans text-[16px] font-bold text-white">{item.title}</h3>
                <p className="mt-3 font-sans text-[13px] leading-[1.6] text-[#6B6B6B]">{item.description}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0E0E0E] py-24">
        <div className="mx-auto max-w-[700px] rounded-[8px] border border-[rgba(185,28,28,0.15)] bg-[rgba(185,28,28,0.06)] px-4 py-10 text-center sm:px-8 sm:py-12 md:px-16">
          <h3 className="font-sans text-[28px] font-extrabold leading-[1.15] text-white md:text-[32px]">
            Building healthcare software or managing clinical infrastructure?
          </h3>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={openModal}
              className="inline-flex items-center justify-center rounded-[6px] bg-[#B91C1C] px-8 py-3 font-sans text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-[#DC2626]"
            >
              Book a Racko Meet →
            </button>
            <Link
              href="/products/private-cloud"
              className="inline-flex items-center justify-center rounded-[6px] border border-[rgba(255,255,255,0.15)] bg-transparent px-8 py-3 font-sans text-[15px] font-medium text-white transition-colors duration-150 hover:bg-[rgba(255,255,255,0.06)]"
            >
              Explore Private Cloud →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
