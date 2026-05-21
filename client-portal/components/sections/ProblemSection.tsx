"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";

const problems = [
  {
    number: "01",
    title: "Cost Volatility",
    description:
      "Cloud bills spike unpredictably. Stable workloads on rented compute have no cost ceiling — and no exit.",
  },
  {
    number: "02",
    title: "Idle Resources",
    description:
      "Over-provisioned compute, unused storage, and forgotten lab environments drain cloud budgets silently.",
  },
  {
    number: "03",
    title: "Storage Growth",
    description:
      "Data, backups, media, and logs compound fast. Without governance, storage spend becomes uncontrollable.",
  },
  {
    number: "04",
    title: "GPU Availability",
    description:
      "AI and ML workloads need GPU-backed environments. Most cloud models make this expensive or unpredictable.",
  },
  {
    number: "05",
    title: "Backup & DR Gaps",
    description:
      "Most teams discover backup failures during recovery. DR planning is treated as optional until it isn't.",
  },
  {
    number: "06",
    title: "Fragmented Access Control",
    description:
      "Multiple environments, multiple vendors, and multiple teams create access blind spots and audit failures.",
  },
  {
    number: "07",
    title: "Weak Workload Visibility",
    description:
      "Without usage intelligence, teams can't see what's running, what's idle, what's at risk, or what costs more.",
  },
  {
    number: "08",
    title: "Manual Environment Setup",
    description:
      "Lab, demo, and POC environments are built manually, inconsistently, and never cleaned up systematically.",
  },
  {
    number: "09",
    title: "Lab & Demo Sprawl",
    description:
      "Training labs, sandboxes, and pilot environments multiply without lifecycle control or cost guardrails.",
  },
  {
    number: "10",
    title: "Vendor Accountability Gaps",
    description:
      "Generic hosting providers give capacity. They don't give managed operations, backup, DR, or lifecycle support.",
  },
];

export default function ProblemSection() {
  return (
    <section className="relative overflow-hidden bg-[#0A0A0A] py-16 sm:py-20 lg:py-24">
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse 70% 60% at 15% 50%, rgba(185,28,28,0.10) 0%, transparent 65%),
            radial-gradient(ellipse 50% 40% at 85% 20%, rgba(185,28,28,0.07) 0%, transparent 60%),
            radial-gradient(ellipse 40% 50% at 70% 85%, rgba(185,28,28,0.05) 0%, transparent 55%)
          `,
        }}
      />
      <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-[0.04]">
        <defs>
          <pattern id="prob-grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#B91C1C" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#prob-grid)" />
      </svg>
      <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-[0.06]">
        <path
          d="M -200 300 Q 400 100 900 400 T 1800 300"
          fill="none"
          stroke="#B91C1C"
          strokeWidth="1.5"
          strokeDasharray="12 8"
          style={{ animation: "flowLine 10s linear infinite" }}
        />
        <path
          d="M -200 500 Q 500 200 1000 500 T 1800 400"
          fill="none"
          stroke="#B91C1C"
          strokeWidth="1"
          strokeDasharray="6 12"
          style={{ animation: "flowLine 14s linear infinite reverse" }}
        />
      </svg>

      <div className="relative z-[1] mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-[#B91C1C]"
        >
          THE PROBLEM
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-3 text-center font-sans text-[clamp(36px,4.5vw,60px)] font-extrabold leading-[1.06] tracking-[-0.03em] text-white"
        >
          Cloud is now a board-level cost, control,
          <br />
          and continuity decision.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mx-auto mt-5 max-w-[760px] text-center font-sans text-[15px] leading-[1.65] text-[#6B6B6B] sm:text-[16px] md:text-[17px]"
        >
          Enterprises and digital-first teams are no longer asking only where to host workloads.
          They are asking which workloads need VPS, Dedicated Cloud, Private Cloud, GPU Cloud,
          CloudLabs, storage, backup, or managed operations — and how to keep cost, access, uptime,
          lifecycle, and environment sprawl under control.
        </motion.p>
      </div>

      <div className="relative z-[1] mx-auto mt-12 w-full max-w-[1280px] px-4 sm:mt-16 sm:px-6 lg:mt-[72px] lg:px-8">
        <div className="grid grid-cols-1 gap-[1px] overflow-hidden rounded-[10px] border border-[rgba(185,28,28,0.2)] bg-[rgba(185,28,28,0.15)] md:grid-cols-2 lg:grid-cols-5">
          {problems.map((card, index) => (
            <ProblemCard key={card.number} card={card} index={index} />
          ))}
        </div>
      </div>

      <div className="relative z-[1] mx-auto mt-12 w-full max-w-[1280px] px-4 text-center sm:mt-16 sm:px-6 lg:mt-[72px] lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <p className="mx-auto max-w-[920px] font-sans text-[clamp(22px,3.2vw,40px)] font-extrabold leading-[1.25] tracking-[-0.02em] text-white">
            Racko addresses all ten —{" "}
            <span className="text-[rgba(255,255,255,0.38)]">with one accountable cloud partner.</span>
          </p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="mt-7 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center"
          >
            <Link
              href="/assessment"
              className="inline-flex w-full items-center justify-center rounded-[5px] bg-[#B91C1C] px-5 py-[11px] font-sans text-[13px] font-medium text-white transition-all duration-150 hover:-translate-y-[1px] hover:bg-[#DC2626] sm:w-auto sm:px-7"
            >
              Book a Racko Meet →
            </Link>
            <Link
              href="#platform"
              className="inline-flex w-full items-center justify-center rounded-[5px] border border-[rgba(255,255,255,0.2)] bg-transparent px-5 py-[11px] font-sans text-[13px] font-medium text-white transition-all duration-150 hover:bg-[rgba(255,255,255,0.04)] sm:w-auto sm:px-7"
            >
              See how it works
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function ProblemCard({
  card,
  index,
}: {
  card: (typeof problems)[number];
  index: number;
}) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative cursor-default overflow-hidden bg-[#111111] px-4 py-6 transition-colors duration-200 hover:bg-[#161616] sm:px-5 sm:py-7 lg:px-4 lg:py-6 xl:px-6 xl:py-8"
    >
      <span className="absolute left-0 right-0 top-0 h-[2px] bg-[linear-gradient(90deg,transparent,#B91C1C,transparent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <AnimatePresence>
        {isHovered ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-none absolute h-[200px] w-[200px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(185,28,28,0.08) 0%, transparent 70%)",
              left: mousePos.x - 100,
              top: mousePos.y - 100,
            }}
          />
        ) : null}
      </AnimatePresence>
      <div className="relative z-[1] flex items-start justify-between">
        <p className="font-mono text-[10px] tracking-[0.1em] text-[#B91C1C]">{card.number}</p>
      </div>
      <motion.div
        initial={{ scaleX: 0, originX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: 0.2 + index * 0.08 }}
        className="mb-4 mt-[14px] h-[2px] w-7 bg-[#B91C1C]"
      />
      <h3 className="relative z-[1] font-sans text-[17px] font-bold leading-tight text-white lg:text-[15px] xl:text-[17px]">
        {card.title}
      </h3>
      <p className="relative z-[1] mt-2.5 font-sans text-[12px] leading-[1.65] text-[#6B6B6B] lg:text-[11px] lg:leading-[1.6] xl:text-[13px] xl:leading-[1.65]">
        {card.description}
      </p>
    </motion.div>
  );
}
