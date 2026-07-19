"use client";

import Link from "next/link";
import {
  Layers,
  Cpu,
  FlaskConical,
  Archive,
  BarChart,
  Lock,
  GitBranch,
} from "lucide-react";
import Eyebrow from "@/components/ui/Eyebrow";
import { useDemoModal } from "@/components/ui/DemoModalContext";

type SolutionItem = {
  id: string;
  Icon: any;
  title: string;
  description: string;
  cta: string;
  href: string;
  modal?: boolean;
};

const SOLUTION_ITEMS: SolutionItem[] = [
  {
    id: "01",
    Icon: Layers,
    title: "Workload Cloud",
    description:
      "Match your workload to the right cloud model - VPS, Cloud VPS, Dedicated Cloud, Private Cloud, or GPU Cloud - based on performance, cost, and governance requirements.",
    cta: "Explore products ->",
    href: "/products",
  },
  {
    id: "02",
    Icon: Cpu,
    title: "AI-Ready Cloud",
    description:
      "GPU-backed environments for AI model training, inference APIs, RAG workloads, and GenAI products - with cost attribution and managed lifecycle.",
    cta: "Explore GPU Cloud ->",
    href: "/products/gpu-cloud",
  },
  {
    id: "03",
    Icon: FlaskConical,
    title: "CloudLabs for Teams",
    description:
      "Self-provisioned lab environments, sandboxes, demo environments, and event infrastructure - with governance, cost control, and auto-cleanup.",
    cta: "Explore CloudLabs ->",
    href: "/cloudlabs",
  },
  {
    id: "04",
    Icon: Archive,
    title: "Backup & DR",
    description:
      "Centralized backup, automated schedules, retention policies, restore readiness, and disaster recovery planning for all workloads.",
    cta: "Explore Backup Storage ->",
    href: "/products/backup-storage",
  },
  {
    id: "05",
    Icon: BarChart,
    title: "Cloud Cost Benchmarking",
    description:
      "Compare VPS, Dedicated Cloud, GPU, CloudLabs, and storage SKUs before committing - then ask Racko for the final quote and deployment model.",
    cta: "Start benchmarking ->",
    href: "/benchmark",
  },
  {
    id: "06",
    Icon: Lock,
    title: "Secure Workspaces",
    description:
      "Governed cloud environments for sensitive workloads - Private Cloud, isolated workspaces, access controls, audit trails, and backup.",
    cta: "Explore Private Cloud ->",
    href: "/products/private-cloud",
  },
  {
    id: "07",
    Icon: GitBranch,
    title: "Hybrid / Multi-Cloud",
    description:
      "Connect Racko Cloud with AWS, Azure, GCP, and Oracle - workload portability, governance continuity, and one managed operations layer across environments.",
    cta: "Book a Racko Meet ->",
    href: "",
    modal: true,
  },
];

export default function SolutionsPageContent() {
  const { openModal } = useDemoModal();

  return (
    <main className="min-w-0">
      <section className="bg-[#0A0A0A] pb-[90px] pt-[140px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <Eyebrow label="SOLUTIONS" />
          <h1 className="mt-5 max-w-[980px] font-sans text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] text-white sm:text-[54px] md:text-[64px]">
            Cloud outcomes for every workload challenge.
          </h1>
          <p className="mt-6 max-w-[700px] font-sans text-[18px] font-normal leading-[1.65] text-[#6B6B6B]">
            Racko Cloud solutions map specific business and workload challenges to the right combination of cloud
            products, governance models, and managed operations.
          </p>
        </div>
      </section>

      <section className="bg-[#0E0E0E] py-20">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {SOLUTION_ITEMS.map((item) => (
              <article
                key={item.id}
                className="flex h-full flex-col rounded border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-6 py-7"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-crimson-500">{item.id}</p>
                <div className="mt-3 text-[#B91C1C]">
                  <item.Icon size={22} />
                </div>
                <h3 className="mt-3 font-sans text-[18px] font-bold text-white">{item.title}</h3>
                <p className="mt-3 flex-1 font-sans text-[14px] leading-[1.65] text-[#6B6B6B]">{item.description}</p>
                {item.modal ? (
                  <button
                    type="button"
                    onClick={openModal}
                    className="mt-5 self-start font-mono text-[12px] text-crimson-500 transition-colors hover:text-crimson-400"
                  >
                    {item.cta}
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    className="mt-5 self-start font-mono text-[12px] text-crimson-500 transition-colors hover:text-crimson-400"
                  >
                    {item.cta}
                  </Link>
                )}
              </article>
            ))}
          </div>

          <div className="mt-14 rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-6 py-8 text-center">
            <h2 className="font-sans text-[24px] font-bold text-white">Not sure which solution fits?</h2>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={openModal}
                className="inline-flex items-center justify-center rounded-[6px] bg-[#B91C1C] px-8 py-3 font-sans text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-[#DC2626]"
              >
                Book a Racko Meet →
              </button>
              <Link
                href="/assessment"
                className="inline-flex items-center justify-center rounded-[6px] border border-[rgba(255,255,255,0.15)] bg-transparent px-8 py-3 font-sans text-[15px] font-medium text-white transition-colors duration-150 hover:bg-[rgba(255,255,255,0.06)]"
              >
                Discover Racko Products →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
