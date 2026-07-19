"use client";

import { motion } from "framer-motion";
import Eyebrow from "@/components/ui/Eyebrow";
import { SOLUTION_CARDS } from "@/lib/constants";

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
      staggerChildren: 0.06,
    },
  },
};

type SolutionsSectionProps = {
  id?: string;
};

export default function SolutionsSection({ id }: SolutionsSectionProps) {
  return (
    <section id={id} className="bg-bg-900 py-[56px] md:py-[72px] xl:py-[120px]">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-40px" }}
          className="mx-auto mb-12 max-w-[560px] text-center"
        >
          <Eyebrow label="Solutions" centered />
          <h2 className="font-sans text-[clamp(1.5rem,5vw,2.875rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-bg-50 md:text-[46px]">
            Find your problem. Map your path.
          </h2>
          <p className="mt-4 text-base font-normal leading-[1.7] text-bg-400">
            Navigate infrastructure complexity through solution pathways designed
            for enterprise execution and measurable outcomes.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-40px" }}
          className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4"
        >
          {SOLUTION_CARDS.map((solution) => (
            <motion.article
              key={solution.title}
              variants={fadeUp}
                className="group min-w-0 rounded-[8px] border border-border bg-bg-800/70 px-6 py-7 transition-all duration-200 ease-out hover:-translate-y-[2px] hover:border-border-strong hover:bg-bg-700"
            >
              <div className="text-xl">{solution.icon}</div>
              <h3 className="mt-4 font-sans text-[20px] font-semibold text-bg-50">
                {solution.title}
              </h3>
              <p className="mt-3 text-sm font-normal leading-[1.7] text-bg-400">
                {solution.desc}
              </p>

              <div className="mt-6 text-xs text-crimson-500">Explore →</div>
              <span className="mt-3 block h-[2px] w-full origin-left scale-x-0 bg-crimson-500 transition-transform duration-300 group-hover:scale-x-100" />
            </motion.article>
          ))}
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-40px" }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <button
            type="button"
            className="rounded-[6px] border border-border-strong bg-transparent px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 ease-out hover:border-border-strong hover:bg-bg-700"
          >
            Explore All Solutions
          </button>
          <button
            type="button"
            className="rounded-[6px] bg-crimson-500 px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 ease-out hover:-translate-y-[1px] hover:bg-crimson-400"
          >
            Request Assessment
          </button>
        </motion.div>
      </div>
    </section>
  );
}
