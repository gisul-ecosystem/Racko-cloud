"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Eyebrow from "@/components/ui/Eyebrow";

type ResourceType =
  | "Guide"
  | "Checklist"
  | "Architecture Brief"
  | "Case Study";

type FilterType =
  | "All"
  | "Guides"
  | "Checklists"
  | "Architecture Briefs"
  | "Case Studies";

type ResourceCard = {
  type: ResourceType;
  title: string;
  desc: string;
  tags: string[];
  readTime: string;
  cta: string;
};

const FILTERS: FilterType[] = [
  "All",
  "Guides",
  "Checklists",
  "Architecture Briefs",
  "Case Studies",
];

const RESOURCES: ResourceCard[] = [
  {
    type: "Guide",
    title: "Hybrid Workload Placement Framework",
    desc: "Decision criteria for assigning workloads across private, cloud, and AI compute — with governance and cost-performance alignment.",
    tags: ["Hybrid Cloud", "Architecture"],
    readTime: "12 min read",
    cta: "Read guide",
  },
  {
    type: "Checklist",
    title: "AI Infrastructure Readiness Assessment",
    desc: "Evaluate your current environment readiness for production AI workloads across compute, networking, governance, and MLOps.",
    tags: ["AI Infrastructure", "GPU"],
    readTime: "8 min",
    cta: "Download checklist",
  },
  {
    type: "Architecture Brief",
    title: "Governance for Regulated Environments",
    desc: "Practical framework for data placement controls, access governance, audit readiness, and policy enforcement at enterprise scale.",
    tags: ["Governance", "Compliance"],
    readTime: "15 min read",
    cta: "Read brief",
  },
  {
    type: "Guide",
    title: "Cloud Cost Repatriation Playbook",
    desc: "When to bring workloads back from public cloud, how to model the economics, and what the migration path looks like in practice.",
    tags: ["FinOps", "Strategy"],
    readTime: "18 min read",
    cta: "Read guide",
  },
  {
    type: "Checklist",
    title: "Managed Infrastructure Vendor Evaluation",
    desc: "24 questions to ask any managed infrastructure provider before signing — covering SLAs, governance, security, and operations.",
    tags: ["Procurement", "Vendor"],
    readTime: "10 min",
    cta: "Download checklist",
  },
  {
    type: "Architecture Brief",
    title: "Private Cloud for EdTech Platforms",
    desc: "Infrastructure design patterns for EdTech platforms running 10,000+ concurrent sessions with data residency requirements.",
    tags: ["EdTech", "Private Cloud"],
    readTime: "12 min read",
    cta: "Read brief",
  },
  {
    type: "Case Study",
    title: "How Straive Reduced Infra Spend by 38%",
    desc: "From fragmented multi-cloud to a unified private + hybrid model — the assessment, migration, and operational outcomes.",
    tags: ["Case Study", "BPO"],
    readTime: "6 min read",
    cta: "Read case study",
  },
  {
    type: "Guide",
    title: "MLOps Infrastructure Design Patterns",
    desc: "Infrastructure patterns for teams building ML pipelines — training, inference, model versioning, and cost attribution.",
    tags: ["AI Infrastructure", "MLOps"],
    readTime: "20 min read",
    cta: "Read guide",
  },
  {
    type: "Architecture Brief",
    title: "HIPAA-Oriented Infrastructure Design",
    desc: "How to architect healthcare infrastructure environments that support HIPAA operational requirements without sacrificing performance.",
    tags: ["Healthcare", "Compliance"],
    readTime: "14 min read",
    cta: "Read brief",
  },
  {
    type: "Checklist",
    title: "Cloud Migration Pre-Flight Checklist",
    desc: "32-point checklist for teams planning a cloud migration — covering discovery, dependencies, cutover, and post-migration ops.",
    tags: ["Migration", "Planning"],
    readTime: "15 min",
    cta: "Download checklist",
  },
  {
    type: "Case Study",
    title: "TeamLease Digital — Databricks on Private Infrastructure",
    desc: "How TeamLease Digital moved AI-assisted development tooling to a private environment with 40% better cost-performance.",
    tags: ["Case Study", "AI Infrastructure"],
    readTime: "5 min read",
    cta: "Read case study",
  },
  {
    type: "Guide",
    title: "Observability Architecture for Hybrid Environments",
    desc: "How to instrument, collect, and make sense of telemetry data across private, cloud, and AI compute environments.",
    tags: ["Observability", "Hybrid Cloud"],
    readTime: "16 min read",
    cta: "Read guide",
  },
];

