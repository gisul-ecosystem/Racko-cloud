"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const workloads: Array<{
  id: string;
  number: string;
  label: string;
  example: string;
}> = [
  {
    id: "stable",
    number: "01",
    label: "Stable Workloads",
    example: "Production databases, ERP systems, core apps",
  },
  {
    id: "sensitive",
    number: "02",
    label: "Sensitive Workloads",
    example: "Healthcare data, financial records, PHI",
  },
  {
    id: "latency",
    number: "03",
    label: "Latency-Heavy Workloads",
    example: "Contact centres, industrial systems, real-time apps",
  },
  {
    id: "elastic",
    number: "04",
    label: "Elastic Workloads",
    example: "Seasonal traffic, dev/test, burst compute",
  },
  {
    id: "ai",
    number: "05",
    label: "AI Workloads",
    example: "Model training, inference, LLM deployments",
  },
  {
    id: "cost",
    number: "06",
    label: "Cost-Predictable Workloads",
    example: "Long-running batch, analytics, archival",
  },
  {
    id: "storage",
    number: "07",
    label: "Storage-Heavy Workload",
    example: "Media, datasets, logs, archives, backups",
  },
  {
    id: "backup",
    number: "08",
    label: "Backup-Critical Workload",
    example: "Business-critical data, DR readiness, restore SLAs",
  },
  {
    id: "website",
    number: "09",
    label: "Website / Portal Workload",
    example: "Business sites, CMS, WordPress, digital portals",
  },
  {
    id: "client-dedicated",
    number: "10",
    label: "Client-Dedicated Workload",
    example: "BPO client pods, dedicated customer environments",
  },
  {
    id: "analytics",
    number: "11",
    label: "Analytics Workload",
    example: "BI dashboards, data pipelines, reporting engines",
  },
  {
    id: "demo",
    number: "12",
    label: "Temporary Pilot / Demo",
    example: "POC environments, client demos, trial deployments",
  },
  {
    id: "lab",
    number: "13",
    label: "Hands-On Learning Lab",
    example: "Technical training, CloudLabs, cohort environments",
  },
  {
    id: "sandbox",
    number: "14",
    label: "Self-Provisioned Sandbox",
    example: "Developer workspaces, experiment environments",
  },
  {
    id: "hackathon",
    number: "15",
    label: "Hackathon / Event",
    example: "Time-boxed event compute, team sandboxes",
  },
  {
    id: "lms-lab",
    number: "16",
    label: "LMS-Integrated Lab",
    example: "LMS-connected training labs with usage reporting",
  },
];

const RESULTS: Record<
  string,
  { recommended: string; why: string; services: string[]; cta: string }
