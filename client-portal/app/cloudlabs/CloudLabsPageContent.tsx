"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BarChart,
  BookOpen,
  Box,
  CheckSquare,
  Clock,
  Copy,
  DollarSign,
  FlaskConical,
  Globe,
  Headphones,
  Key,
  Layout,
  LayoutTemplate,
  Presentation,
  RefreshCw,
  Server,
  Trash2,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

type EnvCard = {
  num: string;
  title: string;
  description: string;
  href: string;
  Icon: LucideIcon;
};

const environmentCards: EnvCard[] = [
  {
    num: "01",
    title: "Hands-on Labs",
    description:
      "Pre-configured technical lab environments for cloud, DevOps, Kubernetes, databases, AI/ML, and full-stack development training cohorts.",
    href: "/cloudlabs/hands-on-labs",
    Icon: FlaskConical,
  },
  {
    num: "02",
    title: "Cloud Sandboxes",
    description:
      "Isolated sandbox environments for experimentation, testing, and exploration — with cost guardrails and auto-cleanup on completion.",
    href: "/cloudlabs/sandboxes",
    Icon: Box,
  },
  {
    num: "03",
    title: "Self-Provisioned Workspaces",
    description:
      "Developer and learner workspaces that teams can provision themselves from pre-approved templates — no IT ticket required.",
    href: "/cloudlabs/workspaces",
    Icon: User,
  },
  {
    num: "04",
    title: "Cloud Portal",
    description:
      "A unified portal for launching, monitoring, and managing all CloudLabs environments — with usage dashboards and cost visibility.",
    href: "/cloudlabs/portal",
    Icon: Globe,
  },
  {
    num: "05",
    title: "Usage & Cost Dashboards",
    description:
      "Real-time visibility into environment usage, resource consumption, cost attribution, and idle resource detection.",
    href: "/cloudlabs/dashboards",
    Icon: BarChart,
  },
  {
    num: "06",
    title: "Lab Templates & Blueprints",
    description:
      "Reusable, pre-validated environment templates for consistent lab delivery — reducing setup time and trainer overhead.",
    href: "/cloudlabs/templates",
    Icon: Layout,
  },
  {
    num: "07",
    title: "LMS Integration",
    description:
      "Connect CloudLabs directly with your LMS — launch labs from within your learning platform with SSO and session tracking.",
    href: "/cloudlabs/lms",
    Icon: BookOpen,
  },
  {
    num: "08",
    title: "Skill Validation & Assessment",
    description:
      "Track learner progress, capture environment outputs, and generate assessment reports for certification and skill validation programs.",
    href: "/cloudlabs/assessment",
    Icon: CheckSquare,
  },
  {
    num: "09",
    title: "Demo / POC Environments",
    description:
      "Customer-ready demo and proof-of-concept environments launched in minutes — with time-boxing, access controls, and auto-cleanup.",
    href: "/cloudlabs/demos",
    Icon: Presentation,
  },
  {
    num: "10",
    title: "Event & Hackathon Environments",
    description:
      "Scalable event infrastructure for hackathons, bootcamps, and tech events — with team sandboxes, usage reporting, and managed support.",
    href: "/cloudlabs/events",
    Icon: Users,
  },
  {
    num: "11",
    title: "Cloud Subscriptions & Licences",
    description:
      "Cloud server subscriptions and software licences for training cohorts — managed access, billing visibility, and lifecycle control.",
    href: "/cloudlabs/subscriptions",
    Icon: Key,
  },
  {
    num: "12",
    title: "Bare Metal / Dedicated Labs",
    description:
      "High-performance bare metal lab environments for intensive workloads — Kubernetes, databases, GPU labs, and DevOps pipelines.",
    href: "/cloudlabs/bare-metal-labs",
    Icon: Server,
  },
];

type ControlChip = {
  Icon: LucideIcon;
  title: string;
  description: string;
};

