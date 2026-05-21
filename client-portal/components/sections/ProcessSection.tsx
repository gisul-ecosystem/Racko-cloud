"use client";

import { motion } from "framer-motion";
import Eyebrow from "@/components/ui/Eyebrow";

const steps = [
  {
    number: "01",
    title: "Assess",
    description:
      "Map workload requirements, constraints, governance needs, and current-state gaps.",
  },
  {
    number: "02",
    title: "Architect",
    description:
      "Design the right infrastructure model - private, hybrid, or AI-ready - for each workload.",
  },
  {
    number: "03",
    title: "Deploy",
    description:
      "Migrate and provision environments with minimal disruption and maximum control.",
  },
  {
    number: "04",
    title: "Operate",
    description:
      "Run with full visibility, governance guardrails, and managed expert support.",
  },
  {
    number: "05",
    title: "Optimize",
    description:
      "Continuously improve cost-performance, scale confidently, and evolve your AI readiness.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export default function ProcessSection() {
  return (
    <section className="bg-bg-900 py-[56px] md:py-[72px] xl:py-[120px]">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-40px" }}
          className="mx-auto mb-14 max-w-[560px] text-center"
        >
          <Eyebrow label="Methodology" centered />
          <h2 className="font-sans text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em] text-bg-50 md:text-[46px]">
            From assessment to operational scale
          </h2>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-40px" }}
          className="relative"
        >
          <span className="absolute left-7 right-7 top-7 hidden h-px bg-border-strong lg:block" />

          <div className="flex flex-col gap-9 lg:flex-row lg:gap-0">
            {steps.map((step) => (
              <motion.article
                key={step.number}
                variants={fadeUp}
                className="flex-1 min-w-0 px-0 text-center lg:px-5"
              >
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[8px] border border-border bg-bg-800 font-sans text-[18px] font-bold text-bg-50 transition-all duration-200 ease-out hover:-translate-y-[2px] hover:border-border-strong hover:bg-bg-700">
                  {step.number}
                </div>
                <h3 className="font-sans text-[20px] font-semibold text-bg-50">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm font-normal leading-[1.7] text-bg-400">
                  {step.description}
                </p>
              </motion.article>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