> = {
  stable: {
    recommended: "Bare Metal · Mumbai / Noida / Chennai",
    why: "Predictable load, cost control, no noisy-neighbour risk. Physical infrastructure delivers consistent performance and eliminates variable cloud billing.",
    services: ["Bare Metal", "Private Cloud", "Managed Ops", "Backup / DR"],
    cta: "/assessment",
  },
  sensitive: {
    recommended: "Private Cloud · Local Infrastructure",
    why: "Data sovereignty, access governance, and audit trails require dedicated, controlled environments inside Indian jurisdiction.",
    services: ["Private Cloud", "Security & Governance", "Backup/DR", "Monitoring"],
    cta: "/assessment",
  },
  latency: {
    recommended: "Bare Metal · Local Infrastructure",
    why: "Co-location near operations eliminates the latency penalty of cloud regions for real-time and industrial systems.",
    services: ["Bare Metal", "VPS", "Local Infra", "Managed Ops"],
    cta: "/assessment",
  },
  elastic: {
    recommended: "Hybrid Cloud",
    why: "Elastic demand needs cloud burst capacity — with Racko as the orchestration and governance layer across environments.",
    services: ["Hybrid Cloud", "Cloud Migration", "Managed Ops", "Cost Optimisation"],
    cta: "/assessment",
  },
  ai: {
    recommended: "GPU Infrastructure",
    why: "Training and inference require purpose-built GPU environments with cost-per-inference attribution and managed lifecycle.",
    services: ["GPU Infra", "AI Deployment", "Managed Ops", "Hybrid Cloud"],
    cta: "/assessment",
  },
  cost: {
    recommended: "Bare Metal · Private Cloud",
    why: "Fixed workloads on owned infrastructure eliminate variable cloud billing and deliver predictable cost-performance economics.",
    services: ["Bare Metal", "Private Cloud", "Managed Ops", "Lifecycle Support"],
    cta: "/assessment",
  },
  storage: {
    recommended: "S3-Compatible Storage",
    why: "Object storage with S3 API, lifecycle policies, encryption, and multi-cloud interoperability.",
    services: ["S3 Storage", "Backup Storage", "Managed Ops"],
    cta: "/assessment",
  },
  backup: {
    recommended: "Backup Storage",
    why: "Centralized backup with automated schedules, retention policies, encryption, and restore readiness.",
    services: ["Backup Storage", "Managed Ops", "DR Planning"],
    cta: "/assessment",
  },
  website: {
    recommended: "Web Hosting / Cloud VPS",
    why: "Managed hosting or Cloud VPS for sites, portals, CMS, and WordPress with SSL, backups, and 24/7 support.",
    services: ["Web Hosting", "Cloud VPS", "Managed Ops"],
    cta: "/assessment",
  },
  "client-dedicated": {
    recommended: "Private Cloud / HA Dedicated Cloud",
    why: "Isolated, dedicated environments for client workloads with governance, access control, and accountability.",
    services: ["Private Cloud", "Dedicated Cloud", "Managed Ops"],
    cta: "/assessment",
  },
  analytics: {
    recommended: "Dedicated Server / Cloud VPS",
    why: "High-performance compute for analytics engines, dashboards, and data pipelines with predictable economics.",
    services: ["Dedicated Server", "Cloud VPS", "S3 Storage"],
    cta: "/assessment",
  },
  demo: {
    recommended: "CloudLabs & Workspaces",
    why: "Time-boxed demo and POC environments with auto-cleanup, cost guardrails, and governance.",
    services: ["CloudLabs", "Cloud VPS", "Managed Ops"],
    cta: "/assessment",
  },
  lab: {
    recommended: "CloudLabs & Workspaces",
    why: "Template-based lab provisioning with LMS integration, usage dashboards, auto-cleanup, and lifecycle support.",
    services: ["CloudLabs", "Cloud VPS", "Managed Ops"],
    cta: "/assessment",
  },
  sandbox: {
    recommended: "CloudLabs & Workspaces",
    why: "Self-provisioned developer workspaces with cost guardrails, time-boxing, and reset capabilities.",
    services: ["CloudLabs", "VPS", "Managed Ops"],
    cta: "/assessment",
  },
  hackathon: {
    recommended: "CloudLabs & Workspaces",
    why: "Event environments with team sandboxes, auto-cleanup, usage reporting, and managed support.",
    services: ["CloudLabs", "GPU Cloud", "Managed Ops"],
    cta: "/assessment",
  },
  "lms-lab": {
    recommended: "CloudLabs + Cloud VPS",
    why: "LMS-integrated lab environments with skill validation, usage reporting, and automated lifecycle management.",
    services: ["CloudLabs", "Cloud VPS", "LMS Integration"],
    cta: "/assessment",
  },
};

const workloadIds = workloads.map((w) => w.id);

