import type { Metadata } from "next";
import Link from "next/link";
import BottomCTA from "@/components/sections/BottomCTA";

export const metadata: Metadata = {
  title: "Use Cases — Racko",
  description:
    "Workload-aware infrastructure for EdTech, AI Startups, BPO/KPO, Manufacturing, and Healthcare.",
};

const industryCards = [
  {
    label: "EDTECH",
    title: "EdTech",
    desc: "LMS infrastructure, CloudLabs, assessment platforms, GenAI learning, and hire-train-deploy factories.",
    useCases: "5 use cases",
    href: "/use-cases/edtech",
  },
  {
    label: "AI STARTUPS",
    title: "AI Startups",
    desc: "GPU training, inference infrastructure, RAG, data pipelines, and enterprise AI deployment.",
    useCases: "5 use cases",
    href: "/use-cases/ai-startups",
  },
  {
    label: "BPO / KPO",
    title: "BPO & KPO",
    desc: "Voice AI, omnichannel CX, analytics, agent desktop, and compliance archive infrastructure.",
    useCases: "5 use cases",
    href: "/use-cases/bpo-kpo",
  },
  {
    label: "MANUFACTURING",
    title: "Manufacturing",
    desc: "IIoT, predictive maintenance, ERP, factory edge compute, and AI quality inspection.",
    useCases: "5 use cases",
    href: "/use-cases/manufacturing",
  },
  {
    label: "HEALTHCARE",
    title: "Healthcare",
    desc: "HMS, EHR/EMR, AI diagnostics, telemedicine, and remote health monitoring infrastructure.",
    useCases: "5 use cases",
    href: "/use-cases/healthcare",
  },
];

const capabilityChips = [
  "Bare Metal",
  "VPS",
  "Private Cloud",
  "GPU Infrastructure",
  "Hybrid Cloud",
  "Managed Operations",
  "Backup / DR",
  "Observability & Governance",
];

export default function UseCasesPage() {
  return (
    <>
      <section className="bg-[#0A0A0A] pb-20 pt-[160px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-crimson-500">
            USE CASES
          </p>
          <h1 className="mt-5 font-sans text-[40px] font-extrabold leading-[1.04] tracking-[-0.03em] text-white md:text-[56px] lg:text-[64px]">
            Workload-aware infrastructure
            <br />
            for high-growth industries.
          </h1>
          <p className="mt-6 max-w-[580px] font-sans text-[18px] font-normal leading-[1.7] text-[#6B6B6B]">
            Every industry has a different infrastructure challenge. Racko maps
            to your workload, compliance posture, and operational constraints —
            not to a generic VM catalogue.
          </p>
        </div>
      </section>

      <section className="bg-[#0E0E0E] py-20">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <div className="grid grid-cols-1 gap-[1px] bg-[rgba(255,255,255,0.08)] lg:grid-cols-3 xl:grid-cols-5">
            {industryCards.map((card) => (
              <Link
                key={card.title}
                href={card.href}
                className="group cursor-pointer border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-7 py-9 transition-all duration-200 hover:border-[rgba(255,255,255,0.14)] hover:bg-[#242424]"
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-crimson-500">
                  {card.label}
                </p>
                <h2 className="mt-3 font-sans text-[22px] font-bold text-white">
                  {card.title}
                </h2>
                <p className="mt-2.5 font-sans text-[13px] leading-[1.6] text-[#A1A1A1]">
                  {card.desc}
                </p>
                <p className="mt-4 font-mono text-[11px] text-[#3D3D3D]">
                  {card.useCases}
                </p>
                <p className="mt-2 font-mono text-[11px] text-[#B91C1C] transition-colors duration-150 group-hover:text-[#DC2626]">
                  Explore →
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0A0A0A] py-[100px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 text-center xl:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-crimson-500">
            COMMON INFRASTRUCTURE LAYER
          </p>
          <h2 className="mt-5 font-sans text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em] text-white md:text-[44px]">
            The same operational model. Every industry.
          </h2>
          <div className="mx-auto mt-10 flex max-w-[900px] flex-wrap justify-center gap-2.5">
            {capabilityChips.map((chip) => (
              <span
                key={chip}
                className="rounded-[3px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[#A1A1A1]"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

      <BottomCTA />
    </>
  );
}
