"use client";

import Link from "next/link";
import {
  Server,
  HardDrive,
  Cpu,
  Archive,
  TrendingUp,
  DollarSign,
  Zap,
} from "lucide-react";
import Eyebrow from "@/components/ui/Eyebrow";
import { useDemoModal } from "@/components/ui/DemoModalContext";

const problems = [
  "Plant applications and ERP systems need uptime that generic hosting cannot guarantee",
  "Production data lacks backup and DR — continuity risk is high",
  "Digital transformation pilots run on ad-hoc infrastructure with no lifecycle control",
  "No cost visibility across plant, site, or workload",
];

const solutionCards = [
  {
    Icon: Server,
    title: "Plant Workload Environments",
    description:
      "Controlled cloud for plant applications, monitoring tools, dashboards, and operational systems.",
  },
  {
    Icon: HardDrive,
    title: "ERP / MES Support",
    description:
      "Dedicated Cloud for ERP, MES, production databases, and business-critical manufacturing systems.",
  },
  {
    Icon: Cpu,
    title: "AI & Analytics",
    description:
      "GPU-ready environments for predictive maintenance, visual inspection, and industrial analytics.",
  },
  {
    Icon: Archive,
    title: "Backup & DR",
    description:
      "Centralized backup for plant systems, ERP data, operational records, and production databases.",
  },
];

const stackItems = [
  { name: "Dedicated Cloud", desc: "ERP/MES and production-critical workloads" },
  { name: "Private Cloud", desc: "Sensitive production data and plant systems" },
  { name: "Cloud VPS", desc: "Plant dashboards and internal tools" },
  { name: "GPU Cloud", desc: "Predictive maintenance, visual inspection, digital twins" },
  { name: "S3 Storage", desc: "Machine logs, quality data, sensor exports, reports" },
  { name: "Backup Storage", desc: "ERP/MES data, plant systems, operational records" },
  { name: "Managed Ops", desc: "24/7 uptime monitoring and lifecycle management" },
];

const flowSteps = [
  "Plant system identified",
  "Cloud workload provisioned",
  "Production data secured",
  "Analytics and AI active",
  "Backup and DR running",
  "Continuous operations",
];

const outcomes = [
  {
    Icon: TrendingUp,
    title: "Stronger operational continuity",
    description: "Backup and DR reduce plant downtime risk from infrastructure failures.",
  },
  {
    Icon: DollarSign,
    title: "Predictable cloud cost",
    description:
      "Dedicated Cloud eliminates variable billing — fixed, transparent cloud economics per workload.",
  },
  {
    Icon: Zap,
    title: "Faster digital rollouts",
    description:
      "Template-based environments accelerate plant pilots and digital transformation programs.",
  },
];

const useCasePills = [
  { label: "ERP / MES Workloads", href: "/use-cases/manufacturing#erp-mes-workloads" },
  { label: "Plant Edge Compute", href: "/use-cases/manufacturing#plant-edge-compute" },
  { label: "Industrial AI & Analytics", href: "/use-cases/manufacturing#industrial-ai-analytics" },
];

export default function ManufacturingPageContent() {
  const { openModal } = useDemoModal();

  return (
    <main className="min-w-0">
      <section className="bg-[#0A0A0A] pb-20 pt-[140px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <Eyebrow label="MANUFACTURING" />
          <h1 className="mt-5 max-w-[820px] font-sans text-[40px] font-extrabold leading-[1.06] tracking-[-0.03em] text-white sm:text-[48px] md:text-[56px]">
            Cloud for plant workloads, industrial analytics, and continuity.
          </h1>
          <p className="mt-6 max-w-[620px] font-sans text-[18px] leading-[1.7] text-[#6B6B6B]">
            Racko Cloud helps manufacturers run plant applications, ERP/MES systems, production data workloads, and
            AI-ready environments with stronger reliability and cost control.
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
          <div>
            <Eyebrow label="THE CHALLENGE" />
            <h2 className="mt-4 max-w-[600px] font-sans text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-white md:text-[40px]">
              Manufacturing cloud failures show up on the production floor.
            </h2>
          </div>
          <div className="space-y-4">
            {problems.map((problem) => (
              <p key={problem} className="flex gap-2 font-sans text-[13px] leading-[1.7] text-[#A1A1A1]">
                <span className="font-mono text-[#B91C1C]">&gt;</span>
                <span>{problem}</span>
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0A0A0A] py-24">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <div className="text-center">
            <Eyebrow label="RACKO CLOUD SOLUTION" centered />
            <h2 className="mx-auto mt-4 max-w-[820px] font-sans text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-white md:text-[40px]">
              One reliable cloud model from plant to enterprise.
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-px bg-[#B91C1C] md:grid-cols-2 xl:grid-cols-4">
            {solutionCards.map((item) => (
              <article key={item.title} className="bg-[#111111] px-6 py-7">
                <div className="text-[#B91C1C]">
                  <item.Icon size={22} />
                </div>
                <h3 className="mt-3 font-sans text-[18px] font-bold text-white">{item.title}</h3>
                <p className="mt-3 font-sans text-[13px] leading-[1.7] text-[#6B6B6B]">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0E0E0E] py-24">
        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 xl:px-8">
          <div>
            <Eyebrow label="RECOMMENDED STACK" />
            <h3 className="mt-4 font-sans text-[28px] font-bold leading-[1.15] text-white">
              Products Racko deploys for manufacturing workloads.
            </h3>
            <div className="mt-6 space-y-3">
              {stackItems.map((item) => (
                <div key={item.name} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#B91C1C]" />
                  <p className="font-sans text-[13px] leading-[1.65] text-[#A1A1A1]">
                    <span className="font-semibold text-white">{item.name}</span> — {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute left-[17px] top-6 h-[calc(100%-48px)] border-l border-dashed border-[rgba(185,28,28,0.4)]" />
            <div className="space-y-5">
              {flowSteps.map((step, idx) => (
                <div key={step} className="flex items-center gap-4">
                  <span className="relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(185,28,28,0.45)] bg-[#111111] font-mono text-[11px] text-[#B91C1C]">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <p className="font-sans text-[14px] text-[#A1A1A1]">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#0A0A0A] py-24">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <Eyebrow label="OUTCOMES" />
          <h2 className="mt-4 max-w-[760px] font-sans text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-white md:text-[40px]">
            What manufacturing teams achieve with Racko Cloud.
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {outcomes.map((item) => (
              <article
                key={item.title}
                className="rounded border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-6 py-7"
              >
                <div className="text-[#B91C1C]">
                  <item.Icon size={22} />
                </div>
                <h3 className="mt-3 font-sans text-[18px] font-bold text-white">{item.title}</h3>
                <p className="mt-3 font-sans text-[13px] leading-[1.7] text-[#6B6B6B]">{item.description}</p>
              </article>
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

      <section className="bg-[#0E0E0E] py-20">
        <div className="mx-auto max-w-[700px] rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[#111111] px-6 py-10 text-center sm:px-10">
          <h3 className="font-sans text-[28px] font-extrabold leading-[1.15] text-white md:text-[32px]">
            Running a manufacturing plant or industrial operations team?
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
              href="/products/dedicated-cloud"
              className="inline-flex items-center justify-center rounded-[6px] border border-[rgba(255,255,255,0.15)] bg-transparent px-8 py-3 font-sans text-[15px] font-medium text-white transition-colors duration-150 hover:bg-[rgba(255,255,255,0.06)]"
            >
              Explore Dedicated Cloud →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
