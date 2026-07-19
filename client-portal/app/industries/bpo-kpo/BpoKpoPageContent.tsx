"use client";

import Link from "next/link";
import {
  Lock,
  Users,
  BarChart,
  Archive,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import Eyebrow from "@/components/ui/Eyebrow";
import { useDemoModal } from "@/components/ui/DemoModalContext";

const problems = [
  "Client data runs on shared cloud with insufficient isolation",
  "New client onboarding requires manual environment setup",
  "No cost attribution per client or process workload",
  "Backup and DR gaps create SLA exposure",
];

const solutionCards = [
  {
    Icon: Lock,
    title: "Secure Agent Workspaces",
    description:
      "Controlled cloud environments for agents, analysts, QA teams, and client-dedicated delivery pods.",
  },
  {
    Icon: Users,
    title: "Client-Dedicated Environments",
    description:
      "Isolated environments per client - separate access, separate data, separate cost attribution.",
  },
  {
    Icon: BarChart,
    title: "Analytics Workloads",
    description:
      "Dedicated cloud for BI dashboards, reporting engines, and process analytics workloads.",
  },
  {
    Icon: Archive,
    title: "Backup & DR",
    description:
      "Automated backup for client workloads, process apps, audit files, and operational records.",
  },
];

const stackItems = [
  { name: "Private Cloud", desc: "Client-dedicated, isolated environments" },
  { name: "Dedicated Cloud", desc: "High-volume process platforms and analytics" },
  { name: "Cloud VPS", desc: "Agent apps, dashboards, and internal tools" },
  { name: "S3 Storage", desc: "Call recordings, documents, process files, archives" },
  { name: "Backup Storage", desc: "Client data, audit files, operational records" },
  { name: "Managed Ops", desc: "24/7 monitoring, governance, uptime" },
];

const flowSteps = [
  "Client onboarding",
  "Secure workspace provisioned",
  "Agent / analyst access active",
  "Process delivery running",
  "Analytics and reporting live",
  "Backup / DR maintained",
];

const outcomes = [
  {
    Icon: TrendingDown,
    title: "Faster client onboarding",
    description: "Template-based environments reduce client setup from weeks to days.",
  },
  {
    Icon: Lock,
    title: "Stronger data isolation",
    description: "Per-client cloud environments eliminate cross-client data exposure risk.",
  },
  {
    Icon: RefreshCw,
    title: "Operational continuity",
    description: "Backup and DR support ensures SLA-bound operations survive incidents.",
  },
];

const useCasePills = [
  { label: "Secure Agent Workspaces", href: "/use-cases/bpo-kpo#secure-agent-workspaces" },
  { label: "Client-Dedicated Environments", href: "/use-cases/bpo-kpo#client-dedicated-environments" },
  { label: "Analytics Workloads", href: "/use-cases/bpo-kpo#analytics-workloads" },
];

export default function BpoKpoPageContent() {
  const { openModal } = useDemoModal();

  return (
    <main className="min-w-0">
      <section className="bg-[#0A0A0A] pb-20 pt-[140px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <Eyebrow label="BPO / KPO" />
          <h1 className="mt-5 max-w-[780px] font-sans text-[40px] font-extrabold leading-[1.06] tracking-[-0.03em] text-white sm:text-[48px] md:text-[56px]">
            Cloud for secure workspaces, client delivery, and continuity.
          </h1>
          <p className="mt-6 max-w-[620px] font-sans text-[18px] leading-[1.7] text-[#6B6B6B]">
            Racko Cloud helps BPO/KPO operations run client-specific environments, analytics workloads, and process
            platforms with stronger governance, visibility, and cost control.
          </p>
          <button
            type="button"
            onClick={openModal}
            className="mt-8 inline-flex items-center rounded-[6px] bg-[#B91C1C] px-8 py-3 font-sans text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-[#DC2626]"
          >
            Book a Racko Meet -&gt;
          </button>
        </div>
      </section>

      <section className="bg-[#0E0E0E] py-24">
        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 xl:px-8">
          <div>
            <Eyebrow label="THE CHALLENGE" />
            <h2 className="mt-4 max-w-[560px] font-sans text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-white md:text-[40px]">
              BPO/KPO teams carry cloud risk on behalf of their clients.
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
              One governed cloud model for every client and every shift.
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
              Products Racko deploys for BPO/KPO operations.
            </h3>
            <div className="mt-6 space-y-3">
              {stackItems.map((item) => (
                <div key={item.name} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#B91C1C]" />
                  <p className="font-sans text-[13px] leading-[1.65] text-[#A1A1A1]">
                    <span className="font-semibold text-white">{item.name}</span> - {item.desc}
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
            What BPO/KPO teams achieve with Racko Cloud.
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
            Running a contact centre, KPO, or outsourced operations team?
          </h3>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={openModal}
              className="inline-flex items-center justify-center rounded-[6px] bg-[#B91C1C] px-8 py-3 font-sans text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-[#DC2626]"
            >
              Book a Racko Meet -&gt;
            </button>
            <Link
              href="/products/private-cloud"
              className="inline-flex items-center justify-center rounded-[6px] border border-[rgba(255,255,255,0.15)] bg-transparent px-8 py-3 font-sans text-[15px] font-medium text-white transition-colors duration-150 hover:bg-[rgba(255,255,255,0.06)]"
            >
              Explore Private Cloud -&gt;
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