export default function WorkloadPlacementSection() {
  const [selected, setSelected] = useState<string>("stable");
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCardClick = (id: string) => {
    setSelected(id);
    setIsAutoPlaying(false);
    if (autoPlayRef.current) clearInterval(autoPlayRef.current);
  };

  const handleCardClickWithResume = (id: string) => {
    handleCardClick(id);
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => {
      setIsAutoPlaying(true);
    }, 8000);
  };

  useEffect(() => {
    if (!isAutoPlaying) return;

    autoPlayRef.current = setInterval(() => {
      setSelected((prev) => {
        const currentIndex = workloadIds.indexOf(prev);
        const nextIndex = (currentIndex + 1) % workloadIds.length;
        return workloadIds[nextIndex];
      });
    }, 2800);

    return () => {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    };
  }, [isAutoPlaying]);

  useEffect(() => {
    return () => {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
    };
  }, []);

  const cardClass = (id: string) =>
    [
      "relative cursor-pointer overflow-hidden rounded-[4px] border p-4 text-left sm:p-5",
      "transition-all duration-200",
      selected === id
        ? "border-[#B91C1C] bg-[rgba(185,28,28,0.08)]"
        : "border-[rgba(255,255,255,0.08)] bg-[#1A1A1A]",
      "hover:border-[rgba(255,255,255,0.14)] hover:bg-[#242424]",
    ].join(" ");

  return (
    <section className="min-w-0 bg-[#0E0E0E] py-16 sm:py-20 lg:py-24">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
        <div className="mx-auto max-w-[900px] text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-crimson-500">
            WORKLOAD PLACEMENT
          </p>
          <h2 className="mt-5 font-sans text-[clamp(1.75rem,5vw,3.25rem)] font-extrabold leading-[1.1] text-white">
            Not every workload belongs in the same cloud model.
          </h2>
          <p className="mx-auto mt-5 max-w-[640px] font-sans text-[15px] leading-[1.65] text-[#6B6B6B] sm:text-[16px]">
            Tell us your workload type — Racko recommends the right cloud product, governance model,
            and next step.
          </p>
        </div>

        <div className="mx-auto mb-0 mt-12 grid w-full max-w-[1280px] grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {workloads.map((workload) => (
            <button
              key={workload.id}
              type="button"
              onClick={() => handleCardClickWithResume(workload.id)}
              className={cardClass(workload.id)}
            >
              <p className="font-mono text-[9px] text-crimson-500">{workload.number}</p>
              <p className="mt-2 break-words font-sans text-[15px] font-semibold text-white">
                {workload.label}
              </p>
              <p className="mt-1 break-words font-sans text-[12px] text-[#A1A1A1]">
                {workload.example}
              </p>
              {selected === workload.id && isAutoPlaying ? (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden bg-[rgba(185,28,28,0.2)]">
                  <motion.div
                    key={selected}
                    className="h-full bg-[#B91C1C]"
                    style={{ originX: 0 }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 2.8, ease: "linear" }}
                  />
                </div>
              ) : null}
            </button>
          ))}
        </div>

        <div className="mb-4 mt-6 flex max-w-full flex-wrap items-center justify-center gap-2 px-1">
          {workloadIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => handleCardClickWithResume(id)}
              className={`h-[6px] shrink-0 rounded-[3px] border-0 p-0 transition-all duration-300 ${
                selected === id ? "w-5 bg-[#B91C1C]" : "w-[6px] bg-[rgba(255,255,255,0.15)]"
              }`}
            />
          ))}
          <span className="ml-2 font-mono text-[9px] text-[#3D3D3D]">
            {isAutoPlaying ? "AUTO" : "PAUSED"}
          </span>
        </div>

        <div className="mx-auto min-h-[200px] w-full max-w-[1100px] overflow-hidden rounded-[4px] border border-[rgba(255,255,255,0.08)] bg-[#161616]">
          <AnimatePresence mode="wait">
            <motion.div
              key={selected}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="grid grid-cols-1 gap-8 p-4 sm:p-6 lg:grid-cols-2 lg:gap-x-10 lg:gap-y-10 xl:grid-cols-4 xl:gap-x-8 xl:gap-y-0 xl:p-8"
            >
              <div className="min-w-0 xl:border-r xl:border-[rgba(255,255,255,0.06)] xl:pr-8">
                <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.1em] text-[#3D3D3D]">
                  RECOMMENDED FOR
                </p>
                <p className="font-sans text-[15px] font-bold leading-[1.3] text-white">
                  {RESULTS[selected].recommended}
                </p>
                <div className="mt-3 h-[2px] w-8 bg-[#B91C1C]" />
              </div>

              <div className="min-w-0 xl:border-r xl:border-[rgba(255,255,255,0.06)] xl:px-8">
                <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.1em] text-[#3D3D3D]">
                  WHY IT FITS
                </p>
                <p className="font-sans text-[13px] leading-[1.6] text-[#A1A1A1]">
                  {RESULTS[selected].why}
                </p>
              </div>

              <div className="min-w-0 xl:border-r xl:border-[rgba(255,255,255,0.06)] xl:px-8">
                <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.1em] text-[#3D3D3D]">
                  RACKO SERVICES
                </p>
                <div className="flex flex-col gap-2">
                  {RESULTS[selected].services.map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[#B91C1C]">{">"}</span>
                      <span className="font-mono text-[11px] text-[#6B6B6B]">{s}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex min-w-0 flex-col justify-between xl:pl-8">
                <div>
                  <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.1em] text-[#3D3D3D]">
                    NEXT STEP
                  </p>
                  <p className="font-sans text-[13px] text-[#6B6B6B]">
                    Tell us about this workload. We&apos;ll recommend the right
                    environment and migration path.
                  </p>
                </div>

                <Link
                  href={RESULTS[selected].cta}
                  className="mt-6 inline-flex w-full items-center justify-center rounded-[3px] bg-[#B91C1C] px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-white transition-colors duration-150 hover:bg-[#DC2626] sm:w-auto"
                >
                  Book a Racko Meet →
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