const filterToType: Partial<Record<FilterType, ResourceType>> = {
  Guides: "Guide",
  Checklists: "Checklist",
  "Architecture Briefs": "Architecture Brief",
  "Case Studies": "Case Study",
};

export default function ResourcesPageContent() {
  const [activeFilter, setActiveFilter] = useState<FilterType>("All");

  const filteredResources = useMemo(() => {
    if (activeFilter === "All") return RESOURCES;
    const type = filterToType[activeFilter];
    return RESOURCES.filter((item) => item.type === type);
  }, [activeFilter]);

  return (
    <>
      <section className="bg-[#0A0A0A] pb-20 pt-[140px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <Eyebrow label="RESOURCES" />
          <h1 className="mt-4 font-sans text-[42px] font-extrabold leading-[1.06] tracking-[-0.03em] text-white md:text-[64px]">
            Infrastructure intelligence
            <br />
            for buying committees.
          </h1>
          <p className="mt-6 max-w-[520px] text-[18px] leading-[1.7] text-[#6B6B6B]">
            Practical guides, checklists, and architecture briefs for
            infrastructure and IT leadership teams making high-stakes platform
            decisions.
          </p>
        </div>
      </section>

      <section className="sticky top-[68px] z-10 border-y border-[rgba(255,255,255,0.1)] bg-[#111111] px-6 py-5 xl:px-16">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`rounded-[3px] border px-4 py-[7px] font-mono text-[10px] transition-colors duration-150 ${
                  isActive
                    ? "border-[#B91C1C] bg-[#B91C1C] text-white"
                    : "border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.03)] text-[#A1A1A1] hover:border-[rgba(255,255,255,0.28)] hover:text-white"
                }`}
              >
                {filter}
              </button>
            );
          })}
        </div>
      </section>

      <section className="bg-[#0E0E0E] pb-[120px] pt-16">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <motion.div
            layout
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
          >
            <AnimatePresence mode="popLayout">
              {filteredResources.map((card) => (
                <motion.article
                  layout
                  key={card.title}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="cursor-pointer rounded-[6px] border border-[rgba(255,255,255,0.14)] bg-[#202020] px-6 py-7 shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition-all duration-200 ease-out hover:-translate-y-[2px] hover:border-[rgba(255,255,255,0.24)] hover:bg-[#262626]"
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-crimson-500">
                    {card.type}
                  </p>
                  <h3 className="mt-3 font-sans text-[16px] font-bold leading-[1.3] text-white">
                    {card.title}
                  </h3>
                  <p className="mt-2.5 text-[13px] leading-[1.6] text-[#A1A1A1]">
                    {card.desc}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {card.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-[3px] border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] px-2 py-[3px] font-mono text-[9px] text-[#8A8A8A]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-[rgba(255,255,255,0.1)] pt-4">
                    <span className="font-mono text-[10px] text-[#8A8A8A]">
                      {card.readTime}
                    </span>
                    <span className="font-mono text-[11px] text-crimson-500 transition-colors duration-150 hover:text-crimson-400">
                      {card.cta}
                    </span>
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      <section className="border-t border-[rgba(255,255,255,0.08)] bg-[#0A0A0A] py-20">
        <div className="mx-auto w-full max-w-[560px] px-6 text-center xl:px-8">
          <Eyebrow label="STAY UPDATED" centered />
          <h2 className="mt-4 font-sans text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] text-white md:text-[36px]">
            Infrastructure thinking, monthly.
          </h2>
          <p className="mt-4 text-base leading-[1.7] text-[#6B6B6B]">
            New guides, checklists, and architecture briefs — no product updates,
            no sales content.
          </p>

          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              placeholder="your@company.com"
              className="flex-1 rounded-[4px] border border-[rgba(255,255,255,0.1)] bg-[#1A1A1A] px-4 py-3 text-sm text-white placeholder:text-[#3D3D3D] outline-none focus:border-[rgba(185,28,28,0.5)]"
            />
            <button
              type="button"
              onClick={() => console.log("Subscribe clicked")}
              className="rounded-[4px] border-0 bg-crimson-500 px-6 py-3 font-mono text-xs text-white transition-colors duration-150 hover:bg-crimson-400"
            >
              Subscribe →
            </button>
          </div>

          <p className="mt-3 font-mono text-[10px] text-[#3D3D3D]">
            No spam. Unsubscribe any time.
          </p>
        </div>
      </section>
    </>
  );
}
