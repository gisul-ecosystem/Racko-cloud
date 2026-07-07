"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Eyebrow from "@/components/ui/Eyebrow";

type IndustriesTeaserProps = {
  id?: string;
};

const industries = [
  {
    id: "edtech",
    label: "EDTECH",
    title: "EdTech Platforms",
    desc: "Learning infrastructure for 10k+ concurrent students with compliance and uptime guarantees.",
    href: "/industries/edtech",
  },
  {
    id: "healthcare",
    label: "HEALTHCARE",
    title: "Healthcare & MedTech",
    desc: "HIPAA-oriented environments with data sovereignty and audit-ready access controls.",
    href: "/industries/healthcare",
  },
  {
    id: "ai-native",
    label: "AI-NATIVE",
    title: "AI-Native Startups",
    desc: "GPU compute, inference environments, and MLOps pipelines for teams building on AI.",
    href: "/industries/ai-startups",
  },
  {
    id: "bpo-kpo",
    label: "BPO / KPO",
    title: "BPO & Knowledge Services",
    desc: "High-availability, multi-region infrastructure for large-scale operations teams.",
    href: "/industries/bpo-kpo",
  },
  {
    id: "manufacturing",
    label: "MANUFACTURING",
    title: "Manufacturing & Industrial",
    desc: "Low-latency local compute for industrial systems, OT/IT integration, and hardware-heavy operational workloads.",
    href: "/industries/manufacturing",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const },
  },
};

export default function IndustriesTeaser({ id }: IndustriesTeaserProps) {
  return (
    <section id={id} className="bg-[#0A0A0A] py-24">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-40px" }}
          className="mx-auto mb-12 max-w-[900px] text-center"
        >
          <Eyebrow label="INDUSTRIES" centered />
          <h2 className="font-sans text-[clamp(1.625rem,4.5vw,2.75rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-bg-50 md:text-[44px]">
            Built for the teams running critical infrastructure.
          </h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-40px" }}
          variants={{ show: { transition: { staggerChildren: 0.08 } } }}
          className="grid grid-cols-1 gap-4 lg:grid-cols-3 xl:grid-cols-5"
        >
          {industries.map((item) => (
            <motion.article
              key={item.id}
              variants={fadeUp}
              className="rounded-[4px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-7 py-8 transition-all duration-200 ease-out hover:border-[rgba(255,255,255,0.14)] hover:bg-[#242424]"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-crimson-500">
                {item.label}
              </p>
              <h3 className="mt-3 font-sans text-base font-bold text-bg-50">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-[1.65] text-[#A1A1A1]">{item.desc}</p>
              <div className="mt-4 border-t border-[rgba(255,255,255,0.06)] pt-4">
                <Link
                  href={item.href}
                  className="font-mono text-[11px] text-[#B91C1C] transition-colors duration-150 hover:text-[#DC2626]"
                >
                  Explore →
                </Link>
              </div>
            </motion.article>
          ))}
        </motion.div>

        <div className="mt-8 text-center">
          <Link
            href="#industries"
            className="font-mono text-[13px] text-[#6B6B6B] transition-colors duration-150 hover:text-white"
          >
            See all industries →
          </Link>
        </div>
      </div>
    </section>
  );
}
