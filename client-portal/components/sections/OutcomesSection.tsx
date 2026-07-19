"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  CheckCircle,
  Cpu,
  Database,
  RefreshCw,
  Shield,
  Target,
  TrendingDown,
  Zap,
} from "lucide-react";
import AnimatedCounter from "@/components/ui/AnimatedCounter";

interface OutcomesSectionProps {
  bgImage?: string;
}

type StatCard = {
  value: number;
  suffix: string;
  label: string;
  sublabel: string;
  icon: "trendingDown" | "zap" | "database";
};

type IconCard = {
  category: string;
  label: string;
  desc: string;
  href: string;
  icon: "shield" | "cpu" | "refresh";
};

const statCards: StatCard[] = [
  {
    value: 60,
    suffix: "%",
    label: "Reduction in Ops Overhead",
    sublabel: "Fewer tickets. Lower toil. More time for product.",
    icon: "trendingDown",
  },
  {
    value: 40,
    suffix: "%",
    label: "Faster Environment Provisioning",
    sublabel: "Spin up secure, compliant environments in minutes.",
    icon: "zap",
  },
  {
    value: 35,
    suffix: "%",
    label: "Better Cost-Performance Economics",
    sublabel: "Optimise across compute, storage, and network.",
    icon: "database",
  },
];

const iconCards: IconCard[] = [
  {
    category: "GOVERNANCE",
    label: "Stronger Governance Posture",
    desc: "Policy-first architecture with audit trails and access controls across every layer.",
    href: "/platform#security",
    icon: "shield",
  },
  {
    category: "AI INFRASTRUCTURE",
    label: "AI Production Readiness",
    desc: "GPU compute, inference environments, and MLOps tooling — from pilot to production.",
    href: "/solutions/gpu",
    icon: "cpu",
  },
  {
    category: "RESILIENCE",
    label: "Workload Resilience & Portability",
    desc: "Redundancy architecture and workload portability designed for continuity at scale.",
    href: "/platform#managed-ops",
    icon: "refresh",
  },
];

function StatIcon({ icon }: { icon: StatCard["icon"] }) {
  if (icon === "trendingDown") return <TrendingDown size={22} color="#B91C1C" />;
  if (icon === "zap") return <Zap size={22} color="#B91C1C" />;
  return <Database size={22} color="#B91C1C" />;
}

function QualitativeIcon({ icon }: { icon: IconCard["icon"] }) {
  if (icon === "shield") return <Shield size={18} color="#B91C1C" />;
  if (icon === "cpu") return <Cpu size={18} color="#B91C1C" />;
  return <RefreshCw size={18} color="#B91C1C" />;
}

export default function OutcomesSection({
  bgImage = "/images/outcomes-bg.png",
}: OutcomesSectionProps) {
  return (
    <section className="relative min-h-[600px] w-full overflow-hidden">
      <div className="absolute inset-0 z-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bgImage}
          alt=""
          className="h-full w-full object-cover object-[center_right]"
        />
        <div
          className="pointer-events-none absolute inset-0 z-[1] mix-blend-multiply"
          style={{ background: "rgba(10,10,10,0.28)" }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(10,10,10,0.94)_0%,rgba(10,10,10,0.90)_30%,rgba(10,10,10,0.80)_55%,rgba(10,10,10,0.66)_75%,rgba(10,10,10,0.48)_100%)]" />
        <div className="absolute left-0 right-0 top-0 h-20 bg-[linear-gradient(to_bottom,#0A0A0A,transparent)]" />
        <div className="absolute bottom-0 left-0 right-0 h-[120px] bg-[linear-gradient(to_top,#0A0A0A,transparent)]" />
      </div>

      <div className="relative z-[1] mx-auto w-full max-w-[1280px] px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="max-w-[520px]"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#B91C1C]">
            BUSINESS OUTCOMES
          </p>
          <h2 className="mt-3 max-w-[480px] font-sans text-[clamp(36px,3.5vw,48px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-white">
            Infrastructure decisions
            <br />
            that show up in your P&amp;L
          </h2>
          <p className="mt-4 max-w-[420px] font-sans text-[15px] leading-[1.65] text-[#A1A1A1]">
            Racko helps engineering and finance leaders reduce cost, improve resilience,
            and move faster — at every layer.
          </p>
        </motion.div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {statCards.map((card, idx) => (
            <motion.article
              key={card.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1, ease: "easeOut" }}
              className="flex items-center gap-4 rounded-[8px] border border-[rgba(255,255,255,0.09)] bg-[rgba(15,15,15,0.92)] px-5 py-6 backdrop-blur-[16px] [backdrop-filter:blur(16px)]"
            >
              <div className="flex h-[52px] w-[52px] items-center justify-center rounded-[8px] border border-[rgba(185,28,28,0.18)] bg-[rgba(185,28,28,0.08)]">
                <StatIcon icon={card.icon} />
              </div>
              <div>
                <p className="font-sans text-[36px] font-extrabold leading-none text-[#E53935]">
                  <AnimatedCounter target={card.value} suffix={card.suffix} />
                </p>
                <p className="mt-0.5 font-sans text-[14px] font-semibold text-white">
                  {card.label}
                </p>
                <p className="mt-1 font-sans text-[12px] text-[#6B6B6B]">{card.sublabel}</p>
              </div>
            </motion.article>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {iconCards.map((card, idx) => (
            <motion.article
              key={card.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 + idx * 0.1, ease: "easeOut" }}
              className="flex flex-col gap-2.5 rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[rgba(15,15,15,0.88)] px-5 py-6 backdrop-blur-[12px] [backdrop-filter:blur(12px)]"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[rgba(185,28,28,0.18)] bg-[rgba(185,28,28,0.08)]">
                  <QualitativeIcon icon={card.icon} />
                </div>
                <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#B91C1C]">
                  {card.category}
                </p>
              </div>
              <h3 className="mt-1.5 font-sans text-[18px] font-bold text-white">{card.label}</h3>
              <p className="font-sans text-[13px] leading-[1.6] text-[#A1A1A1]">{card.desc}</p>
              <Link
                href={card.href}
                className="mt-2 font-mono text-[11px] text-[rgba(185,28,28,0.7)] transition-colors duration-150 hover:text-[#B91C1C]"
              >
                Learn more →
              </Link>
            </motion.article>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5, ease: "easeOut" }}
          className="mt-8 flex flex-col gap-4 rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-6 py-4 md:flex-row md:items-center md:gap-8"
        >
          <div className="flex items-center gap-2.5">
            <Target size={18} color="#B91C1C" />
            <p className="font-sans text-[14px] font-semibold text-white">
              Built for the outcomes that matter
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:ml-auto md:gap-7">
            {[
              "Lower TCO",
              "Faster Time to Value",
              "Operational Excellence",
              "Enterprise Resilience",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle size={14} color="#B91C1C" />
                <span className="font-sans text-[12px] text-[#A1A1A1]">{item}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
