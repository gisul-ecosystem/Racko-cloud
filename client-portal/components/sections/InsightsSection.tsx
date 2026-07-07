"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import Eyebrow from "@/components/ui/Eyebrow";
import { INSIGHT_CARDS } from "@/lib/constants";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: "easeOut" as const },
  },
};

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

type InsightsSectionProps = {
  id?: string;
};

export default function InsightsSection({ id }: InsightsSectionProps) {
  return (
    <section id={id} className="bg-bg-900 py-16 sm:py-20 lg:py-24">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-40px" }}
          className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="max-w-[560px]">
            <Eyebrow label="Resources" />
            <h2 className="font-sans text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em] text-bg-50 md:text-[44px]">
              Infrastructure intelligence for buying committees
            </h2>
          </div>
          <Link
            href="#resources"
            className="w-fit text-sm text-bg-400 transition-colors duration-200 ease-out hover:text-crimson-500"
          >
            Explore All Resources →
          </Link>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-40px" }}
          className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5"
        >
          {INSIGHT_CARDS.map((item) => (
            <motion.article
              key={item.title}
              variants={fadeUp}
              className="rounded-[8px] border border-border bg-[#1A1A1A] px-6 py-7 transition-all duration-200 ease-out hover:-translate-y-[2px] hover:border-border-strong hover:bg-bg-700"
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#B91C1C]">
                {item.type}
              </p>
              <h3 className="mt-4 font-sans text-[17px] font-bold leading-[1.3] text-bg-50">
                {item.title}
              </h3>
              <p className="mt-3 text-sm font-normal leading-[1.7] text-[#A1A1A1]">
                {item.desc}
              </p>
              <p className="mt-4 text-sm font-normal leading-[1.65] text-[#6B6B6B]">
                {item.tags}
              </p>
              <p className="mt-6 text-xs font-medium text-crimson-500">{item.cta} →</p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