const controlChips: ControlChip[] = [
  {
    Icon: LayoutTemplate,
    title: "Template-Based Provisioning",
    description: "Launch from pre-validated templates in minutes.",
  },
  {
    Icon: Clock,
    title: "Time-Boxed Access",
    description: "Set access windows — environments expire automatically.",
  },
  {
    Icon: Trash2,
    title: "Auto-Cleanup",
    description: "Environments are cleaned up on schedule — no sprawl.",
  },
  {
    Icon: BarChart,
    title: "Usage Dashboards",
    description: "Real-time visibility into who's using what and at what cost.",
  },
  {
    Icon: DollarSign,
    title: "Cost Guardrails",
    description: "Set spend limits per environment, team, or cohort.",
  },
  {
    Icon: Copy,
    title: "Environment Cloning",
    description: "Clone existing environments for fast repeat delivery.",
  },
  {
    Icon: RefreshCw,
    title: "Backup & Restore",
    description: "Snapshot and restore capabilities for critical environments.",
  },
  {
    Icon: Headphones,
    title: "Managed Support",
    description: "Racko team handles environment issues so yours doesn't have to.",
  },
];

const industryCards = [
  {
    title: "EdTech",
    description:
      "CloudLabs, LMS-integrated labs, learner sandboxes, assessment environments, skill validation, and AI learning workspaces.",
  },
  {
    title: "AI-Native Startups",
    description:
      "AI/ML experiment workspaces, GPU sandboxes, RAG and inference environments, and demo deployments for investor and customer pilots.",
  },
  {
    title: "BPO / KPO",
    description:
      "Agent workspace environments, UAT and transition sandboxes, client onboarding environments, and process pilot deployments.",
  },
  {
    title: "Manufacturing",
    description:
      "Industrial digital pilot environments, IIoT sandboxes, ERP demo environments, and plant rollout test workloads.",
  },
  {
    title: "Healthcare",
    description:
      "Digital pilot environments for healthcare apps, diagnostics sandbox environments, telemedicine demos, and clinical workflow testing.",
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.45, ease: "easeOut" as const },
};

export default function CloudLabsPageContent() {
  return (
    <main className="min-w-0 bg-[#0A0A0A]">
      {/* Hero */}
      <section className="bg-[#0A0A0A] pb-20 pt-[140px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 md:px-16">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#B91C1C]">
            CLOUDLABS &amp; WORKSPACES
          </p>
          <h1 className="mt-5 max-w-[920px] font-sans text-[clamp(36px,5vw,64px)] font-extrabold leading-[1.06] tracking-[-0.03em] text-white">
            Launch governed cloud environments
            <br />
            in minutes — not days.
          </h1>
          <p className="mt-6 max-w-[580px] font-sans text-[18px] font-normal leading-[1.65] text-[#6B6B6B]">
            Racko CloudLabs enables teams to launch controlled labs, sandboxes, demos, AI workspaces, event environments,
            LMS-connected labs, and proof-of-value deployments — with governance, cost control, usage visibility, and
            managed lifecycle support.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/products"
              className="inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#B91C1C] px-8 py-3 font-sans text-[15px] font-semibold text-white transition-all duration-200 hover:-translate-y-px hover:bg-[#DC2626]"
            >
              Discover Racko Products
              <span className="font-mono text-[14px]">→</span>
            </Link>
            <Link
              href="/industries"
              className="inline-flex items-center justify-center rounded-[6px] border border-[rgba(255,255,255,0.2)] bg-transparent px-8 py-3 font-sans text-[15px] font-medium text-white transition-colors duration-150 hover:border-[rgba(255,255,255,0.35)] hover:bg-[rgba(255,255,255,0.06)]"
            >
              Explore CloudLabs use cases
            </Link>
          </div>
        </div>
      </section>

      {/* What You Can Launch */}
      <section className="bg-[#0E0E0E] py-24">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 md:px-16">
          <motion.p {...fadeUp} className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#3D3D3D]">
            ENVIRONMENT TYPES
          </motion.p>
          <motion.h2
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.05 }}
            className="mt-4 max-w-[900px] font-sans text-[clamp(32px,4vw,48px)] font-extrabold leading-[1.08] tracking-[-0.03em] text-white"
          >
            12 environment types. One CloudLabs platform.
          </motion.h2>

          <div className="mt-12 overflow-hidden rounded-lg bg-[rgba(185,28,28,0.1)] p-px">
            <div className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3">
              {environmentCards.map((card, index) => {
                const Icon = card.Icon;
                return (
                  <motion.div
                    key={card.href}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.35, delay: index * 0.03 }}
                    className="min-w-0"
                  >
                    <Link
                      href={card.href}
                      className="group relative block h-full bg-[#111111] px-6 py-7 transition-colors duration-200 hover:bg-[#161616]"
                    >
                      <span className="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#B91C1C] to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                      <p className="font-mono text-[9px] tracking-[0.08em] text-[#B91C1C]">{card.num}</p>
                      <div className="mt-3 text-[#B91C1C]">
                        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                      </div>
                      <h3 className="mt-3 font-sans text-[16px] font-bold text-white">{card.title}</h3>
                      <p className="mt-2 font-sans text-[13px] leading-[1.6] text-[#A1A1A1]">{card.description}</p>
                      <p className="mt-4 font-mono text-[11px] text-[#B91C1C] transition-colors group-hover:text-[#DC2626]">
                        Learn more →
                      </p>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Control layer */}
      <section className="bg-[#0A0A0A] py-24">
        <div className="mx-auto grid w-full max-w-[1280px] gap-12 px-6 md:grid-cols-2 md:gap-16 md:px-16">
          <motion.div {...fadeUp} className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#3D3D3D]">CONTROL LAYER</p>
            <h2 className="mt-4 font-sans text-[clamp(28px,3.5vw,48px)] font-extrabold leading-[1.08] tracking-[-0.03em] text-white">
              Every CloudLabs environment is governed.
            </h2>
            <p className="mt-6 font-sans text-[16px] font-normal leading-[1.7] text-[#6B6B6B]">
              Racko CloudLabs is not just compute. Every environment comes with a governance and control layer —
              template-based provisioning, time-boxed access, auto-cleanup, usage dashboards, cost guardrails, and
              lifecycle management. So teams get environments fast, and administrators keep full visibility and control.
            </p>
            <Link
              href="/products"
              className="mt-8 inline-flex items-center gap-2 font-mono text-[12px] text-[#B91C1C] transition-colors hover:text-[#DC2626]"
            >
              Discover Racko Products
              <span aria-hidden>→</span>
            </Link>
          </motion.div>
          <motion.div {...fadeUp} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {controlChips.map((chip) => {
              const Icon = chip.Icon;
              return (
                <div
                  key={chip.title}
                  className="rounded border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-5 py-4"
                >
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#B91C1C]" strokeWidth={1.75} aria-hidden />
                    <div>
                      <p className="font-sans text-[14px] font-semibold text-white">{chip.title}</p>
                      <p className="mt-1 font-sans text-[12px] leading-[1.55] text-[#6B6B6B]">{chip.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Industry use cases */}
      <section className="bg-[#0E0E0E] py-24">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 md:px-16">
          <motion.p {...fadeUp} className="text-center font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#3D3D3D]">
            USE CASES BY INDUSTRY
          </motion.p>
          <motion.h2
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.05 }}
            className="mx-auto mt-4 max-w-[900px] text-center font-sans text-[clamp(28px,3.5vw,44px)] font-extrabold leading-[1.08] tracking-[-0.03em] text-white"
          >
            CloudLabs for every industry context.
          </motion.h2>
          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            {industryCards.map((card, index) => (
              <motion.article
                key={card.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="rounded border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-6 py-7"
              >
                <h3 className="font-sans text-[16px] font-bold text-white">{card.title}</h3>
                <p className="mt-3 font-sans text-[13px] leading-[1.65] text-[#A1A1A1]">{card.description}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-[#0A0A0A] py-24">
        <div className="mx-auto max-w-[720px] px-6 text-center md:px-16">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[#B91C1C]">GET STARTED</p>
          <h2 className="mt-5 font-sans text-[clamp(26px,3.5vw,40px)] font-extrabold leading-[1.1] tracking-[-0.03em] text-white">
            Tell us what environment you need to launch.
          </h2>
          <p className="mx-auto mt-5 max-w-[560px] font-sans text-[16px] leading-[1.7] text-[#6B6B6B]">
            Racko CloudLabs team will design the right environment — lab, sandbox, workspace, demo, or event
            infrastructure — and get it running.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link
              href="/products"
              className="inline-flex w-full items-center justify-center gap-2 rounded-[6px] bg-[#B91C1C] px-8 py-3 font-sans text-[15px] font-semibold text-white transition-all duration-200 hover:bg-[#DC2626] sm:w-auto"
            >
              Discover Racko Products
              <span className="font-mono text-[14px]">→</span>
            </Link>
            <Link
              href="/company/contact"
              className="inline-flex w-full items-center justify-center font-mono text-[12px] text-[#B91C1C] transition-colors hover:text-[#DC2626] sm:w-auto"
            >
              Talk to an expert →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
